import fs from "node:fs";
import { consoleLabPath } from "./consoleLabPaths.js";

const policyPath = consoleLabPath("10_SHARED_BACKBONE", "gateway_api", "policies", "command-classes.v1.json");

const fallbackPolicy = {
  version: "command-classes.v1",
  default_class: "standard",
  classes: {
    standard: {
      risk: "standard",
      approval_scopes: [],
      tunnel_required: false,
      evidence_level: "sealed_trace",
      execution_timeout_ms: 15000,
      rollback_required: false
    }
  },
  classification_order: []
};

export function getCommandPolicyMap() {
  try {
    const parsed = JSON.parse(fs.readFileSync(policyPath, "utf8"));
    return {
      ...fallbackPolicy,
      ...parsed,
      classes: parsed?.classes && typeof parsed.classes === "object" ? parsed.classes : fallbackPolicy.classes,
      classification_order: Array.isArray(parsed?.classification_order) ? parsed.classification_order : fallbackPolicy.classification_order
    };
  } catch {
    return fallbackPolicy;
  }
}

export function classifyCommandEnvelope({ action = "", target = null, details = {} }) {
  const policyMap = getCommandPolicyMap();
  const searchable = `${action} ${target ?? ""} ${JSON.stringify(details || {})}`.toLowerCase();
  const match = policyMap.classification_order.find((rule) =>
    (rule.fragments || []).some((fragment) => searchable.includes(String(fragment).toLowerCase()))
  );

  const commandClass = match?.command_class || policyMap.default_class || "standard";
  const policy = policyMap.classes?.[commandClass] || policyMap.classes.standard || fallbackPolicy.classes.standard;

  return {
    policy_version: policyMap.version,
    command_class: commandClass,
    policy
  };
}
