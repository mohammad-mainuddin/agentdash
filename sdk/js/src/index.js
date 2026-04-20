/**
 * AgentDash JavaScript SDK
 *
 * Usage:
 *   const { AgentDash } = require("agentdash");
 *   const dash = new AgentDash({ url: "http://localhost:4242", apiKey: "secret" });
 *
 *   const run = dash.startRun("my-agent");
 *   await run.log("Hello");
 *
 *   // Nested spans
 *   const span = run.span("research-phase");
 *   await span.start();
 *   await span.log("fetching...");
 *   await span.end("success");
 *
 *   await run.end("success");
 */

const { randomUUID } = require("crypto");

const WS = typeof WebSocket !== "undefined" ? WebSocket : require("ws");

const MAX_QUEUE   = 500;
const BACKOFF_MIN = 3000;
const BACKOFF_MAX = 60000;

// ── Span ──────────────────────────────────────────────────────────────────────

class Span {
  constructor(name, runId, client, parentSpanId = null) {
    this.spanId       = randomUUID();
    this.name         = name;
    this._runId       = runId;
    this._client      = client;
    this._parentSpanId = parentSpanId;
    this._ended       = false;
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
   * @param {string}  opts.url    - AgentDash server URL (default: http://localhost:4242)
   * @param {string}  [opts.apiKey] - API key (must match AGENTDASH_API_KEY on the server)
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
        console.warn(`[AgentDash] Queue full (${MAX_QUEUE}) — oldest event dropped`);
        this._queue.shift();
      }
      this._queue.push(payload);
    }
    return Promise.resolve();
  }

  startRun(agentName) {
    const runId = randomUUID();
    this._send({ type: "run_start", runId, agentName, timestamp: new Date().toISOString() });
    return new AgentRun(runId, agentName, this);
  }

  close() {
    this._ws?.close();
  }
}

// ── MCPInstrumentation ────────────────────────────────────────────────────────

/**
 * Wraps an MCP Client so every callTool() and readResource() is automatically
 * logged to AgentDash as an mcp_call event.
 *
 * Works with @modelcontextprotocol/sdk Client.
 *
 * Usage:
 *   const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
 *   const { MCPInstrumentation } = require("agentdash");
 *
 *   const run = dash.startRun("my-agent");
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
      const t0 = Date.now();
      let error = null, result = null;
      try {
        result = await origCallTool(params, ...args);
        return result;
      } catch (e) {
        error = e.message;
        throw e;
      } finally {
        target.mcpCall({
          server,
          tool: params.name,
          kind: "tool",
          input: params.arguments || {},
          output: result?.content ?? null,
          durationMs: Date.now() - t0,
          error,
        });
      }
    };

    client.readResource = async (params, ...args) => {
      const t0 = Date.now();
      let error = null, result = null;
      try {
        result = await origReadResource(params, ...args);
        return result;
      } catch (e) {
        error = e.message;
        throw e;
      } finally {
        target.mcpCall({
          server,
          tool: params.uri,
          kind: "resource",
          input: { uri: params.uri },
          output: result?.contents ?? null,
          durationMs: Date.now() - t0,
          error,
        });
      }
    };

    return client;
  }
}

module.exports = { AgentDash, AgentRun, Span, MCPInstrumentation };
