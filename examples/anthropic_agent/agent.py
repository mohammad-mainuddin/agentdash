"""
AgentDash Example — Real Anthropic Agent with Auto-Instrumentation
==================================================================
A research agent that uses the Anthropic SDK with tool use.
Every LLM call and tool execution is automatically tracked in AgentDash.

Requirements:
    pip install anthropic agentdash[all]

Environment:
    export ANTHROPIC_API_KEY=sk-ant-...
    export AGENTDASH_URL=http://localhost:4242   # optional, default shown

Run:
    python agent.py "explain transformer attention mechanisms"
"""

import json
import os
import sys
import time

import anthropic

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../../sdk/python"))
from agentdash import AgentDash, AnthropicInstrumentation

# ── Config ────────────────────────────────────────────────────────────────────

SERVER_URL = os.getenv("AGENTDASH_URL", "http://localhost:4242")
MODEL      = "claude-sonnet-4-6"

# ── Tools ─────────────────────────────────────────────────────────────────────

TOOLS = [
    {
        "name": "web_search",
        "description": "Search the web for up-to-date information on a topic.",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "The search query"},
            },
            "required": ["query"],
        },
    },
    {
        "name": "read_page",
        "description": "Fetch and read the content of a web page.",
        "input_schema": {
            "type": "object",
            "properties": {
                "url": {"type": "string", "description": "The URL to read"},
            },
            "required": ["url"],
        },
    },
]


def execute_tool(name: str, input: dict, run_span) -> str:
    """Simulate tool execution and log real results to AgentDash."""
    t0 = time.time()

    if name == "web_search":
        # Simulated — replace with a real search API in production
        time.sleep(0.3)
        result = {
            "results": [
                {"title": f"Result 1 for '{input['query']}'", "url": "https://example.com/1", "snippet": "Relevant information about the topic."},
                {"title": f"Result 2 for '{input['query']}'", "url": "https://example.com/2", "snippet": "More detailed analysis and examples."},
            ]
        }
    elif name == "read_page":
        time.sleep(0.5)
        result = {
            "url": input["url"],
            "content": f"Full page content of {input['url']}. Contains detailed information about the queried topic with references and examples.",
            "word_count": 1200,
        }
    else:
        result = {"error": f"Unknown tool: {name}"}

    duration_ms = int((time.time() - t0) * 1000)
    run_span.tool_call(tool=name, input=input, output=result, duration_ms=duration_ms)
    return json.dumps(result)


# ── Agent loop ────────────────────────────────────────────────────────────────

def run_agent(topic: str):
    print(f"\n🤖 Starting Anthropic research agent — topic: '{topic}'")
    print(f"   Dashboard: {SERVER_URL.replace('4242', '3000')}/runs\n")

    dash   = AgentDash(url=SERVER_URL)
    client = anthropic.Anthropic()

    with dash.start_run(agent_name="anthropic-research-agent") as run:

        # Wrap client — all messages.create() calls auto-logged with real token counts
        instr  = AnthropicInstrumentation(run)
        client = instr.wrap(client)

        with run.span("research") as research_span:
            research_span.log(f"Researching: {topic}")

            messages = [{"role": "user", "content": f"Research this topic thoroughly: {topic}"}]
            system   = "You are a research assistant. Use the available tools to gather information, then synthesise a clear summary."

            # Agentic loop — runs until the model stops calling tools
            with research_span.span("llm-loop") as loop_span:
                while True:
                    loop_span.log(f"LLM call — {len(messages)} messages in context")

                    response = client.messages.create(
                        model=MODEL,
                        max_tokens=1024,
                        system=system,
                        tools=TOOLS,
                        messages=messages,
                    )

                    # Append assistant response
                    messages.append({"role": "assistant", "content": response.content})

                    if response.stop_reason == "end_turn":
                        loop_span.log("Model finished — no more tool calls")
                        break

                    if response.stop_reason != "tool_use":
                        loop_span.log(f"Unexpected stop reason: {response.stop_reason}")
                        break

                    # Execute each tool call and return results
                    tool_results = []
                    with loop_span.span("tool-execution") as tool_span:
                        for block in response.content:
                            if block.type != "tool_use":
                                continue
                            tool_span.log(f"Executing: {block.name}({json.dumps(block.input)[:80]})")
                            result = execute_tool(block.name, block.input, tool_span)
                            tool_results.append({
                                "type": "tool_result",
                                "tool_use_id": block.id,
                                "content": result,
                            })

                    messages.append({"role": "user", "content": tool_results})

            # Extract and log the final text response
            final_text = next(
                (b.text for b in response.content if hasattr(b, "text")),
                "(no text output)"
            )
            research_span.log(f"Research complete — {len(final_text)} chars synthesised")

        run.log("Agent run finished successfully")
        print(f"\n📋 Summary:\n{final_text[:500]}{'...' if len(final_text) > 500 else ''}")
        print(f"\n✅ Done! View full trace: {SERVER_URL.replace('4242', '3000')}/runs\n")

    time.sleep(1)  # let final events flush


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    if not os.getenv("ANTHROPIC_API_KEY"):
        print("Error: ANTHROPIC_API_KEY environment variable not set.")
        sys.exit(1)

    topic = " ".join(sys.argv[1:]) if len(sys.argv) > 1 else "transformer attention mechanisms"
    run_agent(topic)
