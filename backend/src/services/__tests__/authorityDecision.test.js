import { test, describe } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

import {
  decideAuthority,
  verifyDecisionSignature,
  validateAuthorityRequest,
  validateAuthorityDecision,
  SCHEMA_VERSION
} from "../authorityDecision.js";
import {
  createMalformedRequestRateLimiter,
  buildRateLimitKey
} from "../malformedRequestRateLimit.js";
import {
  computeRequestHash,
  writeMalformedRequestEvidence,
  writeMalformedRequestRateLimitSummary,
  summarizeErrorClasses,
  classifyValidationError,
  EXPECTED_SCHEMA_ID
} from "../malformedRequestEvidence.js";

import { payloadHash } from "../../lib/stableJson.js";
import { signPayloadHash, verifyPayloadHash } from "../keyStore.js";

// ---------------------------------------------------------------------------
// Test scaffolding: spin up an in-memory ed25519 key pair and a stub policy
// map that mirrors 10_SHARED_BACKBONE/gateway_api/policies/command-classes.v1
// so we don't depend on disk during these tests.
// ---------------------------------------------------------------------------

function makeTestKeyPair() {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("ed25519");
  return {
    keyId: "test-key-001",
    record: { source: "in-memory" },
    privateKeyPath: "(memory)",
    publicKeyPath: "(memory)",
    privateKey,
    publicKey,
    keyType: "ed25519"
  };
}

const STUB_POLICY_MAP = Object.freeze({
  version: "command-classes.v1",
  default_class: "standard",
  classes: {
    standard: { risk: "standard", approval_scopes: [] },
    high_risk: { risk: "high", approval_scopes: ["executive"] },
    tunnel: { risk: "high", approval_scopes: ["executive", "tunnel"] }
  },
  classification_order: []
});

function makeEvidenceRecorder() {
  const calls = [];
  let counter = 0;
  return {
    calls,
    write: async (entry) => {
      counter += 1;
      const ts = entry?.details?.ts || "2026-04-03T12:00:00.000Z";
      const tx = crypto
        .createHash("sha256")
        .update(`${counter}:${JSON.stringify(entry)}`)
        .digest("hex");
      const eventId = `${ts.replace(/[^0-9TZ]/g, "")}-${tx.slice(0, 16)}`;
      calls.push(entry);
      return {
        recorded_at: ts,
        baseline_ref: {
          file_path: "/tmp/04_EVIDENCE_ROOM/actions/events.jsonl",
          consolelab_path: "04_EVIDENCE_ROOM/actions/events.jsonl",
          format: "jsonl"
        },
        room_ref: {
          event_id: eventId,
          tx_hash: tx,
          hash_algorithm: "sha256",
          attestation_state: "pending_activation",
          verification_state: "inactive",
          recorded_at: ts,
          artifact_paths: {
            audit_trails: "/tmp/04_EVIDENCE_ROOM/audit_trails/events.jsonl"
          }
        }
      };
    }
  };
}

function makeMalformedEvidenceRecorder() {
  const malformedRows = [];
  const summaryRows = [];
  let counter = 0;
  return {
    malformedRows,
    summaryRows,
    writeMalformed: async (entry) => {
      counter += 1;
      malformedRows.push(entry);
      const txHash = crypto
        .createHash("sha256")
        .update(`malformed:${counter}:${JSON.stringify(entry.rawRequest)}`)
        .digest("hex");
      return {
        event_id: `${entry.ts.replace(/[^0-9TZ]/g, "")}-${txHash.slice(0, 16)}`,
        tx_hash: txHash,
        request_hash: txHash,
        recorded_at: entry.ts,
        ref_path: "04_EVIDENCE_ROOM/malformed_requests/events.jsonl",
        audit_trails_ref_path: "04_EVIDENCE_ROOM/audit_trails/events.jsonl"
      };
    },
    writeSummary: async (entry) => {
      summaryRows.push(entry);
      const txHash = crypto
        .createHash("sha256")
        .update(`summary:${entry.rateLimitKey}:${entry.windowStartedAt}:${entry.hitCount}`)
        .digest("hex");
      return {
        event_id: `${entry.ts.replace(/[^0-9TZ]/g, "")}-${txHash.slice(0, 16)}`,
        tx_hash: txHash,
        recorded_at: entry.ts,
        ref_path: "04_EVIDENCE_ROOM/malformed_requests/events.jsonl",
        audit_trails_ref_path: "04_EVIDENCE_ROOM/audit_trails/events.jsonl"
      };
    }
  };
}

function buildDeps(overrides = {}) {
  const keyPair = overrides.keyPair || makeTestKeyPair();
  const recorder = overrides.recorder || makeEvidenceRecorder();
  const malformedRecorder = overrides.malformedRecorder || makeMalformedEvidenceRecorder();
  const rateLimiter =
    overrides.malformedRateLimiter ||
    createMalformedRequestRateLimiter({
      limit: overrides.rateLimit ?? 10,
      windowMs: overrides.rateLimitWindowMs ?? 60_000,
      now: overrides.rateLimitNow
    });
  return {
    keyPair,
    recorder,
    malformedRecorder,
    rateLimiter,
    deps: {
      writeEvidence: recorder.write,
      loadActiveKeyPair: async () => keyPair,
      signPayloadHash,
      getCommandPolicyMap: () => overrides.policyMap || STUB_POLICY_MAP,
      now: overrides.now || (() => "2026-04-03T12:00:00.000Z"),
      sourceIp: "127.0.0.1",
      sealId: "test-seal",
      sourceSurface: overrides.sourceSurface || "test",
      tunnelSessionId: overrides.tunnelSessionId || null,
      writeMalformedRequestEvidence: malformedRecorder.writeMalformed,
      writeMalformedRequestRateLimitSummary: malformedRecorder.writeSummary,
      malformedRateLimiter: rateLimiter
    }
  };
}

function buildRequest(overrides = {}) {
  return {
    schema_version: SCHEMA_VERSION,
    tracking_id: "20260403T120000000Z-test",
    action: "deploy_feature_gate",
    scope: ["executive"],
    standard: "high_risk",
    policy: "command-classes.v1",
    payload: { feature: "gate_x", region: "us-west" },
    requested_by: "vyrden-runtime-1",
    ts: "2026-04-03T12:00:00.000Z",
    ...overrides
  };
}

// ---------------------------------------------------------------------------

describe("schema lock", () => {
  test("a known-good AuthorityRequest validates", () => {
    const result = validateAuthorityRequest(buildRequest());
    assert.equal(result.ok, true, JSON.stringify(result.errors));
  });

  test("a request missing tracking_id fails validation at the schema", () => {
    const bad = buildRequest();
    delete bad.tracking_id;
    const result = validateAuthorityRequest(bad);
    assert.equal(result.ok, false);
    assert.match(result.errors[0].path, /tracking_id/);
  });

  test("a request with an unexpected top-level field is rejected (additionalProperties=false)", () => {
    const bad = { ...buildRequest(), bonus: "extra" };
    const result = validateAuthorityRequest(bad);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => /bonus/.test(e.path)));
  });

  test("AuthorityDecision validator requires `reason` when decision != APPROVED", () => {
    const malformedRejected = {
      schema_version: SCHEMA_VERSION,
      tracking_id: "t",
      decision: "REJECTED",
      scope: [],
      standard: "high_risk",
      policy: "command-classes.v1",
      payloadHash: `sha256:${"a".repeat(64)}`,
      evidenceStamp: {
        event_id: "x",
        tx_hash: "a".repeat(64),
        recorded_at: "2026-04-03T12:00:00.000Z",
        ref_path: "x"
      },
      signature: "AAA=",
      key_id: "test-key-001",
      algorithm: "ed25519",
      ts: "2026-04-03T12:00:00.000Z"
      // <-- no `reason`
    };
    const result = validateAuthorityDecision(malformedRejected);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => /reason/.test(e.path)));
  });
});

describe("decideAuthority — refusal axes (scope / standard / policy)", () => {
  test("missing scope (empty array) → NEEDS_INFO + evidence written + reason=scope_missing + requiredNext.axes=['scope']", async () => {
    const { recorder, deps } = buildDeps();
    const req = buildRequest({ scope: [] });
    const decision = await decideAuthority({ request: req, deps });
    assert.equal(decision.decision, "NEEDS_INFO");
    assert.equal(decision.reason, "scope_missing");
    assert.deepEqual(decision.requiredNext, { axes: ["scope"] });
    assert.equal(decision._meta.evidence_written, true);
    assert.equal(recorder.calls.length, 1);
    assert.equal(recorder.calls[0].action, "authority.needs_info");
    assert.equal(recorder.calls[0].details.decision, "NEEDS_INFO");
    assert.equal(decision.evidenceStamp.event_id.length > 0, true);
  });

  test("missing scope (field absent) → NEEDS_INFO + evidence + reason=scope_missing + requiredNext.axes=['scope']", async () => {
    const { recorder, deps } = buildDeps();
    const req = buildRequest();
    delete req.scope;
    const decision = await decideAuthority({ request: req, deps });
    assert.equal(decision.decision, "NEEDS_INFO");
    assert.equal(decision.reason, "scope_missing");
    assert.deepEqual(decision.requiredNext, { axes: ["scope"] });
    assert.equal(recorder.calls.length, 1);
  });

  test("missing standard → NEEDS_INFO + evidence + reason=standard_missing + requiredNext.axes=['standard']", async () => {
    const { recorder, deps } = buildDeps();
    const req = buildRequest();
    delete req.standard;
    const decision = await decideAuthority({ request: req, deps });
    assert.equal(decision.decision, "NEEDS_INFO");
    assert.equal(decision.reason, "standard_missing");
    assert.deepEqual(decision.requiredNext, { axes: ["standard"] });
    assert.equal(decision._meta.evidence_written, true);
    assert.equal(recorder.calls.length, 1);
  });

  test("missing policy → NEEDS_INFO + evidence + reason=policy_missing + requiredNext.axes=['policy']", async () => {
    const { recorder, deps } = buildDeps();
    const req = buildRequest();
    delete req.policy;
    const decision = await decideAuthority({ request: req, deps });
    assert.equal(decision.decision, "NEEDS_INFO");
    assert.equal(decision.reason, "policy_missing");
    assert.deepEqual(decision.requiredNext, { axes: ["policy"] });
    assert.equal(recorder.calls.length, 1);
  });

  test("multiple axes missing → requiredNext.axes carries all of them in declaration order", async () => {
    const { deps } = buildDeps();
    const req = buildRequest();
    delete req.scope;
    delete req.standard;
    delete req.policy;
    const decision = await decideAuthority({ request: req, deps });
    assert.equal(decision.decision, "NEEDS_INFO");
    assert.deepEqual(decision.requiredNext, { axes: ["scope", "standard", "policy"] });
  });

  test("schema-invalid request (missing tracking_id) → REJECTED + reasonCode=MALFORMED_REQUEST + evidence in audit_trails + malformed_requests", async () => {
    const { recorder, malformedRecorder, deps } = buildDeps();
    const req = buildRequest();
    delete req.tracking_id;
    const decision = await decideAuthority({ request: req, deps });
    assert.equal(decision.decision, "REJECTED");
    assert.equal(decision.reasonCode, "MALFORMED_REQUEST");
    assert.match(decision.reason, /^schema_invalid:/);
    assert.equal(decision._meta.evidence_written, true);
    assert.equal(decision._meta.rate_limited, false);
    assert.equal(decision.evidenceStamp.ref_path, "04_EVIDENCE_ROOM/malformed_requests/events.jsonl");
    assert.equal(recorder.calls.length, 0, "bound writeEvidence is NOT used for malformed requests");
    assert.equal(malformedRecorder.malformedRows.length, 1);
    assert.equal(malformedRecorder.summaryRows.length, 0);
    const malformedEntry = malformedRecorder.malformedRows[0];
    assert.equal(malformedEntry.sourceSurface, "test");
    assert.equal(malformedEntry.sourceIp, "127.0.0.1");
    assert.equal(malformedEntry.rawRequest.action, "deploy_feature_gate");
    assert.ok(Array.isArray(malformedEntry.schemaErrors));
    assert.ok(malformedEntry.schemaErrors.length > 0);
  });

  test("policy version mismatch → REJECTED + evidence + reason mentions both versions", async () => {
    const { recorder, deps } = buildDeps();
    const req = buildRequest({ policy: "command-classes.v0" });
    const decision = await decideAuthority({ request: req, deps });
    assert.equal(decision.decision, "REJECTED");
    assert.match(decision.reason, /policy_version_mismatch/);
    assert.match(decision.reason, /v1/);
    assert.match(decision.reason, /v0/);
    assert.equal(recorder.calls.length, 1, "rejections are evidenced");
  });

  test("scope incomplete (missing executive for tunnel) → NEEDS_INFO + evidence + requiredNext.scopes=['executive']", async () => {
    const { recorder, deps } = buildDeps();
    // tunnel demands executive+tunnel, but we only declare tunnel.
    const req = buildRequest({ scope: ["tunnel"], standard: "tunnel" });
    const decision = await decideAuthority({ request: req, deps });
    assert.equal(decision.decision, "NEEDS_INFO");
    assert.match(decision.reason, /scope_incomplete:missing=executive/);
    assert.deepEqual(decision.requiredNext, { scopes: ["executive"] });
    assert.equal(recorder.calls.length, 1);
  });
});

describe("decideAuthority — approval path", () => {
  test("approved path returns APPROVED, writes evidence, evidenceStamp.event_id matches the writeEvidence return", async () => {
    const { recorder, deps } = buildDeps();
    const req = buildRequest();
    const decision = await decideAuthority({ request: req, deps });

    assert.equal(decision.decision, "APPROVED");
    assert.equal(decision.scope.length, 1);
    assert.equal(decision.standard, "high_risk");
    assert.equal(decision.policy, "command-classes.v1");
    assert.equal(decision.algorithm, "ed25519");
    assert.equal(decision.key_id, "test-key-001");
    assert.equal(decision.ts, "2026-04-03T12:00:00.000Z");

    assert.equal(recorder.calls.length, 1);
    assert.equal(recorder.calls[0].component, "consolelab.authority");
    assert.equal(recorder.calls[0].action, "authority.approved");
    assert.equal(recorder.calls[0].details.tracking_id, req.tracking_id);
    assert.equal(recorder.calls[0].details.payload_hash, decision.payloadHash);

    // evidenceStamp must reference the same line writeEvidence produced.
    assert.equal(decision.evidenceStamp.tx_hash.length, 64);
    assert.equal(decision.evidenceStamp.event_id.includes(decision.evidenceStamp.tx_hash.slice(0, 16)), true);

    // No `reason` and no `requiredNext` on APPROVED packets.
    assert.equal(Object.prototype.hasOwnProperty.call(decision, "reason"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(decision, "requiredNext"), false);
  });

  test("REJECTED packets must not carry requiredNext", async () => {
    const { deps } = buildDeps();
    const req = buildRequest({ policy: "command-classes.v0" });
    const decision = await decideAuthority({ request: req, deps });
    assert.equal(decision.decision, "REJECTED");
    assert.equal(Object.prototype.hasOwnProperty.call(decision, "requiredNext"), false);
  });

  test("payloadHash equals sha256 of stableStringify(payload)", async () => {
    const { deps } = buildDeps();
    const req = buildRequest({ payload: { z: 1, a: 2, nested: { b: 3, a: 4 } } });
    const decision = await decideAuthority({ request: req, deps });
    assert.equal(decision.payloadHash, payloadHash(req.payload));
  });

  test("returned packet always satisfies the AuthorityDecision schema lock", async () => {
    const { deps } = buildDeps();
    for (const req of [
      buildRequest(),                                                 // approved
      buildRequest({ scope: [] }),                                    // schema-invalid
      buildRequest({ policy: "command-classes.v0" }),                 // rejected
      buildRequest({ scope: ["tunnel"], standard: "tunnel" })         // needs-info (incomplete scope)
    ]) {
      const decision = await decideAuthority({ request: req, deps });
      const cleaned = { ...decision };
      delete cleaned._meta;
      // unbound packets carry placeholder values that intentionally fail
      // ScopeName/Standard patterns — those are explicitly marked
      // _meta.evidence_written=false and are not contractually
      // verifiable. Skip them.
      if (decision._meta?.evidence_written === false) continue;
      const result = validateAuthorityDecision(cleaned);
      assert.equal(
        result.ok,
        true,
        `decision for ${req.standard}/${JSON.stringify(req.scope)} failed self-validation: ${JSON.stringify(result.errors)}`
      );
    }
  });
});

describe("decideAuthority — signing & tampering", () => {
  test("signature verifies against active public key", async () => {
    const { keyPair, deps } = buildDeps();
    const decision = await decideAuthority({ request: buildRequest(), deps });
    const verified = verifyPayloadHash(
      decision.payloadHash,
      decision.signature,
      keyPair.publicKey,
      keyPair.keyType
    );
    assert.equal(verified, true);

    // verifyDecisionSignature() helper, with same injected key pair.
    const helperVerified = await verifyDecisionSignature(decision, {
      loadActiveKeyPair: async () => keyPair
    });
    assert.equal(helperVerified, true);
  });

  test("tampering the payloadHash invalidates the signature", async () => {
    const { keyPair, deps } = buildDeps();
    const decision = await decideAuthority({ request: buildRequest(), deps });
    const tampered = { ...decision, payloadHash: `sha256:${"f".repeat(64)}` };
    const verified = verifyPayloadHash(
      tampered.payloadHash,
      tampered.signature,
      keyPair.publicKey,
      keyPair.keyType
    );
    assert.equal(verified, false);

    const helperVerified = await verifyDecisionSignature(tampered, {
      loadActiveKeyPair: async () => keyPair
    });
    assert.equal(helperVerified, false);
  });

  test("tampering the signature itself fails verification", async () => {
    const { keyPair, deps } = buildDeps();
    const decision = await decideAuthority({ request: buildRequest(), deps });
    const otherKey = crypto.generateKeyPairSync("ed25519");
    const wrongSignature = signPayloadHash(decision.payloadHash, otherKey.privateKey, "ed25519");
    const verified = verifyPayloadHash(
      decision.payloadHash,
      wrongSignature,
      keyPair.publicKey,
      keyPair.keyType
    );
    assert.equal(verified, false);
  });
});

describe("decideAuthority — evidence binding contract", () => {
  test("every decision (approved/rejected/needs-info) results in exactly one writeEvidence call when packet is bound", async () => {
    for (const [label, req] of [
      ["approved", buildRequest()],
      ["rejected", buildRequest({ policy: "command-classes.v0" })],
      ["needs-info-incomplete-scope", buildRequest({ scope: ["tunnel"], standard: "tunnel" })]
    ]) {
      const { recorder, deps } = buildDeps();
      await decideAuthority({ request: req, deps });
      assert.equal(recorder.calls.length, 1, `${label} must write exactly one evidence row`);
      assert.equal(
        recorder.calls[0].component,
        "consolelab.authority",
        `${label} evidence row must come from consolelab.authority`
      );
      assert.equal(
        ["approved", "rejected", "needs_info"].includes(recorder.calls[0].result),
        true,
        `${label} must record a known result`
      );
    }
  });
});

describe("decideAuthority — malformed-request handling", () => {
  test("schema-invalid additionalProperties → REJECTED + MALFORMED_REQUEST + evidence captures schemaErrors", async () => {
    const { malformedRecorder, deps } = buildDeps();
    const req = buildRequest();
    req.unexpected_field = "boom";
    const decision = await decideAuthority({ request: req, deps });
    assert.equal(decision.decision, "REJECTED");
    assert.equal(decision.reasonCode, "MALFORMED_REQUEST");
    assert.equal(decision._meta.evidence_written, true);
    assert.equal(malformedRecorder.malformedRows.length, 1);
    assert.equal(malformedRecorder.malformedRows[0].schemaErrors.length > 0, true);
    // A.1 tightening: every validator error carries a stable `code` so the
    // evidence row can route on machine-readable error_class buckets.
    for (const err of malformedRecorder.malformedRows[0].schemaErrors) {
      assert.equal(typeof err.code, "string");
      assert.ok(err.code.length > 0, "validator must attach a non-empty code");
    }
  });

  test("schema validator emits stable error codes for known violations", () => {
    const cases = [
      { mutate: (r) => { delete r.tracking_id; }, expected: "missing_required_property" },
      { mutate: (r) => { r.unexpected_field = "x"; }, expected: "additional_property_disallowed" },
      { mutate: (r) => { r.schema_version = "v0"; }, expected: "const_mismatch" },
      { mutate: (r) => { r.tracking_id = 42; }, expected: "type_mismatch" },
      { mutate: (r) => { r.action = "BAD ACTION"; }, expected: "pattern_mismatch" },
      { mutate: (r) => { r.scope = ["dup", "dup"]; }, expected: "unique_items_violation" }
    ];
    for (const { mutate, expected } of cases) {
      const req = buildRequest();
      mutate(req);
      const result = validateAuthorityRequest(req);
      assert.equal(result.ok, false, `case ${expected} expected to fail validation`);
      const codes = result.errors.map((e) => e.code);
      assert.ok(codes.includes(expected), `expected error code ${expected} in ${JSON.stringify(codes)}`);
    }
  });

  test("malformed packet payloadHash equals sha256(stableStringify(rawRequest)) so the rejection is non-repudiable", async () => {
    const { keyPair, deps } = buildDeps();
    const req = buildRequest();
    delete req.tracking_id;
    const decision = await decideAuthority({ request: req, deps });
    const expected = `sha256:${computeRequestHash(req)}`;
    assert.equal(decision.payloadHash, expected);
    // Signature over that hash must verify.
    const verified = verifyPayloadHash(
      decision.payloadHash,
      decision.signature,
      keyPair.publicKey,
      keyPair.keyType
    );
    assert.equal(verified, true);
  });

  test("malformed decision packets satisfy the AuthorityDecision schema lock (REJECTED branch with reasonCode)", async () => {
    const { deps } = buildDeps();
    const req = buildRequest();
    delete req.tracking_id;
    const decision = await decideAuthority({ request: req, deps });
    const result = validateAuthorityDecision(stripMeta(decision));
    assert.equal(result.ok, true, JSON.stringify(result.errors));
    assert.equal(decision.reasonCode, "MALFORMED_REQUEST");
  });
});

describe("decideAuthority — malformed rate limiting", () => {
  test("11th malformed request in a 60s window for the same key → REJECTED + MALFORMED_REQUEST_RATE_LIMITED", async () => {
    const { malformedRecorder, deps } = buildDeps({ rateLimit: 10 });
    const malformedReq = () => {
      const r = buildRequest();
      delete r.tracking_id;
      return r;
    };

    for (let i = 0; i < 10; i++) {
      const decision = await decideAuthority({ request: malformedReq(), deps });
      assert.equal(decision.decision, "REJECTED");
      assert.equal(decision.reasonCode, "MALFORMED_REQUEST", `request ${i + 1} should still be allowed`);
    }
    assert.equal(malformedRecorder.malformedRows.length, 10);
    assert.equal(malformedRecorder.summaryRows.length, 0);

    const overLimit = await decideAuthority({ request: malformedReq(), deps });
    assert.equal(overLimit.decision, "REJECTED");
    assert.equal(overLimit.reasonCode, "MALFORMED_REQUEST_RATE_LIMITED");
    assert.equal(overLimit._meta.rate_limited, true);
    assert.equal(overLimit._meta.rate_limit_hit_count, 10);
    assert.equal(malformedRecorder.malformedRows.length, 10, "rate-limited requests must NOT add to the rich row stream");
    assert.equal(malformedRecorder.summaryRows.length, 1, "first rate-limited hit emits exactly one summary row");
  });

  test("multiple rate-limited hits in the same 60s window emit only ONE summary row per key", async () => {
    const { malformedRecorder, deps } = buildDeps({ rateLimit: 2 });
    const malformedReq = () => {
      const r = buildRequest();
      delete r.tracking_id;
      return r;
    };

    // Burn through the limit.
    await decideAuthority({ request: malformedReq(), deps });
    await decideAuthority({ request: malformedReq(), deps });
    // 5 rate-limited follow-ups inside the same window.
    for (let i = 0; i < 5; i++) {
      const d = await decideAuthority({ request: malformedReq(), deps });
      assert.equal(d.reasonCode, "MALFORMED_REQUEST_RATE_LIMITED");
    }
    assert.equal(malformedRecorder.summaryRows.length, 1, "summary row must be rate-limited to one per minute per key");
  });

  test("different rate-limit keys do NOT share a counter", async () => {
    const { malformedRecorder, deps } = buildDeps({ rateLimit: 2 });
    const malformedReq = () => {
      const r = buildRequest();
      delete r.tracking_id;
      return r;
    };

    // Two requests for source-A → exhausts source-A.
    await decideAuthority({ request: malformedReq(), deps: { ...deps, rateLimitKey: "source-A" } });
    await decideAuthority({ request: malformedReq(), deps: { ...deps, rateLimitKey: "source-A" } });
    const aOverLimit = await decideAuthority({ request: malformedReq(), deps: { ...deps, rateLimitKey: "source-A" } });
    assert.equal(aOverLimit.reasonCode, "MALFORMED_REQUEST_RATE_LIMITED");

    // First request for source-B should still be allowed.
    const bAllowed = await decideAuthority({ request: malformedReq(), deps: { ...deps, rateLimitKey: "source-B" } });
    assert.equal(bAllowed.reasonCode, "MALFORMED_REQUEST");
    assert.equal(malformedRecorder.malformedRows.length, 3, "source-A's 2 + source-B's 1");
  });

  test("buildRateLimitKey: source_ip + tunnel_session_id wins over correlation_id when both present", () => {
    const k1 = buildRateLimitKey({ sourceIp: "10.0.0.1", correlationId: "corr-1", tunnelSessionId: "tun-x" });
    const k2 = buildRateLimitKey({ sourceIp: "10.0.0.1", correlationId: "corr-2", tunnelSessionId: "tun-x" });
    assert.equal(k1, k2);
    assert.equal(k1, "10.0.0.1|tun-x");
  });

  test("buildRateLimitKey: falls back to 'anon' when no session/correlation", () => {
    const key = buildRateLimitKey({ sourceIp: "10.0.0.1" });
    assert.equal(key, "10.0.0.1|anon");
  });

  test("malformed_requests rich row carries expected_schema_id, schema_version, error_classes, error_class_counts", async () => {
    const captured = [];
    const fakeAppend = async (filePath, payload) => {
      captured.push({ filePath, payload });
    };
    const stamp = await writeMalformedRequestEvidence({
      rawRequest: { schema_version: "v0", action: "BAD ACTION" },
      schemaErrors: [
        { path: "AuthorityRequest.schema_version", message: "...", code: "const_mismatch" },
        { path: "AuthorityRequest.action", message: "...", code: "pattern_mismatch" },
        { path: "AuthorityRequest.tracking_id", message: "...", code: "missing_required_property" },
        { path: "AuthorityRequest.payload", message: "...", code: "missing_required_property" },
        { path: "AuthorityRequest.requested_by", message: "...", code: "missing_required_property" },
        { path: "AuthorityRequest.ts", message: "...", code: "missing_required_property" }
      ],
      sourceSurface: "test-surface",
      sourceIp: "10.1.2.3",
      correlationId: "corr-A",
      tunnelSessionId: null,
      ts: "2026-04-03T12:00:00.000Z",
      appendJsonl: fakeAppend
    });
    assert.ok(stamp.event_id);
    assert.ok(stamp.tx_hash);
    assert.equal(stamp.ref_path, "04_EVIDENCE_ROOM/malformed_requests/events.jsonl");
    assert.equal(stamp.audit_trails_ref_path, "04_EVIDENCE_ROOM/audit_trails/events.jsonl");

    assert.equal(captured.length, 2, "must write to audit_trails AND malformed_requests");
    const audit = captured.find((c) => c.filePath.endsWith("audit_trails/events.jsonl"));
    const rich = captured.find((c) => c.filePath.endsWith("malformed_requests/events.jsonl"));
    assert.ok(audit && rich);

    // audit row stays minimal
    assert.equal(audit.payload.action, "authority.malformed_request");
    assert.equal(audit.payload.result, "rejected");
    assert.ok(!("error_classes" in audit.payload), "audit row must not carry rich error fields");

    // rich row carries the A.1 fields
    assert.equal(rich.payload.expected_schema_id, EXPECTED_SCHEMA_ID);
    assert.equal(rich.payload.expected_schema_id, "AuthorityRequest");
    assert.equal(rich.payload.schema_version, SCHEMA_VERSION);
    assert.deepEqual(
      rich.payload.error_classes,
      ["const_mismatch", "missing_required_property", "pattern_mismatch"],
      "error_classes must be sorted unique enum keys"
    );
    assert.deepEqual(rich.payload.error_class_counts, {
      const_mismatch: 1,
      missing_required_property: 4,
      pattern_mismatch: 1
    });
    assert.equal(rich.payload.parse_error_count, 6);
    // Each parse_errors entry also carries error_class for downstream routing.
    for (const e of rich.payload.parse_errors) {
      assert.ok(typeof e.error_class === "string" && e.error_class.length > 0);
    }
  });

  test("malformed rate-limit summary row carries expected_schema_id and schema_version", async () => {
    const captured = [];
    const fakeAppend = async (filePath, payload) => {
      captured.push({ filePath, payload });
    };
    await writeMalformedRequestRateLimitSummary({
      rateLimitKey: "10.1.2.3|tun-x",
      hitCount: 12,
      windowStartedAt: "2026-04-03T11:59:00.000Z",
      ts: "2026-04-03T12:00:00.000Z",
      appendJsonl: fakeAppend
    });
    const rich = captured.find((c) => c.filePath.endsWith("malformed_requests/events.jsonl"));
    assert.ok(rich);
    assert.equal(rich.payload.expected_schema_id, "AuthorityRequest");
    assert.equal(rich.payload.schema_version, SCHEMA_VERSION);
    assert.equal(rich.payload.action, "authority.malformed_request_rate_limit_hit");
    assert.equal(rich.payload.reason_code, "MALFORMED_REQUEST_RATE_LIMITED");
    assert.equal(rich.payload.hit_count, 12);
  });

  test("summarizeErrorClasses + classifyValidationError fall back to 'unknown' on missing code", () => {
    assert.equal(classifyValidationError(null), "unknown");
    assert.equal(classifyValidationError({}), "unknown");
    assert.equal(classifyValidationError({ code: "" }), "unknown");
    assert.equal(classifyValidationError({ code: "type_mismatch" }), "type_mismatch");
    assert.deepEqual(summarizeErrorClasses(null), {});
    assert.deepEqual(
      summarizeErrorClasses([{ code: "type_mismatch" }, { code: "type_mismatch" }, {}]),
      { type_mismatch: 2, unknown: 1 }
    );
  });

  test("rate limiter sliding window: events older than windowMs are pruned", async () => {
    let nowMs = 0;
    const limiter = createMalformedRequestRateLimiter({
      limit: 2,
      windowMs: 1_000,
      now: () => nowMs
    });
    nowMs = 0;       limiter.consume("k"); // 1
    nowMs = 100;     limiter.consume("k"); // 2 → at limit
    nowMs = 500;     assert.equal(limiter.consume("k").allowed, false);
    nowMs = 1_500;   assert.equal(limiter.consume("k").allowed, true, "first event aged out, room for one more");
  });
});

function stripMeta(decision) {
  const copy = { ...decision };
  delete copy._meta;
  return copy;
}
