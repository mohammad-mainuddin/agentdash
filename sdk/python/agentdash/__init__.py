"""
AgentDash Python SDK
Connect your AI agents to AgentDash for real-time monitoring.

Quick start:
    from agentdash import AgentDash

    dash = AgentDash(url="http://localhost:4242")

    with dash.start_run(agent_name="my-agent") as run:
        run.log("Starting task")
        run.tool_call(tool="search", input={"q": "hi"}, output={"result": "..."}, duration_ms=120)

With spans:
    with dash.start_run("my-agent") as run:
        with run.span("phase-1") as s:
            s.log("doing work")

With auto-instrumentation:
    from agentdash import AgentDash, AnthropicInstrumentation
    import anthropic

    dash   = AgentDash(url="http://localhost:4242")
    client = anthropic.Anthropic()

    with dash.start_run("my-agent") as run:
        client = AnthropicInstrumentation(run).wrap(client)
        response = client.messages.create(...)  # auto-tracked
"""

from .client import AgentDash
from .run import AgentRun
from .span import Span
from .instrumentation import AnthropicInstrumentation, OpenAIInstrumentation, MCPInstrumentation
from .instrumentation import _compute_cost as compute_llm_cost

__all__ = [
    "AgentDash", "AgentRun", "Span",
    "AnthropicInstrumentation", "OpenAIInstrumentation", "MCPInstrumentation",
    "compute_llm_cost",
]
__version__ = "1.1.0"
