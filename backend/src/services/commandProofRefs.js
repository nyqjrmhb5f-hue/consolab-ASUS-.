import fs from "node:fs/promises";
import path from "node:path";
import { consoleLabPath, consoleLabRoot } from "./consoleLabPaths.js";

const evidenceRefsRoot = consoleLabPath("03_OPERATIONS_ROOM", "evidence_refs");

function toJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function normalizeRelativePath(value) {
  if (typeof value !== "string" || !value) {
    return value ?? null;
  }

  if (!path.isAbsolute(value)) {
    return value.replace(/\\/g, "/");
  }

  const relative = path.relative(consoleLabRoot, value).replace(/\\/g, "/");
  return relative && !relative.startsWith("..") ? relative : value;
}

function normalizePaths(value) {
  if (Array.isArray(value)) {
    return value.map((item) => normalizePaths(item));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, normalizePaths(nested)])
    );
  }

  return normalizeRelativePath(value);
}

async function writeJson(filePath, payload) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, toJson(payload), "utf8");
}

async function writeProofRef(lane, trackingId, refKind, payload) {
  const safeKind = String(refKind || "proof").replace(/[^A-Za-z0-9._-]/g, "_");
  const filePath = path.join(evidenceRefsRoot, lane, `${trackingId}.${safeKind}.json`);
  const createdAt = payload.created_at || new Date().toISOString();
  const normalizedPayload = normalizePaths({
    ...payload,
    created_at: createdAt,
    ref_kind: refKind,
    lane
  });

  await writeJson(filePath, normalizedPayload);

  return {
    ref_kind: refKind,
    lane,
    created_at: createdAt,
    file_path: filePath,
    consolelab_path: normalizeRelativePath(filePath)
  };
}

export async function writeExecutionRef({
  tracking_id,
  action,
  command_class,
  lifecycle_state = "executed",
  result = null,
  targets = {},
  detail = {}
}) {
  return writeProofRef("runtime", tracking_id, "execution", {
    tracking_id,
    action,
    command_class,
    lifecycle_state,
    result_kind: result?.kind || null,
    targets,
    detail
  });
}

export async function writeApprovalRef({
  tracking_id,
  action,
  command_class,
  scope,
  approved_by,
  approved_at,
  targets = {},
  detail = {}
}) {
  return writeProofRef("runtime", tracking_id, `approval.${scope}`, {
    tracking_id,
    action,
    command_class,
    lifecycle_state: "approved",
    approval_scope: scope,
    approved_by: approved_by || "codex",
    approved_at: approved_at || new Date().toISOString(),
    targets,
    detail
  });
}

export async function writeRollbackRef({
  tracking_id,
  action,
  command_class,
  rollback_state = {},
  targets = {},
  detail = {}
}) {
  return writeProofRef("recovery", tracking_id, "rollback", {
    tracking_id,
    action,
    command_class,
    lifecycle_state: "rolled_back",
    rollback_state,
    targets,
    detail
  });
}

export async function writeEvidenceRef({
  tracking_id,
  action,
  command_class,
  evidence = {},
  targets = {},
  detail = {}
}) {
  return writeProofRef("runtime", tracking_id, "sealed", {
    tracking_id,
    action,
    command_class,
    lifecycle_state: "sealed",
    evidence,
    targets,
    detail
  });
}

export async function writeSignatureRef({
  tracking_id,
  action,
  command_class,
  evidence = {},
  targets = {},
  detail = {}
}) {
  return writeProofRef("runtime", tracking_id, "signature", {
    tracking_id,
    action,
    command_class,
    lifecycle_state: "sealed",
    signature: {
      event_id: evidence?.room_ref?.event_id || null,
      tx_hash: evidence?.room_ref?.tx_hash || null,
      signing_key_id: evidence?.room_ref?.signing_key_id || null,
      attestation_state: evidence?.room_ref?.attestation_state || null,
      verification_state: evidence?.room_ref?.verification_state || null,
      key_type: evidence?.room_ref?.key_type || null
    },
    targets,
    detail
  });
}
