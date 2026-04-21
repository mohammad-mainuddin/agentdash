"""
AgentDash Example — n8n-style REST-only Agent
==============================================
This example shows how to instrument ANY automation tool (n8n, Make, Zapier,
Node-RED, or plain HTTP) using the AgentDash REST API — no SDK or WebSocket
needed. Each step is a plain HTTP call.

This is exactly what you replicate with n8n HTTP Request nodes.

Run with:
    pip install requests          # or use built-in urllib
    python agent.py

Or run the bare-urllib version (zero dependencies):
    python agent_urllib.py

Make sure AgentDash server is running:
    docker compose up
"""

import time
import uuid
import requests

SERVER = "http://localhost:4242"


def start_run(agent_name: str, project: str) -> str:
    """POST /runs — create a new run, returns run_id."""
    resp = requests.post(f"{SERVER}/runs", json={
        "agent_name": agent_name,
        "project": project,
    })
    resp.raise_for_status()
    return resp.json()["id"]


def log_event(run_id: str, message: str, event_type: str = "log", data: dict = None):
    """POST /runs/:id/events — append any event to a run."""
    payload = {
        "type": event_type,
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "data": data or {"message": message},
    }
    requests.post(f"{SERVER}/runs/{run_id}/events", json=payload).raise_for_status()


def tool_event(run_id: str, tool: str, inp: dict, out: dict, duration_ms: int):
    """Helper: record a tool_call event."""
    log_event(run_id, tool, event_type="tool_call", data={
        "tool": tool,
        "input": inp,
        "output": out,
        "duration_ms": duration_ms,
    })


def llm_event(run_id: str, model: str, messages: list, response: str,
              input_tokens: int, output_tokens: int, duration_ms: int):
    """Helper: record an llm_call event (shows in Prompts tab)."""
    log_event(run_id, model, event_type="llm_call", data={
        "model": model,
        "messages": messages,
        "response": response,
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "duration_ms": duration_ms,
        "cost_usd": (input_tokens * 3 + output_tokens * 15) / 1_000_000,  # Haiku pricing
    })


def end_run(run_id: str, status: str = "success"):
    """PATCH /runs/:id — mark the run finished."""
    requests.patch(f"{SERVER}/runs/{run_id}", json={"status": status}).raise_for_status()


# ── Simulated n8n workflow: "Customer Support Triage" ────────────────────────

def run_support_triage(ticket_id: str, customer_email: str, subject: str):
    print(f"\n[n8n] Webhook triggered — ticket {ticket_id}")

    run_id = start_run("support-triage", project="customer-support")
    print(f"[AgentDash] Run started: {run_id[:8]}...")

    try:
        # Step 1 (Webhook node): ticket received
        log_event(run_id, f"Ticket {ticket_id} received from {customer_email}")
        log_event(run_id, f"Subject: {subject}")
        time.sleep(0.3)

        # Step 2 (HTTP Request node): look up customer
        t0 = time.time()
        time.sleep(0.4)  # simulate API call
        customer = {"name": "Alice Johnson", "plan": "pro", "open_tickets": 2}
        tool_event(run_id, "lookup_customer",
                   inp={"email": customer_email},
                   out=customer,
                   duration_ms=int((time.time() - t0) * 1000))
        log_event(run_id, f"Customer: {customer['name']} ({customer['plan']} plan)")

        # Step 3 (AI node): classify the ticket
        t0 = time.time()
        time.sleep(0.8)  # simulate LLM call
        classification = "billing"
        llm_event(run_id,
                  model="claude-haiku-4-5",
                  messages=[
                      {"role": "user", "content": f"Classify this support ticket: {subject}"}
                  ],
                  response=f"Category: {classification}. Priority: medium. Sentiment: frustrated.",
                  input_tokens=45,
                  output_tokens=18,
                  duration_ms=int((time.time() - t0) * 1000))
        log_event(run_id, f"Ticket classified as: {classification}")

        # Step 4 (HTTP Request node): route to correct team queue
        t0 = time.time()
        time.sleep(0.3)
        tool_event(run_id, "assign_to_queue",
                   inp={"ticket_id": ticket_id, "queue": classification, "priority": "medium"},
                   out={"queued": True, "position": 3, "estimated_wait_minutes": 12},
                   duration_ms=int((time.time() - t0) * 1000))
        log_event(run_id, "Ticket assigned to billing queue (position 3)")

        # Step 5 (Send Email node): acknowledgement to customer
        t0 = time.time()
        time.sleep(0.2)
        tool_event(run_id, "send_email",
                   inp={
                       "to": customer_email,
                       "subject": f"Re: {subject} [Ticket #{ticket_id}]",
                       "body": "We received your ticket and our billing team will reply within 12 minutes.",
                   },
                   out={"sent": True, "message_id": str(uuid.uuid4())[:8]},
                   duration_ms=int((time.time() - t0) * 1000))
        log_event(run_id, f"Acknowledgement email sent to {customer_email}")

        end_run(run_id, "success")
        print(f"[AgentDash] Run complete — view at http://localhost:3000/runs/{run_id}")

    except Exception as e:
        log_event(run_id, f"Error: {e}")
        end_run(run_id, "error")
        raise


if __name__ == "__main__":
    run_support_triage(
        ticket_id="TKT-9281",
        customer_email="alice@acme.com",
        subject="Invoice shows wrong amount for March",
    )
