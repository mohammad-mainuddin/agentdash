"""
AgentDash Example — Simple Simulated Agent
==========================================
Simulates a research agent that searches the web, reads pages,
and summarises results. All steps are sent to AgentDash in real time.

Run with:
    pip install agentdash
    python agent.py

Make sure AgentDash server is running first:
    docker-compose up
"""

import sys
import time
import random
import os

# Allow running without pip install (local dev)
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../../sdk/python"))

from agentdash import AgentDash

# ── Config ────────────────────────────────────────────────────────────────────

SERVER_URL = os.getenv("AGENTDASH_URL", "http://localhost:4242")

# ── Simulated tool functions ──────────────────────────────────────────────────

def web_search(query: str) -> dict:
    """Simulates a web search."""
    time.sleep(random.uniform(0.3, 0.8))
    return {
        "results": [
            {"title": f"Result 1 for '{query}'", "url": "https://example.com/1", "snippet": "This is a relevant snippet about the topic."},
            {"title": f"Result 2 for '{query}'", "url": "https://example.com/2", "snippet": "Another highly relevant result with useful information."},
        ]
    }


def fetch_page(url: str) -> dict:
    """Simulates fetching a web page."""
    time.sleep(random.uniform(0.5, 1.2))
    return {
        "url": url,
        "content": f"This is the full page content of {url}. It contains detailed information about the topic that the agent requested.",
        "word_count": random.randint(500, 3000),
    }


def summarise(text: str) -> dict:
    """Simulates LLM summarisation."""
    time.sleep(random.uniform(0.8, 1.5))
    return {
        "summary": "The topic involves several key concepts including efficiency, scalability, and modern tooling. Key takeaways: (1) performance matters, (2) simplicity wins, (3) observability is critical.",
        "tokens_used": random.randint(200, 800),
    }


# ── Agent logic ───────────────────────────────────────────────────────────────

def run_agent(topic: str):
    """Run a simulated research agent on a given topic."""

    print(f"\n🤖 Starting research agent — topic: '{topic}'")
    print(f"   Sending events to: {SERVER_URL}\n")

    dash = AgentDash(url=SERVER_URL)
    time.sleep(0.5)  # Let WebSocket connect

    # Use context manager for automatic run_end on error
    with dash.start_run(agent_name="research-agent") as run:

        run.log(f"Starting research on topic: '{topic}'")
        run.log("Initialising tools: web_search, fetch_page, summarise")

        # Step 1: Search
        run.log(f"Searching the web for: {topic}")
        t0 = time.time()
        search_result = web_search(topic)
        duration = int((time.time() - t0) * 1000)

        run.tool_call(
            tool="web_search",
            input={"query": topic},
            output=search_result,
            duration_ms=duration,
        )
        run.log(f"Found {len(search_result['results'])} results")

        # Step 2: Fetch top results
        for i, result in enumerate(search_result["results"], 1):
            run.log(f"Fetching page {i}/{len(search_result['results'])}: {result['url']}")
            t0 = time.time()
            page = fetch_page(result["url"])
            duration = int((time.time() - t0) * 1000)

            run.tool_call(
                tool="fetch_page",
                input={"url": result["url"]},
                output=page,
                duration_ms=duration,
            )
            run.log(f"Fetched {page['word_count']} words from {result['url']}")

        # Step 3: Summarise
        run.log("Summarising gathered content...")
        t0 = time.time()
        summary = summarise(f"Research on: {topic}")
        duration = int((time.time() - t0) * 1000)

        run.tool_call(
            tool="summarise",
            input={"text": f"Research content about: {topic}"},
            output=summary,
            duration_ms=duration,
        )

        run.log(f"Summary complete — used ~{summary['tokens_used']} tokens")
        run.log("Research task finished successfully")

    print("\n✅ Agent run complete!")
    print(f"   View in dashboard: http://localhost:3000/runs\n")
    time.sleep(1)  # Let final event flush


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    topic = sys.argv[1] if len(sys.argv) > 1 else "Claude Managed Agents infrastructure"
    run_agent(topic)
