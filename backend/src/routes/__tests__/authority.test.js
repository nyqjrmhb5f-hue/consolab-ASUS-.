// Route-level tests for the authority decision ingress.
// Mounts the router on an in-memory http.Server, hits it with node:fetch,
// asserts wire-payload shape (must validate against AuthorityDecision schema
// and must NOT carry the internal `_meta` field) and HTTP status mapping.
//
// No external test deps — uses node:test, node:http, node:fetch.

import test, { describe } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import crypto from "node:crypto";
import express from "express";

import { createAuthorityRouter, authorityDecisionStatusCode, stripDecisionMeta } from "../authority.js";
import {
  validateAuthorityDecision,
  SCHEMA_VERSION
} from "../../services/authorityDecision.js";
import { createMalformedRequestRateLimiter } from "../../services/malformedRequestRateLimit.js";

// --- test scaffolding ------------------------------------------------------

function buildRequest(overrides = {}) {
  return {
    schema_version: "authority-decision.v1",
    tracking_id: "TRK-ROUTE-001",
    action: "test.route",
    scope: ["executive", "tunnel"],
    standard: "tunnel",
    policy: "command-policy.v1",
    payload: { foo: "bar" },
    requested_by: "route-test",
    ts: "2026-04-03T12:00:00.000Z",
    ...overrides
  };
}

function makeStubKeyPair() {
  return {
    keyId: "test-key",
    keyType: "ed25519",
    privateKey: "stub-priv",
    publicKey: "stub-pub"
  };
}

function makeEvidenceRecorder() {
  const writes = [];
  let counter = 0;
  return {
    writes,
    writeEvidence: async (input) => {
      counter += 1;
      writes.push(input);
      const ts = input?.details?.ts || "2026-04-03T12:00:00.000Z";
      const tx = crypto
        .createHash("sha256")
        .update(`${counter}:${JSON.stringify(input)}`)
        .digest("hex");
      const eventId = `${ts.replace(/[^0-9TZ]/g, "")}-${tx.slice(0, 16)}`;
      return {
        recorded_at: ts,
        baseline_ref: {
          consolelab_path: "04_EVIDENCE_ROOM/actions/events.jsonl",
          file_path: "/tmp/04_EVIDENCE_ROOM/actions/events.jsonl"
        },
        room_ref: {
          event_id: eventId,
          tx_hash: tx,
          hash_algorithm: "sha256",
          attestation_state: "signed",
          verification_state: "verified",
          signing_key_id: "test-key",
          recorded_at: ts,
          artifact_paths: {
            audit_trails: "04_EVIDENCE_ROOM/audit_trails/events.jsonl"
          }
        }
      };
    }
  };
}

function makeMalformedRecorder() {
  const malformedRows = [];
  const summaryRows = [];
  let counter = 0;
  return {
    malformedRows,
    summaryRows,
    writeMalformed: async (input) => {
      counter += 1;
      malformedRows.push(input);
      const txHash = crypto
        .createHash("sha256")
        .update(`malformed:${counter}:${JSON.stringify(input.rawRequest)}`)
        .digest("hex");
      return {
        event_id: `${input.ts.replace(/[^0-9TZ]/g, "")}-${txHash.slice(0, 16)}`,
        tx_hash: txHash,
        request_hash: txHash,
        recorded_at: input.ts,
        ref_path: "04_EVIDENCE_ROOM/malformed_requests/events.jsonl",
        audit_trails_ref_path: "04_EVIDENCE_ROOM/audit_trails/events.jsonl"
      };
    },
    writeSummary: async (input) => {
      summaryRows.push(input);
      const txHash = crypto
        .createHash("sha256")
        .update(`summary:${input.rateLimitKey}:${input.windowStartedAt}:${input.hitCount}`)
        .digest("hex");
      return {
        event_id: `${input.ts.replace(/[^0-9TZ]/g, "")}-${txHash.slice(0, 16)}`,
        tx_hash: txHash,
        recorded_at: input.ts,
        ref_path: "04_EVIDENCE_ROOM/malformed_requests/events.jsonl",
        audit_trails_ref_path: "04_EVIDENCE_ROOM/audit_trails/events.jsonl"
      };
    }
  };
}

function buildDecideAuthorityWithDeps(extraDeps = {}) {
  const evidenceRecorder = makeEvidenceRecorder();
  const malformedRecorder = makeMalformedRecorder();
  const rateLimiter = createMalformedRequestRateLimiter({ limit: 10, windowMs: 60_000 });

  const wrapped = async ({ request, deps = {} }) => {
    const { decideAuthority } = await import("../../services/authorityDecision.js");
    return decideAuthority({
      request,
      deps: {
        ...deps,
        writeEvidence: evidenceRecorder.writeEvidence,
        writeMalformedRequestEvidence: malformedRecorder.writeMalformed,
        writeMalformedRequestRateLimitSummary: malformedRecorder.writeSummary,
        malformedRateLimiter: rateLimiter,
        loadActiveKeyPair: async () => makeStubKeyPair(),
        signPayloadHash: () => "stub-signature",
        getCommandPolicyMap: () => ({
          version: "command-policy.v1",
          classes: {
            tunnel: {
              command_class: "tunnel",
              approval_scopes: ["executive", "tunnel"]
            }
          }
        }),
        ...extraDeps
      }
    });
  };
  // Reset state on the unused recorder so test isolation is real.
  void evidenceRecorder.writes;
  return { decideAuthority: wrapped, evidenceRecorder, malformedRecorder, rateLimiter };
}

async function startServer(router) {
  const app = express();
  app.use(express.json());
  app.use(router);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const url = `http://127.0.0.1:${port}`;
  return {
    url,
    close: () => new Promise((resolve) => server.close(resolve))
  };
}

async function postAuthority(baseUrl, body, headers = {}) {
  const res = await fetch(`${baseUrl}/api/authority/decisions`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body)
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: res.status, body: json, raw: text };
}

// --- pure helpers ----------------------------------------------------------

describe("authorityDecisionStatusCode", () => {
  test("APPROVED → 200", () => {
    assert.equal(authorityDecisionStatusCode({ decision: "APPROVED" }), 200);
  });
  test("NEEDS_INFO → 422", () => {
    assert.equal(authorityDecisionStatusCode({ decision: "NEEDS_INFO" }), 422);
  });
  test("REJECTED + MALFORMED_REQUEST → 400", () => {
    assert.equal(
      authorityDecisionStatusCode({ decision: "REJECTED", reasonCode: "MALFORMED_REQUEST" }),
      400
    );
  });
  test("REJECTED + MALFORMED_REQUEST_RATE_LIMITED → 429", () => {
    assert.equal(
      authorityDecisionStatusCode({ decision: "REJECTED", reasonCode: "MALFORMED_REQUEST_RATE_LIMITED" }),
      429
    );
  });
  test("REJECTED (no reasonCode) → 403", () => {
    assert.equal(authorityDecisionStatusCode({ decision: "REJECTED" }), 403);
  });
  test("missing/unknown → 500", () => {
    assert.equal(authorityDecisionStatusCode(null), 500);
    assert.equal(authorityDecisionStatusCode({ decision: "WAT" }), 500);
  });
});

describe("stripDecisionMeta", () => {
  test("removes _meta from the wire payload", () => {
    const out = stripDecisionMeta({ decision: "APPROVED", a: 1, _meta: { x: true } });
    assert.deepEqual(out, { decision: "APPROVED", a: 1 });
    assert.equal("_meta" in out, false);
  });
  test("passes through null/undefined safely", () => {
    assert.equal(stripDecisionMeta(null), null);
    assert.equal(stripDecisionMeta(undefined), undefined);
  });
});

// --- end-to-end route tests -----------------------------------------------

describe("POST /api/authority/decisions — wire shape contract", () => {
  test("APPROVED packet: 200 + AuthorityDecision validates + no _meta on wire", async () => {
    const { decideAuthority } = buildDecideAuthorityWithDeps();
    const router = createAuthorityRouter({ decideAuthority });
    const srv = await startServer(router);
    try {
      const { status, body } = await postAuthority(srv.url, buildRequest());
      assert.equal(status, 200);
      assert.equal(body.decision, "APPROVED");
      assert.equal(body.schema_version, SCHEMA_VERSION);
      assert.equal("_meta" in body, false, "_meta must not leak onto the wire");
      const result = validateAuthorityDecision(body);
      assert.equal(result.ok, true, JSON.stringify(result.errors));
    } finally {
      await srv.close();
    }
  });

  test("NEEDS_INFO packet (axis missing): 422 + validates + carries requiredNext", async () => {
    const { decideAuthority } = buildDecideAuthorityWithDeps();
    const router = createAuthorityRouter({ decideAuthority });
    const srv = await startServer(router);
    try {
      const req = buildRequest();
      delete req.standard; // axis missing → NEEDS_INFO
      // Schema requires 'standard' as required field, so this becomes
      // schema-invalid → REJECTED+MALFORMED. Use empty array for scope axis instead.
      const req2 = buildRequest({ scope: [] });
      const { status, body } = await postAuthority(srv.url, req2);
      assert.equal(status, 422);
      assert.equal(body.decision, "NEEDS_INFO");
      assert.equal(body.reason, "scope_missing");
      assert.deepEqual(body.requiredNext, { axes: ["scope"] });
      assert.equal("_meta" in body, false);
      assert.equal(validateAuthorityDecision(body).ok, true);
    } finally {
      await srv.close();
    }
  });

  test("NEEDS_INFO packet (scope_incomplete): 422 + validates + carries requiredNext.scopes", async () => {
    const { decideAuthority } = buildDecideAuthorityWithDeps();
    const router = createAuthorityRouter({ decideAuthority });
    const srv = await startServer(router);
    try {
      const req = buildRequest({ scope: ["tunnel"] }); // missing executive
      const { status, body } = await postAuthority(srv.url, req);
      assert.equal(status, 422);
      assert.equal(body.decision, "NEEDS_INFO");
      assert.match(body.reason, /scope_incomplete:missing=executive/);
      assert.deepEqual(body.requiredNext, { scopes: ["executive"] });
      assert.equal(validateAuthorityDecision(body).ok, true);
    } finally {
      await srv.close();
    }
  });

  test("REJECTED policy_version_mismatch: 403 + validates", async () => {
    const { decideAuthority } = buildDecideAuthorityWithDeps();
    const router = createAuthorityRouter({ decideAuthority });
    const srv = await startServer(router);
    try {
      const req = buildRequest({ policy: "command-policy.v0" });
      const { status, body } = await postAuthority(srv.url, req);
      assert.equal(status, 403);
      assert.equal(body.decision, "REJECTED");
      assert.match(body.reason, /policy_version_mismatch/);
      assert.equal(validateAuthorityDecision(body).ok, true);
    } finally {
      await srv.close();
    }
  });

  test("REJECTED MALFORMED_REQUEST (missing tracking_id): 400 + validates + reasonCode", async () => {
    const { decideAuthority, malformedRecorder } = buildDecideAuthorityWithDeps();
    const router = createAuthorityRouter({ decideAuthority });
    const srv = await startServer(router);
    try {
      const req = buildRequest();
      delete req.tracking_id;
      const { status, body } = await postAuthority(srv.url, req);
      assert.equal(status, 400);
      assert.equal(body.decision, "REJECTED");
      assert.equal(body.reasonCode, "MALFORMED_REQUEST");
      assert.equal(malformedRecorder.malformedRows.length, 1, "must write a malformed evidence row");
      assert.equal(validateAuthorityDecision(body).ok, true);
    } finally {
      await srv.close();
    }
  });

  test("REJECTED MALFORMED_REQUEST (additional_property): 400 + validates", async () => {
    const { decideAuthority } = buildDecideAuthorityWithDeps();
    const router = createAuthorityRouter({ decideAuthority });
    const srv = await startServer(router);
    try {
      const req = { ...buildRequest(), unexpected_field: "boom" };
      const { status, body } = await postAuthority(srv.url, req);
      assert.equal(status, 400);
      assert.equal(body.decision, "REJECTED");
      assert.equal(body.reasonCode, "MALFORMED_REQUEST");
    } finally {
      await srv.close();
    }
  });

  test("Rate-limit: 11th malformed request in 60s window → 429 + MALFORMED_REQUEST_RATE_LIMITED", async () => {
    const { decideAuthority, malformedRecorder } = buildDecideAuthorityWithDeps();
    const router = createAuthorityRouter({ decideAuthority });
    const srv = await startServer(router);
    try {
      const malformed = () => {
        const r = buildRequest();
        delete r.tracking_id;
        return r;
      };
      // Drive 10 malformed hits with the same correlation_id so the rate
      // limiter keys them together. The route extracts correlation_id from
      // either the X-Correlation-Id header or the body.correlation_id field.
      const headers = { "x-correlation-id": "rl-test-corr" };
      let lastStatus = null;
      for (let i = 0; i < 10; i++) {
        const r = await postAuthority(srv.url, malformed(), headers);
        assert.equal(r.status, 400, `hit ${i + 1} should be 400`);
        assert.equal(r.body.reasonCode, "MALFORMED_REQUEST");
        lastStatus = r.status;
      }
      const eleventh = await postAuthority(srv.url, malformed(), headers);
      assert.equal(eleventh.status, 429);
      assert.equal(eleventh.body.decision, "REJECTED");
      assert.equal(eleventh.body.reasonCode, "MALFORMED_REQUEST_RATE_LIMITED");
      assert.equal(validateAuthorityDecision(eleventh.body).ok, true);
      assert.ok(malformedRecorder.malformedRows.length === 10, "first 10 evidence rows land");
      assert.ok(malformedRecorder.summaryRows.length >= 1, "rate-limit summary row(s) emitted");
      void lastStatus;
    } finally {
      await srv.close();
    }
  });

  test("source headers flow into rate limiter (different keys do not share counter)", async () => {
    const { decideAuthority } = buildDecideAuthorityWithDeps();
    const router = createAuthorityRouter({ decideAuthority });
    const srv = await startServer(router);
    try {
      const malformed = () => {
        const r = buildRequest();
        delete r.tracking_id;
        return r;
      };
      // Burn 10 hits on key A.
      for (let i = 0; i < 10; i++) {
        const r = await postAuthority(srv.url, malformed(), { "x-correlation-id": "key-A" });
        assert.equal(r.status, 400);
      }
      // Key B's first hit should still be 400, not 429.
      const onB = await postAuthority(srv.url, malformed(), { "x-correlation-id": "key-B" });
      assert.equal(onB.status, 400);
      assert.equal(onB.body.reasonCode, "MALFORMED_REQUEST");
    } finally {
      await srv.close();
    }
  });

  test("authorityRouter (production export) is a mountable Express router", async () => {
    // Structural smoke-test: the default authorityRouter export is mountable
    // on an Express app without throwing. We don't fire requests against it
    // here because it would route through the production decideAuthority and
    // write to the real 04_EVIDENCE_ROOM. End-to-end coverage comes from the
    // createAuthorityRouter() tests above.
    const { authorityRouter } = await import("../authority.js");
    const app = express();
    app.use(express.json());
    assert.doesNotThrow(() => app.use(authorityRouter));
  });

  test("requireAccess gate (when supplied) gets called before decideAuthority", async () => {
    let gateCalled = 0;
    let decideCalled = 0;
    const requireAccess = (req, res, next) => {
      gateCalled++;
      // Simulate Cloudflare Access denying.
      return res.status(401).json({ ok: false, error: "missing_access_token" });
    };
    const decideAuthority = async () => {
      decideCalled++;
      throw new Error("decideAuthority should not run when access is denied");
    };
    const router = createAuthorityRouter({ requireAccess, decideAuthority });
    const srv = await startServer(router);
    try {
      const r = await postAuthority(srv.url, buildRequest());
      assert.equal(r.status, 401);
      assert.equal(gateCalled, 1);
      assert.equal(decideCalled, 0);
    } finally {
      await srv.close();
    }
  });
});
