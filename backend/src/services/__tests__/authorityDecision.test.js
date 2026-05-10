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

function buildDeps(overrides = {}) {
  const keyPair = overrides.keyPair || makeTestKeyPair();
  const recorder = overrides.recorder || makeEvidenceRecorder();
  return {
    keyPair,
    recorder,
    deps: {
      writeEvidence: recorder.write,
      loadActiveKeyPair: async () => keyPair,
      signPayloadHash,
      getCommandPolicyMap: () => overrides.policyMap || STUB_POLICY_MAP,
      now: overrides.now || (() => "2026-04-03T12:00:00.000Z"),
      sourceIp: "127.0.0.1",
      sealId: "test-seal"
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

  test("schema-invalid request (missing tracking_id) → unbound NEEDS_INFO, NO evidence", async () => {
    const { recorder, deps } = buildDeps();
    const req = buildRequest();
    delete req.tracking_id;
    const decision = await decideAuthority({ request: req, deps });
    assert.equal(decision.decision, "NEEDS_INFO");
    assert.match(decision.reason, /^schema_invalid:/);
    assert.equal(decision._meta.evidence_written, false);
    assert.equal(recorder.calls.length, 0);
    assert.equal(decision.signature, "", "unbound packets must not be signed");
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
