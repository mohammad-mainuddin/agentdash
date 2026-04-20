/**
 * AgentDash Server
 * Node.js + Express + WebSocket backend
 * Port 4242
 */

const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const cors = require("cors");
const { v4: uuidv4 } = require("uuid");
const db = require("./db");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(cors());
app.use(express.json());

// ── Auth ──────────────────────────────────────────────────────────────────────

const API_KEY = process.env.AGENTDASH_API_KEY || null;

function checkApiKey(key) {
  if (!API_KEY) return true;
  return key === API_KEY;
}

function requireAuth(req, res, next) {
  if (!API_KEY) return next();
  const header = req.headers["authorization"] || "";
  const key = header.startsWith("Bearer ") ? header.slice(7) : req.headers["x-api-key"];
  if (!checkApiKey(key)) return res.status(401).json({ error: "Unauthorized" });
  next();
}

app.use(requireAuth);

// ── WebSocket ─────────────────────────────────────────────────────────────────

const dashboardClients = new Set();

function broadcastToDashboard(event) {
  const message = JSON.stringify(event);
  for (const client of dashboardClients) {
    if (client.readyState === WebSocket.OPEN) client.send(message);
  }
}

wss.on("connection", (ws, req) => {
  const urlObj = new URL(req.url, "http://localhost");
  const clientType = urlObj.pathname === "/dashboard" ? "dashboard" : "sdk";
  const key = urlObj.searchParams.get("key");

  if (!checkApiKey(key)) {
    ws.close(4401, "Unauthorized");
    console.log(`[WS] Rejected unauthenticated ${clientType} connection`);
    return;
  }

  if (clientType === "dashboard") {
    dashboardClients.add(ws);
    console.log(`[WS] Dashboard client connected (${dashboardClients.size} total)`);
    ws.on("close", () => {
      dashboardClients.delete(ws);
      console.log(`[WS] Dashboard client disconnected (${dashboardClients.size} total)`);
    });
    return;
  }

  console.log("[WS] SDK client connected");

  ws.on("message", (data) => {
    let event;
    try {
      event = JSON.parse(data.toString());
    } catch (e) {
      console.error("[WS] Invalid JSON from SDK:", e.message);
      return;
    }
    console.log(`[WS] Event received: ${event.type} (run: ${event.runId})`);
    try {
      handleSdkEvent(event);
    } catch (err) {
      console.error("[WS] Error handling event:", err.message);
    }
  });

  ws.on("close", () => console.log("[WS] SDK client disconnected"));
});

// ── Event handler ─────────────────────────────────────────────────────────────

function handleSdkEvent(event) {
  const ts = event.timestamp || new Date().toISOString();

  // Helper: ensure run row exists (for out-of-order events)
  function ensureRun(runId) {
    const run = db.prepare("SELECT id FROM runs WHERE id = ?").get(runId);
    if (!run) {
      db.prepare(
        `INSERT OR IGNORE INTO runs (id, agent_name, status, started_at, token_count) VALUES (?, 'unknown', 'running', ?, 0)`
      ).run(runId, ts);
    }
  }

  // Use SDK-supplied token count if present, otherwise estimate from text length
  function resolveTokens(event, ...textParts) {
    if (typeof event.tokenCount === "number") return event.tokenCount;
    const text = textParts.filter(Boolean).join(" ");
    return Math.ceil(text.length / 4);
  }

  switch (event.type) {
    case "run_start": {
      db.prepare(
        `INSERT OR REPLACE INTO runs (id, agent_name, status, started_at, token_count) VALUES (?, ?, 'running', ?, 0)`
      ).run(event.runId, event.agentName, ts);

      db.prepare(
        `INSERT INTO events (id, run_id, type, data, timestamp) VALUES (?, ?, ?, ?, ?)`
      ).run(uuidv4(), event.runId, "run_start", JSON.stringify({ agentName: event.agentName }), ts);
      break;
    }

    case "log": {
      ensureRun(event.runId);
      db.prepare(
        `INSERT INTO events (id, run_id, type, data, timestamp) VALUES (?, ?, ?, ?, ?)`
      ).run(
        uuidv4(), event.runId, "log",
        JSON.stringify({ message: event.message, spanId: event.spanId || null }),
        ts
      );
      const tokens = resolveTokens(event, event.message);
      db.prepare("UPDATE runs SET token_count = token_count + ? WHERE id = ?").run(tokens, event.runId);
      break;
    }

    case "tool_call": {
      ensureRun(event.runId);
      db.prepare(
        `INSERT INTO events (id, run_id, type, data, timestamp) VALUES (?, ?, ?, ?, ?)`
      ).run(
        uuidv4(), event.runId, "tool_call",
        JSON.stringify({
          tool: event.tool,
          input: event.input,
          output: event.output,
          duration_ms: event.duration_ms || 0,
          spanId: event.spanId || null,
        }),
        ts
      );
      const tokens = resolveTokens(
        event,
        JSON.stringify(event.input || ""),
        JSON.stringify(event.output || "")
      );
      db.prepare("UPDATE runs SET token_count = token_count + ? WHERE id = ?").run(tokens, event.runId);
      break;
    }

    case "span_start": {
      ensureRun(event.runId);
      db.prepare(
        `INSERT INTO events (id, run_id, type, data, timestamp) VALUES (?, ?, ?, ?, ?)`
      ).run(
        uuidv4(), event.runId, "span_start",
        JSON.stringify({ name: event.name, spanId: event.spanId, parentSpanId: event.parentSpanId || null }),
        ts
      );
      break;
    }

    case "span_end": {
      ensureRun(event.runId);
      db.prepare(
        `INSERT INTO events (id, run_id, type, data, timestamp) VALUES (?, ?, ?, ?, ?)`
      ).run(
        uuidv4(), event.runId, "span_end",
        JSON.stringify({ spanId: event.spanId, status: event.status }),
        ts
      );
      break;
    }

    case "run_end": {
      db.prepare(`UPDATE runs SET status = ?, ended_at = ? WHERE id = ?`).run(
        event.status || "success", ts, event.runId
      );
      db.prepare(
        `INSERT INTO events (id, run_id, type, data, timestamp) VALUES (?, ?, ?, ?, ?)`
      ).run(uuidv4(), event.runId, "run_end", JSON.stringify({ status: event.status }), ts);
      break;
    }

    default:
      console.warn(`[WS] Unknown event type: ${event.type}`);
      return;
  }

  const run = db.prepare("SELECT * FROM runs WHERE id = ?").get(event.runId);
  broadcastToDashboard({ ...event, _run: run });
}

// ── REST API ──────────────────────────────────────────────────────────────────

app.post("/runs", (req, res) => {
  const { agentName } = req.body;
  if (!agentName) return res.status(400).json({ error: "agentName is required" });
  const id = uuidv4();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO runs (id, agent_name, status, started_at, token_count) VALUES (?, ?, 'running', ?, 0)`
  ).run(id, agentName, now);
  res.status(201).json({ id, agentName, status: "running", started_at: now });
});

app.get("/runs", (req, res) => {
  const runs = db.prepare("SELECT * FROM runs ORDER BY started_at DESC").all();
  res.json(runs);
});

app.get("/runs/:id", (req, res) => {
  const run = db.prepare("SELECT * FROM runs WHERE id = ?").get(req.params.id);
  if (!run) return res.status(404).json({ error: "Run not found" });
  const events = db
    .prepare("SELECT * FROM events WHERE run_id = ? ORDER BY timestamp ASC")
    .all(req.params.id)
    .map((e) => ({ ...e, data: JSON.parse(e.data) }));
  res.json({ ...run, events });
});

app.delete("/runs/:id", (req, res) => {
  const run = db.prepare("SELECT id FROM runs WHERE id = ?").get(req.params.id);
  if (!run) return res.status(404).json({ error: "Run not found" });
  db.prepare("DELETE FROM events WHERE run_id = ?").run(req.params.id);
  db.prepare("DELETE FROM runs WHERE id = ?").run(req.params.id);
  res.json({ deleted: true });
});

app.delete("/runs", (req, res) => {
  const days = parseInt(req.query.olderThan) || 7;
  const cutoff = new Date(Date.now() - days * 86400 * 1000).toISOString();
  const old = db.prepare("SELECT id FROM runs WHERE started_at < ?").all(cutoff);
  for (const r of old) {
    db.prepare("DELETE FROM events WHERE run_id = ?").run(r.id);
    db.prepare("DELETE FROM runs WHERE id = ?").run(r.id);
  }
  res.json({ deleted: old.length });
});

app.get("/stats", (req, res) => {
  const total  = db.prepare("SELECT COUNT(*) as count FROM runs").get().count;
  const active = db.prepare("SELECT COUNT(*) as count FROM runs WHERE status = 'running'").get().count;
  const tokens = db.prepare("SELECT SUM(token_count) as total FROM runs").get().total || 0;
  const recentEvents = db
    .prepare(
      `SELECT e.*, r.agent_name FROM events e
       JOIN runs r ON e.run_id = r.id
       ORDER BY e.timestamp DESC LIMIT 20`
    )
    .all()
    .map((e) => ({ ...e, data: JSON.parse(e.data) }));
  res.json({ total, active, tokens, recentEvents });
});

// ── Start ─────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 4242;
server.listen(PORT, () => {
  console.log(`\n🚀 AgentDash server running on port ${PORT}`);
  console.log(`   REST API:              http://localhost:${PORT}`);
  console.log(`   WebSocket (SDK):       ws://localhost:${PORT}/`);
  console.log(`   WebSocket (Dashboard): ws://localhost:${PORT}/dashboard`);
  if (API_KEY) {
    console.log(`   Auth: API key enabled (AGENTDASH_API_KEY is set)\n`);
  } else {
    console.log(`   Auth: disabled (set AGENTDASH_API_KEY to enable)\n`);
  }
});

module.exports = { app, server }; // exported for tests
