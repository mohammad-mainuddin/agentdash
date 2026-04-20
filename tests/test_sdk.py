"""
AgentDash Python SDK — unit tests.
Uses a mock WebSocket server so no real server is needed.
"""

import json
import threading
import time
import uuid
from unittest.mock import MagicMock, patch

import pytest

# ── Helpers ───────────────────────────────────────────────────────────────────

def make_client(captured: list):
    """Return an AgentDash client whose _send() appends to `captured`."""
    from agentdash.client import AgentDash

    with patch("websocket.WebSocketApp") as MockWS:
        instance = MagicMock()
        MockWS.return_value = instance

        # Simulate immediate connection
        def fake_run_forever():
            pass
        instance.run_forever = fake_run_forever

        client = AgentDash.__new__(AgentDash)
        client.url = "http://localhost:4242"
        client._api_key = None
        client._ws_url = "ws://localhost:4242"
        client._ws = instance
        client._connected = threading.Event()
        client._connected.set()
        client._lock = threading.Lock()
        from collections import deque
        client._queue = deque(maxlen=500)
        client._reconnect_delay = 3
        from agentdash.client import count_tokens
        client.count_tokens = count_tokens

        # Override _send to capture events
        def capture(event):
            if "timestamp" not in event:
                from datetime import datetime, timezone
                event["timestamp"] = datetime.now(timezone.utc).isoformat()
            captured.append(event)
        client._send = capture

        return client


# ── AgentRun ──────────────────────────────────────────────────────────────────

class TestAgentRun:
    def test_log_sends_correct_event(self):
        captured = []
        client = make_client(captured)
        run = client.start_run("test-agent")
        captured.clear()  # discard run_start

        run.log("hello world")

        assert len(captured) == 1
        evt = captured[0]
        assert evt["type"] == "log"
        assert evt["message"] == "hello world"
        assert evt["runId"] == run.run_id
        assert "timestamp" in evt
        assert "tokenCount" in evt
        assert evt["tokenCount"] > 0

    def test_tool_call_sends_correct_event(self):
        captured = []
        client = make_client(captured)
        run = client.start_run("test-agent")
        captured.clear()

        run.tool_call(tool="search", input={"q": "hi"}, output={"result": "ok"}, duration_ms=150)

        assert len(captured) == 1
        evt = captured[0]
        assert evt["type"] == "tool_call"
        assert evt["tool"] == "search"
        assert evt["input"] == {"q": "hi"}
        assert evt["output"] == {"result": "ok"}
        assert evt["duration_ms"] == 150
        assert "tokenCount" in evt

    def test_end_sends_run_end(self):
        captured = []
        client = make_client(captured)
        run = client.start_run("test-agent")
        captured.clear()

        run.end("success")

        assert len(captured) == 1
        assert captured[0]["type"] == "run_end"
        assert captured[0]["status"] == "success"

    def test_end_idempotent(self):
        captured = []
        client = make_client(captured)
        run = client.start_run("test-agent")
        captured.clear()

        run.end("success")
        run.end("success")

        assert len(captured) == 1  # only one run_end

    def test_context_manager_success(self):
        captured = []
        client = make_client(captured)

        with client.start_run("test-agent") as run:
            run.log("working")

        end_events = [e for e in captured if e["type"] == "run_end"]
        assert len(end_events) == 1
        assert end_events[0]["status"] == "success"

    def test_context_manager_error(self):
        captured = []
        client = make_client(captured)

        with pytest.raises(ValueError):
            with client.start_run("test-agent") as run:
                raise ValueError("boom")

        end_events = [e for e in captured if e["type"] == "run_end"]
        assert end_events[0]["status"] == "error"


# ── Spans ─────────────────────────────────────────────────────────────────────

class TestSpans:
    def test_span_emits_start_and_end(self):
        captured = []
        client = make_client(captured)
        run = client.start_run("test-agent")
        captured.clear()

        with run.span("my-phase") as s:
            s.log("inside span")

        types = [e["type"] for e in captured]
        assert "span_start" in types
        assert "span_end" in types
        assert "log" in types

    def test_span_carries_span_id(self):
        captured = []
        client = make_client(captured)
        run = client.start_run("test-agent")
        captured.clear()

        with run.span("phase") as s:
            s.log("msg")

        start_evt = next(e for e in captured if e["type"] == "span_start")
        log_evt   = next(e for e in captured if e["type"] == "log")
        assert start_evt["spanId"] == s.span_id
        assert log_evt["spanId"] == s.span_id

    def test_nested_spans_have_parent_id(self):
        captured = []
        client = make_client(captured)
        run = client.start_run("test-agent")
        captured.clear()

        with run.span("parent") as parent:
            with parent.span("child") as child:
                child.log("nested")

        child_start = next(
            e for e in captured
            if e["type"] == "span_start" and e["spanId"] == child.span_id
        )
        assert child_start["parentSpanId"] == parent.span_id

    def test_span_end_error_on_exception(self):
        captured = []
        client = make_client(captured)
        run = client.start_run("test-agent")
        captured.clear()

        with pytest.raises(RuntimeError):
            with run.span("phase") as s:
                raise RuntimeError("fail")

        end_evt = next(e for e in captured if e["type"] == "span_end")
        assert end_evt["status"] == "error"


# ── Token counting ────────────────────────────────────────────────────────────

class TestTokenCounting:
    def test_count_tokens_returns_positive(self):
        from agentdash.client import count_tokens
        assert count_tokens("hello world") > 0

    def test_count_tokens_scales_with_length(self):
        from agentdash.client import count_tokens
        short = count_tokens("hi")
        long  = count_tokens("hello world " * 100)
        assert long > short

    def test_log_includes_token_count(self):
        captured = []
        client = make_client(captured)
        run = client.start_run("test-agent")
        captured.clear()

        run.log("the quick brown fox")
        assert captured[0]["tokenCount"] > 0


# ── Queue behaviour ───────────────────────────────────────────────────────────

class TestQueue:
    def test_events_queued_when_disconnected(self):
        from agentdash.client import AgentDash

        with patch("websocket.WebSocketApp"):
            client = AgentDash.__new__(AgentDash)
            client.url = "http://localhost:4242"
            client._api_key = None
            client._ws = MagicMock()
            client._connected = threading.Event()  # not set = disconnected
            client._lock = threading.Lock()
            from collections import deque
            client._queue = deque(maxlen=500)
            client._reconnect_delay = 3
            from agentdash.client import count_tokens
            client.count_tokens = count_tokens

            client._send({"type": "log", "runId": "x", "message": "hello"})

            assert len(client._queue) == 1
