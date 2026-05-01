import { config } from "../config.js";
import { fetchJson } from "../lib/http.js";
import { runDellCommand } from "../lib/ssh.js";

function classifyAnchorLog(logText) {
  if (logText.includes("Tailscale SSH requires an additional check")) {
    return { classification: "AUTH_REQUIRED" };
  }
  const healthy = logText.includes("SEALCHECK: PASS") && logText.includes("[anchor] mode=direct");
  if (!healthy) {
    return { classification: "FAIL" };
  }
  if (logText.includes("ANCHOR TX HASH:") || logText.includes('"status":"ANCHORED"')) {
    return { classification: "ANCHORED" };
  }
  if (logText.includes("ALREADY_SEEN")) {
    return { classification: "ALREADY_SEEN" };
  }
  return { classification: "WAITING" };
}

function extract(logText, marker) {
  const line = logText.split("\n").find((entry) => entry.includes(marker));
  return line ? line.trim() : null;
}

export async function getAnchorStatus() {
  const [runtimeHealth, runtimeMetrics] = await Promise.all([
    fetchJson(config.dell.runtimeHealthUrl),
    fetchJson(config.dell.runtimeMetricsUrl)
  ]);

  if (runtimeHealth.ok || runtimeMetrics.ok) {
    return {
      mode: "proxy",
      nextTimer: "unavailable via proxy",
      classification: runtimeHealth.ok ? "VISIBLE" : "PARTIAL",
      lastTxHash: null,
      metrics: runtimeMetrics.ok ? runtimeMetrics.data : null,
      rawLog: JSON.stringify({
        runtimeHealth: runtimeHealth.ok ? runtimeHealth.data : null,
        runtimeMetrics: runtimeMetrics.ok ? runtimeMetrics.data : null
      })
    };
  }

  const [timer, journal] = await Promise.all([
    runDellCommand("systemctl list-timers --all | grep vyrdx-hash-anchor || true"),
    runDellCommand("journalctl -u vyrdx-hash-anchor.service -n 50 --no-pager -l")
  ]);

  const logText = journal.ok ? journal.stdout : journal.stderr || "";
  const classification = classifyAnchorLog(logText).classification;

  return {
    mode: logText.includes("[anchor] mode=direct") ? "direct" : "unknown",
    nextTimer: timer.ok ? timer.stdout : "unavailable",
    classification,
    lastTxHash: extract(logText, "ANCHOR TX HASH:") || extract(logText, '"txHash":'),
    rawLog: logText
  };
}
