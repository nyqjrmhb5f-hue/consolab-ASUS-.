#!/usr/bin/env node
// Drift detector for 06_INTERFACES/schemas/*.
//
// Loads the locked schemas + zero-dep validator from
// 06_INTERFACES/schemas/index.js and asserts:
//   1. The schema bundle is a frozen, well-formed object.
//   2. The validator accepts a known-good AuthorityRequest.
//   3. The validator accepts a known-good AuthorityDecision.
//   4. The validator REJECTS a packet that violates additionalProperties:false
//      with a stable error code (`additional_property_disallowed`). This
//      catches the case where someone weakens the lock without updating the
//      tests.
//
// If any assertion fails, exits non-zero so CI flags the drift before it
// reaches main.

import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");
const schemasIndex = path.join(repoRoot, "06_INTERFACES", "schemas", "index.js");

const mod = await import(schemasIndex);
const {
  AUTHORITY_DECISION_SCHEMA,
  validateAuthorityRequest,
  validateAuthorityDecision,
  SCHEMA_VERSION
} = mod;

function assert(cond, msg) {
  if (!cond) {
    console.error(`schema-lint FAIL: ${msg}`);
    process.exit(1);
  }
}

// 1. Bundle shape
assert(typeof AUTHORITY_DECISION_SCHEMA === "object" && AUTHORITY_DECISION_SCHEMA !== null, "AUTHORITY_DECISION_SCHEMA must be a non-null object");
assert(typeof SCHEMA_VERSION === "string" && SCHEMA_VERSION.length > 0, "SCHEMA_VERSION must be a non-empty string");
assert(SCHEMA_VERSION === "authority-decision.v1", `SCHEMA_VERSION should be 'authority-decision.v1' (got ${JSON.stringify(SCHEMA_VERSION)})`);
assert(Object.isFrozen(AUTHORITY_DECISION_SCHEMA), "AUTHORITY_DECISION_SCHEMA must be frozen");

// 2. Known-good AuthorityRequest validates
const goodRequest = {
  schema_version: "authority-decision.v1",
  tracking_id: "TRK-CI-001",
  action: "ci.test",
  scope: ["executive", "tunnel"],
  standard: "tunnel",
  policy: "command-policy.v1",
  payload: { foo: "bar" },
  requested_by: "ci",
  ts: "2026-04-03T12:00:00.000Z"
};
const reqResult = validateAuthorityRequest(goodRequest);
assert(reqResult.ok === true, `known-good AuthorityRequest must validate (errors=${JSON.stringify(reqResult.errors)})`);

// 3. Known-good AuthorityDecision validates
const goodDecision = {
  schema_version: "authority-decision.v1",
  tracking_id: "TRK-CI-001",
  decision: "APPROVED",
  scope: ["executive", "tunnel"],
  standard: "tunnel",
  policy: "command-policy.v1",
  payloadHash: `sha256:${"a".repeat(64)}`,
  evidenceStamp: {
    event_id: "20260403T120000000Z-deadbeefdeadbeef",
    tx_hash: "a".repeat(64),
    recorded_at: "2026-04-03T12:00:00.000Z",
    ref_path: "04_EVIDENCE_ROOM/audit_trails/events.jsonl"
  },
  signature: "stub",
  key_id: "ci-key",
  algorithm: "ed25519",
  ts: "2026-04-03T12:00:00.000Z"
};
const decResult = validateAuthorityDecision(goodDecision);
assert(decResult.ok === true, `known-good AuthorityDecision must validate (errors=${JSON.stringify(decResult.errors)})`);

// 4. additionalProperties: false is enforced + emits stable error code
const badRequest = { ...goodRequest, surprise_field: "boom" };
const badResult = validateAuthorityRequest(badRequest);
assert(badResult.ok === false, "additionalProperties:false must reject unknown fields");
assert(
  Array.isArray(badResult.errors) && badResult.errors.some((e) => e.code === "additional_property_disallowed"),
  `at least one error must carry code='additional_property_disallowed' (got ${JSON.stringify(badResult.errors)})`
);

console.log("schema-lint OK — locked schemas validate cleanly.");
