"""
AgentDash REST API — zero dependency version (stdlib only)
Use this when you can't install requests.
"""

import json
import time
import urllib.request
from urllib.error import HTTPError

SERVER = "http://localhost:4242"


def _post(path: str, body: dict):
    data = json.dumps(body).encode()
    req = urllib.request.Request(
        f"{SERVER}{path}",
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())


def _patch(path: str, body: dict):
    data = json.dumps(body).encode()
    req = urllib.request.Request(
        f"{SERVER}{path}",
        data=data,
        headers={"Content-Type": "application/json"},
        method="PATCH",
    )
    with urllib.request.urlopen(req):
        pass


# Start a run
resp = _post("/runs", {"agent_name": "my-n8n-agent", "project": "n8n-demo"})
run_id = resp["id"]
print(f"Run started: {run_id}")

# Log steps
_post(f"/runs/{run_id}/events", {
    "type": "log",
    "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    "data": {"message": "Workflow step 1: data fetched"},
})

_post(f"/runs/{run_id}/events", {
    "type": "tool_call",
    "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    "data": {
        "tool": "http_get",
        "input": {"url": "https://api.example.com/data"},
        "output": {"records": 42},
        "duration_ms": 320,
    },
})

_post(f"/runs/{run_id}/events", {
    "type": "log",
    "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    "data": {"message": "Workflow complete"},
})

# End the run
_patch(f"/runs/{run_id}", {"status": "success"})
print(f"Done — http://localhost:3000/runs/{run_id}")
