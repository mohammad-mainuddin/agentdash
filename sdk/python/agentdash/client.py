"""
AgentDash client — manages the WebSocket connection to the server.
"""

import json
import threading
import time
import uuid
from collections import deque
from datetime import datetime, timezone

import websocket  # websocket-client

from .run import AgentRun

_MAX_QUEUE  = 500
_BACKOFF_MIN = 3
_BACKOFF_MAX = 60

# tiktoken is optional — used for accurate token counting when available
try:
    import tiktoken
    _encoder = tiktoken.get_encoding("cl100k_base")
    def count_tokens(text: str) -> int:
        return len(_encoder.encode(text))
except ImportError:
    def count_tokens(text: str) -> int:
        return max(1, len(text) // 4)


class AgentDash:
    """
    Main entry point for the AgentDash SDK.

    Args:
        url:     Base URL of the AgentDash server (e.g. "http://localhost:4242")
        api_key: Optional API key — must match AGENTDASH_API_KEY on the server
    """

    def __init__(self, url: str = "http://localhost:4242", api_key: str | None = None):
        self.url = url.rstrip("/")
        self._api_key = api_key
        self.count_tokens = count_tokens  # expose so instrumentation can use it

        ws_url = self.url.replace("http://", "ws://").replace("https://", "wss://")
        if api_key:
            ws_url = f"{ws_url}?key={api_key}"
        self._ws_url = ws_url

        self._ws: websocket.WebSocketApp | None = None
        self._connected = threading.Event()
        self._lock = threading.Lock()
        self._queue: deque[str] = deque(maxlen=_MAX_QUEUE)
        self._reconnect_delay = _BACKOFF_MIN
        self._connect()

    # ── Connection ────────────────────────────────────────────────────────────

    def _connect(self):
        """Establish WebSocket connection in a background thread."""

        def on_open(ws):
            self._reconnect_delay = _BACKOFF_MIN
            self._connected.set()
            print(f"[AgentDash] Connected to {self.url}")
            self._flush_queue()

        def on_error(ws, error):
            print(f"[AgentDash] WebSocket error: {error}")

        def on_close(ws, code, msg):
            self._connected.clear()
            delay = self._reconnect_delay
            self._reconnect_delay = min(self._reconnect_delay * 2, _BACKOFF_MAX)
            print(f"[AgentDash] Disconnected — reconnecting in {delay}s")
            time.sleep(delay)
            self._connect()

        self._ws = websocket.WebSocketApp(
            self._ws_url,
            on_open=on_open,
            on_error=on_error,
            on_close=on_close,
        )

        t = threading.Thread(target=self._ws.run_forever, daemon=True)
        t.start()

        if not self._connected.wait(timeout=5):
            print("[AgentDash] Warning: could not connect within 5s — events will be queued")

    def _flush_queue(self):
        """Send any events that were queued while disconnected."""
        with self._lock:
            while self._queue:
                payload = self._queue.popleft()
                try:
                    self._ws.send(payload)
                except Exception as e:
                    print(f"[AgentDash] Flush failed, re-queuing: {e}")
                    self._queue.appendleft(payload)
                    break

    def _send(self, event: dict):
        """Send a single event over WebSocket, queuing if disconnected."""
        if "timestamp" not in event:
            event["timestamp"] = datetime.now(timezone.utc).isoformat()

        payload = json.dumps(event)

        with self._lock:
            if self._ws and self._connected.is_set():
                try:
                    self._ws.send(payload)
                    return
                except Exception as e:
                    print(f"[AgentDash] Send failed, queuing: {e}")

            if len(self._queue) >= _MAX_QUEUE:
                print(f"[AgentDash] Queue full ({_MAX_QUEUE}) — oldest event dropped")
            self._queue.append(payload)

    # ── Public API ────────────────────────────────────────────────────────────

    def start_run(self, agent_name: str) -> "AgentRun":
        """
        Start a new agent run and return a Run object for logging.

        Args:
            agent_name: Human-readable name for this agent

        Returns:
            AgentRun instance
        """
        run_id = str(uuid.uuid4())
        self._send({
            "type": "run_start",
            "runId": run_id,
            "agentName": agent_name,
        })
        return AgentRun(run_id=run_id, agent_name=agent_name, client=self)
