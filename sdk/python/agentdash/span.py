"""
Span — represents a named phase within an agent run.
Spans can be nested to model multi-step agent workflows.
"""

from __future__ import annotations
import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from .run import AgentRun


class Span:
    """
    A named, timed phase within an agent run. Created via run.span() or span.span().

    Spans can be nested arbitrarily:
        with run.span("research") as s:
            s.log("starting")
            with s.span("fetch") as sub:
                sub.tool_call(tool="http_get", ...)
    """

    def __init__(self, name: str, run: "AgentRun", parent_span_id: str | None = None):
        self.span_id = str(uuid.uuid4())
        self.name = name
        self._run = run
        self._parent_span_id = parent_span_id
        self._ended = False

    def _now(self) -> str:
        return datetime.now(timezone.utc).isoformat()

    def _send(self, event: dict):
        event.setdefault("spanId", self.span_id)
        self._run._client._send(event)

    # ── Logging ───────────────────────────────────────────────────────────────

    def log(self, message: str):
        self._send({
            "type": "log",
            "runId": self._run.run_id,
            "message": message,
            "timestamp": self._now(),
        })

    def tool_call(self, tool: str, input: Any = None, output: Any = None, duration_ms: int = 0):
        self._send({
            "type": "tool_call",
            "runId": self._run.run_id,
            "tool": tool,
            "input": input,
            "output": output,
            "duration_ms": duration_ms,
            "timestamp": self._now(),
        })

    def mcp_call(self, server: str, tool: str, kind: str = "tool",
                 input: Any = None, output: Any = None,
                 duration_ms: int = 0, error: "str | None" = None):
        """Record an MCP server interaction within this span."""
        self._send({
            "type": "mcp_call",
            "runId": self._run.run_id,
            "server": server,
            "tool": tool,
            "kind": kind,
            "input": input,
            "output": output,
            "duration_ms": duration_ms,
            "error": error,
            "timestamp": self._now(),
        })

    def span(self, name: str) -> "Span":
        """Create a nested child span."""
        return Span(name=name, run=self._run, parent_span_id=self.span_id)

    # ── Context manager ───────────────────────────────────────────────────────

    def __enter__(self) -> "Span":
        self._run._client._send({
            "type": "span_start",
            "runId": self._run.run_id,
            "spanId": self.span_id,
            "parentSpanId": self._parent_span_id,
            "name": self.name,
            "timestamp": self._now(),
        })
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        if self._ended:
            return False
        self._ended = True
        self._run._client._send({
            "type": "span_end",
            "runId": self._run.run_id,
            "spanId": self.span_id,
            "status": "error" if exc_type else "success",
            "timestamp": self._now(),
        })
        return False
