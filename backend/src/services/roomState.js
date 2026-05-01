import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { getRoomRegistry } from "./roomRegistry.js";
import { consoleLabPath } from "./consoleLabPaths.js";

function exists(target) {
  return fs.existsSync(target);
}

function dirCount(target) {
  if (!exists(target)) return 0;
  try {
    return fs.readdirSync(target).length;
  } catch {
    return 0;
  }
}

function hostExecutablePath(candidates) {
  for (const candidate of candidates) {
    if (exists(candidate)) {
      return candidate;
    }

    try {
      const result = spawnSync("flatpak-spawn", ["--host", "test", "-x", candidate], { stdio: "ignore" });
      if (result.status === 0) {
        return candidate;
      }
    } catch {
      // Ignore host probing failure and continue.
    }
  }

  return null;
}

function makeCheck(name, status, detail, extra = {}) {
  return { name, status, detail, ...extra };
}

function okCheck(name, target, detail = "present") {
  return makeCheck(name, exists(target) ? "UP" : "DOWN", exists(target) ? detail : "missing path", { path: target });
}

function summarize(checks) {
  const up = checks.filter((check) => check.status === "UP").length;
  const degraded = checks.filter((check) => check.status === "DEGRADED").length;
  const down = checks.filter((check) => check.status === "DOWN").length;
  const overall_status = down > 0 ? "DOWN" : degraded > 0 ? "DEGRADED" : "UP";
  return { overall_status, up, degraded, down };
}

function structuredRoomState(room, checks) {
  return {
    room_id: room.id,
    title: room.title,
    primary_engine: room.primary_engine,
    role: room.role,
    ...summarize(checks),
    checks
  };
}

function executiveState(room) {
  const root = room.path;
  const checks = [
    okCheck("mission", path.join(root, "mission")),
    okCheck("policy", path.join(root, "policy")),
    okCheck("approvals", path.join(root, "approvals", "pending")),
    okCheck("oversight", path.join(root, "oversight"))
  ];
  return structuredRoomState(room, checks);
}

function commercialState(room) {
  const root = room.path;
  const checks = [
    okCheck("pricing", path.join(root, "pricing")),
    okCheck("contracts", path.join(root, "contracts")),
    okCheck("subscriptions", path.join(root, "subscriptions")),
    okCheck("promotions", path.join(root, "promotions"))
  ];
  return structuredRoomState(room, checks);
}

function operationsState(room) {
  const root = room.path;
  const checks = [
    okCheck("jobs", path.join(root, "jobs")),
    okCheck("queues", path.join(root, "queues")),
    okCheck("runtime_control", path.join(root, "runtime_control")),
    okCheck("key_turn", path.join(root, "change_control", "key_turn"))
  ];
  return structuredRoomState(room, checks);
}

function evidenceState(room) {
  const root = room.path;
  const journalFile = path.join(root, "runtime_journals", "events.jsonl");
  const txFile = path.join(root, "tx_hashes", "events.jsonl");
  const signingKeyId = process.env.CONSOLELAB_EVIDENCE_SIGNING_KEY_ID || "";
  const attestationMode = String(process.env.CONSOLELAB_EVIDENCE_ATTESTATION_MODE || "integrity_only").toLowerCase();
  const checks = [
    okCheck("runtime_journals", path.join(root, "runtime_journals")),
    okCheck("tx_hashes", path.join(root, "tx_hashes")),
    okCheck("proofs", path.join(root, "proofs")),
    makeCheck(
      "journal_stream",
      exists(journalFile) ? "UP" : "DEGRADED",
      exists(journalFile) ? "journal stream active" : "no journal stream yet",
      { path: journalFile }
    ),
    makeCheck(
      "hash_stream",
      exists(txFile) ? "UP" : "DEGRADED",
      exists(txFile) ? "hash stream active" : "no tx hash stream yet",
      { path: txFile }
    ),
    makeCheck(
      "signing_identity",
      signingKeyId ? "UP" : "DEGRADED",
      signingKeyId ? `configured ${signingKeyId}` : "signing key not configured",
      { signing_key_id: signingKeyId || null, attestation_mode: attestationMode }
    ),
    makeCheck(
      "attestation_mode",
      attestationMode === "required" ? "UP" : "DEGRADED",
      attestationMode === "required" ? "attestation enforced" : "integrity only / ready-not-armed"
    )
  ];
  return structuredRoomState(room, checks);
}

function centralBrainState(room) {
  const root = room.path;
  const kittyPaths = ["/home/t79/.local/bin/kitty", "/usr/bin/kitty"];
  const zshPaths = ["/usr/bin/zsh", "/bin/zsh"];
  const kittyPath = hostExecutablePath(kittyPaths);
  const zshPath = hostExecutablePath(zshPaths);
  const connectorsPath = path.join(root, "integrations", "connectors");
  const checks = [
    makeCheck("kitty_cockpit", kittyPath ? "UP" : "DOWN", kittyPath ? "kitty available" : "kitty missing", { path: kittyPath }),
    makeCheck("zsh_shell", zshPath ? "UP" : "DOWN", zshPath ? "zsh available" : "zsh missing", { path: zshPath }),
    okCheck("registry", path.join(root, "docs", "room_registry.json")),
    okCheck("security_policy", path.join(root, "policies", "security.yaml")),
    okCheck("retention_policy", path.join(root, "policies", "retention.yaml")),
    okCheck("core_prime", path.join(root, "core", "CORE-PRIME", "README.md")),
    okCheck("memory", path.join(root, "core", "memory")),
    okCheck("rag", path.join(root, "core", "rag")),
    okCheck("mcp_brain", path.join(root, "integrations", "mcp_brain")),
    makeCheck(
      "connector_inventory",
      dirCount(connectorsPath) > 0 ? "UP" : "DEGRADED",
      dirCount(connectorsPath) > 0 ? "connector artifacts present" : "connector directory empty",
      { path: connectorsPath, entry_count: dirCount(connectorsPath) }
    )
  ];
  return structuredRoomState(room, checks);
}

function interfacesState(room) {
  const root = room.path;
  const checks = [
    okCheck("operator_console", path.join(root, "operator_console")),
    okCheck("customer_surface", path.join(root, "customer_surface")),
    okCheck("schemas", path.join(root, "schemas")),
    okCheck("sensory", path.join(root, "sensory"))
  ];
  return structuredRoomState(room, checks);
}

function intelligenceTunnelState(room) {
  const root = room.path;
  const knownHostsPath = consoleLabPath(".ssh", "known_hosts");
  const checks = [
    okCheck("ssh", path.join(root, "ssh")),
    okCheck("tunnels", path.join(root, "tunnels")),
    okCheck("relay", path.join(root, "relay")),
    okCheck("session_control", path.join(root, "session_control")),
    okCheck("approvals", path.join(root, "approvals")),
    makeCheck(
      "known_hosts",
      exists(knownHostsPath) ? "UP" : "DEGRADED",
      exists(knownHostsPath) ? "known hosts loaded" : "known hosts file missing",
      { path: knownHostsPath }
    )
  ];
  return structuredRoomState(room, checks);
}

function deploymentState(room) {
  const root = room.path;
  const checks = [
    okCheck("manifests", path.join(root, "manifests")),
    okCheck("release", path.join(root, "release")),
    okCheck("strategy", path.join(root, "release", "strategy.yaml")),
    okCheck("healthchecks", path.join(root, "healthchecks")),
    okCheck("rollback", path.join(root, "rollback"))
  ];
  return structuredRoomState(room, checks);
}

function sharedBackboneState(room) {
  const root = room.path;
  const backendEntryPath = consoleLabPath("backend", "src", "index.js");
  const checks = [
    okCheck("gateway_api", path.join(root, "gateway_api", "README.md")),
    okCheck("server", path.join(root, "server", "README.md")),
    okCheck("agent_gateway", path.join(root, "agent_gateway", "README.md")),
    okCheck("backend_entry", backendEntryPath),
    okCheck("api_routes", path.join(root, "gateway_api", "routes"))
  ];
  return structuredRoomState(room, checks);
}

function genericState(room) {
  return structuredRoomState(room, [okCheck("room_root", room.path)]);
}

const roomStateBuilders = {
  "01_EXECUTIVE": executiveState,
  "02_COMMERCIAL_ROOM": commercialState,
  "03_OPERATIONS_ROOM": operationsState,
  "04_EVIDENCE_ROOM": evidenceState,
  "05_CENTRAL_BRAIN": centralBrainState,
  "06_INTERFACES": interfacesState,
  "07_INTELLIGENCE_TUNNEL": intelligenceTunnelState,
  "09_DEPLOYMENT": deploymentState,
  "10_SHARED_BACKBONE": sharedBackboneState
};

export function getConsoleLabRoomStates() {
  const registry = getRoomRegistry();
  const items = registry.rooms.map((room) => {
    const build = roomStateBuilders[room.id] || genericState;
    return build(room);
  });

  const summary = summarize(items.map((item) => ({ status: item.overall_status })));

  return {
    timestamp: new Date().toISOString(),
    summary: {
      total: items.length,
      up: summary.up,
      degraded: summary.degraded,
      down: summary.down,
      overall: summary.down > 0 ? "DEGRADED" : summary.degraded > 0 ? "WATCH" : "HEALTHY"
    },
    items
  };
}
