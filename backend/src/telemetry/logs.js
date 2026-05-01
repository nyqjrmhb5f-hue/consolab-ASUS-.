import { runCommand } from "../lib/command.js";
import { runDellCommand } from "../lib/ssh.js";

const allowlist = {
  asus: new Set(["ssh.service", "ssh.socket", "tailscaled.service"]),
  dell: new Set([
    "vyrdx-core.service",
    "vyrdx-chain.service",
    "vyrdx-engine.service",
    "vyrdx-hash-anchor.service",
    "vyrdx-attestation-refresh.service",
    "nginx.service"
  ])
};

export async function getLogs({ source, service, limit = 50 }) {
  if (!allowlist[source]?.has(service)) {
    return {
      ok: false,
      error: `service_not_allowed:${source}:${service}`,
      output: ""
    };
  }

  const args = ["-u", service, "-n", String(limit), "--no-pager", "-l"];
  const result = source === "asus"
    ? await runCommand("journalctl", args)
    : await runDellCommand(`journalctl ${args.map((item) => `'${item}'`).join(" ")}`);

  return {
    ok: result.ok,
    error: result.ok ? null : result.stderr || "log_fetch_failed",
    output: result.ok ? result.stdout : result.stderr || result.stdout
  };
}
