const base = import.meta.env.VITE_API_BASE || "/api";

async function requestJson(path, options = {}) {
  const headers = new Headers(options.headers || {});
  const hasBody = options.body !== undefined;

  if (hasBody && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${base}${path}`, {
    ...options,
    headers
  });

  const text = await response.text();
  let payload = null;

  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { ok: false, error: "invalid_json_response", raw: text };
    }
  }

  if (!response.ok) {
    const error = new Error(payload?.error || `Request failed: ${path}`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

async function getJson(path) {
  return requestJson(path);
}

export const api = {
  topology: () => getJson("/control-surface/topology"),
  liveTv: () => getJson("/control-surface/live-tv"),
  rooms: () => getJson("/control-surface/rooms"),
  roomStates: () => getJson("/control-surface/room-states"),
  chronos: () => getJson("/control-surface/chronos"),
  brainModules: () => getJson("/control-surface/brain-modules"),
  agentGatewayState: () => getJson("/control-surface/agent-gateway"),
  tunnelFabric: () => getJson("/control-surface/tunnel-fabric"),
  gatewayStatus: () => getJson("/gateway-api/status"),
  gatewayFeed: (limit = 20) => getJson(`/gateway-api/commands?limit=${encodeURIComponent(limit)}`),
  gatewayIntakeFeed: (limit = 20) => getJson(`/gateway-api/commands/feed/intake?limit=${encodeURIComponent(limit)}`),
  gatewayExecutionFeed: (limit = 20) => getJson(`/gateway-api/commands/feed/execution?limit=${encodeURIComponent(limit)}`),
  projectorVerify: () => getJson("/gateway-api/commands/projector/verify"),
  projectorRebuild: () =>
    requestJson("/gateway-api/commands/projector/rebuild", {
      method: "POST"
    }),
  commandReceipt: (trackingId) => getJson(`/gateway-api/commands/${encodeURIComponent(trackingId)}`),
  commandStatus: (trackingId) => getJson(`/gateway-api/commands/${encodeURIComponent(trackingId)}/status`),
  commandHistory: (trackingId) => getJson(`/gateway-api/commands/${encodeURIComponent(trackingId)}/history`),
  submitCommand: (payload) =>
    requestJson("/gateway-api/commands", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  signExecutiveApproval: (trackingId, payload = {}) =>
    requestJson(`/executive/approvals/${encodeURIComponent(trackingId)}/sign`, {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  signTunnelApproval: (trackingId, payload = {}) =>
    requestJson(`/intelligence-tunnel/approvals/${encodeURIComponent(trackingId)}/sign`, {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  dispatchCommand: (trackingId, payload = {}) =>
    requestJson(`/operations/dispatch/${encodeURIComponent(trackingId)}`, {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  closeTunnel: (trackingId, payload = {}) =>
    requestJson(`/intelligence-tunnel/tunnels/${encodeURIComponent(trackingId)}/close`, {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  approvalQueues: () => getJson("/executive/approvals"),
  operationsQueues: () => getJson("/operations/queues"),
  evidenceReader: (limit = 100) => getJson(`/control-surface/evidence-reader?limit=${encodeURIComponent(limit)}`),
  telemetryCollector: () => getJson("/control-surface/telemetry-collector")
};
