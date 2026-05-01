import { Router } from "express";
import { getCommandReceipt, getGatewayFeed, getGatewayStatus, stageCommand } from "../services/commandIntake.js";
import { getCommandPolicyMap } from "../services/commandPolicy.js";
import {
  getCommandExecutionFeed,
  getCommandHistory,
  getCommandStatus,
  rebuildCommandStateIndex,
  verifyCommandStateIndex
} from "../services/commandStateProjector.js";
import {
  approveExecutiveCommand,
  approveTunnelCommand,
  attestCommand,
  dispatchCommand,
  failCommand,
  getApprovalQueues,
  getOperationsQueues,
  getWorkflowReceipt,
  sealCommand
} from "../services/commandWorkflow.js";
import { closeTunnelSession } from "../services/tunnelFabric.js";
import { getAttestationConfig } from "../services/evidenceAttestation.js";
import { writeEvidenceRef, writeSignatureRef } from "../services/commandProofRefs.js";
import { writeEvidence } from "../services/evidenceWriter.js";

export const commandRouter = Router();

function getSourceIp(req) {
  return req.header("x-forwarded-for")?.split(",")[0]?.trim() || req.socket.remoteAddress || "unknown";
}

function getSealId(req) {
  return req.header("cf-ray") || "unknown";
}

function getIdempotencyKey(req) {
  return req.header("x-idempotency-key") || req.body?.idempotency_key || "";
}

function getCorrelationId(req) {
  return req.header("x-correlation-id") || req.body?.correlation_id || "";
}

async function finalizeExecutionResult(req, result, meta = {}) {
  if (!result?.ok) {
    return result;
  }

  if (result.receipt?.lifecycle_state === "rolled_back") {
    await writeEvidence({
      component: meta.component || "ops_matrix",
      action: "command.rollback",
      result: "ok",
      source_ip: getSourceIp(req),
      seal_id: getSealId(req),
      details: {
        tracking_id: result.receipt.tracking_id,
        command_action: result.receipt.action,
        command_class: result.receipt.command_class,
        rollback_reason: result.error || result.receipt.rollback_state?.reason || null,
        rollback_state: result.receipt.rollback_state || null
      }
    });

    return result;
  }

  if (result.receipt?.lifecycle_state !== "executed") {
    return result;
  }

  const evidence = await writeEvidence({
    component: meta.component || "ops_matrix",
    action: meta.action || "command.execute",
    result: "ok",
    source_ip: getSourceIp(req),
    seal_id: getSealId(req),
    details: {
      tracking_id: result.receipt.tracking_id,
      command_action: result.receipt.action,
      command_class: result.receipt.command_class,
      requested_by: result.receipt.requested_by,
      approval_scope: meta.approval_scope || null,
      dispatched_by: result.receipt.dispatch_state?.dispatched_by || meta.dispatched_by || null
    }
  });

  const evidenceRef = await writeEvidenceRef({
    tracking_id: result.receipt.tracking_id,
    action: result.receipt.action,
    command_class: result.receipt.command_class,
    evidence,
    targets: {
      executed_job: `03_OPERATIONS_ROOM/jobs/executed/${result.receipt.tracking_id}.json`,
      completed_job: `03_OPERATIONS_ROOM/jobs/completed/${result.receipt.tracking_id}.json`,
      executed_action: `03_OPERATIONS_ROOM/actions/executed/${result.receipt.tracking_id}.json`,
      gateway_session: `10_SHARED_BACKBONE/agent_gateway/sessions/${result.receipt.tracking_id}.json`
    },
    detail: {
      approval_scope: meta.approval_scope || null,
      dispatched_by: result.receipt.dispatch_state?.dispatched_by || meta.dispatched_by || null
    }
  });

  const signatureRef = evidence.room_ref?.attestation_state === "signed"
    ? await writeSignatureRef({
        tracking_id: result.receipt.tracking_id,
        action: result.receipt.action,
        command_class: result.receipt.command_class,
        evidence,
        targets: {
          attestation_log: evidence.room_ref?.artifact_paths?.attestations || null,
          signer_events: evidence.room_ref?.artifact_paths?.signer_events || null
        },
        detail: {
          approval_scope: meta.approval_scope || null
        }
      })
    : null;
  const attestationConfig = await getAttestationConfig();
  const attestationVerified = Boolean(signatureRef && evidence.room_ref?.verification_state === "verified");

  if (attestationConfig.is_required && !attestationVerified) {
    return failCommand(result.receipt.tracking_id, {
      error: "attestation_required_failed",
      failed_by: meta.sealed_by || "gateway_api",
      evidence_state: "attestation_failed",
      evidence_ref: evidenceRef,
      signature_ref: signatureRef,
      attestation_state: evidence.room_ref?.attestation_state || null,
      detail: {
        evidence_component: meta.component || "ops_matrix",
        evidence_action: meta.action || "command.execute",
        verification_state: evidence.room_ref?.verification_state || null,
        signing_key_id: evidence.room_ref?.signing_key_id || null
      }
    });
  }

  const sealed = await sealCommand(result.receipt.tracking_id, {
    sealed_by: meta.sealed_by || "gateway_api",
    evidence_component: meta.component || "ops_matrix",
    evidence_action: meta.action || "command.execute",
    evidence_ref: evidenceRef,
    signature_ref: signatureRef,
    attestation_state: evidence.room_ref?.attestation_state || null
  });

  if (!sealed.ok) {
    return sealed;
  }

  if (attestationVerified) {
    const attested = await attestCommand(result.receipt.tracking_id, {
      signature_ref: signatureRef,
      attestation_state: evidence.room_ref?.attestation_state || "signed",
      signing_key_id: evidence.room_ref?.signing_key_id || null,
      verified: true
    });

    return attested.ok
      ? {
          ...result,
          receipt: attested.receipt
        }
      : {
          ok: false,
        error: attested.error,
        receipt: sealed.receipt
      };
  }

  return {
    ...result,
    receipt: sealed.receipt
  };
}

commandRouter.get("/gateway-api/status", async (_req, res) => {
  res.json(await getGatewayStatus());
});

commandRouter.get("/gateway-api/policies/command-classes", async (_req, res) => {
  res.json({
    timestamp: new Date().toISOString(),
    service: "GATEWAY-API",
    policy_map: getCommandPolicyMap()
  });
});

commandRouter.get("/gateway-api/commands", async (req, res) => {
  res.json(await getGatewayFeed(req.query.limit || 20));
});

commandRouter.get("/gateway-api/commands/feed/intake", async (req, res) => {
  res.json(await getGatewayFeed(req.query.limit || 20));
});

commandRouter.get("/gateway-api/commands/feed/execution", async (req, res) => {
  res.json(await getCommandExecutionFeed(req.query.limit || 20));
});

commandRouter.get("/gateway-api/commands/projector/verify", async (_req, res) => {
  res.json(await verifyCommandStateIndex());
});

commandRouter.post("/gateway-api/commands/projector/rebuild", async (_req, res) => {
  res.json(await rebuildCommandStateIndex({ persist: true }));
});

commandRouter.get("/agent-gateway/status", async (_req, res) => {
  const payload = await getGatewayStatus();
  res.json({
    ...payload,
    service: "AGENT-GATEWAY"
  });
});

commandRouter.get("/executive/approvals", async (_req, res) => {
  res.json(await getApprovalQueues());
});

commandRouter.get("/operations/queues", async (_req, res) => {
  res.json(await getOperationsQueues());
});

commandRouter.post("/gateway-api/commands", async (req, res) => {
  const staged = await stageCommand(req.body || {}, {
    idempotency_key: getIdempotencyKey(req),
    correlation_id: getCorrelationId(req)
  });

  if (!staged.ok) {
    await writeEvidence({
      component: "gateway_api",
      action: "command.reject",
      result: "deny",
      source_ip: getSourceIp(req),
      seal_id: getSealId(req),
      details: {
        error: staged.error,
        control_state: staged.control_state || "rejected",
        existing_tracking_id: staged.existing_tracking_id || null
      }
    }).catch(() => {});

    return res.status(staged.error === "idempotency_conflict" ? 409 : 400).json({
      ok: false,
      error: staged.error,
      control_state: staged.control_state || "rejected",
      existing_tracking_id: staged.existing_tracking_id || null
    });
  }

  if (staged.deduped) {
    return res.status(200).json({ ok: true, ...staged });
  }

  if (staged.receipt.status === "accepted") {
    const dispatched = await dispatchCommand(staged.receipt.tracking_id, {
      dispatched_by: "gateway_api"
    });

    if (dispatched.ok) {
      const finalized = await finalizeExecutionResult(req, dispatched, {
        component: "ops_matrix",
        action: "command.execute",
        sealed_by: "gateway_api",
        dispatched_by: "gateway_api"
      });

      return res.status(finalized.ok ? 202 : 503).json({ ok: finalized.ok, ...finalized, staged: staged.receipt });
    }
  }

  await writeEvidence({
    component: "gateway_api",
    action: "command.stage",
    result: staged.receipt.status === "accepted" ? "ok" : "watch",
    source_ip: getSourceIp(req),
    seal_id: getSealId(req),
    details: staged.receipt
  }).catch(() => {});

  return res.status(202).json({ ok: true, ...staged });
});

commandRouter.get("/gateway-api/commands/:trackingId/status", async (req, res) => {
  const payload = await getCommandStatus(req.params.trackingId);
  if (!payload) {
    return res.status(404).json({ ok: false, error: "not_found" });
  }

  return res.json({ ok: true, status: payload });
});

commandRouter.get("/gateway-api/commands/:trackingId/history", async (req, res) => {
  const payload = await getCommandHistory(req.params.trackingId);
  if (!payload) {
    return res.status(404).json({ ok: false, error: "not_found" });
  }

  return res.json({ ok: true, history: payload });
});

commandRouter.get("/gateway-api/commands/:trackingId", async (req, res) => {
  const payload = (await getWorkflowReceipt(req.params.trackingId)) || (await getCommandReceipt(req.params.trackingId));
  if (!payload) {
    return res.status(404).json({ ok: false, error: "not_found" });
  }

  return res.json({ ok: true, receipt: payload });
});

commandRouter.post("/executive/approvals/:trackingId/sign", async (req, res) => {
  const result = await approveExecutiveCommand(req.params.trackingId, {
    approved_by: req.body?.approved_by || "codex",
    note: req.body?.note || ""
  });

  if (!result.ok) {
    return res.status(result.error === "not_found" ? 404 : 409).json({ ok: false, error: result.error, approvals_pending: result.approvals_pending });
  }

  await writeEvidence({
    component: "apex_control",
    action: "approval.sign",
    result: "ok",
    source_ip: getSourceIp(req),
    seal_id: getSealId(req),
    details: {
      tracking_id: req.params.trackingId,
      scope: "executive",
      approved_by: req.body?.approved_by || "codex"
    }
  }).catch(() => {});

  const finalized = await finalizeExecutionResult(req, result, {
    component: "ops_matrix",
    action: "command.execute",
    approval_scope: "executive",
    sealed_by: "executive_approval"
  });

  return res.status(finalized.ok ? 200 : 503).json({ ok: finalized.ok, ...finalized });
});

commandRouter.post("/intelligence-tunnel/approvals/:trackingId/sign", async (req, res) => {
  const result = await approveTunnelCommand(req.params.trackingId, {
    approved_by: req.body?.approved_by || "codex",
    note: req.body?.note || ""
  });

  if (!result.ok) {
    return res.status(result.error === "not_found" ? 404 : 409).json({ ok: false, error: result.error, approvals_pending: result.approvals_pending });
  }

  await writeEvidence({
    component: "synapse_bridge",
    action: "approval.sign",
    result: "ok",
    source_ip: getSourceIp(req),
    seal_id: getSealId(req),
    details: {
      tracking_id: req.params.trackingId,
      scope: "tunnel",
      approved_by: req.body?.approved_by || "codex"
    }
  }).catch(() => {});

  const finalized = await finalizeExecutionResult(req, result, {
    component: "ops_matrix",
    action: "command.execute",
    approval_scope: "tunnel",
    sealed_by: "tunnel_approval"
  });

  return res.status(finalized.ok ? 200 : 503).json({ ok: finalized.ok, ...finalized });
});

commandRouter.post("/operations/dispatch/:trackingId", async (req, res) => {
  const result = await dispatchCommand(req.params.trackingId, {
    dispatched_by: req.body?.dispatched_by || "codex"
  });

  if (!result.ok) {
    return res.status(result.error === "not_found" ? 404 : 409).json({ ok: false, error: result.error, approvals_pending: result.approvals_pending });
  }

  const finalized = await finalizeExecutionResult(req, result, {
    component: "ops_matrix",
    action: "command.execute",
    sealed_by: "operations_dispatch",
    dispatched_by: req.body?.dispatched_by || "codex"
  });

  return res.status(finalized.ok ? 200 : 503).json({ ok: finalized.ok, ...finalized });
});

commandRouter.post("/intelligence-tunnel/tunnels/:trackingId/close", async (req, res) => {
  const result = await closeTunnelSession(req.params.trackingId, {
    closed_by: req.body?.closed_by || "codex",
    reason: req.body?.reason || "operator_closed"
  });

  if (!result.ok) {
    return res.status(result.error === "not_found" ? 404 : 409).json({ ok: false, error: result.error });
  }

  await writeEvidence({
    component: "synapse_bridge",
    action: "tunnel.close",
    result: "ok",
    source_ip: getSourceIp(req),
    seal_id: getSealId(req),
    details: result.receipt
  }).catch(() => {});

  return res.json({ ok: true, ...result });
});

commandRouter.post("/command", async (req, res) => {
  const staged = await stageCommand(req.body || {}, {
    idempotency_key: getIdempotencyKey(req),
    correlation_id: getCorrelationId(req)
  });
  if (!staged.ok) {
    return res.status(staged.error === "idempotency_conflict" ? 409 : 400).json({
      ok: false,
      error: staged.error,
      control_state: staged.control_state || "rejected",
      existing_tracking_id: staged.existing_tracking_id || null
    });
  }

  if (staged.deduped) {
    return res.status(200).json({ ok: true, ...staged });
  }

  if (staged.receipt.status === "accepted") {
    const dispatched = await dispatchCommand(staged.receipt.tracking_id, {
      dispatched_by: "legacy_command_route"
    });
    if (dispatched.ok) {
      const finalized = await finalizeExecutionResult(req, dispatched, {
        component: "ops_matrix",
        action: "command.execute",
        sealed_by: "legacy_command_route",
        dispatched_by: "legacy_command_route"
      });
      return res.status(202).json({ ok: true, ...finalized, staged: staged.receipt });
    }
  }

  return res.status(202).json({ ok: true, ...staged });
});
