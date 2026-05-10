import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { consoleLabPath } from "./consoleLabPaths.js";
import { stableStringify } from "./evidenceAttestation.js";
import { SCHEMA_VERSION } from "../../../06_INTERFACES/schemas/index.js";

export const EXPECTED_SCHEMA_ID = "AuthorityRequest";

/**
 * Stable, machine-routable error class for a single schema-validator error.
 * Falls back to `unknown` if the validator did not attach a `code` (which
 * shouldn't happen for the locked schema, but we guard against drift).
 */
export function classifyValidationError(err) {
  if (err && typeof err === "object" && typeof err.code === "string" && err.code.length > 0) {
    return err.code;
  }
  return "unknown";
}

export function summarizeErrorClasses(errs) {
  const counts = {};
  if (!Array.isArray(errs)) return counts;
  for (const e of errs) {
    const cls = classifyValidationError(e);
    counts[cls] = (counts[cls] || 0) + 1;
  }
  return counts;
}

const evidenceRoomRoot = consoleLabPath("04_EVIDENCE_ROOM");

const AUDIT_TRAILS_REL = "04_EVIDENCE_ROOM/audit_trails/events.jsonl";
const MALFORMED_REQUESTS_REL = "04_EVIDENCE_ROOM/malformed_requests/events.jsonl";

async function appendJsonl(filePath, payload) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.appendFile(filePath, `${JSON.stringify(payload)}\n`, "utf8");
}

function makeHash(content) {
  return crypto.createHash("sha256").update(content).digest("hex");
}

function deriveEventId(timestamp, txHash) {
  const ts = String(timestamp).replace(/[^0-9TZ]/g, "");
  return `${ts}-${txHash.slice(0, 16)}`;
}

/**
 * Compute the canonical request hash that goes onto the malformed_request
 * evidence row and into the AuthorityDecision.payloadHash field. Hashed over
 * a stable-stringified copy of the parsed inbound object so key permutation
 * cannot be used to forge a different hash.
 */
export function computeRequestHash(rawRequest) {
  const canonical = stableStringify(rawRequest ?? null);
  return makeHash(canonical);
}

function summarizeRequestSafely(rawRequest) {
  // Pull only the metadata that's safe to surface on the malformed row.
  // Never echo the full payload — we don't trust it yet.
  if (!rawRequest || typeof rawRequest !== "object") {
    return { tracking_id_hint: null, action_hint: null, schema_version_hint: null };
  }
  const tracking_id_hint = typeof rawRequest.tracking_id === "string" ? rawRequest.tracking_id.slice(0, 128) : null;
  const action_hint = typeof rawRequest.action === "string" ? rawRequest.action.slice(0, 128) : null;
  const schema_version_hint = typeof rawRequest.schema_version === "string" ? rawRequest.schema_version.slice(0, 64) : null;
  return { tracking_id_hint, action_hint, schema_version_hint };
}

/**
 * Land an `authority.malformed_request` evidence row in:
 *   - 04_EVIDENCE_ROOM/audit_trails/events.jsonl     (minimal, audit-shape row)
 *   - 04_EVIDENCE_ROOM/malformed_requests/events.jsonl (rich, dedicated row)
 *
 * Returns an evidenceStamp shaped like the one writeEvidence returns, so the
 * AuthorityDecision packet shape stays uniform.
 */
export async function writeMalformedRequestEvidence({
  rawRequest,
  schemaErrors,
  sourceSurface = "unknown",
  sourceIp = null,
  correlationId = null,
  tunnelSessionId = null,
  ts,
  appendJsonl: appendJsonlOverride
}) {
  const append = appendJsonlOverride || appendJsonl;
  const timestamp = ts || new Date().toISOString();
  const requestHash = computeRequestHash(rawRequest);
  const txHash = requestHash; // request_hash *is* the tx_hash for malformed rows
  const eventId = deriveEventId(timestamp, txHash);
  const { tracking_id_hint, action_hint, schema_version_hint } = summarizeRequestSafely(rawRequest);
  const auditRow = {
    event_id: eventId,
    tx_hash: txHash,
    seal_id: null,
    component: "consolelab.authority",
    action: "authority.malformed_request",
    result: "rejected",
    recorded_at: timestamp
  };
  const errorList = Array.isArray(schemaErrors) ? schemaErrors : [];
  const errorClassCounts = summarizeErrorClasses(errorList);
  const errorClasses = Object.keys(errorClassCounts).sort();
  const richRow = {
    event_id: eventId,
    tx_hash: txHash,
    request_hash: requestHash,
    hash_algorithm: "sha256",
    hash_scope: "canonical_stable_json",
    component: "consolelab.authority",
    action: "authority.malformed_request",
    result: "rejected",
    reason_code: "MALFORMED_REQUEST",
    expected_schema_id: EXPECTED_SCHEMA_ID,
    schema_version: SCHEMA_VERSION,
    error_classes: errorClasses,
    error_class_counts: errorClassCounts,
    source_surface: sourceSurface,
    source_ip: sourceIp,
    correlation_id: correlationId,
    tunnel_session_id: tunnelSessionId,
    tracking_id_hint,
    action_hint,
    schema_version_hint,
    parse_error_count: errorList.length,
    parse_errors: errorList.slice(0, 16).map((e) => ({
      path: typeof e?.path === "string" ? e.path.slice(0, 256) : null,
      message: typeof e?.message === "string" ? e.message.slice(0, 256) : null,
      error_class: classifyValidationError(e)
    })),
    recorded_at: timestamp
  };

  await Promise.all([
    append(path.join(evidenceRoomRoot, "audit_trails", "events.jsonl"), auditRow),
    append(path.join(evidenceRoomRoot, "malformed_requests", "events.jsonl"), richRow)
  ]);

  return {
    event_id: eventId,
    tx_hash: txHash,
    request_hash: requestHash,
    recorded_at: timestamp,
    ref_path: MALFORMED_REQUESTS_REL,
    audit_trails_ref_path: AUDIT_TRAILS_REL
  };
}

/**
 * Land one summary row when the rate limiter just rejected a malformed
 * request. Goes to the same two artifacts as the normal malformed row, but
 * never to the rich `parse_errors` block (we don't want noise).
 */
export async function writeMalformedRequestRateLimitSummary({
  rateLimitKey,
  hitCount,
  windowStartedAt,
  ts,
  appendJsonl: appendJsonlOverride
}) {
  const append = appendJsonlOverride || appendJsonl;
  const timestamp = ts || new Date().toISOString();
  const summaryHash = makeHash(`${rateLimitKey}|${windowStartedAt}|${hitCount}`);
  const eventId = deriveEventId(timestamp, summaryHash);

  const auditRow = {
    event_id: eventId,
    tx_hash: summaryHash,
    seal_id: null,
    component: "consolelab.authority",
    action: "authority.malformed_request_rate_limit_hit",
    result: "rejected",
    recorded_at: timestamp
  };
  const richRow = {
    event_id: eventId,
    tx_hash: summaryHash,
    component: "consolelab.authority",
    action: "authority.malformed_request_rate_limit_hit",
    result: "rejected",
    reason_code: "MALFORMED_REQUEST_RATE_LIMITED",
    expected_schema_id: EXPECTED_SCHEMA_ID,
    schema_version: SCHEMA_VERSION,
    rate_limit_key: rateLimitKey,
    hit_count: hitCount,
    window_started_at: windowStartedAt,
    recorded_at: timestamp
  };

  await Promise.all([
    append(path.join(evidenceRoomRoot, "audit_trails", "events.jsonl"), auditRow),
    append(path.join(evidenceRoomRoot, "malformed_requests", "events.jsonl"), richRow)
  ]);

  return {
    event_id: eventId,
    tx_hash: summaryHash,
    recorded_at: timestamp,
    ref_path: MALFORMED_REQUESTS_REL,
    audit_trails_ref_path: AUDIT_TRAILS_REL
  };
}
