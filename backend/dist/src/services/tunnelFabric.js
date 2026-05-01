import fs from "node:fs/promises";
import path from "node:path";
import { consoleLabPath } from "./consoleLabPaths.js";

const root = consoleLabPath("07_INTELLIGENCE_TUNNEL");
const agentGatewayRoot = consoleLabPath("10_SHARED_BACKBONE", "agent_gateway");

async function readJson(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    return null;
  }
}

async function writeJson(filePath, payload) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

async function removeFile(filePath) {
  await fs.rm(filePath, { force: true }).catch(() => {});
}

async function listJson(dirPath, limit = 25) {
  try {
    const entries = (await fs.readdir(dirPath)).sort();
    const items = await Promise.all(entries.slice(-limit).map((name) => readJson(path.join(dirPath, name))));
    return items.filter(Boolean).reverse();
  } catch {
    return [];
  }
}

function tunnelPaths(id) {
  return {
    tunnel: path.join(root, "tunnels", `${id}.json`),
    sessionControl: path.join(root, "session_control", `${id}.json`),
    approval: path.join(root, "approvals", `${id}.json`),
    auditApproved: path.join(root, "audit", "approved", `${id}.json`),
    auditClosed: path.join(root, "audit", "closed", `${id}.json`),
    session: path.join(agentGatewayRoot, "sessions", `${id}.json`)
  };
}

export async function getTunnelFabricState() {
  const [approvals, staged, approvedAudit, sessionControl, closedAudit] = await Promise.all([
    listJson(path.join(root, "approvals"), 25),
    listJson(path.join(root, "tunnels"), 25),
    listJson(path.join(root, "audit", "approved"), 25),
    listJson(path.join(root, "session_control"), 25),
    listJson(path.join(root, "audit", "closed"), 25)
  ]);

  return {
    timestamp: new Date().toISOString(),
    service: "SYNAPSE-BRIDGE",
    root,
    summary: {
      approvals: approvals.length,
      staged_tunnels: staged.filter((item) => item?.status !== "closed").length,
      closed_tunnels: closedAudit.length,
      session_events: sessionControl.length
    },
    approvals,
    tunnels: staged,
    approved_audit: approvedAudit,
    session_control: sessionControl,
    closed_audit: closedAudit
  };
}

export async function closeTunnelSession(id, meta = {}) {
  const paths = tunnelPaths(id);
  const [tunnel, agentSession] = await Promise.all([readJson(paths.tunnel), readJson(paths.session)]);

  if (!tunnel) {
    return { ok: false, error: "not_found" };
  }

  const closedAt = new Date().toISOString();
  const closedBy = meta.closed_by || "consolelab-codex";
  const reason = meta.reason || "operator_closed";

  const closedTunnel = {
    ...tunnel,
    status: "closed",
    closed_at: closedAt,
    closed_by: closedBy,
    close_reason: reason
  };

  const sessionRecord = {
    tracking_id: id,
    action: "close_remote_tunnel",
    status: "closed",
    target: tunnel.target || null,
    closed_at: closedAt,
    closed_by: closedBy,
    close_reason: reason
  };

  const updatedAgentSession = agentSession
    ? {
        ...agentSession,
        session_state: {
          status: "closed",
          closed_at: closedAt,
          closed_by: closedBy,
          close_reason: reason
        }
      }
    : null;

  await Promise.all([
    writeJson(paths.tunnel, closedTunnel),
    writeJson(paths.sessionControl, sessionRecord),
    writeJson(paths.auditClosed, sessionRecord),
    updatedAgentSession ? writeJson(paths.session, updatedAgentSession) : Promise.resolve(),
    removeFile(paths.approval)
  ]);

  return {
    ok: true,
    receipt: {
      tracking_id: id,
      status: "closed",
      target: tunnel.target || null,
      closed_at: closedAt,
      closed_by: closedBy,
      close_reason: reason
    }
  };
}
