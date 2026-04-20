"""
MCP Agent Example
=================
Shows how to monitor an AI agent that uses MCP servers with AgentDash.

This agent uses Claude + MCP filesystem server to:
1. Write a short story to a temp file
2. Read it back and summarise it

All MCP calls (write_file, read_file) and LLM calls are automatically
captured in AgentDash via MCPInstrumentation + AnthropicInstrumentation.

Prerequisites:
    pip install agentdash anthropic mcp
    npx -y @modelcontextprotocol/server-filesystem /tmp   # MCP server

Run:
    python agent.py
    # Open http://localhost:3000 to see the run in AgentDash
"""

import asyncio
import os
import anthropic
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

from agentdash import AgentDash, AnthropicInstrumentation, MCPInstrumentation

STORY_PATH = "/tmp/agentdash_story.txt"
TOOLS = [
    {
        "name": "write_file",
        "description": "Write content to a file",
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {"type": "string"},
                "content": {"type": "string"},
            },
            "required": ["path", "content"],
        },
    },
    {
        "name": "read_file",
        "description": "Read content from a file",
        "input_schema": {
            "type": "object",
            "properties": {"path": {"type": "string"}},
            "required": ["path"],
        },
    },
]


async def run_agent(run, anthropic_client, mcp_session):
    """Simple agentic loop: let Claude drive tool use until it stops."""
    run.log("Starting MCP agent — Claude + filesystem MCP server")
    messages = [
        {
            "role": "user",
            "content": (
                f"Write a two-sentence story about a curious robot to {STORY_PATH}, "
                "then read it back and give me a one-sentence summary."
            ),
        }
    ]

    with run.span("agentic-loop") as loop_span:
        for turn in range(6):
            loop_span.log(f"Turn {turn + 1}")
            response = anthropic_client.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=512,
                tools=TOOLS,
                messages=messages,
            )

            if response.stop_reason == "end_turn":
                final = next(
                    (b.text for b in response.content if hasattr(b, "text")), ""
                )
                loop_span.log(f"Agent finished: {final}")
                run.log(f"Result: {final}")
                break

            # Execute tool calls via MCP
            tool_results = []
            for block in response.content:
                if block.type != "tool_use":
                    continue
                with loop_span.span(f"mcp:{block.name}") as tool_span:
                    tool_span.log(f"Calling MCP tool: {block.name}")
                    result = await mcp_session.call_tool(block.name, block.input)
                    content_text = (
                        result.content[0].text
                        if result.content and hasattr(result.content[0], "text")
                        else str(result.content)
                    )
                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": content_text,
                    })

            messages.append({"role": "assistant", "content": response.content})
            messages.append({"role": "user", "content": tool_results})


async def main():
    dash = AgentDash(url=os.environ.get("AGENTDASH_URL", "http://localhost:4242"))
    anthropic_client = anthropic.Anthropic()

    server_params = StdioServerParameters(
        command="npx",
        args=["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
    )

    async with stdio_client(server_params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()

            with dash.start_run("mcp-filesystem-agent") as run:
                # Instrument both the LLM client and the MCP session
                anthropic_client = AnthropicInstrumentation(run).wrap(anthropic_client)
                session = MCPInstrumentation(run, server_name="filesystem").wrap(session)

                await run_agent(run, anthropic_client, session)

    print("\nDone — open http://localhost:3000 to view the run in AgentDash")


if __name__ == "__main__":
    asyncio.run(main())
