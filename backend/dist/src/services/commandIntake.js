import fs from "node:fs/promises";
import crypto from "node:crypto";
import path from "node:path";
import { classifyCommandEnvelope } from "./commandPolicy.js";
import { consoleLabRoot } from "./consoleLabPaths.js";
import { getCommandIntakeFeed, recordCommandIntakeEvent } from "./commandStateProjector.js";

function normalizeText(value, fallback = "") {
  const text = typeof value === "string" ? value.trim() : "";
  return text || fallback;
}

function normalizeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function toJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function safeParseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function sortValue(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => sortValue(entry));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sortValue(value[key])])
    );
  }

  return value;
}

function stableStringify(value) {
  return JSON.stringify(sortValue(value));
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function trackingId() {
  return `${new Date().toISOString().replace(/[^0-9TZ]/g, "")}-${crypto.randomUUID().slice(0, 8)}`;
}

function indexKey(value) {
  return sha256(String(value));
}

function buildCommandHash(envelope) {
  return sha256(
    stableStringify({
      action: envelope.action,
      target: envelope.target,
      details: envelope.details,
      requested_by: envelope.requested_by,
      source: envelope.source,
      channel: envelope.channel,
      command_class: envelope.command_class
    })
  );
}

function summarizeReceipt(envelope, extra = {}) {
  return {
    tracking_id: envelope.tracking_id,
    status: envelope.status,
    control_state: envelope.control_state,
    risk: envelope.risk,
    command_class: envelope.command_class,
    approvals_required: envelope.approvals_required,
    approval_scopes: envelope.approval_scopes || envelope.approvals_required,
    action: envelope.action,
    received_at: envelope.received_at,
    idempotency_key: envelope.idempotency_key || null,
    correlation_id: envelope.correlation_id,
    command_hash: envelope.command_hash,
    ...extra
  };
}

function buildEnvelope(payload = {}, meta = {}) {
  const action = normalizeText(payload.action);
  const requestedBy = normalizeText(payload.requested_by, "consolelab-operator");
  const source = normalizeText(payload.source, "operator_console");
  const target = payload.target ?? null;
  const details = normalizeObject(payload.details);
  const channel = normalizeText(payload.channel, "gateway_api");
  const idempotencyKey = normalizeText(meta.idempotency_key || payload.idempotency_key, "");
  const correlationId = normalizeText(meta.correlation_id || payload.correlation_id, crypto.randomUUID());

  if (!action) {
    return { ok: false, error: "action_required", control_state: "rejected" };
  }

  const classification = classifyCommandEnvelope({ action, target, details });
  const approvalsRequired = [...new Set(classification.policy.approval_scopes || [])];
  const id = trackingId();
  const receivedAt = new Date().toISOString();
  const initialState = approvalsRequired.length ? "pending_approval" : "accepted";

  const envelope = {
    tracking_id: id,
    action,
    target,
    details,
    requested_by: requestedBy,
    source,
    channel,
    risk: classification.policy.risk || "standard",
    command_class: classification.command_class,
    approvals_required: approvalsRequired,
    approval_scopes: approvalsRequired,
    pending_approval_scopes: approvalsRequired,
    approved_scopes: [],
    proof_contract_version: "proof-refs.v1",
    policy_version: classification.policy_version,
    policy: {
      evidence_level: classification.policy.evidence_level || "sealed_trace",
      execution_timeout_ms: Number(classification.policy.execution_timeout_ms || 15000),
      rollback_required: Boolean(classification.policy.rollback_required),
      tunnel_required: Boolean(classification.policy.tunnel_required),
      approval_scopes: approvalsRequired
    },
    idempotency_key: idempotencyKey || null,
    correlation_id: correlationId,
    received_at: receivedAt,
    status: initialState,
    control_state: initialState,
    lifecycle_state: approvalsRequired.length ? "pending_approval" : "staged"
  };

  envelope.command_hash = buildCommandHash(envelope);

  return {
    ok: true,
    envelope
  };
}

async function writeJsonFile(filePath, payload) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, toJson(payload), "utf8");
}

async function appendJsonl(filePath, payload) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.appendFile(filePath, `${JSON.stringify(payload)}\n`, "utf8");
}

async function readJsonFile(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    return null;
  }
}

async function readJsonlTail(filePath, limit = 20) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return raw
      .split("\n")
      .filter(Boolean)
      .map((line) => safeParseJson(line))
      .filter(Boolean)
      .slice(-limit)
      .reverse();
  } catch {
    return [];
  }
}

function idempotencyFilePath(idempotencyKey) {
  return path.join(
    consoleLabRoot,
    "10_SHARED_BACKBONE",
    "gateway_api",
    "routes",
    "idempotency",
    `${indexKey(idempotencyKey)}.json`
  );
}

function correlationFilePath(correlationId) {
  return path.join(
    consoleLabRoot,
    "10_SHARED_BACKBONE",
    "gateway_api",
    "routes",
    "correlation",
    `${indexKey(correlationId)}.json`
  );
}

async function loadLifecycleReceipt(id) {
  const candidates = [
    path.join(consoleLabRoot, "03_OPERATIONS_ROOM", "jobs", "rolled_back", `${id}.json`),
    path.join(consoleLabRoot, "03_OPERATIONS_ROOM", "jobs", "failed", `${id}.json`),
    path.join(consoleLabRoot, "03_OPERATIONS_ROOM", "jobs", "rejected", `${id}.json`),
    path.join(consoleLabRoot, "03_OPERATIONS_ROOM", "jobs", "completed", `${id}.json`),
    path.join(consoleLabRoot, "03_OPERATIONS_ROOM", "jobs", "executed", `${id}.json`),
    path.join(consoleLabRoot, "03_OPERATIONS_ROOM", "jobs", "active", `${id}.json`),
    path.join(consoleLabRoot, "03_OPERATIONS_ROOM", "jobs", "intake", `${id}.json`),
    path.join(consoleLabRoot, "01_EXECUTIVE", "approvals", "pending", `${id}.json`),
    path.join(consoleLabRoot, "01_EXECUTIVE", "approvals", "signed", `${id}.json`),
    path.join(consoleLabRoot, "07_INTELLIGENCE_TUNNEL", "approvals", `${id}.json`),
    path.join(consoleLabRoot, "03_OPERATIONS_ROOM", "actions", "executed", `${id}.json`),
    path.join(consoleLabRoot, "03_OPERATIONS_ROOM", "actions", "approved", `${id}.json`),
    path.join(consoleLabRoot, "03_OPERATIONS_ROOM", "actions", "requested", `${id}.json`)
  ];

  for (const candidate of candidates) {
    const payload = await readJsonFile(candidate);
    if (payload) {
      return payload;
    }
  }

  return null;
}

async function resolveIdempotentCommand(envelope) {
  if (!envelope.idempotency_key) {
    return null;
  }

  const existing = await readJsonFile(idempotencyFilePath(envelope.idempotency_key));
  if (!existing) {
    return null;
  }

  if (existing.command_hash !== envelope.command_hash) {
    return {
      ok: false,
      error: "idempotency_conflict",
      control_state: "rejected",
      existing_tracking_id: existing.tracking_id
    };
  }

  const receipt = (await loadLifecycleReceipt(existing.tracking_id)) || {
    tracking_id: existing.tracking_id,
    status: existing.status || "accepted",
    control_state: existing.control_state || "accepted",
    correlation_id: existing.correlation_id,
    idempotency_key: existing.idempotency_key,
    command_hash: existing.command_hash
  };

  return {
    ok: true,
    deduped: true,
    receipt: summarizeReceipt(receipt, {
      deduped: true,
      existing_tracking_id: existing.tracking_id
    }),
    existing_tracking_id: existing.tracking_id
  };
}

export async function stageCommand(payload = {}, meta = {}) {
  const built = buildEnvelope(payload, meta);
  if (!built.ok) {
    return built;
  }

  const envelope = built.envelope;
  const deduped = await resolveIdempotentCommand(envelope);
  if (deduped) {
    return deduped;
  }

  const gatewayEvent = {
    tracking_id: envelope.tracking_id,
    action: envelope.action,
    status: envelope.status,
    control_state: envelope.control_state,
    risk: envelope.risk,
    command_class: envelope.command_class,
    requested_by: envelope.requested_by,
    source: envelope.source,
    received_at: envelope.received_at,
    idempotency_key: envelope.idempotency_key,
    correlation_id: envelope.correlation_id,
    command_hash: envelope.command_hash
  };

  await Promise.all([
    writeJsonFile(
      path.join(consoleLabRoot, "03_OPERATIONS_ROOM", "jobs", "intake", `${envelope.tracking_id}.json`),
      envelope
    ),
    writeJsonFile(
      path.join(consoleLabRoot, "03_OPERATIONS_ROOM", "actions", "requested", `${envelope.tracking_id}.json`),
      envelope
    ),
    writeJsonFile(
      path.join(consoleLabRoot, "05_CENTRAL_BRAIN", "workflows", `${envelope.tracking_id}.json`),
      envelope
    ),
    writeJsonFile(
      path.join(consoleLabRoot, "10_SHARED_BACKBONE", "agent_gateway", "sessions", `${envelope.tracking_id}.json`),
      envelope
    ),
    envelope.idempotency_key
      ? writeJsonFile(idempotencyFilePath(envelope.idempotency_key), {
          idempotency_key: envelope.idempotency_key,
          tracking_id: envelope.tracking_id,
          correlation_id: envelope.correlation_id,
          command_hash: envelope.command_hash,
          action: envelope.action,
          status: envelope.status,
          control_state: envelope.control_state,
          created_at: envelope.received_at
        })
      : Promise.resolve(),
    writeJsonFile(correlationFilePath(envelope.correlation_id), {
      correlation_id: envelope.correlation_id,
      tracking_id: envelope.tracking_id,
      idempotency_key: envelope.idempotency_key,
      action: envelope.action,
      status: envelope.status,
      control_state: envelope.control_state,
      created_at: envelope.received_at
    }),
    appendJsonl(
      path.join(consoleLabRoot, "10_SHARED_BACKBONE", "gateway_api", "routes", "command_intake.jsonl"),
      gatewayEvent
    )
  ]);

  await recordCommandIntakeEvent(envelope, "received", "command.received", {
    channel: envelope.channel
  });
  await recordCommandIntakeEvent(envelope, "validated", "command.validated", {
    policy_version: envelope.policy_version
  });
  await recordCommandIntakeEvent(
    envelope,
    envelope.approvals_required.length ? "pending_approval" : "staged",
    envelope.approvals_required.length ? "command.awaiting_approval" : "command.staged",
    {
      approval_scopes: envelope.approvals_required
    }
  );

  if (envelope.approvals_required.includes("executive")) {
    await writeJsonFile(
      path.join(consoleLabRoot, "01_EXECUTIVE", "approvals", "pending", `${envelope.tracking_id}.json`),
      envelope
    );
  }

  if (envelope.approvals_required.includes("tunnel")) {
    await writeJsonFile(
      path.join(consoleLabRoot, "07_INTELLIGENCE_TUNNEL", "approvals", `${envelope.tracking_id}.json`),
      envelope
    );
  }

  return {
    ok: true,
    receipt: summarizeReceipt(envelope)
  };
}

export async function getCommandReceipt(id) {
  if (!normalizeText(id)) {
    return null;
  }
  return loadLifecycleReceipt(id);
}

function safeCount(target) {
  return fs.readdir(target).then((items) => items.length).catch(() => 0);
}

export async function getGatewayStatus() {
  const [intakeCount, approvalCount, tunnelApprovalCount, sessionCount] = await Promise.all([
    safeCount(path.join(consoleLabRoot, "03_OPERATIONS_ROOM", "jobs", "intake")),
    safeCount(path.join(consoleLabRoot, "01_EXECUTIVE", "approvals", "pending")),
    safeCount(path.join(consoleLabRoot, "07_INTELLIGENCE_TUNNEL", "approvals")),
    safeCount(path.join(consoleLabRoot, "10_SHARED_BACKBONE", "agent_gateway", "sessions"))
  ]);

  return {
    timestamp: new Date().toISOString(),
    service: "GATEWAY-API",
    status: "UP",
    schema: "command-envelope.v1",
    queues: {
      intake: intakeCount,
      executive_approvals: approvalCount,
      tunnel_approvals: tunnelApprovalCount,
      agent_sessions: sessionCount
    }
  };
}

export async function getGatewayFeed(limit = 20) {
  return getCommandIntakeFeed(limit);
}
