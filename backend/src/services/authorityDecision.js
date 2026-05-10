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
import {
  productionRateLimiter,
  buildRateLimitKey
} from "./malformedRequestRateLimit.js";
import {
  writeMalformedRequestEvidence as defaultWriteMalformedEvidence,
  writeMalformedRequestRateLimitSummary as defaultWriteMalformedRateLimitSummary,
  computeRequestHash
} from "./malformedRequestEvidence.js";

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
  const sourceSurface = deps.sourceSurface || "unknown";
  const correlationId =
    typeof request?.correlation_id === "string" && request.correlation_id.length > 0
      ? request.correlation_id
      : deps.correlationId || null;
  const tunnelSessionId = deps.tunnelSessionId || null;
  const writeMalformedEvidence = deps.writeMalformedRequestEvidence || defaultWriteMalformedEvidence;
  const writeMalformedRateLimitSummary =
    deps.writeMalformedRequestRateLimitSummary || defaultWriteMalformedRateLimitSummary;
  const rateLimiter = deps.malformedRateLimiter || productionRateLimiter;
  const rateLimitKeyOverride = deps.rateLimitKey;

  const requestValidation = validateAuthorityRequest(request);
  if (!requestValidation.ok) {
    return await handleMalformedRequest({
      request,
      schemaErrors: requestValidation.errors,
      sourceSurface,
      sourceIp,
      correlationId,
      tunnelSessionId,
      ts: now(),
      writeMalformedEvidence,
      writeMalformedRateLimitSummary,
      rateLimiter,
      rateLimitKey: rateLimitKeyOverride || buildRateLimitKey({ sourceIp, correlationId, tunnelSessionId }),
      loadKeyPair,
      sign
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

/**
 * Schema-invalid inbound packets used to be returned as an unbound NEEDS_INFO
 * with no evidence. Per the policy lock: every byte hitting ConsoleLab leaves
 * a trail. Schema-invalid packets are now REJECTED with reasonCode=
 * MALFORMED_REQUEST and an immutable evidence row. To keep an attacker from
 * spamming the vault, the malformed channel is rate-limited (10/60s per
 * (source_ip, correlation_id || tunnel_session_id || "anon") key); over-limit
 * traffic still gets a REJECTED reply with reasonCode=
 * MALFORMED_REQUEST_RATE_LIMITED, plus one summary row per minute per key.
 */
async function handleMalformedRequest({
  request,
  schemaErrors,
  sourceSurface,
  sourceIp,
  correlationId,
  tunnelSessionId,
  ts,
  writeMalformedEvidence,
  writeMalformedRateLimitSummary,
  rateLimiter,
  rateLimitKey,
  loadKeyPair,
  sign
}) {
  const trackingId = typeof request?.tracking_id === "string" ? request.tracking_id : "unknown";
  const requestHashHex = computeRequestHash(request);
  const payloadHashStr = `sha256:${requestHashHex}`;
  const limit = rateLimiter.consume(rateLimitKey);

  let evidenceStamp;
  let evidenceWritten = false;
  let reasonCode;
  let reason;

  if (!limit.allowed) {
    reasonCode = "MALFORMED_REQUEST_RATE_LIMITED";
    reason = `malformed_request_rate_limited:hit_count=${limit.hit_count}:window_started_at=${limit.window_started_at}`;
    if (limit.should_emit_summary) {
      const summaryStamp = await writeMalformedRateLimitSummary({
        rateLimitKey,
        hitCount: limit.hit_count,
        windowStartedAt: limit.window_started_at,
        ts
      });
      evidenceStamp = {
        event_id: summaryStamp.event_id,
        tx_hash: summaryStamp.tx_hash,
        recorded_at: summaryStamp.recorded_at,
        ref_path: summaryStamp.ref_path
      };
      evidenceWritten = true;
    }
  } else {
    reasonCode = "MALFORMED_REQUEST";
    const firstErr = schemaErrors?.[0];
    reason = `schema_invalid:${firstErr?.path || "?"}:${firstErr?.message || "?"}`;
    const stamp = await writeMalformedEvidence({
      rawRequest: request,
      schemaErrors,
      sourceSurface,
      sourceIp,
      correlationId,
      tunnelSessionId,
      ts
    });
    evidenceStamp = {
      event_id: stamp.event_id,
      tx_hash: stamp.tx_hash,
      recorded_at: stamp.recorded_at,
      ref_path: stamp.ref_path
    };
    evidenceWritten = true;
  }

  // If we suppressed the summary row this minute, the rejection is still
  // returned (the caller still gets a deterministic answer) but with no
  // matching evidence stamp. Synthesize a placeholder pointing at the
  // dedicated malformed_requests artifact so the schema validator stays
  // happy and downstream callers can still see WHERE rate-limited evidence
  // would have landed.
  if (!evidenceStamp) {
    evidenceStamp = {
      event_id: `rate_limited-${requestHashHex.slice(0, 16)}`,
      tx_hash: requestHashHex,
      recorded_at: ts,
      ref_path: "04_EVIDENCE_ROOM/malformed_requests/events.jsonl"
    };
  }

  // Sign the request hash so the rejection is non-repudiable: the runtime
  // can prove ConsoleLab saw exactly these bytes and refused them.
  let signature = "";
  let keyId = "unbound";
  let algorithm = "unknown";
  try {
    const keyPair = await loadKeyPair();
    signature = sign(payloadHashStr, keyPair.privateKey, keyPair.keyType);
    keyId = keyPair.keyId;
    algorithm = keyPair.keyType || "unknown";
  } catch {
    // Fallback: if the key store is unavailable, still return a deterministic
    // packet. The schema requires signature.minLength=1; emit a sentinel.
    signature = "unsigned";
  }

  const packet = {
    schema_version: SCHEMA_VERSION,
    tracking_id: trackingId,
    decision: "REJECTED",
    scope: [],
    standard: "unknown",
    policy: "unknown",
    payloadHash: payloadHashStr,
    evidenceStamp,
    signature,
    key_id: keyId,
    algorithm,
    ts,
    reason,
    reasonCode
  };
  if (typeof request?.correlation_id === "string" && request.correlation_id.length > 0) {
    packet.correlation_id = request.correlation_id;
  }

  const decisionValidation = validateAuthorityDecision(packet);
  if (!decisionValidation.ok) {
    throw new Error(
      `decideAuthority emitted a malformed-request packet that fails its own schema: ${JSON.stringify(decisionValidation.errors)}`
    );
  }

  return {
    ...packet,
    _meta: {
      evidence_written: evidenceWritten,
      evidence_recorded_at: evidenceStamp.recorded_at,
      rate_limited: !limit.allowed,
      rate_limit_hit_count: limit.hit_count,
      rate_limit_window_started_at: limit.window_started_at
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
