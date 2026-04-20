import React, { useState } from "react";
import { useSettings } from "../context/SettingsContext";
import { api } from "../lib/api";

export default function SettingsPage() {
  const { serverUrl, darkMode, updateServer, toggleDark } = useSettings();
  const [urlInput, setUrlInput] = useState(serverUrl);
  const [saved, setSaved] = useState(false);
  const [retainDays, setRetainDays] = useState(7);
  const [cleaning, setCleaning] = useState(false);
  const [cleanResult, setCleanResult] = useState(null);

  const saveServer = () => {
    updateServer(urlInput.trim());
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const cleanOld = async () => {
    setCleaning(true);
    setCleanResult(null);
    try {
      const res = await api.deleteOldRuns(retainDays);
      setCleanResult(`Deleted ${res.deleted} run(s)`);
    } catch (e) {
      setCleanResult("Error: " + e.message);
    }
    setCleaning(false);
  };

  return (
    <div className="flex-1 overflow-auto p-6 max-w-2xl">
      <div className="mb-6">
        <h1 className="text-xl font-display font-bold text-terminal-text">Settings</h1>
        <p className="text-sm text-terminal-dim mt-0.5">Configure your AgentDash instance</p>
      </div>

      {/* Server URL */}
      <div className="card p-5 mb-4">
        <h2 className="text-sm font-semibold text-terminal-text mb-1">Server URL</h2>
        <p className="text-xs text-terminal-dim mb-4">
          The AgentDash backend server address. Both REST API and WebSocket use this URL.
        </p>
        <div className="flex gap-2">
          <input
            className="input flex-1"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="http://localhost:4242"
          />
          <button onClick={saveServer} className="btn-primary">
            {saved ? "✓ Saved" : "Save"}
          </button>
        </div>
        <div className="mt-2 text-xs text-terminal-dim">
          WebSocket: <span className="text-terminal-cyan">{urlInput.replace(/^http/, "ws")}/dashboard</span>
        </div>
      </div>

      {/* Dark mode */}
      <div className="card p-5 mb-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-terminal-text">Dark Mode</h2>
            <p className="text-xs text-terminal-dim mt-0.5">Toggle between dark and light theme</p>
          </div>
          <button
            onClick={toggleDark}
            className={`relative w-11 h-6 rounded-full transition-colors ${
              darkMode ? "bg-terminal-green/30 border border-terminal-green/40" : "bg-terminal-muted border border-terminal-border"
            }`}
          >
            <div className={`absolute top-1 w-4 h-4 rounded-full transition-all ${
              darkMode ? "left-6 bg-terminal-green" : "left-1 bg-terminal-dim"
            }`} />
          </button>
        </div>
      </div>

      {/* Data retention */}
      <div className="card p-5 mb-4">
        <h2 className="text-sm font-semibold text-terminal-text mb-1">Data Retention</h2>
        <p className="text-xs text-terminal-dim mb-4">
          Delete runs older than a specified number of days. This cannot be undone.
        </p>
        <div className="flex items-center gap-3">
          <span className="text-sm text-terminal-dim">Delete runs older than</span>
          <input
            type="number"
            min={1}
            max={365}
            value={retainDays}
            onChange={(e) => setRetainDays(Number(e.target.value))}
            className="input w-20 text-center"
          />
          <span className="text-sm text-terminal-dim">days</span>
          <button onClick={cleanOld} disabled={cleaning} className="btn-danger">
            {cleaning ? "Cleaning…" : "Clean Now"}
          </button>
        </div>
        {cleanResult && (
          <div className="mt-3 text-xs text-terminal-green animate-fade-in">{cleanResult}</div>
        )}
      </div>

      {/* SDK info */}
      <div className="card p-5">
        <h2 className="text-sm font-semibold text-terminal-text mb-3">Connect an Agent</h2>
        <p className="text-xs text-terminal-dim mb-3">Use the Python SDK to send events from your agent:</p>
        <pre className="bg-terminal-bg rounded p-4 text-xs text-terminal-green overflow-auto leading-relaxed">
{`pip install agentdash

from agentdash import AgentDash

dash = AgentDash(url="${serverUrl}")
run = dash.start_run(agent_name="my-agent")
run.log("Starting task")
run.tool_call(
    tool="web_search",
    input={"query": "hello"},
    output={"result": "..."},
    duration_ms=320
)
run.end(status="success")`}
        </pre>
      </div>
    </div>
  );
}
