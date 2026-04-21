# AgentDash

**Self-hosted, real-time monitoring dashboard for AI agents.**

AgentDash gives you a terminal-style dashboard to observe every log, tool call, MCP interaction, LLM prompt/response, token count, and dollar cost your agents produce — live, as they happen. Monitor one agent or fifty agents across ten teams. No cloud required.

[![CI](https://github.com/mohammad-mainuddin/agentdash/actions/workflows/ci.yml/badge.svg)](https://github.com/mohammad-mainuddin/agentdash/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

---

## What it does

| Feature | Detail |
|---|---|
| **Real-time event stream** | Every log, tool call, MCP call, and LLM response appears instantly via WebSocket |
| **Prompt inspector** | Full message history sent to the LLM + response for every API call |
| **Cost tracking** | Per-run and total USD cost from real token counts and current model pricing |
| **MCP monitoring** | Capture every MCP tool call and resource read — input, output, duration, errors |
| **Span tree** | Nested, indented timeline of every phase in multi-step agents |
| **Alerts** | Webhook notifications (Slack, Discord, custom) on error, token budget, or time limit |
| **Projects / Namespaces** | Group agents by project — each team sees their own agents, runs, tokens, and cost |
| **Agent registry** | See every agent as a persistent entity — run count, error rate, avg duration, last seen |
| **Trend charts** | Runs/day, tokens/day, cost/day, error rate % over 7d / 14d / 30d — per project or global |
| **Run comparison** | Side-by-side diff of any two runs — events, prompts, tools, token delta, cost delta |
| **Search & filter** | Filter runs by project, agent name, status, or date range |
| **Multi-agent linking** | Link child runs to parent — see full orchestrator/subagent hierarchies |
| **Run export** | Download any run as JSON for offline analysis |
| **Data retention** | Auto-delete old runs on a configurable schedule |
| **Dark & light mode** | Full theme switching |
| **SDK resilience** | 500-event queue, exponential backoff (3s→60s), context-manager auto-close |

---

## Quick Start

```bash
git clone https://github.com/mohammad-mainuddin/agentdash
cd agentdash
docker compose up
```

- **Dashboard** → http://localhost:3000
- **API server** → http://localhost:4242

---

## Install the SDK

**Python:**
```bash
pip install agentdash                # core
pip install agentdash[tiktoken]      # + accurate token counting
pip install agentdash[all]           # + tiktoken + Anthropic
```

**JavaScript:**
```bash
npm install agentdash
```

---

## Connect Everything — Step-by-Step Guide

### 1. Python (basic)

```python
from agentdash import AgentDash

dash = AgentDash(url="http://localhost:4242")

with dash.start_run(agent_name="my-agent", project="my-project") as run:
    run.log("Starting task")
    run.tool_call(
        tool="web_search",
        input={"query": "latest AI papers"},
        output={"results": [...]},
        duration_ms=320,
    )
    run.log("Task complete")
```

Open http://localhost:3000 → **Runs** to see it live.

---

### 2. Claude / Anthropic (auto-instrumentation)

Wrap the Anthropic client once — every `messages.create` call is captured automatically with full prompts, responses, token counts, and cost:

```python
import anthropic
from agentdash import AgentDash, AnthropicInstrumentation

dash   = AgentDash(url="http://localhost:4242")
client = anthropic.Anthropic()

with dash.start_run("claude-agent", project="sales-bot") as run:
    # Wrap the client inside the run — every API call is recorded
    client = AnthropicInstrumentation(run).wrap(client)

    response = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1024,
        messages=[{"role": "user", "content": "Summarise transformer attention"}],
    )
    run.log(f"Got response: {response.content[0].text[:80]}...")
```

**What you see in the dashboard:**
- **Prompts tab** — full message history + response text
- **Tokens tab** — exact input + output token counts
- **Cost** — live USD cost per call, cumulative per run

**Run the example:**
```bash
export ANTHROPIC_API_KEY=sk-ant-...
pip install agentdash[all]
python examples/anthropic_agent/agent.py "explain transformers"
```

---

### 3. OpenAI (auto-instrumentation)

```python
import openai
from agentdash import AgentDash, OpenAIInstrumentation

dash = AgentDash(url="http://localhost:4242")

with dash.start_run("gpt-agent", project="data-pipeline") as run:
    client = OpenAIInstrumentation(run).wrap(openai.OpenAI())

    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": "What is RAG?"}],
    )
    run.log(f"Response: {response.choices[0].message.content[:80]}...")
```

---

### 4. n8n Workflows — connect via REST API

n8n uses HTTP Request nodes — no WebSocket or Python needed. Every n8n workflow can stream events directly to AgentDash.

**AgentDash server must be reachable from n8n.** If n8n runs in Docker on the same machine, use `host.docker.internal` instead of `localhost`:

```
http://host.docker.internal:4242   # inside Docker on Mac/Windows
http://172.17.0.1:4242              # inside Docker on Linux
http://localhost:4242               # when n8n runs on the host
```

#### Step 1 — Start a run at the beginning of your workflow

Add an **HTTP Request** node:
- **Method:** `POST`
- **URL:** `http://host.docker.internal:4242/runs`
- **Body (JSON):**
```json
{
  "agent_name": "my-n8n-workflow",
  "project": "n8n-automation"
}
```
- **Save response** to a variable (e.g. `run_id = $json.id`)

#### Step 2 — Log each step

Add **HTTP Request** nodes throughout your workflow:
- **Method:** `POST`
- **URL:** `http://host.docker.internal:4242/runs/{{ $vars.run_id }}/events`
- **Body (JSON):**
```json
{
  "type": "log",
  "timestamp": "{{ new Date().toISOString() }}",
  "data": { "message": "Step 3: data transformed" }
}
```

#### Step 3 — Record tool calls (shows in Tools tab)

```json
{
  "type": "tool_call",
  "timestamp": "{{ new Date().toISOString() }}",
  "data": {
    "tool": "http_get",
    "input": { "url": "https://api.example.com/data" },
    "output": { "records": 42 },
    "duration_ms": 380
  }
}
```

#### Step 4 — End the run

At the end of your workflow (and in error branches):
- **Method:** `PATCH`
- **URL:** `http://host.docker.internal:4242/runs/{{ $vars.run_id }}`
- **Body (JSON):**
```json
{ "status": "success" }
```
For error branches use `"status": "error"`.

#### Run the n8n example (Python simulation)

```bash
pip install requests
python examples/n8n_agent/agent.py
```

This simulates exactly what n8n HTTP Request nodes do — no n8n needed to test.

---

### 5. JavaScript / Node.js SDK

```js
const { AgentDash } = require("agentdash");
const dash = new AgentDash({ url: "http://localhost:4242" });

const run = dash.startRun("my-agent", { project: "sales-bot" });
await run.log("Starting");
await run.toolCall({
  tool: "search",
  input: { q: "hello" },
  output: { results: [] },
  durationMs: 100,
});
await run.llmCall({
  model: "gpt-4o",
  messages: [{ role: "user", content: "Hello" }],
  response: "Hi there!",
  inputTokens: 10,
  outputTokens: 5,
  durationMs: 800,
});
await run.end("success");

// Child run
const child = dash.startRun("sub-agent", {
  project: "sales-bot",
  parentRunId: run.runId,
});

// Spans
const span = run.span("research");
await span.start();
await span.log("fetching...");
await span.end("success");
```

---

### 6. MCP Server Monitoring

Wrap your MCP session and every `call_tool` / `read_resource` is captured automatically:

```python
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client
from agentdash import AgentDash, AnthropicInstrumentation, MCPInstrumentation

dash = AgentDash(url="http://localhost:4242")

async with stdio_client(StdioServerParameters(
    command="npx", args=["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]
)) as (read, write):
    async with ClientSession(read, write) as session:
        await session.initialize()

        with dash.start_run("mcp-agent", project="my-project") as run:
            client  = AnthropicInstrumentation(run).wrap(anthropic.Anthropic())
            session = MCPInstrumentation(run, server_name="filesystem").wrap(session)
```

**Run the example:**
```bash
pip install agentdash[all] mcp
python examples/mcp_agent/agent.py
```

---

### 7. Spans — Nested Phases

Group work into named phases. Spans nest arbitrarily and appear as a collapsible tree:

```python
with dash.start_run("research-agent", project="data-pipeline") as run:
    with run.span("research") as s:
        s.log("gathering sources")

        with s.span("fetch") as fetch:
            fetch.tool_call(tool="http_get", input={"url": "..."}, output={...}, duration_ms=450)

        with s.span("summarise") as summ:
            summ.log("calling LLM")
```

---

### 8. Multi-Agent Linking

Link child agents to their parent — the dashboard shows the full hierarchy:

```python
with dash.start_run("orchestrator", project="sales-bot") as parent:
    parent.log("Spawning sub-agents")

    with dash.start_run("sub-agent-1", project="sales-bot", parent_run_id=parent.run_id) as child:
        child.log("Working on subtask")
```

Child runs appear under the parent and show a `↳ child` label in the runs list.

---

## Projects — Team-Scale Monitoring

Assign a `project` to every agent. AgentDash groups them so each team sees their own agents, runs, cost, and error rates on the **Projects** page.

```python
# sales team
with dash.start_run("lead-qualifier",  project="sales-bot") as run: ...
with dash.start_run("email-drafter",   project="sales-bot") as run: ...

# HR team
with dash.start_run("resume-screener", project="hr-pipeline") as run: ...
with dash.start_run("onboarding-bot",  project="hr-pipeline") as run: ...

# data team
with dash.start_run("etl-agent",       project="data-pipeline") as run: ...
with dash.start_run("anomaly-detector",project="data-pipeline") as run: ...
```

The **Projects** page shows each project as a card — run count, active agents, total tokens, total cost, error rate. Click a project to open the **Agent Registry**: every agent with its run history, average duration, and last seen time.

---

## Trend Charts

The **Trends** page shows 4 charts over a selectable period (7d / 14d / 30d), filterable by project:

- **Runs per day** — how active are your agents
- **Tokens per day** — usage growth over time
- **Cost per day (¢)** — spend pattern, spikes, and anomalies
- **Error rate %** — is reliability improving or degrading

---

## Run Comparison

On any run detail page, click **⇄ Compare** to pick another run of the same agent. AgentDash opens a side-by-side view showing:

- **Diff summary** — token delta, cost delta, duration delta, tools present in one run but not the other
- **Events tab** — both runs' event streams side by side
- **Prompts tab** — LLM messages and responses compared
- **Tools tab** — tool calls with inputs and outputs

Typical use: a run failed → you fix it → re-run → compare the new run to the failed one to confirm the fix.

---

## Alerts

Configure webhook alerts in **Settings**. Fires a POST to your URL when:
- A run ends with `status=error`
- Token count exceeds your budget
- Run duration exceeds your time limit

Works with Slack, Discord, n8n, Make, or any custom endpoint.

**Webhook payload:**
```json
{
  "event": "agentdash_alert",
  "reasons": ["run_error"],
  "run": {
    "id": "...",
    "agent_name": "my-agent",
    "status": "error",
    "token_count": 4821,
    "cost_usd": 0.0144,
    "duration_s": 47
  },
  "timestamp": "2026-04-20T11:00:00Z"
}
```

---

## Dashboard Pages

| Page | Contents |
|---|---|
| **Overview** | Live activity feed, 4 stat cards (active runs, total runs, tokens, cost) |
| **Runs** | Full run list — filter by project dropdown, agent name, status; cost and project badge per row |
| **Run detail** | Logs, Prompts, Tools, MCP, Tokens, Timeline tabs + Compare + Export buttons |
| **Compare** | Side-by-side diff of two runs — diff summary, events, prompts, tools |
| **Projects** | Project cards with aggregate stats; click → agent registry for that project |
| **Trends** | 4 charts (runs/day, tokens/day, cost/day, error rate %) with period + project filter |
| **Settings** | Server URL, dark mode, alerts (webhook, on_error, token budget, time budget), retention |

---

## API Reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/stats` | Overview stats (runs, tokens, cost, LLM calls, recent events) |
| `GET` | `/stats/trends` | Daily aggregates for charts — `?days=14&project=` |
| `GET` | `/runs` | List runs — `?q=`, `?status=`, `?project=`, `?from=`, `?to=` |
| `POST` | `/runs` | Create a run |
| `GET` | `/runs/:id` | Run + events + child runs |
| `POST` | `/runs/:id/events` | Append an event to a run (REST — for n8n, Make, etc.) |
| `PATCH` | `/runs/:id` | Update run status (`{ "status": "success" \| "error" }`) |
| `GET` | `/runs/:id/export` | Download run as JSON |
| `DELETE` | `/runs/:id` | Delete a run |
| `DELETE` | `/runs?olderThan=7` | Bulk delete runs older than N days |
| `GET` | `/projects` | All projects with aggregate stats |
| `GET` | `/projects/:name/agents` | Agent registry for a project |
| `GET` | `/settings` | Get all settings |
| `PUT` | `/settings` | Update settings |
| `POST` | `/settings/test-webhook` | Send a test webhook |

---

## Configuration

| Variable | Default | Description |
|---|---|---|
| `PORT` | `4242` | Server port |
| `DATA_DIR` | `./data` | SQLite storage directory |
| `AGENTDASH_API_KEY` | _(unset)_ | API key — disables open access when set |

### Enabling Auth

```yaml
# docker-compose.yml
services:
  server:
    environment:
      - AGENTDASH_API_KEY=your-secret-key
```

```python
dash = AgentDash(url="http://localhost:4242", api_key="your-secret-key")
```

---

## Repo Structure

```
agentdash/
├── dashboard/           # React + Vite + Tailwind + Recharts frontend
│   └── src/
│       ├── pages/       # Overview, Runs, RunDetail, Compare, Projects, Trends, Settings
│       ├── components/  # Sidebar, StatusBadge
│       └── context/     # Settings, WebSocket
│
├── server/              # Node.js + Express + WebSocket (SQLite)
│
├── sdk/
│   ├── python/          # Python SDK
│   └── js/              # JavaScript SDK
│
├── examples/
│   ├── simple_agent/    # Pure Python SDK — no API key needed
│   ├── anthropic_agent/ # Claude + auto-instrumentation
│   ├── mcp_agent/       # Claude + MCP filesystem server
│   └── n8n_agent/       # REST-only example (works with n8n, Make, Zapier, etc.)
│
├── tests/
│   ├── server.test.js   # Jest + supertest
│   └── test_sdk.py      # pytest
│
└── docker-compose.yml
```

---

## Run the Examples

```bash
# Basic Python — no API key needed
python examples/simple_agent/agent.py

# Claude + auto-instrumentation
export ANTHROPIC_API_KEY=sk-ant-...
pip install agentdash[all]
python examples/anthropic_agent/agent.py "explain transformers"

# Claude + MCP filesystem
pip install agentdash[all] mcp
python examples/mcp_agent/agent.py

# n8n-style REST-only (simulates n8n HTTP Request nodes)
pip install requests
python examples/n8n_agent/agent.py
```

Open http://localhost:3000 to watch live.

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

```bash
docker compose up
pytest tests/test_sdk.py -v
node server/node_modules/.bin/jest tests/server.test.js --forceExit
```

---

## License

MIT — Built for engineers who want full observability over their AI agents without sending data to a third-party cloud.
