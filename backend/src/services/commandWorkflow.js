import fs from "node:fs/promises";
import crypto from "node:crypto";
import path from "node:path";
import { getConsoleLabRoomStates } from "./roomState.js";
import { getChronosTimeline } from "./chronosTimeline.js";
import { getGatewayFeed, getGatewayStatus } from "./commandIntake.js";
import { consoleLabRoot as root } from "./consoleLabPaths.js";
import { isTerminalLifecycleState } from "./commandLifecycle.js";
import { getCommandExecutionFeed, recordCommandExecutionEvent, recordCommandIntakeEvent } from "./commandStateProjector.js";
import { writeApprovalRef, writeExecutionRef, writeRollbackRef } from "./commandProofRefs.js";

function toJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function readJson(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    return null;
  }
}

async function writeJson(filePath, payload) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, toJson(payload), "utf8");
}

async function removeFile(filePath) {
  await fs.rm(filePath, { force: true }).catch(() => {});
}

function exists(filePath) {
  return fs.access(filePath).then(() => true).catch(() => false);
}

function featureGatePaths(gateId, trackingId) {
  return {
    gate: path.join(root, "03_OPERATIONS_ROOM", "runtime_control", "feature_gates", `${gateId}.json`),
    recovery: path.join(root, "03_OPERATIONS_ROOM", "runtime_control", "recovery", `${trackingId}.json`),
    rollbackArtifact: path.join(root, "09_DEPLOYMENT", "rollback", `${trackingId}.json`),
    pipelineRollback: path.join(root, "03_OPERATIONS_ROOM", "pipelines", "rollback", `${trackingId}.json`)
  };
}

function commandPaths(id) {
  return {
    intake: path.join(root, "03_OPERATIONS_ROOM", "jobs", "intake", `${id}.json`),
    active: path.join(root, "03_OPERATIONS_ROOM", "jobs", "active", `${id}.json`),
    executed: path.join(root, "03_OPERATIONS_ROOM", "jobs", "executed", `${id}.json`),
    rejected: path.join(root, "03_OPERATIONS_ROOM", "jobs", "rejected", `${id}.json`),
    rolledBack: path.join(root, "03_OPERATIONS_ROOM", "jobs", "rolled_back", `${id}.json`),
    completed: path.join(root, "03_OPERATIONS_ROOM", "jobs", "completed", `${id}.json`),
    failed: path.join(root, "03_OPERATIONS_ROOM", "jobs", "failed", `${id}.json`),
    actionRequested: path.join(root, "03_OPERATIONS_ROOM", "actions", "requested", `${id}.json`),
    actionApproved: path.join(root, "03_OPERATIONS_ROOM", "actions", "approved", `${id}.json`),
    actionExecuted: path.join(root, "03_OPERATIONS_ROOM", "actions", "executed", `${id}.json`),
    actionRolledBack: path.join(root, "03_OPERATIONS_ROOM", "actions", "rolled_back", `${id}.json`),
    executivePending: path.join(root, "01_EXECUTIVE", "approvals", "pending", `${id}.json`),
    executiveSigned: path.join(root, "01_EXECUTIVE", "approvals", "signed", `${id}.json`),
    executiveDecision: path.join(root, "01_EXECUTIVE", "decisions", `${id}.json`),
    tunnelPending: path.join(root, "07_INTELLIGENCE_TUNNEL", "approvals", `${id}.json`),
    tunnelApprovedAudit: path.join(root, "07_INTELLIGENCE_TUNNEL", "audit", "approved", `${id}.json`),
    tunnelDefinition: path.join(root, "07_INTELLIGENCE_TUNNEL", "tunnels", `${id}.json`),
    gatewaySession: path.join(root, "10_SHARED_BACKBONE", "agent_gateway", "sessions", `${id}.json`),
    gatewayApproval: path.join(root, "10_SHARED_BACKBONE", "agent_gateway", "approvals", `${id}.json`)
  };
}

function hashKey(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function idempotencyMirrorPath(idempotencyKey) {
  return idempotencyKey
    ? path.join(root, "10_SHARED_BACKBONE", "gateway_api", "routes", "idempotency", `${hashKey(idempotencyKey)}.json`)
    : null;
}

function correlationMirrorPath(correlationId) {
  return correlationId
    ? path.join(root, "10_SHARED_BACKBONE", "gateway_api", "routes", "correlation", `${hashKey(correlationId)}.json`)
    : null;
}

async function syncGatewayMirrors(payload, extra = {}) {
  const paths = [
    { filePath: commandPaths(payload.tracking_id).gatewaySession, base: payload },
    {
      filePath: idempotencyMirrorPath(payload.idempotency_key),
      base: {
        idempotency_key: payload.idempotency_key,
        tracking_id: payload.tracking_id,
        correlation_id: payload.correlation_id,
        command_hash: payload.command_hash,
        action: payload.action,
        created_at: payload.received_at
      }
    },
    {
      filePath: correlationMirrorPath(payload.correlation_id),
      base: {
        correlation_id: payload.correlation_id,
        tracking_id: payload.tracking_id,
        idempotency_key: payload.idempotency_key,
        action: payload.action,
        created_at: payload.received_at
      }
    }
  ].filter((entry) => entry.filePath);

  await Promise.all(
    paths.map(async ({ filePath, base }) => {
      const existing = await readJson(filePath);
      await writeJson(filePath, {
        ...(existing || {}),
        ...base,
        status: payload.status,
        control_state: payload.control_state,
        approval_state: payload.approval_state || existing?.approval_state || undefined,
        approval_scopes: payload.approval_scopes || existing?.approval_scopes || undefined,
        pending_approval_scopes: payload.pending_approval_scopes || existing?.pending_approval_scopes || undefined,
        approved_scopes: payload.approved_scopes || existing?.approved_scopes || undefined,
        proof_contract_version: payload.proof_contract_version || existing?.proof_contract_version || undefined,
        approval_ref: payload.approval_ref || existing?.approval_ref || undefined,
        approval_refs: payload.approval_refs || existing?.approval_refs || undefined,
        dispatch_state: payload.dispatch_state || existing?.dispatch_state || undefined,
        evidence_state: payload.evidence_state || existing?.evidence_state || undefined,
        execution_ref: payload.execution_ref || existing?.execution_ref || undefined,
        rollback_ref: payload.rollback_ref || existing?.rollback_ref || undefined,
        evidence_ref: payload.evidence_ref || existing?.evidence_ref || undefined,
        signature_ref: payload.signature_ref || existing?.signature_ref || undefined,
        attestation_state: payload.attestation_state || existing?.attestation_state || undefined,
        failure_state: payload.failure_state || existing?.failure_state || undefined,
        result: extra.includeResult ? payload.result || existing?.result || undefined : existing?.result
      });
    })
  );
}

function pendingScopes(payload = {}) {
  return (payload.approvals_required || []).filter((scope) => {
    const approvalState = payload.approval_state?.[scope];
    return approvalState?.status !== "approved";
  });
}

function approvedScopes(payload = {}) {
  return Object.entries(payload.approval_state || {})
    .filter(([, value]) => value?.status === "approved")
    .map(([scope]) => scope);
}

async function loadEnvelope(id) {
  const paths = commandPaths(id);
  const candidates = [
    paths.rolledBack,
    paths.failed,
    paths.rejected,
    paths.completed,
    paths.executed,
    paths.active,
    paths.intake,
    paths.executivePending,
    paths.executiveSigned,
    paths.tunnelPending,
    paths.gatewayApproval,
    paths.actionApproved,
    paths.actionRequested,
    paths.actionExecuted
  ];

  for (const candidate of candidates) {
    const payload = await readJson(candidate);
    if (payload) {
      return payload;
    }
  }

  return null;
}

export async function getWorkflowReceipt(id) {
  const payload = await loadEnvelope(id);
  if (!payload) {
    return null;
  }

  return payload;
}

function withApprovalTracking(payload = {}) {
  const scopes = Array.isArray(payload.approvals_required) ? payload.approvals_required : [];
  return {
    ...payload,
    approval_scopes: payload.approval_scopes || scopes,
    pending_approval_scopes: pendingScopes(payload),
    approved_scopes: approvedScopes(payload)
  };
}

async function applyFeatureGateMutation(payload) {
  const gateId = String(
    payload.details?.gate_id || payload.details?.feature_gate_id || payload.target || ""
  )
    .trim()
    .replace(/[^A-Za-z0-9._-]/g, "_");

  if (!gateId) {
    return {
      ok: false,
      error: "gate_id_required"
    };
  }

  const desiredEnabled = Boolean(payload.details?.enabled);
  const paths = featureGatePaths(gateId, payload.tracking_id);
  const previousState = await readJson(paths.gate);
  const timestamp = new Date().toISOString();
  const nextGateState = {
    gate_id: gateId,
    enabled: desiredEnabled,
    status: "applied",
    source_tracking_id: payload.tracking_id,
    updated_at: timestamp,
    previous_enabled: previousState?.enabled ?? null,
    source_command_class: payload.command_class
  };

  await Promise.all([
    writeJson(paths.gate, nextGateState),
    writeJson(paths.recovery, {
      tracking_id: payload.tracking_id,
      gate_id: gateId,
      created_at: timestamp,
      previous_state: previousState,
      attempted_state: nextGateState
    })
  ]);

  if (payload.details?.simulate_failure) {
    return {
      ok: false,
      error: "feature_gate_verification_failed",
      rollback_context: {
        type: "feature_gate",
        gate_id: gateId,
        previous_state: previousState,
        applied_state: nextGateState
      }
    };
  }

  return {
    ok: true,
    outcome: {
      kind: "feature_gate_deployed",
      gate_id: gateId,
      enabled: desiredEnabled,
      previous_enabled: previousState?.enabled ?? null
    }
  };
}

async function performRollback(payload, rollbackContext = {}, failureMeta = {}) {
  if (rollbackContext.type !== "feature_gate") {
    return null;
  }

  const gateId = rollbackContext.gate_id;
  const paths = featureGatePaths(gateId, payload.tracking_id);
  const rolledBackAt = new Date().toISOString();
  const restoredState = rollbackContext.previous_state
    ? {
        ...rollbackContext.previous_state,
        restored_at: rolledBackAt,
        restored_from_tracking_id: payload.tracking_id,
        rollback_reason: failureMeta.error || "runtime_mutation_failed"
      }
    : null;

  await Promise.all([
    restoredState ? writeJson(paths.gate, restoredState) : removeFile(paths.gate),
    writeJson(paths.rollbackArtifact, {
      tracking_id: payload.tracking_id,
      action: payload.action,
      rollback_type: rollbackContext.type,
      gate_id: gateId,
      rolled_back_at: rolledBackAt,
      failure_reason: failureMeta.error || "runtime_mutation_failed",
      previous_state: rollbackContext.previous_state || null,
      restored_state: restoredState,
      removed_gate: !restoredState
    }),
    writeJson(paths.pipelineRollback, {
      tracking_id: payload.tracking_id,
      gate_id: gateId,
      rolled_back_at: rolledBackAt,
      failure_reason: failureMeta.error || "runtime_mutation_failed"
    })
  ]);

  const rollbackRef = await writeRollbackRef({
    tracking_id: payload.tracking_id,
    action: payload.action,
    command_class: payload.command_class,
    rollback_state: {
      status: "rolled_back",
      rolled_back_at: rolledBackAt,
      reason: failureMeta.error || "runtime_mutation_failed",
      gate_id: gateId,
      artifact: paths.rollbackArtifact
    },
    targets: {
      rollback_artifact: paths.rollbackArtifact,
      pipeline_rollback: paths.pipelineRollback,
      rollback_job: commandPaths(payload.tracking_id).rolledBack,
      rollback_action: commandPaths(payload.tracking_id).actionRolledBack
    },
    detail: {
      rollback_type: rollbackContext.type,
      removed_gate: !restoredState
    }
  });

  return {
    ...withApprovalTracking(payload),
    status: "rolled_back",
    control_state: "rejected",
    lifecycle_state: "rolled_back",
    evidence_state: "rollback_recorded",
    rollback_ref: rollbackRef,
    rollback_state: {
      status: "rolled_back",
      rolled_back_at: rolledBackAt,
      reason: failureMeta.error || "runtime_mutation_failed",
      gate_id: gateId,
      artifact: paths.rollbackArtifact
    },
    result: {
      kind: "feature_gate_rolled_back",
      gate_id: gateId,
      restored: Boolean(restoredState)
    }
  };
}

async function executeAction(payload) {
  switch (payload.action) {
    case "refresh_room_state": {
      const roomId = payload.details?.room_id;
      const roomStates = getConsoleLabRoomStates();
      const item = roomStates.items.find((entry) => entry.room_id === roomId) || null;
      return {
        ok: true,
        outcome: {
          kind: "room_state_refresh",
          room_id: roomId,
          room_state: item,
          summary: roomStates.summary
        }
      };
    }
    case "read_chronos": {
      return {
        ok: true,
        outcome: {
          kind: "chronos_timeline",
          timeline: await getChronosTimeline()
        }
      };
    }
    case "read_gateway_status": {
      const intakeFeed = await getGatewayFeed(10);
      const executionFeed = await getCommandExecutionFeed(10);
      return {
        ok: true,
        outcome: {
          kind: "gateway_status",
          status: await getGatewayStatus(),
          feed: intakeFeed,
          intake_feed: intakeFeed,
          execution_feed: executionFeed
        }
      };
    }
    case "open_remote_tunnel": {
      return {
        ok: true,
        outcome: {
          kind: "tunnel_definition",
          status: "approved_staged",
          target: payload.details?.target || null,
          note: "Tunnel definition staged. Real remote session wiring still requires connector/session configuration."
        }
      };
    }
    case "deploy_feature_gate": {
      return applyFeatureGateMutation(payload);
    }
    default:
      return {
        ok: true,
        outcome: {
          kind: "staged_action",
          status: "completed_without_side_effects",
          action: payload.action
        }
      };
  }
}

export async function dispatchCommand(id, dispatchMeta = {}) {
  const paths = commandPaths(id);
  const payload = withApprovalTracking(await loadEnvelope(id));

  if (!payload) {
    return { ok: false, error: "not_found" };
  }

  const stillPending = pendingScopes(payload);
  if (stillPending.length) {
    return { ok: false, error: "approvals_pending", approvals_pending: stillPending };
  }

  const activePayload = {
    ...payload,
    status: "active",
    control_state: "accepted",
    lifecycle_state: "dispatched",
    evidence_state: "pending_write",
    dispatch_state: {
      status: "active",
      started_at: new Date().toISOString(),
      ...dispatchMeta
    }
  };

  await Promise.all([
    writeJson(paths.active, activePayload),
    writeJson(paths.actionApproved, activePayload),
    syncGatewayMirrors(activePayload),
    recordCommandExecutionEvent(activePayload, "dispatched", "command.dispatched", {
      dispatched_by: activePayload.dispatch_state.dispatched_by || dispatchMeta.dispatched_by || "unknown"
    }),
    removeFile(paths.intake)
  ]);

  const result = await executeAction(activePayload);
  const completedAt = new Date().toISOString();

  if (!result.ok) {
    const failedPayload = {
      ...activePayload,
      status: "failed",
      control_state: "rejected",
      lifecycle_state: "failed",
      dispatch_state: {
        ...activePayload.dispatch_state,
        status: "failed",
        completed_at: completedAt,
        error: result.error
      }
    };

    await Promise.all([
      writeJson(paths.failed, failedPayload),
      writeJson(paths.rejected, failedPayload),
      syncGatewayMirrors(failedPayload, { includeResult: false }),
      recordCommandExecutionEvent(failedPayload, "failed", "command.failed", {
        error: result.error
      }),
      removeFile(paths.active)
    ]);

    if (activePayload.policy?.rollback_required && result.rollback_context) {
      const rolledBackPayload = await performRollback(failedPayload, result.rollback_context, {
        error: result.error
      });

      if (rolledBackPayload) {
        await Promise.all([
          writeJson(paths.rolledBack, rolledBackPayload),
          writeJson(paths.actionRolledBack, rolledBackPayload),
          syncGatewayMirrors(rolledBackPayload, { includeResult: true }),
          recordCommandExecutionEvent(rolledBackPayload, "rolled_back", "command.rolled_back", {
            reason: result.error,
            gate_id: result.rollback_context.gate_id || null
          })
        ]);

        return {
          ok: true,
          rolled_back: true,
          error: result.error,
          receipt: rolledBackPayload
        };
      }
    }

    return { ok: false, error: result.error };
  }

  const executionRef = await writeExecutionRef({
    tracking_id: activePayload.tracking_id,
    action: activePayload.action,
    command_class: activePayload.command_class,
    lifecycle_state: "executed",
    result: result.outcome,
    targets: {
      executed_job: paths.executed,
      completed_job: paths.completed,
      executed_action: paths.actionExecuted,
      gateway_session: paths.gatewaySession
    },
    detail: {
      dispatched_by: activePayload.dispatch_state?.dispatched_by || dispatchMeta.dispatched_by || "unknown",
      completed_at: completedAt
    }
  });

  const completedPayload = {
    ...activePayload,
    status: "completed",
    control_state: "accepted",
    lifecycle_state: "executed",
    evidence_state: "pending_write",
    execution_ref: executionRef,
    result: result.outcome,
    dispatch_state: {
      ...activePayload.dispatch_state,
      status: "completed",
      completed_at: completedAt
    }
  };

  await Promise.all([
    writeJson(paths.completed, completedPayload),
    writeJson(paths.executed, completedPayload),
    writeJson(paths.actionExecuted, completedPayload),
    syncGatewayMirrors(completedPayload, { includeResult: true }),
    recordCommandExecutionEvent(completedPayload, "executed", "command.executed", {
      result_kind: result.outcome?.kind || "unknown"
    }),
    result.outcome?.kind === "tunnel_definition"
      ? writeJson(paths.tunnelDefinition, {
          tracking_id: id,
          action: payload.action,
          status: "approved_staged",
          target: payload.details?.target || null,
          created_at: completedAt
        })
      : Promise.resolve()
  ]);

  await removeFile(paths.active);

  return {
    ok: true,
    receipt: completedPayload
  };
}

export async function sealCommand(id, meta = {}) {
  const paths = commandPaths(id);
  const payload = withApprovalTracking(await loadEnvelope(id));

  if (!payload) {
    return { ok: false, error: "not_found" };
  }

  if (
    ["sealed", "attested_sealed"].includes(payload.lifecycle_state) &&
    payload.control_state === "sealed"
  ) {
    return { ok: true, receipt: payload };
  }

  const evidenceRef = meta.evidence_ref || payload.evidence_ref || null;
  if (!evidenceRef) {
    return { ok: false, error: "evidence_ref_required" };
  }

  const signatureRef = meta.signature_ref || payload.signature_ref || null;
  const attestationState = meta.attestation_state || payload.attestation_state || null;

  const sealedPayload = {
    ...payload,
    control_state: "sealed",
    lifecycle_state: "sealed",
    evidence_state: "sealed",
    evidence_ref: evidenceRef,
    signature_ref: signatureRef,
    attestation_state: attestationState,
    sealed_at: new Date().toISOString(),
    seal_state: {
      sealed_by: meta.sealed_by || "consolelab",
      evidence_component: meta.evidence_component || null,
      evidence_action: meta.evidence_action || null
    }
  };

  await Promise.all([
    writeJson(paths.completed, sealedPayload),
    writeJson(paths.executed, sealedPayload),
    writeJson(paths.actionExecuted, sealedPayload),
    syncGatewayMirrors(sealedPayload, { includeResult: true }),
    recordCommandExecutionEvent(sealedPayload, "sealed", "command.sealed", {
      sealed_by: meta.sealed_by || "consolelab",
      evidence_component: meta.evidence_component || null,
      evidence_action: meta.evidence_action || null
    })
  ]);

  return {
    ok: true,
    receipt: sealedPayload
  };
}

export async function failCommand(id, meta = {}) {
  const paths = commandPaths(id);
  const payload = withApprovalTracking(await loadEnvelope(id));

  if (!payload) {
    return { ok: false, error: "not_found" };
  }

  if (payload.lifecycle_state === "failed") {
    return {
      ok: false,
      error: meta.error || payload.failure_state?.reason || "command_failed",
      receipt: payload
    };
  }

  if (["attested_sealed", "rolled_back", "rejected"].includes(payload.lifecycle_state)) {
    return {
      ok: false,
      error: "command_terminal",
      lifecycle_state: payload.lifecycle_state
    };
  }

  const failedAt = new Date().toISOString();
  const failedPayload = {
    ...payload,
    status: "failed",
    control_state: "rejected",
    lifecycle_state: "failed",
    evidence_state: meta.evidence_state || "attestation_failed",
    evidence_ref: meta.evidence_ref || payload.evidence_ref || null,
    signature_ref: meta.signature_ref ?? payload.signature_ref ?? null,
    attestation_state: meta.attestation_state || payload.attestation_state || null,
    failure_state: {
      status: "failed",
      failed_at: failedAt,
      failed_by: meta.failed_by || "consolelab",
      reason: meta.error || "command_failed",
      detail: meta.detail || null
    }
  };

  await Promise.all([
    writeJson(paths.failed, failedPayload),
    writeJson(paths.actionExecuted, failedPayload),
    syncGatewayMirrors(failedPayload, { includeResult: true }),
    recordCommandExecutionEvent(failedPayload, "failed", "command.failed", {
      reason: meta.error || "command_failed",
      failed_by: meta.failed_by || "consolelab",
      source_lifecycle_state: payload.lifecycle_state || null,
      detail: meta.detail || null
    }),
    removeFile(paths.active),
    removeFile(paths.completed),
    removeFile(paths.executed)
  ]);

  return {
    ok: false,
    error: meta.error || "command_failed",
    receipt: failedPayload
  };
}

export async function attestCommand(id, meta = {}) {
  const paths = commandPaths(id);
  const payload = withApprovalTracking(await loadEnvelope(id));

  if (!payload) {
    return { ok: false, error: "not_found" };
  }

  if (payload.lifecycle_state === "attested_sealed" && payload.control_state === "sealed") {
    return { ok: true, receipt: payload };
  }

  if (payload.lifecycle_state !== "sealed") {
    return { ok: false, error: "seal_required" };
  }

  if (!payload.signature_ref && !meta.signature_ref) {
    return { ok: false, error: "signature_ref_required" };
  }

  const attestedPayload = {
    ...payload,
    lifecycle_state: "attested_sealed",
    evidence_state: "attested_sealed",
    signature_ref: meta.signature_ref || payload.signature_ref,
    attestation_state: meta.attestation_state || payload.attestation_state || "signed",
    attested_at: new Date().toISOString(),
    attestation_verification: {
      verified: meta.verified !== false,
      verified_at: new Date().toISOString(),
      signing_key_id: meta.signing_key_id || payload.signature_ref?.signing_key_id || null
    }
  };

  await Promise.all([
    writeJson(paths.completed, attestedPayload),
    writeJson(paths.executed, attestedPayload),
    writeJson(paths.actionExecuted, attestedPayload),
    syncGatewayMirrors(attestedPayload, { includeResult: true }),
    recordCommandExecutionEvent(attestedPayload, "attested_sealed", "command.attested_sealed", {
      signing_key_id: meta.signing_key_id || payload.signature_ref?.signing_key_id || null
    })
  ]);

  return {
    ok: true,
    receipt: attestedPayload
  };
}

async function approveScope(id, scope, meta = {}) {
  const paths = commandPaths(id);
  const payload = withApprovalTracking(await loadEnvelope(id));

  if (!payload) {
    return { ok: false, error: "not_found" };
  }

  if (!Array.isArray(payload.approvals_required) || !payload.approvals_required.includes(scope)) {
    return {
      ok: false,
      error: "approval_scope_not_required",
      approvals_pending: pendingScopes(payload)
    };
  }

  if (isTerminalLifecycleState(payload.lifecycle_state)) {
    return {
      ok: false,
      error: "command_terminal",
      lifecycle_state: payload.lifecycle_state
    };
  }

  const approvedAt = new Date().toISOString();
  const stagedApprovalPayload = withApprovalTracking({
    ...payload,
    approval_state: {
      ...(payload.approval_state || {}),
      [scope]: {
        status: "approved",
        approved_by: meta.approved_by || "codex",
        approved_at: approvedAt,
        note: meta.note || ""
      }
    }
  });
  const remainingScopes = pendingScopes(stagedApprovalPayload);
  const targetState = remainingScopes.length ? "pending_approval" : "approved";

  if (scope === "executive") {
    await Promise.all([
      writeJson(paths.executiveSigned, stagedApprovalPayload),
      writeJson(paths.executiveDecision, stagedApprovalPayload),
      writeJson(paths.actionApproved, stagedApprovalPayload),
      removeFile(paths.executivePending)
    ]);
  }

  if (scope === "tunnel") {
    await Promise.all([
      writeJson(paths.tunnelApprovedAudit, stagedApprovalPayload),
      removeFile(paths.tunnelPending)
    ]);
  }

  const approvalRef = await writeApprovalRef({
    tracking_id: stagedApprovalPayload.tracking_id,
    action: stagedApprovalPayload.action,
    command_class: stagedApprovalPayload.command_class,
    scope,
    approved_by: meta.approved_by || "codex",
    approved_at: approvedAt,
    targets: scope === "executive"
      ? {
          executive_signed: paths.executiveSigned,
          executive_decision: paths.executiveDecision,
          approved_action: paths.actionApproved
        }
      : {
          tunnel_audit: paths.tunnelApprovedAudit
        },
    detail: {
      note: meta.note || ""
    }
  });

  const nextPayload = withApprovalTracking({
    ...stagedApprovalPayload,
    status: remainingScopes.length ? "pending_approval" : "approved",
    control_state: remainingScopes.length ? "pending_approval" : "accepted",
    lifecycle_state: targetState,
    approval_ref: approvalRef,
    approval_refs: {
      ...(payload.approval_refs || {}),
      [scope]: approvalRef
    }
  });

  await Promise.all([
    scope === "executive"
      ? Promise.all([
          writeJson(paths.executiveSigned, nextPayload),
          writeJson(paths.executiveDecision, nextPayload),
          writeJson(paths.actionApproved, nextPayload)
        ])
      : Promise.resolve(),
    scope === "tunnel"
      ? writeJson(paths.tunnelApprovedAudit, nextPayload)
      : Promise.resolve(),
    writeJson(paths.gatewayApproval, nextPayload),
    writeJson(paths.intake, {
      ...nextPayload,
      status: nextPayload.status,
      control_state: nextPayload.control_state,
      lifecycle_state: targetState
    }),
    syncGatewayMirrors(nextPayload),
    recordCommandIntakeEvent(
      nextPayload,
      targetState,
      `approval.${scope}.approved`,
      {
        scope,
        approved_by: meta.approved_by || "codex"
      }
    )
  ]);

  if (!remainingScopes.length) {
    return dispatchCommand(id, {
      approved_by: meta.approved_by || "codex",
      approval_scope: scope
    });
  }

  return {
    ok: true,
    receipt: nextPayload
  };
}

export async function approveExecutiveCommand(id, meta = {}) {
  return approveScope(id, "executive", meta);
}

export async function approveTunnelCommand(id, meta = {}) {
  return approveScope(id, "tunnel", meta);
}

async function listJsonFiles(dirPath, limit = 50) {
  try {
    const entries = (await fs.readdir(dirPath)).sort();
    const items = await Promise.all(
      entries
        .slice(-limit)
        .map((name) => readJson(path.join(dirPath, name)))
    );
    return items.filter(Boolean).reverse();
  } catch {
    return [];
  }
}

export async function getApprovalQueues() {
  const [executive, tunnel] = await Promise.all([
    listJsonFiles(path.join(root, "01_EXECUTIVE", "approvals", "pending"), 25),
    listJsonFiles(path.join(root, "07_INTELLIGENCE_TUNNEL", "approvals"), 25)
  ]);

  return {
    timestamp: new Date().toISOString(),
    executive,
    tunnel
  };
}

export async function getOperationsQueues() {
  const [intake, active, executed, rejected, rolled_back, completed, failed] = await Promise.all([
    listJsonFiles(path.join(root, "03_OPERATIONS_ROOM", "jobs", "intake"), 25),
    listJsonFiles(path.join(root, "03_OPERATIONS_ROOM", "jobs", "active"), 25),
    listJsonFiles(path.join(root, "03_OPERATIONS_ROOM", "jobs", "executed"), 25),
    listJsonFiles(path.join(root, "03_OPERATIONS_ROOM", "jobs", "rejected"), 25),
    listJsonFiles(path.join(root, "03_OPERATIONS_ROOM", "jobs", "rolled_back"), 25),
    listJsonFiles(path.join(root, "03_OPERATIONS_ROOM", "jobs", "completed"), 25),
    listJsonFiles(path.join(root, "03_OPERATIONS_ROOM", "jobs", "failed"), 25)
  ]);

  return {
    timestamp: new Date().toISOString(),
    intake,
    active,
    executed,
    rejected,
    rolled_back,
    completed,
    failed
  };
}
