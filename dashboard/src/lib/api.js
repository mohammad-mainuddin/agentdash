/**
 * Thin wrapper around the AgentDash REST API
 */

function getBaseUrl() {
  return localStorage.getItem("agentdash_server")
    || `${window.location.protocol}//${window.location.hostname}:4242`;
}

async function request(path, options = {}) {
  const res = await fetch(`${getBaseUrl()}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  return res.json();
}

export const api = {
  getRuns: (params = {}) => {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v))
    ).toString();
    return request(`/runs${qs ? "?" + qs : ""}`);
  },
  getRun:           (id)   => request(`/runs/${id}`),
  deleteRun:        (id)   => request(`/runs/${id}`, { method: "DELETE" }),
  deleteOldRuns:    (days) => request(`/runs?olderThan=${days}`, { method: "DELETE" }),
  getStats:         ()     => request("/stats"),
  getSettings:      ()     => request("/settings"),
  saveSettings:     (body) => request("/settings", { method: "PUT", body: JSON.stringify(body) }),
  testWebhook:      ()     => request("/settings/test-webhook", { method: "POST" }),
  getExportUrl:     (id)   => `${getBaseUrl()}/runs/${id}/export`,
  getProjects:      ()     => request("/projects"),
  getProjectAgents: (name) => request(`/projects/${encodeURIComponent(name)}/agents`),
  getTrends:        (params = {}) => {
    const qs = new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([,v]) => v))).toString();
    return request(`/stats/trends${qs ? "?" + qs : ""}`);
  },
};
