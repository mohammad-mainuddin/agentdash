import React, { useState, useEffect } from "react";
import { useSettings } from "../context/SettingsContext";
import { api } from "../lib/api";

function Section({ title, sub, children }) {
  return (
    <div className="card p-5 mb-4">
      <h2 className="text-sm font-semibold text-terminal-text mb-1">{title}</h2>
      {sub && <p className="text-xs text-terminal-dim mb-4">{sub}</p>}
      {children}
    </div>
  );
}

export default function SettingsPage() {
  const { serverUrl, darkMode, updateServer, toggleDark } = useSettings();
  const [urlInput,    setUrlInput]    = useState(serverUrl);
  const [urlSaved,    setUrlSaved]    = useState(false);

  // Alert settings
  const [webhookUrl,    setWebhookUrl]    = useState("");
  const [onError,       setOnError]       = useState(false);
  const [tokenBudget,   setTokenBudget]   = useState(0);
  const [timeBudget,    setTimeBudget]    = useState(0);
  const [alertSaved,    setAlertSaved]    = useState(false);
  const [testResult,    setTestResult]    = useState(null);
  const [testLoading,   setTestLoading]   = useState(false);

  // Retention
  const [retainDays,   setRetainDays]   = useState(0);
  const [retainEnabled,setRetainEnabled] = useState(false);
  const [retainSaved,  setRetainSaved]  = useState(false);
  const [cleaning,     setCleaning]     = useState(false);
  const [cleanResult,  setCleanResult]  = useState(null);

  useEffect(() => {
    api.getSettings().then((s) => {
      setWebhookUrl(s.alert_webhook_url   || "");
      setOnError(s.alert_on_error         === "1");
      setTokenBudget(parseInt(s.alert_token_budget  || "0"));
      setTimeBudget(parseInt(s.alert_time_budget_s  || "0"));
      setRetainDays(parseInt(s.retention_days       || "0"));
      setRetainEnabled(parseInt(s.retention_days    || "0") > 0);
    }).catch(console.error);
  }, []);

  const saveServer = () => {
    updateServer(urlInput.trim());
    setUrlSaved(true);
    setTimeout(() => setUrlSaved(false), 2000);
  };

  const saveAlerts = async () => {
    await api.saveSettings({
      alert_webhook_url:  webhookUrl,
      alert_on_error:     onError ? "1" : "0",
      alert_token_budget: String(tokenBudget),
      alert_time_budget_s:String(timeBudget),
    });
    setAlertSaved(true);
    setTimeout(() => setAlertSaved(false), 2000);
  };

  const testWebhook = async () => {
    await saveAlerts();
    setTestLoading(true);
    setTestResult(null);
    try {
      await api.testWebhook();
      setTestResult("✓ Webhook delivered");
    } catch (e) {
      setTestResult("✕ " + e.message);
    }
    setTestLoading(false);
  };

  const saveRetention = async () => {
    await api.saveSettings({ retention_days: retainEnabled ? String(retainDays) : "0" });
    setRetainSaved(true);
    setTimeout(() => setRetainSaved(false), 2000);
  };

  const cleanNow = async () => {
    const days = retainEnabled && retainDays > 0 ? retainDays : 7;
    setCleaning(true);
    setCleanResult(null);
    try {
      const res = await api.deleteOldRuns(days);
      setCleanResult(`Deleted ${res.deleted} run(s) older than ${days} days`);
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
      <Section title="Server URL"
        sub="The AgentDash backend address. Both REST API and WebSocket use this URL.">
        <div className="flex gap-2">
          <input className="input flex-1" value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)} placeholder="http://localhost:4242" />
          <button onClick={saveServer} className="btn-primary">
            {urlSaved ? "✓ Saved" : "Save"}
          </button>
        </div>
        <div className="mt-2 text-xs text-terminal-dim">
          WebSocket: <span className="text-terminal-cyan">{urlInput.replace(/^http/, "ws")}/dashboard</span>
        </div>
      </Section>

      {/* Dark mode */}
      <Section title="Appearance">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-terminal-text">Dark Mode</div>
            <div className="text-xs text-terminal-dim mt-0.5">Toggle between dark and light theme</div>
          </div>
          <button onClick={toggleDark}
            className={`relative w-11 h-6 rounded-full transition-colors ${
              darkMode
                ? "bg-terminal-green/30 border border-terminal-green/40"
                : "bg-terminal-muted border border-terminal-border"
            }`}>
            <div className={`absolute top-1 w-4 h-4 rounded-full transition-all ${
              darkMode ? "left-6 bg-terminal-green" : "left-1 bg-terminal-dim"
            }`} />
          </button>
        </div>
      </Section>

      {/* Alerts */}
      <Section title="Alerts"
        sub="Send a webhook POST when a run fails, exceeds a token budget, or takes too long. Works with Slack, Discord, custom endpoints, etc.">
        <div className="space-y-4">
          <div>
            <label className="text-xs text-terminal-dim uppercase tracking-wider mb-1.5 block">Webhook URL</label>
            <div className="flex gap-2">
              <input className="input flex-1 text-sm" value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                placeholder="https://hooks.slack.com/..." />
              <button onClick={testWebhook} disabled={!webhookUrl || testLoading}
                className="btn-primary text-xs disabled:opacity-40">
                {testLoading ? "…" : "Test"}
              </button>
            </div>
            {testResult && (
              <div className={`mt-1.5 text-xs ${testResult.startsWith("✓") ? "text-terminal-green" : "text-terminal-red"}`}>
                {testResult}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between py-2 border-t border-terminal-border">
            <div>
              <div className="text-sm text-terminal-text">Alert on error</div>
              <div className="text-xs text-terminal-dim">Notify when a run ends with status=error</div>
            </div>
            <button onClick={() => setOnError((v) => !v)}
              className={`relative w-11 h-6 rounded-full transition-colors ${
                onError ? "bg-terminal-red/30 border border-terminal-red/40" : "bg-terminal-muted border border-terminal-border"
              }`}>
              <div className={`absolute top-1 w-4 h-4 rounded-full transition-all ${
                onError ? "left-6 bg-terminal-red" : "left-1 bg-terminal-dim"
              }`} />
            </button>
          </div>

          <div className="flex items-center gap-3 py-2 border-t border-terminal-border">
            <div className="flex-1">
              <div className="text-sm text-terminal-text">Token budget</div>
              <div className="text-xs text-terminal-dim">Alert when a run exceeds N tokens (0 = disabled)</div>
            </div>
            <input type="number" min={0} value={tokenBudget}
              onChange={(e) => setTokenBudget(Number(e.target.value))}
              className="input w-28 text-sm text-right" />
          </div>

          <div className="flex items-center gap-3 py-2 border-t border-terminal-border">
            <div className="flex-1">
              <div className="text-sm text-terminal-text">Time budget (seconds)</div>
              <div className="text-xs text-terminal-dim">Alert when a run exceeds N seconds (0 = disabled)</div>
            </div>
            <input type="number" min={0} value={timeBudget}
              onChange={(e) => setTimeBudget(Number(e.target.value))}
              className="input w-28 text-sm text-right" />
          </div>

          <div className="flex justify-end pt-1">
            <button onClick={saveAlerts} className="btn-primary">
              {alertSaved ? "✓ Saved" : "Save Alerts"}
            </button>
          </div>
        </div>
      </Section>

      {/* Retention */}
      <Section title="Data Retention"
        sub="Automatically delete old runs to keep the database small.">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-terminal-text">Auto-delete old runs</div>
              <div className="text-xs text-terminal-dim">Runs are cleaned every 6 hours at server startup</div>
            </div>
            <button onClick={() => setRetainEnabled((v) => !v)}
              className={`relative w-11 h-6 rounded-full transition-colors ${
                retainEnabled ? "bg-terminal-green/30 border border-terminal-green/40" : "bg-terminal-muted border border-terminal-border"
              }`}>
              <div className={`absolute top-1 w-4 h-4 rounded-full transition-all ${
                retainEnabled ? "left-6 bg-terminal-green" : "left-1 bg-terminal-dim"
              }`} />
            </button>
          </div>

          {retainEnabled && (
            <div className="flex items-center gap-3">
              <span className="text-sm text-terminal-dim">Keep runs for</span>
              <input type="number" min={1} max={365} value={retainDays}
                onChange={(e) => setRetainDays(Number(e.target.value))}
                className="input w-20 text-center" />
              <span className="text-sm text-terminal-dim">days</span>
            </div>
          )}

          <div className="flex gap-2 justify-between items-center">
            <button onClick={cleanNow} disabled={cleaning} className="btn-danger text-xs">
              {cleaning ? "Cleaning…" : "Clean Now"}
            </button>
            <button onClick={saveRetention} className="btn-primary">
              {retainSaved ? "✓ Saved" : "Save Retention"}
            </button>
          </div>
          {cleanResult && (
            <div className="text-xs text-terminal-green animate-fade-in">{cleanResult}</div>
          )}
        </div>
      </Section>

      {/* Quick-start snippet */}
      <Section title="Connect an Agent">
        <p className="text-xs text-terminal-dim mb-3">Use the Python SDK to send events from your agent:</p>
        <pre className="bg-terminal-bg rounded p-4 text-xs text-terminal-green overflow-auto leading-relaxed">
{`pip install agentdash

from agentdash import AgentDash

dash = AgentDash(url="${serverUrl}")
with dash.start_run(agent_name="my-agent") as run:
    run.log("Starting task")
    run.tool_call(tool="search", input={"q": "..."}, output={...}, duration_ms=120)
`}
        </pre>
      </Section>
    </div>
  );
}
