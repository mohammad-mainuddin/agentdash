# AgentDash

**Self-hosted, real-time monitoring dashboard for AI agents.**

AgentDash gives you a terminal-style dashboard to observe every log, tool call, span, and token your agents produce — live, as they happen. No cloud required.

[![CI](https://github.com/yourname/agentdash/actions/workflows/ci.yml/badge.svg)](https://github.com/yourname/agentdash/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![PyPI](https://img.shields.io/pypi/v/agentdash)](https://pypi.org/project/agentdash/)
[![npm](https://img.shields.io/npm/v/agentdash)](https://www.npmjs.com/package/agentdash)

---

## Quick Start

```bash
git clone https://github.com/yourname/agentdash
cd agentdash
docker-compose up
```

- **Dashboard** → http://localhost:3000
- **API server** → http://localhost:4242

---

## Install the SDK

```bash
pip install agentdash           # core
pip install agentdash[tiktoken] # + accurate token counting
pip install agentdash[all]      # + tiktoken + Anthropic instrumentation
```

```bash
npm install agentdash
```

---

## Connect an Agent (Python)

```python
from agentdash import AgentDash

dash = AgentDash(url="http://localhost:4242")

with dash.start_run(agent_name="my-agent") as run:
    run.log("Starting task")
    run.tool_call(
        tool="web_search",
        input={"query": "Claude Managed Agents"},
        output={"results": [...]},
        duration_ms=320,
    )
    run.log("Task complete")
```

---

## Nested Spans

Group related work into named phases. Spans can be nested arbitrarily:

```python
with dash.start_run("research-agent") as run:
    with run.span("research") as s:
        s.log("gathering sources")

        with s.span("fetch-pages") as fetch:
            fetch.tool_call(tool="http_get", input={"url": "..."}, output={...}, duration_ms=450)

        with s.span("summarise") as summ:
            summ.tool_call(tool="llm", input={"prompt": "..."}, output={...}, duration_ms=1200)
```

The **Span Tree** tab in the dashboard renders the full nested timeline.

---

## Auto-Instrumentation (Anthropic)

Zero manual logging — wrap the Anthropic client and every LLM call is tracked automatically with **real token counts** from the API response:

```python
import anthropic
from agentdash import AgentDash, AnthropicInstrumentation

dash   = AgentDash(url="http://localhost:4242")
client = anthropic.Anthropic()

with dash.start_run("my-agent") as run:
    client = AnthropicInstrumentation(run).wrap(client)

    # All calls below are automatically logged — inputs, outputs, token counts
    response = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1024,
        messages=[{"role": "user", "content": "Hello!"}],
    )
```

### OpenAI

```python
import openai
from agentdash import AgentDash, OpenAIInstrumentation

dash   = AgentDash(url="http://localhost:4242")
client = openai.OpenAI()

with dash.start_run("my-agent") as run:
    client = OpenAIInstrumentation(run).wrap(client)
    response = client.chat.completions.create(...)
```

---

## Connect an Agent (JavaScript)

```js
const { AgentDash } = require("agentdash");

const dash = new AgentDash({ url: "http://localhost:4242" });
const run  = dash.startRun("my-agent");

await run.log("Starting task");
await run.toolCall({ tool: "search", input: { q: "hello" }, output: {}, durationMs: 100 });

// Spans
const span = run.span("research-phase");
await span.start();
await span.log("fetching pages");
await span.end("success");

await run.end("success");
```

---

## Run the Examples

**Simulated agent** (no API key needed):

```bash
cd examples/simple_agent
pip install -r ../../sdk/python/requirements.txt
python agent.py "your research topic"
```

**Real Anthropic agent** (with auto-instrumentation):

```bash
export ANTHROPIC_API_KEY=sk-ant-...
cd examples/anthropic_agent
pip install anthropic agentdash[all]
python agent.py "transformer attention mechanisms"
```

Watch both appear live at http://localhost:3000.

---

## Repo Structure

```
agentdash/
├── dashboard/            # React + Vite + TailwindCSS frontend
│   └── src/
│       ├── pages/        # Home, Runs, RunDetail (span tree), Settings
│       ├── components/   # Sidebar, StatusBadge
│       └── context/      # Settings, WebSocket
│
├── server/               # Node.js + Express + WebSocket backend
│
├── sdk/
│   ├── python/           # Python SDK — pip install agentdash
│   └── js/               # JavaScript SDK — npm install agentdash
│
├── examples/
│   ├── simple_agent/     # Simulated research agent (no API key)
│   └── anthropic_agent/  # Real Claude agent with auto-instrumentation
│
├── tests/
│   ├── server.test.js    # Node.js server tests (Jest + supertest)
│   └── test_sdk.py       # Python SDK unit tests (pytest)
│
├── .github/workflows/ci.yml
├── docker-compose.yml
├── CONTRIBUTING.md
└── README.md
```

---

## Dashboard Features

| Page | What you see |
|---|---|
| **Overview** | Active runs, total runs, token count, live activity feed |
| **Runs** | Table of all runs with status, duration, token count |
| **Run Detail** | Logs, Tool Calls, Tokens, Span Tree tabs — all live |
| **Settings** | Server URL, dark/light mode, data retention cleanup |

### Span Tree

When your agent uses spans, the Timeline tab becomes a **Span Tree** — a nested, indented view of every phase, tool call, and log entry in the order they happened. Parent spans are shown with their children indented beneath them.

---

## Architecture

```
Your Agent
    │  WebSocket (ws://localhost:4242)
    ▼
AgentDash Server (Node.js + Express)
    │  SQLite (persisted via Docker volume)
    │  WebSocket broadcast
    ▼
AgentDash Dashboard (React)
```

All events flow through WebSocket in real time. SQLite persists between restarts via a Docker volume. No external dependencies.

---

## API Reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/stats` | Aggregate stats (total, active, tokens, recent events) |
| `GET` | `/runs` | List all runs |
| `POST` | `/runs` | Create a run manually |
| `GET` | `/runs/:id` | Get run + all events |
| `DELETE` | `/runs/:id` | Delete a run |
| `DELETE` | `/runs?olderThan=7` | Bulk delete old runs |

When `AGENTDASH_API_KEY` is set, all REST requests must include the key:

```
Authorization: Bearer <your-key>
# or
X-Api-Key: <your-key>
```

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
# Python SDK
dash = AgentDash(url="http://localhost:4242", api_key="your-secret-key")
```

```js
// JavaScript SDK
const dash = new AgentDash({ url: "http://localhost:4242", apiKey: "your-secret-key" });
```

---

## SDK Reliability

Both SDKs include:

| Feature | Detail |
|---|---|
| **Event queue** | Events sent while disconnected are buffered (up to 500) and flushed on reconnect |
| **Exponential backoff** | Reconnect delay starts at 3s, doubles each failure, caps at 60s |
| **Context manager** | `with dash.start_run(...) as run:` — auto-calls `run.end("error")` on exception |

---

## Token Counts

Token counts are **accurate when tiktoken is installed** (`pip install agentdash[tiktoken]`), using the `cl100k_base` encoding. Without tiktoken, counts fall back to a character-length estimate (~1 token per 4 chars).

Token counts from auto-instrumentation (Anthropic, OpenAI) always use the **exact counts from the API response**, regardless of tiktoken.

The dashboard shows a `~` prefix on estimated counts to distinguish them from exact values.

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Issues and PRs welcome.

Quick setup:

```bash
git clone https://github.com/yourname/agentdash
docker-compose up
pytest tests/test_sdk.py        # Python SDK tests
npx jest tests/server.test.js   # Server tests
```

---

## License

MIT © AgentDash Contributors

---

Built for engineers who want full observability over their AI agents without sending data to a third-party cloud.
