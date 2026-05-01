import fs from "node:fs/promises";
import path from "node:path";
import { consoleLabPath } from "./consoleLabPaths.js";
import { getCommandStateIndex } from "./commandStateProjector.js";

const root = consoleLabPath("10_SHARED_BACKBONE", "agent_gateway");

async function readJson(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    return null;
  }
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

export async function getAgentGatewayState() {
  const [sessions, approvals, agents, mcpLinks, toolRoutes, stateIndex] = await Promise.all([
    listJson(path.join(root, "sessions"), 25),
    listJson(path.join(root, "approvals"), 25),
    listJson(path.join(root, "agents"), 25),
    listJson(path.join(root, "mcp_links"), 25),
    listJson(path.join(root, "tool_routing"), 25),
    getCommandStateIndex()
  ]);

  return {
    timestamp: new Date().toISOString(),
    service: "AGENT-GATEWAY",
    root,
    summary: {
      sessions: sessions.length,
      approvals: approvals.length,
      agents: agents.length,
      mcp_links: mcpLinks.length,
      tool_routes: toolRoutes.length,
      command_states: stateIndex.summary?.total || 0
    },
    sessions,
    approvals,
    agents,
    mcp_links: mcpLinks,
    tool_routes: toolRoutes,
    command_state_index: stateIndex
  };
}
