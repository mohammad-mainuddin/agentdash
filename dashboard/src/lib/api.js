/**
 * Thin wrapper around the AgentDash REST API
 */

function getBaseUrl() {
  return localStorage.getItem("agentdash_server") || `${window.location.protocol}//${window.location.hostname}:4242`;
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
  getRuns: () => request("/runs"),
  getRun: (id) => request(`/runs/${id}`),
  deleteRun: (id) => request(`/runs/${id}`, { method: "DELETE" }),
  deleteOldRuns: (days) => request(`/runs?olderThan=${days}`, { method: "DELETE" }),
  getStats: () => request("/stats"),
};
