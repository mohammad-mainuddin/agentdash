"""
AgentRun — represents a single agent execution session.
"""

import json
from datetime import datetime, timezone
from typing import Any

from .span import Span


class AgentRun:
    """
    Represents a running agent session. Obtained via AgentDash.start_run().
    All methods send events to the AgentDash server in real time.
    """

    def __init__(self, run_id: str, agent_name: str, client):
        self.run_id     = run_id
        self.agent_name = agent_name
        self._client    = client
        self._ended     = False

    def _now(self) -> str:
        return datetime.now(timezone.utc).isoformat()

    def _token_count(self, *parts) -> int:
        text = " ".join(
            p if isinstance(p, str) else json.dumps(p)
            for p in parts if p is not None
        )
        return self._client.count_tokens(text)

    # ── Logging ───────────────────────────────────────────────────────────────

    def log(self, message: str):
        """Send a log message for this run."""
        if self._ended:
            print(f"[AgentDash] Warning: logging after run ended — {message}")
        self._client._send({
            "type": "log",
            "runId": self.run_id,
            "message": message,
            "tokenCount": self._token_count(message),
            "timestamp": self._now(),
        })

    def tool_call(self, tool: str, input: Any = None, output: Any = None, duration_ms: int = 0):
        """Record a tool call with its input, output, and duration."""
        if self._ended:
            print(f"[AgentDash] Warning: tool_call after run ended — {tool}")
        self._client._send({
            "type": "tool_call",
            "runId": self.run_id,
            "tool": tool,
            "input": input,
            "output": output,
            "duration_ms": duration_ms,
            "tokenCount": self._token_count(input, output),
            "timestamp": self._now(),
        })

    def llm_call(self, model: str, messages: list, response: str = "",
                 input_tokens: int = 0, output_tokens: int = 0,
                 cost_usd: float = 0.0, duration_ms: int = 0):
        """Record a full LLM call with prompt messages and response."""
        self._client._send({
            "type": "llm_call",
            "runId": self.run_id,
            "model": model,
            "messages": messages,
            "response": response,
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "cost_usd": cost_usd,
            "duration_ms": duration_ms,
            "timestamp": self._now(),
        })

    def mcp_call(self, server: str, tool: str, kind: str = "tool",
                 input: Any = None, output: Any = None,
                 duration_ms: int = 0, error: "str | None" = None):
        """Record an MCP server interaction (tool call, resource read, etc.)."""
        self._client._send({
            "type": "mcp_call",
            "runId": self.run_id,
            "server": server,
            "tool": tool,
            "kind": kind,
            "input": input,
            "output": output,
            "duration_ms": duration_ms,
            "error": error,
            "tokenCount": self._token_count(input, output),
            "timestamp": self._now(),
        })

    def span(self, name: str) -> Span:
        """
        Start a named phase within this run.

        Usage:
            with run.span("research-phase") as s:
                s.log("fetching pages...")
                with s.span("fetch-page-1") as sub:
                    sub.tool_call(tool="http_get", ...)
        """
        return Span(name=name, run=self, parent_span_id=None)

    def end(self, status: str = "success"):
        """Mark the run as complete. Status: 'success' or 'error'."""
        if self._ended:
            return
        self._ended = True
        self._client._send({
            "type": "run_end",
            "runId": self.run_id,
            "status": status,
            "timestamp": self._now(),
        })

    # ── Context manager ───────────────────────────────────────────────────────

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.end(status="error" if exc_type else "success")
        return False
