/**
 * AgentDash JavaScript SDK
 *
 * Usage:
 *   const { AgentDash } = require("agentdash");
 *   const dash = new AgentDash({ url: "http://localhost:4242" });
 *
 *   const run = dash.startRun("my-agent");
 *   await run.log("Hello");
 *   await run.end("success");
 */

const { randomUUID } = require("crypto");
const WS = typeof WebSocket !== "undefined" ? WebSocket : require("ws");

const MAX_QUEUE   = 500;
const BACKOFF_MIN = 3000;
const BACKOFF_MAX = 60000;

// Per-model pricing (input $/M, output $/M)
const MODEL_PRICING = {
  "claude-opus-4-7":            [15.0,  75.0],
  "claude-sonnet-4-6":          [3.0,   15.0],
  "claude-haiku-4-5-20251001":  [0.8,    4.0],
  "claude-3-5-sonnet-20241022": [3.0,   15.0],
  "claude-3-5-haiku-20241022":  [0.8,    4.0],
  "gpt-4o":                     [2.5,   10.0],
  "gpt-4o-mini":                [0.15,   0.6],
  "gpt-4-turbo":                [10.0,  30.0],
  "gpt-3.5-turbo":              [0.5,    1.5],
  "o1":                         [15.0,  60.0],
  "o1-mini":                    [3.0,   12.0],
};

function computeCost(model, inTok, outTok) {
  let pricing = MODEL_PRICING[model];
  if (!pricing) {
    const key = Object.keys(MODEL_PRICING).find((k) => model.startsWith(k));
    pricing = key ? MODEL_PRICING[key] : null;
  }
  if (!pricing) return 0;
  return Math.round((inTok * pricing[0] + outTok * pricing[1]) / 1_000_000 * 1e8) / 1e8;
}

// ── Span ──────────────────────────────────────────────────────────────────────

class Span {
  constructor(name, runId, client, parentSpanId = null) {
    this.spanId        = randomUUID();
    this.name          = name;
    this._runId        = runId;
    this._client       = client;
    this._parentSpanId = parentSpanId;
    this._ended        = false;
  }

  _now() { return new Date().toISOString(); }

  async start() {
    return this._client._send({
      type: "span_start", runId: this._runId,
      spanId: this.spanId, parentSpanId: this._parentSpanId,
      name: this.name, timestamp: this._now(),
    });
  }

  log(message) {
    return this._client._send({
      type: "log", runId: this._runId, spanId: this.spanId,
      message, timestamp: this._now(),
    });
  }

  toolCall({ tool, input = null, output = null, durationMs = 0 }) {
    return this._client._send({
      type: "tool_call", runId: this._runId, spanId: this.spanId,
      tool, input, output, duration_ms: durationMs, timestamp: this._now(),
    });
  }

  mcpCall({ server, tool, kind = "tool", input = null, output = null, durationMs = 0, error = null }) {
    return this._client._send({
      type: "mcp_call", runId: this._runId, spanId: this.spanId,
      server, tool, kind, input, output, duration_ms: durationMs, error,
      timestamp: this._now(),
    });
  }

  llmCall({ model, messages = [], response = "", inputTokens = 0, outputTokens = 0, durationMs = 0 }) {
    const cost = computeCost(model, inputTokens, outputTokens);
    return this._client._send({
      type: "llm_call", runId: this._runId, spanId: this.spanId,
      model, messages, response,
      input_tokens: inputTokens, output_tokens: outputTokens,
      cost_usd: cost, duration_ms: durationMs, timestamp: this._now(),
    });
  }

  /** Create a nested child span (call .start() on it). */
  span(name) {
    return new Span(name, this._runId, this._client, this.spanId);
  }

  end(status = "success") {
    if (this._ended) return Promise.resolve();
    this._ended = true;
    return this._client._send({
      type: "span_end", runId: this._runId, spanId: this.spanId,
      status, timestamp: this._now(),
    });
  }
}

// ── AgentRun ──────────────────────────────────────────────────────────────────

class AgentRun {
  constructor(runId, agentName, client) {
    this.runId     = runId;
    this.agentName = agentName;
    this._client   = client;
    this._ended    = false;
  }

  _now() { return new Date().toISOString(); }

  log(message) {
    return this._client._send({ type: "log", runId: this.runId, message, timestamp: this._now() });
  }

  toolCall({ tool, input = null, output = null, durationMs = 0 }) {
    return this._client._send({
      type: "tool_call", runId: this.runId,
      tool, input, output, duration_ms: durationMs, timestamp: this._now(),
    });
  }

  mcpCall({ server, tool, kind = "tool", input = null, output = null, durationMs = 0, error = null }) {
    return this._client._send({
      type: "mcp_call", runId: this.runId,
      server, tool, kind, input, output, duration_ms: durationMs, error,
      timestamp: this._now(),
    });
  }

  llmCall({ model, messages = [], response = "", inputTokens = 0, outputTokens = 0, durationMs = 0 }) {
    const cost = computeCost(model, inputTokens, outputTokens);
    return this._client._send({
      type: "llm_call", runId: this.runId,
      model, messages, response,
      input_tokens: inputTokens, output_tokens: outputTokens,
      cost_usd: cost, duration_ms: durationMs, timestamp: this._now(),
    });
  }

  /** Create a top-level span. Call span.start() to open it. */
  span(name) {
    return new Span(name, this.runId, this._client, null);
  }

  end(status = "success") {
    if (this._ended) return Promise.resolve();
    this._ended = true;
    return this._client._send({ type: "run_end", runId: this.runId, status, timestamp: this._now() });
  }
}

// ── AgentDash ─────────────────────────────────────────────────────────────────

class AgentDash {
  /**
   * @param {object} opts
   * @param {string} opts.url      AgentDash server URL (default: http://localhost:4242)
   * @param {string} [opts.apiKey] API key matching AGENTDASH_API_KEY on the server
   */
  constructor({ url = "http://localhost:4242", apiKey = null } = {}) {
    this._baseUrl = url.replace(/\/$/, "");
    this._apiKey  = apiKey;
    this._ws      = null;
    this._queue   = [];
    this._ready   = false;
    this._delay   = BACKOFF_MIN;
    this._connect();
  }

  _buildWsUrl() {
    const base = this._baseUrl.replace(/^http/, "ws");
    return this._apiKey ? `${base}?key=${this._apiKey}` : base;
  }

  _connect() {
    const ws = new WS(this._buildWsUrl());
    this._ws = ws;

    ws.on("open", () => {
      this._ready = true;
      this._delay = BACKOFF_MIN;
      console.log(`[AgentDash] Connected to ${this._baseUrl}`);
      const queued = this._queue.splice(0);
      for (const msg of queued) ws.send(msg);
    });

    ws.on("close", () => {
      this._ready = false;
      const delay = this._delay;
      this._delay = Math.min(this._delay * 2, BACKOFF_MAX);
      console.log(`[AgentDash] Disconnected — reconnecting in ${delay / 1000}s`);
      setTimeout(() => this._connect(), delay);
    });

    ws.on("error", (err) => console.error("[AgentDash] WS error:", err.message));
  }

  _send(event) {
    const payload = JSON.stringify(event);
    if (this._ready && this._ws.readyState === WS.OPEN) {
      this._ws.send(payload);
    } else {
      if (this._queue.length >= MAX_QUEUE) {
        console.warn(`[AgentDash] Queue full — oldest event dropped`);
        this._queue.shift();
      }
      this._queue.push(payload);
    }
    return Promise.resolve();
  }

  /**
   * Start a new run.
   * @param {string} agentName
   * @param {object} [opts]
   * @param {string} [opts.project]     Project/namespace for this agent (e.g. "sales-bot")
   * @param {string} [opts.parentRunId] ID of a parent run for multi-agent hierarchies
   */
  startRun(agentName, { project = "", parentRunId = null } = {}) {
    const runId = randomUUID();
    this._send({
      type: "run_start", runId, agentName,
      project: project || "",
      parentRunId: parentRunId || undefined,
      timestamp: new Date().toISOString(),
    });
    return new AgentRun(runId, agentName, this);
  }

  close() { this._ws?.close(); }
}

// ── MCPInstrumentation ────────────────────────────────────────────────────────

/**
 * Wraps an MCP Client so every callTool() and readResource() is automatically
 * logged to AgentDash as an mcp_call event.
 *
 * Usage:
 *   const instr = new MCPInstrumentation(run, "filesystem");
 *   client = instr.wrap(client);
 *   await client.callTool({ name: "read_file", arguments: { path: "/tmp/a.txt" } });
 */
class MCPInstrumentation {
  constructor(target, serverName = "mcp") {
    this._target     = target;
    this._serverName = serverName;
  }

  wrap(client) {
    const target = this._target;
    const server = this._serverName;
    const origCallTool     = client.callTool.bind(client);
    const origReadResource = client.readResource.bind(client);

    client.callTool = async (params, ...args) => {
      const t0 = Date.now(); let error = null, result = null;
      try { result = await origCallTool(params, ...args); return result; }
      catch (e) { error = e.message; throw e; }
      finally {
        target.mcpCall({
          server, tool: params.name, kind: "tool",
          input: params.arguments || {}, output: result?.content ?? null,
          durationMs: Date.now() - t0, error,
        });
      }
    };

    client.readResource = async (params, ...args) => {
      const t0 = Date.now(); let error = null, result = null;
      try { result = await origReadResource(params, ...args); return result; }
      catch (e) { error = e.message; throw e; }
      finally {
        target.mcpCall({
          server, tool: params.uri, kind: "resource",
          input: { uri: params.uri }, output: result?.contents ?? null,
          durationMs: Date.now() - t0, error,
        });
      }
    };

    return client;
  }
}

module.exports = { AgentDash, AgentRun, Span, MCPInstrumentation, computeCost };
