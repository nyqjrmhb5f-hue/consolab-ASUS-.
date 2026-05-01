export function formatWallClock(value = new Date()) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(value);
}

export function secondsToClock(totalSeconds) {
  const safe = Math.max(0, Number(totalSeconds) || 0);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
}

export function countdownForItem(item, now = Date.now()) {
  if (!item?.next_occurs_at_utc) {
    return item?.countdown || "n/a";
  }

  const target = new Date(item.next_occurs_at_utc).getTime();
  if (Number.isNaN(target)) {
    return item?.countdown || "n/a";
  }

  return secondsToClock(Math.max(0, Math.floor((target - now) / 1000)));
}

export function toneForStatus(value) {
  const text = String(value ?? "unknown").toLowerCase();
  if (/(ok|pass|live|active|ready|connected|green|structured|locked|up|closed)/.test(text)) return "ok";
  if (/(warn|pending|hold|unbound|unknown|degraded|proxy|planned|watch|staged)/.test(text)) return "warn";
  return "bad";
}

export function buildWallAlerts({ roomStates, approvalQueues, tunnelFabric, evidenceSnapshot, brainModules }) {
  const alerts = [];

  if ((roomStates?.summary?.degraded || 0) > 0) {
    alerts.push(`${roomStates.summary.degraded} room${roomStates.summary.degraded === 1 ? "" : "s"} in watch state`);
  }

  const approvalCount = (approvalQueues?.executive?.length || 0) + (approvalQueues?.tunnel?.length || 0);
  if (approvalCount > 0) {
    alerts.push(`${approvalCount} approval gate${approvalCount === 1 ? "" : "s"} waiting`);
  }

  if ((tunnelFabric?.summary?.staged_tunnels || 0) > 0) {
    alerts.push(`${tunnelFabric.summary.staged_tunnels} tunnel session${tunnelFabric.summary.staged_tunnels === 1 ? "" : "s"} staged`);
  }

  if ((brainModules?.summary?.connector_count || 0) > 0) {
    alerts.push(`${brainModules.summary.connector_count} real MCP connector${brainModules.summary.connector_count === 1 ? "" : "s"} linked`);
  }

  if ((evidenceSnapshot?.events_count || 0) > 0) {
    alerts.push(`${evidenceSnapshot.events_count} evidence event${evidenceSnapshot.events_count === 1 ? "" : "s"} sealed`);
  }

  return alerts.slice(0, 6);
}
