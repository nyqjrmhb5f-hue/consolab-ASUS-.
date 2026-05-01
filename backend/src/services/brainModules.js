import fs from "node:fs/promises";
import path from "node:path";
import { consoleLabPath } from "./consoleLabPaths.js";

const root = consoleLabPath("05_CENTRAL_BRAIN");

async function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

async function readText(filePath, fallback = "") {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch {
    return fallback;
  }
}

async function exists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function dirEntries(target) {
  try {
    return await fs.readdir(target);
  } catch {
    return [];
  }
}

async function moduleStatus(id, modulePath, detail, extra = {}) {
  const live = await exists(modulePath);
  return {
    id,
    path: modulePath,
    status: live ? "UP" : "DOWN",
    detail: live ? detail : "missing path",
    ...extra
  };
}

export async function getBrainModules() {
  const workflowDir = path.join(root, "workflows");
  const connectorsInventoryPath = path.join(root, "integrations", "connectors", "mcp_inventory.json");
  const chronosSchedulePath = path.join(root, "orchestration", "calendar", "chronos_schedule.json");
  const securityPolicyPath = path.join(root, "policies", "security.yaml");
  const retentionPolicyPath = path.join(root, "policies", "retention.yaml");

  const [workflowFiles, inventory, chronosSchedule, securityPolicy, retentionPolicy] = await Promise.all([
    dirEntries(workflowDir),
    readJson(connectorsInventoryPath, { connectors: [] }),
    readJson(chronosSchedulePath, { schedules: [] }),
    readText(securityPolicyPath),
    readText(retentionPolicyPath)
  ]);

  const modules = await Promise.all([
    moduleStatus(
      "CORE-PRIME",
      path.join(root, "core", "CORE-PRIME"),
      "central decision kernel live",
      { workflow_count: workflowFiles.filter((name) => name.endsWith(".json")).length }
    ),
    moduleStatus(
      "MEMORY",
      path.join(root, "core", "memory"),
      "persistent memory module present",
      { artifact_count: (await dirEntries(path.join(root, "core", "memory"))).length }
    ),
    moduleStatus(
      "RAG",
      path.join(root, "core", "rag"),
      "retrieval module present",
      { artifact_count: (await dirEntries(path.join(root, "core", "rag"))).length }
    ),
    moduleStatus(
      "MCP-BRAIN",
      path.join(root, "integrations", "mcp_brain"),
      "connector routing module present",
      {
        connector_mode: inventory?.connector_mode || "unknown",
        connector_count: Array.isArray(inventory?.connectors) ? inventory.connectors.length : 0
      }
    ),
    moduleStatus(
      "CHRONOS",
      path.join(root, "orchestration", "calendar"),
      "calendar cadence module present",
      { schedule_count: Array.isArray(chronosSchedule?.items) ? chronosSchedule.items.length : 0 }
    ),
    moduleStatus(
      "LEDGERD",
      path.join(root, "integrations", "ledger"),
      "evidence engine integration present",
      {
        security_policy_loaded: Boolean(securityPolicy.trim()),
        retention_policy_loaded: Boolean(retentionPolicy.trim())
      }
    )
  ]);

  const summary = {
    total: modules.length,
    up: modules.filter((item) => item.status === "UP").length,
    down: modules.filter((item) => item.status === "DOWN").length,
    workflow_count: workflowFiles.filter((name) => name.endsWith(".json")).length,
    connector_count: Array.isArray(inventory?.connectors) ? inventory.connectors.length : 0
  };

  return {
    timestamp: new Date().toISOString(),
    room: "05_CENTRAL_BRAIN",
    root,
    summary,
    inventory,
    modules
  };
}
