import path from "node:path";
import {
  AUTHORITY_DECISION_SCHEMA,
  SCHEMA_VERSION,
  validateAuthorityRequest,
  validateAuthorityDecision
} from "../../../06_INTERFACES/schemas/index.js";
import { payloadHash as defaultPayloadHash } from "../lib/stableJson.js";
import { loadActiveKeyPair, signPayloadHash, verifyPayloadHash } from "./keyStore.js";
import { getCommandPolicyMap } from "./commandPolicy.js";
import { writeEvidence as defaultWriteEvidence } from "./evidenceWriter.js";
import { consoleLabRoot } from "./consoleLabPaths.js";

/**
 * decideAuthority({request, deps?}) → { decision, ...AuthorityDecision packet }
 *
 * ConsoleLab is the only authority. This is the canonical decision function:
 * it validates an inbound AuthorityRequest packet, refuses any request that
 * does not declare scope+standard+policy, applies the policy map to derive
 * APPROVED / REJECTED / NEEDS_INFO, writes an immutable evidence record into
 * 04_EVIDENCE_ROOM (regardless of outcome — refusals are evidenced too), and
 * returns the locked AuthorityDecision packet signed over payloadHash with
 * the active ConsoleLab key.
 *
 * `deps` exists for tests; production callers can omit it.
 */
export async function decideAuthority({ request, deps = {} }) {
  const writeEvidence = deps.writeEvidence || defaultWriteEvidence;
  const computePayloadHash = deps.payloadHash || defaultPayloadHash;
  const loadKeyPair = deps.loadActiveKeyPair || loadActiveKeyPair;
  const sign = deps.signPayloadHash || signPayloadHash;
  const policyLookup = deps.getCommandPolicyMap || getCommandPolicyMap;
  const now = deps.now || (() => new Date().toISOString());
  const sourceIp = deps.sourceIp || null;
  const sealId = deps.sealId || null;

  const requestValidation = validateAuthorityRequest(request);
  if (!requestValidation.ok) {
    // Structurally malformed packets cannot be evidenced — the request is not
    // even an AuthorityRequest. The caller is responsible for surfacing this
    // synchronously to its source. We still emit a NEEDS_INFO packet, but
    // mark `evidence_written=false` so the caller knows it must not treat
    // this as a binding decision.
    return makeUnboundNeedsInfo({
      tracking_id: typeof request?.tracking_id === "string" ? request.tracking_id : "unknown",
      reason: `schema_invalid:${requestValidation.errors[0]?.path || "?"}:${requestValidation.errors[0]?.message || "?"}`,
      ts: now()
    });
  }

  const missingAxes = [];
  if (!Array.isArray(request.scope) || request.scope.length === 0) missingAxes.push("scope");
  if (!isNonEmptyString(request.standard)) missingAxes.push("standard");
  if (!isNonEmptyString(request.policy)) missingAxes.push("policy");

  const computedPayloadHash = computePayloadHash(request.payload ?? {});
  const decisionTs = now();

  if (missingAxes.length > 0) {
    return await emitDecision({
      kind: "needs_info",
      reason: `${missingAxes[0]}_missing`,
      requiredNext: { axes: missingAxes },
      request,
      computedPayloadHash,
      decisionTs,
      writeEvidence,
      loadKeyPair,
      sign,
      sourceIp,
      sealId
    });
  }

  const policyMap = policyLookup();
  const policyVersion = String(policyMap?.version || "");
  const standardClass = policyMap?.classes?.[request.standard];

  if (!standardClass) {
    return await emitDecision({
      kind: "rejected",
      reason: `unknown_standard:${request.standard}`,
      requiredNext: null,
      request,
      computedPayloadHash,
      decisionTs,
      writeEvidence,
      loadKeyPair,
      sign,
      sourceIp,
      sealId
    });
  }

  if (request.policy !== policyVersion) {
    return await emitDecision({
      kind: "rejected",
      reason: `policy_version_mismatch:expected=${policyVersion}:got=${request.policy}`,
      requiredNext: null,
      request,
      computedPayloadHash,
      decisionTs,
      writeEvidence,
      loadKeyPair,
      sign,
      sourceIp,
      sealId
    });
  }

  // The runtime must declare every approval scope the policy expects.
  const requiredScopes = Array.isArray(standardClass.approval_scopes) ? standardClass.approval_scopes : [];
  const declaredScopes = new Set(request.scope);
  const missingScopes = requiredScopes.filter((s) => !declaredScopes.has(s));
  if (missingScopes.length > 0) {
    return await emitDecision({
      kind: "needs_info",
      reason: `scope_incomplete:missing=${missingScopes.join(",")}`,
      requiredNext: { scopes: missingScopes },
      request,
      computedPayloadHash,
      decisionTs,
      writeEvidence,
      loadKeyPair,
      sign,
      sourceIp,
      sealId
    });
  }

  return await emitDecision({
    kind: "approved",
    reason: null,
    requiredNext: null,
    request,
    computedPayloadHash,
    decisionTs,
    writeEvidence,
    loadKeyPair,
    sign,
    sourceIp,
    sealId
  });
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function decisionKindToEnum(kind) {
  switch (kind) {
    case "approved": return "APPROVED";
    case "rejected": return "REJECTED";
    case "needs_info": return "NEEDS_INFO";
    default: throw new Error(`unknown decision kind: ${kind}`);
  }
}

async function emitDecision({
  kind,
  reason,
  requiredNext,
  request,
  computedPayloadHash,
  decisionTs,
  writeEvidence,
  loadKeyPair,
  sign,
  sourceIp,
  sealId
}) {
  const decision = decisionKindToEnum(kind);

  // 1. Write evidence FIRST. Every decision (incl. REJECTED / NEEDS_INFO) is
  //    bound to an immutable record before the packet is signed and returned.
  const evidence = await writeEvidence({
    component: "consolelab.authority",
    action: `authority.${kind}`,
    result: kind === "approved" ? "approved" : kind, // ok|approved|rejected|needs_info
    source_ip: sourceIp || null,
    seal_id: sealId || null,
    details: {
      schema_version: SCHEMA_VERSION,
      tracking_id: request.tracking_id,
      action: request.action,
      requested_by: request.requested_by,
      scope: request.scope,
      standard: request.standard,
      policy: request.policy,
      payload_hash: computedPayloadHash,
      decision,
      reason: reason || null,
      correlation_id: request.correlation_id || null
    }
  });

  const evidenceStamp = buildEvidenceStamp(evidence);

  // 2. Sign payloadHash with the active ConsoleLab key.
  const keyPair = await loadKeyPair();
  const signature = sign(computedPayloadHash, keyPair.privateKey, keyPair.keyType);

  const packet = {
    schema_version: SCHEMA_VERSION,
    tracking_id: request.tracking_id,
    decision,
    scope: Array.isArray(request.scope) ? request.scope : [],
    standard: isNonEmptyString(request.standard) ? request.standard : "unknown",
    policy: isNonEmptyString(request.policy) ? request.policy : "unknown",
    payloadHash: computedPayloadHash,
    evidenceStamp,
    signature,
    key_id: keyPair.keyId,
    algorithm: keyPair.keyType || "unknown",
    ts: decisionTs
  };
  if (reason) packet.reason = reason;
  if (requiredNext && (Array.isArray(requiredNext.axes) || Array.isArray(requiredNext.scopes))) {
    const next = {};
    if (Array.isArray(requiredNext.axes) && requiredNext.axes.length > 0) next.axes = requiredNext.axes;
    if (Array.isArray(requiredNext.scopes) && requiredNext.scopes.length > 0) next.scopes = requiredNext.scopes;
    if (Object.keys(next).length > 0) packet.requiredNext = next;
  }
  if (request.correlation_id) packet.correlation_id = request.correlation_id;

  // 3. Self-check: the packet we're about to return MUST satisfy the lock.
  const decisionValidation = validateAuthorityDecision(packet);
  if (!decisionValidation.ok) {
    throw new Error(
      `decideAuthority emitted a packet that fails its own schema: ${JSON.stringify(decisionValidation.errors)}`
    );
  }

  return {
    ...packet,
    _meta: {
      evidence_written: true,
      evidence_recorded_at: evidence.recorded_at
    }
  };
}

function buildEvidenceStamp(evidence) {
  const room = evidence?.room_ref || {};
  const ref =
    room.artifact_paths?.audit_trails ||
    evidence?.baseline_ref?.consolelab_path ||
    evidence?.baseline_ref?.file_path ||
    "";
  const refRel = (() => {
    if (!ref) return "";
    if (path.isAbsolute(ref) && consoleLabRoot && ref.startsWith(consoleLabRoot)) {
      return path.relative(consoleLabRoot, ref).split(path.sep).join("/");
    }
    return ref.split(path.sep).join("/");
  })();
  return {
    event_id: room.event_id,
    tx_hash: room.tx_hash,
    recorded_at: evidence.recorded_at,
    ref_path: refRel || "04_EVIDENCE_ROOM/audit_trails/events.jsonl"
  };
}

function makeUnboundNeedsInfo({ tracking_id, reason, ts }) {
  // Unbound packet: returned only when the inbound request was so malformed
  // that we cannot persist a meaningful evidence record. Marked accordingly.
  return {
    schema_version: SCHEMA_VERSION,
    tracking_id,
    decision: "NEEDS_INFO",
    scope: [],
    standard: "unknown",
    policy: "unknown",
    payloadHash: `sha256:${"0".repeat(64)}`,
    evidenceStamp: {
      event_id: "unbound",
      tx_hash: "0".repeat(64),
      recorded_at: ts,
      ref_path: "(none — request rejected before evidence write)"
    },
    signature: "",
    key_id: "unbound",
    algorithm: "unknown",
    ts,
    reason,
    _meta: {
      evidence_written: false
    }
  };
}

/** Verify a decision's signature against the embedded payloadHash. */
export async function verifyDecisionSignature(decision, deps = {}) {
  const loadKeyPair = deps.loadActiveKeyPair || loadActiveKeyPair;
  const verify = deps.verifyPayloadHash || verifyPayloadHash;
  if (!decision?.signature || !decision?.payloadHash) return false;
  const keyPair = await loadKeyPair();
  return verify(decision.payloadHash, decision.signature, keyPair.publicKey, keyPair.keyType);
}

export { AUTHORITY_DECISION_SCHEMA, SCHEMA_VERSION, validateAuthorityRequest, validateAuthorityDecision };
