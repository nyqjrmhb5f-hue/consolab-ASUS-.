import fs from "node:fs/promises";
import path from "node:path";
import { consoleLabPath } from "./consoleLabPaths.js";
import { canTransitionLifecycle, lifecycleStates } from "./commandLifecycle.js";

const agentGatewayRoot = consoleLabPath("10_SHARED_BACKBONE", "agent_gateway");
const intakeLogPath = path.join(agentGatewayRoot, "command_intake.jsonl");
const executionLogPath = path.join(agentGatewayRoot, "command_execution.jsonl");
const stateIndexPath = path.join(agentGatewayRoot, "command_state_index.json");
let projectorQueue = Promise.resolve();

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

async function ensureParent(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

async function appendJsonl(filePath, payload) {
  await ensureParent(filePath);
  await fs.appendFile(filePath, `${JSON.stringify(payload)}\n`, "utf8");
}

async function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

async function writeJson(filePath, payload) {
  await ensureParent(filePath);
  await fs.writeFile(filePath, toJson(payload), "utf8");
}

function withProjectorLock(task) {
  const run = projectorQueue.then(task, task);
  projectorQueue = run.catch(() => {});
  return run;
}

async function readJsonlAll(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return raw
      .split("\n")
      .filter(Boolean)
      .map((line) => safeParseJson(line))
      .filter(Boolean);
  } catch {
    return [];
  }
}

async function readJsonlTail(filePath, limit = 20) {
  const rows = await readJsonlAll(filePath);
  return rows.slice(-limit).reverse();
}

function defaultIndex() {
  return {
    updated_at: null,
    summary: summarize({}),
    commands: {}
  };
}

function summarize(commands = {}) {
  const values = Object.values(commands);
  const summary = { total: values.length };

  for (const state of lifecycleStates) {
    summary[state] = values.filter((item) => item.lifecycle_state === state).length;
  }

  return summary;
}

function summarizeResult(result) {
  if (!result || typeof result !== "object") {
    return result ?? null;
  }

  const summary = {
    kind: result.kind || "unknown"
  };

  if (typeof result.status === "string") {
    summary.status = result.status;
  }

  if (result.status?.service) {
    summary.service = result.status.service;
  }

  if (result.status?.status) {
    summary.service_status = result.status.status;
  }

  if (result.status?.queues) {
    summary.queues = result.status.queues;
  }

  if (result.target !== undefined) {
    summary.target = result.target;
  }

  if (result.note) {
    summary.note = result.note;
  }

  if (result.room_id) {
    summary.room_id = result.room_id;
  }

  if (Array.isArray(result.timeline?.items)) {
    summary.timeline_items = result.timeline.items.length;
  }

  if (result.summary && typeof result.summary === "object") {
    summary.summary = result.summary;
  }

  return summary;
}

function sanitizeEvent(event) {
  return event
    ? {
        ...event,
        result: summarizeResult(event.result)
      }
    : event;
}

function sanitizeState(state) {
  return state
    ? {
        ...state,
        result: summarizeResult(state.result)
      }
    : state;
}

function compactProofRef(ref) {
  if (!ref || typeof ref !== "object") {
    return null;
  }

  return {
    ref_kind: ref.ref_kind || null,
    lane: ref.lane || null,
    consolelab_path: ref.consolelab_path || null,
    event_id: ref.event_id || ref.evidence?.event_id || null,
    tx_hash: ref.tx_hash || ref.evidence?.tx_hash || null,
    attestation_state: ref.attestation_state || ref.evidence?.attestation_state || null
  };
}

function compactState(state = {}) {
  return {
    tracking_id: state.tracking_id || null,
    proof_contract_version: state.proof_contract_version || null,
    lifecycle_state: state.lifecycle_state || null,
    control_state: state.control_state || null,
    status: state.status || null,
    evidence_state: state.evidence_state || null,
    latest_event_kind: state.latest_event_kind || null,
    approval_scopes: state.approval_scopes || [],
    pending_approval_scopes: state.pending_approval_scopes || [],
    approved_scopes: state.approved_scopes || [],
    approval_ref: compactProofRef(state.approval_ref),
    execution_ref: compactProofRef(state.execution_ref),
    rollback_ref: compactProofRef(state.rollback_ref),
    evidence_ref: compactProofRef(state.evidence_ref),
    signature_ref: compactProofRef(state.signature_ref),
    attestation_state: state.attestation_state || null
  };
}

function buildEvent(payload = {}, lane, lifecycleState, eventKind, detail = {}) {
  return {
    timestamp: new Date().toISOString(),
    lane,
    event_kind: eventKind,
    lifecycle_state: lifecycleState,
    tracking_id: payload.tracking_id,
    correlation_id: payload.correlation_id || null,
    idempotency_key: payload.idempotency_key || null,
    command_hash: payload.command_hash || null,
    action: payload.action || null,
    target: payload.target ?? null,
    command_class: payload.command_class || null,
    risk: payload.risk || null,
    status: payload.status || null,
    control_state: payload.control_state || null,
    evidence_state: payload.evidence_state || null,
    proof_contract_version: payload.proof_contract_version || null,
    requested_by: payload.requested_by || null,
    source: payload.source || null,
    approvals_required: Array.isArray(payload.approvals_required) ? payload.approvals_required : [],
    approval_scopes: Array.isArray(payload.approval_scopes)
      ? payload.approval_scopes
      : Array.isArray(payload.approvals_required)
        ? payload.approvals_required
        : [],
    pending_approval_scopes: Array.isArray(payload.pending_approval_scopes) ? payload.pending_approval_scopes : [],
    approved_scopes: Array.isArray(payload.approved_scopes) ? payload.approved_scopes : [],
    approval_ref: payload.approval_ref || null,
    approval_refs: payload.approval_refs || null,
    execution_ref: payload.execution_ref || null,
    rollback_ref: payload.rollback_ref || null,
    evidence_ref: payload.evidence_ref || null,
    signature_ref: payload.signature_ref || null,
    attestation_state: payload.attestation_state || null,
    result: summarizeResult(payload.result),
    detail
  };
}

function applyEvent(commands, event, { strict = true } = {}) {
  const current = commands[event.tracking_id] || {};
  const fromState = current.lifecycle_state || null;

  if (!canTransitionLifecycle(fromState, event.lifecycle_state)) {
    const violation = {
      tracking_id: event.tracking_id,
      from_state: fromState,
      to_state: event.lifecycle_state,
      event_kind: event.event_kind,
      timestamp: event.timestamp
    };

    if (strict) {
      const error = new Error("invalid_lifecycle_transition");
      error.details = violation;
      throw error;
    }

    return {
      commands,
      state: current,
      violation
    };
  }

  const next = {
    ...current,
    tracking_id: event.tracking_id,
    correlation_id: event.correlation_id,
    idempotency_key: event.idempotency_key,
    command_hash: event.command_hash,
    action: event.action,
    target: event.target,
    command_class: event.command_class,
    risk: event.risk,
    status: event.status,
    control_state: event.control_state,
    lifecycle_state: event.lifecycle_state,
    evidence_state: event.evidence_state ?? current.evidence_state ?? null,
    proof_contract_version: event.proof_contract_version ?? current.proof_contract_version ?? null,
    approvals_required: event.approvals_required,
    approval_scopes: event.approval_scopes ?? current.approval_scopes ?? [],
    pending_approval_scopes: event.pending_approval_scopes ?? current.pending_approval_scopes ?? [],
    approved_scopes: event.approved_scopes ?? current.approved_scopes ?? [],
    approval_ref: event.approval_ref ?? current.approval_ref ?? null,
    approval_refs: event.approval_refs ?? current.approval_refs ?? null,
    execution_ref: event.execution_ref ?? current.execution_ref ?? null,
    rollback_ref: event.rollback_ref ?? current.rollback_ref ?? null,
    evidence_ref: event.evidence_ref ?? current.evidence_ref ?? null,
    signature_ref: event.signature_ref ?? current.signature_ref ?? null,
    attestation_state: event.attestation_state ?? current.attestation_state ?? null,
    requested_by: event.requested_by,
    source: event.source,
    received_at: current.received_at || event.timestamp,
    updated_at: event.timestamp,
    latest_event_kind: event.event_kind,
    result: summarizeResult(event.result ?? current.result ?? null),
    detail: event.detail ?? current.detail ?? {}
  };

  return {
    commands: {
      ...commands,
      [event.tracking_id]: next
    },
    state: next,
    violation: null
  };
}

async function projectEvent(event, options = {}) {
  const persist = options.persist !== false;
  const strict = options.strict !== false;
  const index = options.index || (await readJson(stateIndexPath, defaultIndex()));
  const commands = index?.commands && typeof index.commands === "object" ? index.commands : {};

  const applied = applyEvent(commands, event, { strict });
  const projected = {
    updated_at: event.timestamp,
    commands: applied.commands,
    summary: summarize(applied.commands)
  };

  if (persist) {
    await writeJson(stateIndexPath, projected);
  }

  return {
    projected,
    state: applied.state,
    violation: applied.violation
  };
}

async function recordEvent(filePath, payload, lane, lifecycleState, eventKind, detail = {}) {
  return withProjectorLock(async () => {
    const event = buildEvent(payload, lane, lifecycleState, eventKind, detail);
    const preview = await projectEvent(event, { persist: false, strict: true });
    await appendJsonl(filePath, event);
    await writeJson(stateIndexPath, preview.projected);
    return { event, state: preview.state };
  });
}

export async function recordCommandIntakeEvent(payload, lifecycleState, eventKind, detail = {}) {
  return recordEvent(intakeLogPath, payload, "intake", lifecycleState, eventKind, detail);
}

export async function recordCommandExecutionEvent(payload, lifecycleState, eventKind, detail = {}) {
  return recordEvent(executionLogPath, payload, "execution", lifecycleState, eventKind, detail);
}

export async function getCommandIntakeFeed(limit = 20) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 20, 100));
  return {
    timestamp: new Date().toISOString(),
    service: "AGENT-GATEWAY",
    lane: "intake",
    items: (await readJsonlTail(intakeLogPath, safeLimit)).map((item) => sanitizeEvent(item))
  };
}

export async function getCommandExecutionFeed(limit = 20) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 20, 100));
  return {
    timestamp: new Date().toISOString(),
    service: "AGENT-GATEWAY",
    lane: "execution",
    items: (await readJsonlTail(executionLogPath, safeLimit)).map((item) => sanitizeEvent(item))
  };
}

export async function getCommandStateIndex() {
  const index = await readJson(stateIndexPath, defaultIndex());

  return {
    updated_at: index.updated_at,
    summary: index.summary || summarize(index.commands || {}),
    commands: Object.fromEntries(
      Object.entries(index.commands || {}).map(([key, value]) => [key, sanitizeState(value)])
    )
  };
}

export async function getCommandStatus(trackingId) {
  const id = String(trackingId || "").trim();
  if (!id) {
    return null;
  }

  const index = await getCommandStateIndex();
  return sanitizeState(index.commands[id] || null);
}

export async function getCommandHistory(trackingId) {
  const id = String(trackingId || "").trim();
  if (!id) {
    return null;
  }

  const [intakeItems, executionItems, status] = await Promise.all([
    readJsonlAll(intakeLogPath),
    readJsonlAll(executionLogPath),
    getCommandStatus(id)
  ]);

  const matches = (event) => {
    if (event?.tracking_id === id) return true;
    if (status?.correlation_id && event?.correlation_id === status.correlation_id) return true;
    if (status?.idempotency_key && event?.idempotency_key === status.idempotency_key) return true;
    return false;
  };

  const items = [...intakeItems, ...executionItems]
    .filter(matches)
    .sort((left, right) => String(left.timestamp || "").localeCompare(String(right.timestamp || "")));

  if (!items.length && !status) {
    return null;
  }

  return {
    timestamp: new Date().toISOString(),
    tracking_id: id,
    status: sanitizeState(status),
    items: items.map((item) => sanitizeEvent(item))
  };
}

function attachSequence(items = [], lane) {
  return items.map((item, index) => ({
    ...item,
    __order: index,
    __lane: lane
  }));
}

function sortLedgerEvents(items = []) {
  const laneOrder = { intake: 0, execution: 1 };
  return items.sort((left, right) => {
    const timeCompare = String(left.timestamp || "").localeCompare(String(right.timestamp || ""));
    if (timeCompare !== 0) return timeCompare;
    const laneCompare = (laneOrder[left.__lane] ?? 99) - (laneOrder[right.__lane] ?? 99);
    if (laneCompare !== 0) return laneCompare;
    return Number(left.__order || 0) - Number(right.__order || 0);
  });
}

function stripInternalFields(item) {
  if (!item) return item;
  const { __order, __lane, ...rest } = item;
  return rest;
}

export async function rebuildCommandStateIndex({ persist = true } = {}) {
  return withProjectorLock(async () => {
    const [intakeItems, executionItems] = await Promise.all([
      readJsonlAll(intakeLogPath),
      readJsonlAll(executionLogPath)
    ]);

    const events = sortLedgerEvents([
      ...attachSequence(intakeItems, "intake"),
      ...attachSequence(executionItems, "execution")
    ]);

    let commands = {};
    const violations = [];

    for (const event of events) {
      const applied = applyEvent(commands, event, { strict: false });
      if (applied.violation) {
        violations.push(applied.violation);
        continue;
      }
      commands = applied.commands;
    }

    const projected = {
      updated_at: events.at(-1)?.timestamp || null,
      commands,
      summary: summarize(commands)
    };

    if (persist) {
      await writeJson(stateIndexPath, projected);
    }

    return {
      timestamp: new Date().toISOString(),
      persisted: persist,
      ledger_counts: {
        intake: intakeItems.length,
        execution: executionItems.length,
        total: events.length
      },
      summary: projected.summary,
      violations,
      index: {
        updated_at: projected.updated_at,
        commands: Object.fromEntries(
          Object.entries(projected.commands).map(([key, value]) => [key, sanitizeState(value)])
        )
      }
    };
  });
}

export async function verifyCommandStateIndex() {
  const [existingIndex, rebuilt] = await Promise.all([
    readJson(stateIndexPath, defaultIndex()),
    rebuildCommandStateIndex({ persist: false })
  ]);

  const existingCommands = existingIndex?.commands && typeof existingIndex.commands === "object" ? existingIndex.commands : {};
  const rebuiltCommands = rebuilt.index?.commands || {};

  const existingIds = new Set(Object.keys(existingCommands));
  const rebuiltIds = new Set(Object.keys(rebuiltCommands));
  const missingInIndex = [...rebuiltIds].filter((id) => !existingIds.has(id));
  const missingInReplay = [...existingIds].filter((id) => !rebuiltIds.has(id));
  const mismatched = [...rebuiltIds]
    .filter((id) => existingIds.has(id))
    .filter((id) => JSON.stringify(compactState(existingCommands[id])) !== JSON.stringify(compactState(rebuiltCommands[id])))
    .map((id) => ({
      tracking_id: id,
      indexed: compactState(existingCommands[id]),
      rebuilt: compactState(rebuiltCommands[id])
    }));

  const sealedEvidenceViolations = Object.values(rebuiltCommands)
    .filter(
      (state) =>
        ["sealed", "attested_sealed"].includes(state.lifecycle_state) &&
        !["sealed", "attested_sealed"].includes(state.evidence_state)
    )
    .map((state) => ({
      tracking_id: state.tracking_id,
      lifecycle_state: state.lifecycle_state,
      evidence_state: state.evidence_state
    }));

  const stateProofViolations = Object.values(rebuiltCommands)
    .flatMap((state) => {
      if (state.proof_contract_version !== "proof-refs.v1") {
        return [];
      }

      const violations = [];

      if (["sealed", "attested_sealed"].includes(state.lifecycle_state) && !state.evidence_ref) {
        violations.push({
          tracking_id: state.tracking_id,
          lifecycle_state: state.lifecycle_state,
          invariant: "sealed_requires_evidence_ref"
        });
      }

      if (state.lifecycle_state === "attested_sealed" || state.attestation_state === "signed") {
        if (!state.signature_ref) {
          violations.push({
            tracking_id: state.tracking_id,
            lifecycle_state: state.lifecycle_state,
            invariant: "attested_sealed_requires_signature_ref"
          });
        }
      }

      if (state.lifecycle_state === "rolled_back" && !state.rollback_ref) {
        violations.push({
          tracking_id: state.tracking_id,
          lifecycle_state: state.lifecycle_state,
          invariant: "rolled_back_requires_rollback_ref"
        });
      }

      if (state.lifecycle_state === "executed" && !state.execution_ref) {
        violations.push({
          tracking_id: state.tracking_id,
          lifecycle_state: state.lifecycle_state,
          invariant: "executed_requires_execution_ref"
        });
      }

      if (
        state.lifecycle_state === "pending_approval" &&
        !(Array.isArray(state.pending_approval_scopes) && state.pending_approval_scopes.length) &&
        !(Array.isArray(state.approval_scopes) && state.approval_scopes.length)
      ) {
        violations.push({
          tracking_id: state.tracking_id,
          lifecycle_state: state.lifecycle_state,
          invariant: "pending_approval_requires_scope"
        });
      }

      if (state.lifecycle_state === "approved" && !state.approval_ref) {
        violations.push({
          tracking_id: state.tracking_id,
          lifecycle_state: state.lifecycle_state,
          invariant: "approved_requires_approval_ref"
        });
      }

      return violations;
    });

  return {
    timestamp: new Date().toISOString(),
    ok:
      rebuilt.violations.length === 0 &&
      missingInIndex.length === 0 &&
      missingInReplay.length === 0 &&
      mismatched.length === 0 &&
      sealedEvidenceViolations.length === 0 &&
      stateProofViolations.length === 0,
    ledger_counts: rebuilt.ledger_counts,
    summary: rebuilt.summary,
    transition_violations: rebuilt.violations.map((item) => stripInternalFields(item)),
    missing_in_index: missingInIndex,
    missing_in_replay: missingInReplay,
    mismatched,
    sealed_evidence_violations: sealedEvidenceViolations,
    state_proof_violations: stateProofViolations
  };
}
