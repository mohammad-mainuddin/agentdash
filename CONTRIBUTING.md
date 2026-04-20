# Contributing to AgentDash

Thanks for your interest in contributing! This guide gets you from zero to a working dev environment in under 10 minutes.

---

## Quick Setup

```bash
git clone https://github.com/yourname/agentdash
cd agentdash
docker-compose up   # starts server + dashboard
```

**Ports:**
- Dashboard → http://localhost:3000
- API server → http://localhost:4242

---

## Project Structure

```
agentdash/
├── server/          Node.js + Express + WebSocket backend
├── dashboard/       React + Vite + TailwindCSS frontend
├── sdk/
│   ├── python/      Python SDK (pip install agentdash)
│   └── js/          JavaScript SDK (npm install agentdash)
├── examples/        Runnable example agents
└── tests/           Integration + unit tests
```

---

## Running Tests

### Server (Node.js)

```bash
cd server && npm install
npx jest ../tests/server.test.js --forceExit
```

### Python SDK

```bash
pip install websocket-client tiktoken anthropic pytest
pytest tests/test_sdk.py -v
```

### All (via CI locally)

```bash
# requires act: https://github.com/nektos/act
act push
```

---

## Development Workflows

### Working on the server

```bash
cd server
npm install
node index.js          # runs on port 4242
# or with auto-reload:
npx nodemon index.js
```

### Working on the dashboard

```bash
cd dashboard
npm install
npm run dev            # Vite dev server on port 5173
```

Update `dashboard/src/lib/api.js` to point at `http://localhost:4242` during local dev.

### Working on the Python SDK

```bash
cd sdk/python
pip install -e ".[dev]"    # editable install with dev extras
python -c "from agentdash import AgentDash; print('ok')"
```

### Running the example agent

```bash
# Start the server first (docker-compose up or node server/index.js)
cd examples/simple_agent
pip install -r ../../sdk/python/requirements.txt
python agent.py "your topic"
```

---

## Making Changes

1. **Fork** the repo and create a branch: `git checkout -b feat/my-feature`
2. **Make changes** — see conventions below
3. **Run tests** — all tests must pass
4. **Open a PR** against `main` with a clear description of what changed and why

---

## Code Conventions

### Server (JavaScript)
- No TypeScript — keep it plain Node.js for simplicity
- `const` over `let`, no `var`
- Event handlers go through `handleSdkEvent()` — add new event types there

### Python SDK
- Python 3.10+ syntax (`X | Y` union types, `match` statements are fine)
- All public classes/methods need a one-line docstring
- Optional deps (`tiktoken`, `anthropic`) must be imported inside functions with a clear `ImportError` message

### Dashboard (React)
- Functional components only
- Tailwind utility classes — no custom CSS unless unavoidable
- New pages go in `dashboard/src/pages/`, new shared components in `dashboard/src/components/`

---

## Good First Issues

Look for issues labelled `good first issue`. Typical examples:

- Adding a new event type to the SDK + server
- Improving the token count display (e.g. exact vs estimated label)
- Adding a copy-to-clipboard button on tool call I/O
- Dark/light mode improvements
- New framework instrumentation (LangChain, etc.)

---

## Adding a New Framework Instrumentation

1. Add a class to `sdk/python/agentdash/instrumentation.py` following the `AnthropicInstrumentation` pattern
2. Export it from `sdk/python/agentdash/__init__.py`
3. Add an optional dependency entry in `pyproject.toml`
4. Add a usage example to the README
5. Write at least one unit test in `tests/test_sdk.py`

---

## Reporting Bugs

Open an issue with:
- AgentDash version (`pip show agentdash` or `npm list agentdash`)
- What you did, what you expected, what happened
- Relevant logs from the server (`docker-compose logs server`)

---

## License

By contributing, you agree that your changes will be licensed under the MIT License.
