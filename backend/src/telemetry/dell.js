import { config } from "../config.js";
import { fetchJson } from "../lib/http.js";
import { runDellCommand } from "../lib/ssh.js";

function parseResourceBlob(blob) {
  const lines = blob.split("\n").filter(Boolean);
  const hostname = lines[0] || "unknown";
  const uptime = lines[1] || "unknown";
  const memory = lines[2] || "unknown";
  const disk = lines[3] || "unknown";
  return { hostname, uptime, memory, disk };
}

export async function getDellStatus() {
  const [proxyStatus, proxyHealth, runtimeHealth, readonlyHealth] = await Promise.all([
    fetchJson(config.dell.proxyStatusUrl),
    fetchJson(config.dell.proxyHealthUrl),
    fetchJson(config.dell.runtimeHealthUrl),
    fetchJson(config.dell.readonlyHealthUrl)
  ]);

  if (proxyStatus.ok || runtimeHealth.ok || readonlyHealth.ok) {
    return {
      machine: "DELL",
      reachable: true,
      systemState: proxyHealth.ok ? "proxy_visible" : "proxy_partial",
      authRequired: false,
      role: proxyStatus.ok && typeof proxyStatus.data === "object" ? proxyStatus.data.role || "DELL" : "DELL",
      services: {
        bridge: proxyStatus.ok && typeof proxyStatus.data === "object"
          ? (proxyStatus.data.sshServiceActive ? "active" : "inactive")
          : "unknown",
        runtimeApi: runtimeHealth.ok && typeof runtimeHealth.data === "object"
          ? runtimeHealth.data.status || "OK"
          : "unknown",
        readonlyApi: readonlyHealth.ok && typeof readonlyHealth.data === "object"
          ? readonlyHealth.data.status || "OK"
          : "unknown",
        attestation: proxyStatus.ok && typeof proxyStatus.data === "object"
          ? `${proxyStatus.data.sshService || "bridge"}:${proxyStatus.data.sshServiceActive ? "active" : "inactive"}`
          : "proxy_only"
      },
      resources: proxyStatus.ok && typeof proxyStatus.data === "object"
        ? {
            hostname: proxyStatus.data.hostname || "unknown",
            uptime: "unavailable via proxy",
            memory: "unavailable via proxy",
            disk: "unavailable via proxy",
            tailscaleIPv4: proxyStatus.data.tailscaleIPv4 || "unknown",
            dropletIp: proxyStatus.data.dropletIp || "unknown",
            domain: proxyStatus.data.domain || "unknown"
          }
        : { raw: "proxy telemetry only" }
    };
  }

  const [core, chain, engine, attestation, systemState, resources] = await Promise.all([
    runDellCommand("systemctl is-active vyrdx-core.service"),
    runDellCommand("systemctl is-active vyrdx-chain.service"),
    runDellCommand("systemctl is-active vyrdx-engine.service"),
    runDellCommand("systemctl status vyrdx-attestation-refresh.service --no-pager -l | sed -n '1,30p'"),
    runDellCommand("systemctl is-system-running"),
    runDellCommand("hostname && uptime -p && free -m | awk 'NR==2{print \"mem_mb=\"$2\" free_mb=\"$7}' && df -h / | awk 'NR==2{print \"disk=\"$3\"/\"$2\" used=\"$5}'")
  ]);

  const authRequired = [core, chain, engine, attestation, systemState].some(
    (result) => !result.ok && `${result.stderr} ${result.stdout}`.includes("Tailscale SSH requires an additional check")
  );

  return {
    machine: "DELL",
    reachable: core.ok || systemState.ok,
    systemState: systemState.ok ? systemState.stdout : systemState.stdout || systemState.stderr || "unknown",
    authRequired,
    services: {
      vyrdxCore: core.ok ? core.stdout : "unknown",
      vyrdxChain: chain.ok ? chain.stdout : "unknown",
      vyrdxEngine: engine.ok ? engine.stdout : "unknown",
      attestation: attestation.ok ? attestation.stdout : attestation.stderr || "unknown"
    },
    resources: resources.ok ? parseResourceBlob(resources.stdout) : { raw: resources.stderr || "unavailable" }
  };
}
