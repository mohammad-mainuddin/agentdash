/**
 * AgentDash Server — Node.js + Express + WebSocket, port 4242
 */

const express = require("express");
const http    = require("http");
const WebSocket = require("ws");
const cors    = require("cors");
const { v4: uuidv4 } = require("uuid");
const db = require("./db");

const app    = express();
const server = http.createServer(app);
const wss    = new WebSocket.Server({ server });

app.use(cors());
app.use(express.json({ limit: "4mb" }));

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
  const urlObj     = new URL(req.url, "http://localhost");
  const clientType = urlObj.pathname === "/dashboard" ? "dashboard" : "sdk";
  const key        = urlObj.searchParams.get("key");

  if (!checkApiKey(key)) {
    ws.close(4401, "Unauthorized");
    return;
  }

  if (clientType === "dashboard") {
    dashboardClients.add(ws);
    ws.on("close", () => dashboardClients.delete(ws));
    return;
  }

  ws.on("message", (data) => {
    let event;
    try { event = JSON.parse(data.toString()); }
    catch (e) { console.error("[WS] Invalid JSON:", e.message); return; }
    try { handleSdkEvent(event); }
    catch (err) { console.error("[WS] Handler error:", err.message); }
  });

  ws.on("close", () => console.log("[WS] SDK client disconnected"));
});

// ── Alerts ────────────────────────────────────────────────────────────────────

function getSetting(key) {
  return db.prepare("SELECT value FROM settings WHERE key = ?").get(key)?.value ?? "";
}

async function postWebhook(url, body) {
  if (!url) return;
  const data = JSON.stringify(body);
  return new Promise((resolve) => {
    try {
      const parsed = new URL(url);
      const mod = parsed.protocol === "https:" ? require("https") : require("http");
      const req = mod.request(parsed, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) },
      }, resolve);
      req.on("error", (e) => console.error("[Alerts] Webhook error:", e.message));
      req.write(data);
      req.end();
    } catch (e) {
      console.error("[Alerts] Invalid webhook URL:", e.message);
      resolve(null);
    }
  });
}

async function fireAlerts(runId, status) {
  const webhookUrl  = getSetting("alert_webhook_url");
  if (!webhookUrl) return;

  const onError     = getSetting("alert_on_error") === "1";
  const tokenBudget = parseInt(getSetting("alert_token_budget") || "0");
  const timeBudget  = parseInt(getSetting("alert_time_budget_s") || "0");

  const run = db.prepare("SELECT * FROM runs WHERE id = ?").get(runId);
  if (!run) return;

  const durationS = run.ended_at
    ? (new Date(run.ended_at) - new Date(run.started_at)) / 1000 : 0;

  const reasons = [];
  if (onError && status === "error")                         reasons.push("run_error");
  if (tokenBudget > 0 && run.token_count > tokenBudget)     reasons.push("token_budget_exceeded");
  if (timeBudget  > 0 && durationS > timeBudget)            reasons.push("time_budget_exceeded");

  if (reasons.length === 0) return;

  await postWebhook(webhookUrl, {
    event: "agentdash_alert",
    reasons,
    run: {
      id:          run.id,
      agent_name:  run.agent_name,
      status:      run.status,
      token_count: run.token_count,
      cost_usd:    run.cost_usd,
      duration_s:  Math.round(durationS),
      started_at:  run.started_at,
      ended_at:    run.ended_at,
    },
    timestamp: new Date().toISOString(),
  });
  console.log(`[Alerts] Fired for run ${runId} — reasons: ${reasons.join(", ")}`);
}

// ── Auto-retention ────────────────────────────────────────────────────────────

function runAutoRetention() {
  const days = parseInt(getSetting("retention_days") || "0");
  if (days <= 0) return;
  const cutoff = new Date(Date.now() - days * 86400 * 1000).toISOString();
  const old = db.prepare("SELECT id FROM runs WHERE started_at < ?").all(cutoff);
  for (const r of old) {
    db.prepare("DELETE FROM events WHERE run_id = ?").run(r.id);
    db.prepare("DELETE FROM runs WHERE id = ?").run(r.id);
  }
  if (old.length > 0) console.log(`[Retention] Auto-deleted ${old.length} runs older than ${days} days`);
}

// Run at startup and every 6 hours
runAutoRetention();
setInterval(runAutoRetention, 6 * 60 * 60 * 1000);

// ── Event handler ─────────────────────────────────────────────────────────────

function handleSdkEvent(event) {
  const ts = event.timestamp || new Date().toISOString();

  function ensureRun(runId) {
    const run = db.prepare("SELECT id FROM runs WHERE id = ?").get(runId);
    if (!run) {
      db.prepare(
        `INSERT OR IGNORE INTO runs (id, agent_name, status, started_at, token_count, cost_usd)
         VALUES (?, 'unknown', 'running', ?, 0, 0)`
      ).run(runId, ts);
    }
  }

  function resolveTokens(event, ...textParts) {
    if (typeof event.tokenCount === "number") return event.tokenCount;
    const text = textParts.filter(Boolean).join(" ");
    return Math.ceil(text.length / 4);
  }

  switch (event.type) {

    case "run_start": {
      db.prepare(
        `INSERT OR REPLACE INTO runs
           (id, agent_name, status, started_at, token_count, cost_usd, parent_run_id, project)
         VALUES (?, ?, 'running', ?, 0, 0, ?, ?)`
      ).run(event.runId, event.agentName, ts, event.parentRunId || null, event.project || "");
      db.prepare(
        `INSERT INTO events (id, run_id, type, data, timestamp) VALUES (?, ?, ?, ?, ?)`
      ).run(uuidv4(), event.runId, "run_start",
        JSON.stringify({ agentName: event.agentName, parentRunId: event.parentRunId || null, project: event.project || null }), ts);
      break;
    }

    case "log": {
      ensureRun(event.runId);
      db.prepare(
        `INSERT INTO events (id, run_id, type, data, timestamp) VALUES (?, ?, ?, ?, ?)`
      ).run(uuidv4(), event.runId, "log",
        JSON.stringify({ message: event.message, spanId: event.spanId || null }), ts);
      const tokens = resolveTokens(event, event.message);
      db.prepare("UPDATE runs SET token_count = token_count + ? WHERE id = ?").run(tokens, event.runId);
      break;
    }

    case "tool_call": {
      ensureRun(event.runId);
      db.prepare(
        `INSERT INTO events (id, run_id, type, data, timestamp) VALUES (?, ?, ?, ?, ?)`
      ).run(uuidv4(), event.runId, "tool_call", JSON.stringify({
        tool:        event.tool,
        input:       event.input,
        output:      event.output,
        duration_ms: event.duration_ms || 0,
        spanId:      event.spanId || null,
      }), ts);
      const tokens = resolveTokens(event,
        JSON.stringify(event.input  || ""),
        JSON.stringify(event.output || ""));
      db.prepare("UPDATE runs SET token_count = token_count + ? WHERE id = ?").run(tokens, event.runId);
      break;
    }

    case "mcp_call": {
      ensureRun(event.runId);
      db.prepare(
        `INSERT INTO events (id, run_id, type, data, timestamp) VALUES (?, ?, ?, ?, ?)`
      ).run(uuidv4(), event.runId, "mcp_call", JSON.stringify({
        server:      event.server,
        tool:        event.tool,
        kind:        event.kind || "tool",
        input:       event.input,
        output:      event.output,
        duration_ms: event.duration_ms || 0,
        error:       event.error || null,
        spanId:      event.spanId || null,
      }), ts);
      const tokens = resolveTokens(event,
        JSON.stringify(event.input  || ""),
        JSON.stringify(event.output || ""));
      db.prepare("UPDATE runs SET token_count = token_count + ? WHERE id = ?").run(tokens, event.runId);
      break;
    }

    case "llm_call": {
      ensureRun(event.runId);
      const cost    = typeof event.cost_usd === "number" ? event.cost_usd : 0;
      const inTok   = event.input_tokens  || 0;
      const outTok  = event.output_tokens || 0;
      db.prepare(
        `INSERT INTO events (id, run_id, type, data, timestamp) VALUES (?, ?, ?, ?, ?)`
      ).run(uuidv4(), event.runId, "llm_call", JSON.stringify({
        model:         event.model,
        messages:      event.messages || [],
        response:      event.response || "",
        input_tokens:  inTok,
        output_tokens: outTok,
        cost_usd:      cost,
        duration_ms:   event.duration_ms || 0,
        spanId:        event.spanId || null,
      }), ts);
      db.prepare(
        `UPDATE runs SET token_count = token_count + ?, cost_usd = cost_usd + ?,
                         llm_calls = llm_calls + 1 WHERE id = ?`
      ).run(inTok + outTok, cost, event.runId);
      break;
    }

    case "span_start": {
      ensureRun(event.runId);
      db.prepare(
        `INSERT INTO events (id, run_id, type, data, timestamp) VALUES (?, ?, ?, ?, ?)`
      ).run(uuidv4(), event.runId, "span_start", JSON.stringify({
        name:         event.name,
        spanId:       event.spanId,
        parentSpanId: event.parentSpanId || null,
      }), ts);
      break;
    }

    case "span_end": {
      ensureRun(event.runId);
      db.prepare(
        `INSERT INTO events (id, run_id, type, data, timestamp) VALUES (?, ?, ?, ?, ?)`
      ).run(uuidv4(), event.runId, "span_end",
        JSON.stringify({ spanId: event.spanId, status: event.status }), ts);
      break;
    }

    case "run_end": {
      db.prepare(`UPDATE runs SET status = ?, ended_at = ? WHERE id = ?`)
        .run(event.status || "success", ts, event.runId);
      db.prepare(
        `INSERT INTO events (id, run_id, type, data, timestamp) VALUES (?, ?, ?, ?, ?)`
      ).run(uuidv4(), event.runId, "run_end",
        JSON.stringify({ status: event.status }), ts);
      fireAlerts(event.runId, event.status || "success");
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

// Runs — list with search/filter
app.get("/runs", (req, res) => {
  const { q, status, from, to, parent, project } = req.query;
  let sql    = "SELECT * FROM runs WHERE 1=1";
  const params = [];
  if (q)       { sql += " AND agent_name LIKE ?"; params.push(`%${q}%`); }
  if (status)  { sql += " AND status = ?";        params.push(status); }
  if (from)    { sql += " AND started_at >= ?";   params.push(from); }
  if (to)      { sql += " AND started_at <= ?";   params.push(to); }
  if (parent)  { sql += " AND parent_run_id = ?"; params.push(parent); }
  if (project) { sql += " AND project = ?";       params.push(project); }
  sql += " ORDER BY started_at DESC LIMIT 500";
  res.json(db.prepare(sql).all(...params));
});

app.post("/runs", (req, res) => {
  const { agentName, parentRunId, project } = req.body;
  if (!agentName) return res.status(400).json({ error: "agentName is required" });
  const id  = uuidv4();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO runs (id, agent_name, status, started_at, token_count, cost_usd, parent_run_id, project)
     VALUES (?, ?, 'running', ?, 0, 0, ?, ?)`
  ).run(id, agentName, now, parentRunId || null, project || "");
  res.status(201).json({ id, agentName, status: "running", started_at: now });
});

// Projects — aggregate stats per project
app.get("/projects", (req, res) => {
  const rows = db.prepare(`
    SELECT
      project,
      COUNT(*)                                                        AS run_count,
      COUNT(CASE WHEN status = 'running' THEN 1 END)                 AS active_count,
      COUNT(CASE WHEN status = 'error'   THEN 1 END)                 AS error_count,
      COUNT(DISTINCT agent_name)                                      AS agent_count,
      COALESCE(SUM(token_count), 0)                                  AS total_tokens,
      COALESCE(SUM(cost_usd),    0)                                  AS total_cost,
      COALESCE(SUM(llm_calls),   0)                                  AS total_llm_calls,
      MAX(started_at)                                                 AS last_run_at
    FROM runs
    WHERE project != '' AND project IS NOT NULL
    GROUP BY project
    ORDER BY last_run_at DESC
  `).all();
  res.json(rows);
});

// Project detail — agents within a project (agent registry)
app.get("/projects/:name/agents", (req, res) => {
  const agents = db.prepare(`
    SELECT
      agent_name,
      COUNT(*)                                                        AS run_count,
      COUNT(CASE WHEN status = 'running' THEN 1 END)                 AS active_count,
      COUNT(CASE WHEN status = 'error'   THEN 1 END)                 AS error_count,
      COALESCE(SUM(token_count), 0)                                  AS total_tokens,
      COALESCE(SUM(cost_usd),    0)                                  AS total_cost,
      MAX(started_at)                                                 AS last_run_at,
      AVG(CASE WHEN ended_at IS NOT NULL
        THEN (julianday(ended_at) - julianday(started_at)) * 86400000
      END)                                                            AS avg_duration_ms
    FROM runs
    WHERE project = ?
    GROUP BY agent_name
    ORDER BY last_run_at DESC
  `).all(req.params.name);
  res.json(agents);
});

app.get("/runs/:id", (req, res) => {
  const run = db.prepare("SELECT * FROM runs WHERE id = ?").get(req.params.id);
  if (!run) return res.status(404).json({ error: "Run not found" });
  const events = db.prepare("SELECT * FROM events WHERE run_id = ? ORDER BY timestamp ASC")
    .all(req.params.id)
    .map((e) => ({ ...e, data: JSON.parse(e.data) }));
  // attach child runs
  const children = db.prepare("SELECT id, agent_name, status FROM runs WHERE parent_run_id = ?")
    .all(req.params.id);
  res.json({ ...run, events, children });
});

// Export a run as a downloadable JSON file
app.get("/runs/:id/export", (req, res) => {
  const run = db.prepare("SELECT * FROM runs WHERE id = ?").get(req.params.id);
  if (!run) return res.status(404).json({ error: "Run not found" });
  const events = db.prepare("SELECT * FROM events WHERE run_id = ? ORDER BY timestamp ASC")
    .all(req.params.id)
    .map((e) => ({ ...e, data: JSON.parse(e.data) }));
  res.setHeader("Content-Disposition",
    `attachment; filename="agentdash-run-${req.params.id.slice(0, 8)}.json"`);
  res.setHeader("Content-Type", "application/json");
  res.json({ ...run, events, exported_at: new Date().toISOString() });
});

app.delete("/runs/:id", (req, res) => {
  const run = db.prepare("SELECT id FROM runs WHERE id = ?").get(req.params.id);
  if (!run) return res.status(404).json({ error: "Run not found" });
  db.prepare("DELETE FROM events WHERE run_id = ?").run(req.params.id);
  db.prepare("DELETE FROM runs WHERE id = ?").run(req.params.id);
  res.json({ deleted: true });
});

app.delete("/runs", (req, res) => {
  const days   = parseInt(req.query.olderThan) || 7;
  const cutoff = new Date(Date.now() - days * 86400 * 1000).toISOString();
  const old    = db.prepare("SELECT id FROM runs WHERE started_at < ?").all(cutoff);
  for (const r of old) {
    db.prepare("DELETE FROM events WHERE run_id = ?").run(r.id);
    db.prepare("DELETE FROM runs WHERE id = ?").run(r.id);
  }
  res.json({ deleted: old.length });
});

// Stats
app.get("/stats", (req, res) => {
  const total    = db.prepare("SELECT COUNT(*) as c FROM runs").get().c;
  const active   = db.prepare("SELECT COUNT(*) as c FROM runs WHERE status = 'running'").get().c;
  const tokens   = db.prepare("SELECT SUM(token_count) as t FROM runs").get().t || 0;
  const cost     = db.prepare("SELECT SUM(cost_usd) as c FROM runs").get().c || 0;
  const llmCalls = db.prepare("SELECT SUM(llm_calls) as c FROM runs").get().c || 0;
  const recentEvents = db.prepare(
    `SELECT e.*, r.agent_name FROM events e
     JOIN runs r ON e.run_id = r.id
     ORDER BY e.timestamp DESC LIMIT 20`
  ).all().map((e) => ({ ...e, data: JSON.parse(e.data) }));
  res.json({ total, active, tokens, cost, llmCalls, recentEvents });
});

// Settings
app.get("/settings", (req, res) => {
  const rows = db.prepare("SELECT key, value FROM settings").all();
  res.json(Object.fromEntries(rows.map((r) => [r.key, r.value])));
});

app.put("/settings", (req, res) => {
  const stmt = db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)");
  for (const [key, value] of Object.entries(req.body)) {
    stmt.run(String(key), String(value));
  }
  res.json({ ok: true });
});

// Test webhook
app.post("/settings/test-webhook", async (req, res) => {
  const url = getSetting("alert_webhook_url");
  if (!url) return res.status(400).json({ error: "No webhook URL configured" });
  try {
    await postWebhook(url, {
      event: "agentdash_test",
      message: "AgentDash webhook test — connection successful",
      timestamp: new Date().toISOString(),
    });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Trends — daily aggregates for charts
app.get("/stats/trends", (req, res) => {
  const days    = Math.min(parseInt(req.query.days) || 14, 90);
  const project = req.query.project || null;

  let sql = `
    SELECT
      date(started_at)                                          AS day,
      COUNT(*)                                                  AS runs,
      COUNT(CASE WHEN status = 'error'   THEN 1 END)           AS errors,
      COALESCE(SUM(token_count), 0)                            AS tokens,
      ROUND(COALESCE(SUM(cost_usd), 0), 6)                     AS cost,
      COALESCE(SUM(llm_calls), 0)                              AS llm_calls
    FROM runs
    WHERE started_at >= date('now', '-' || ? || ' days')
  `;
  const params = [days];
  if (project) { sql += " AND project = ?"; params.push(project); }
  sql += " GROUP BY day ORDER BY day ASC";

  const rows = db.prepare(sql).all(...params);
  const map  = Object.fromEntries(rows.map((r) => [r.day, r]));

  const daily = [];
  for (let i = days - 1; i >= 0; i--) {
    const d   = new Date(Date.now() - i * 86400000);
    const day = d.toISOString().slice(0, 10);
    daily.push(map[day] || { day, runs: 0, errors: 0, tokens: 0, cost: 0, llm_calls: 0 });
  }

  res.json({ daily, days });
});

// ── Start ─────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 4242;
server.listen(PORT, () => {
  console.log(`\n🚀 AgentDash server on port ${PORT}`);
  if (API_KEY) console.log(`   Auth: API key enabled`);
});

module.exports = { app, server };
