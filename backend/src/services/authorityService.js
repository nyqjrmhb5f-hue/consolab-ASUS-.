import crypto from "node:crypto";
import { config } from "../config.js";
import { payloadHash } from "../lib/stableJson.js";
import { loadActiveKeyPair, loadPublicKeyById, signPayloadHash, verifyPayloadHash } from "./keyStore.js";
import { loadSignerRegistry, resolveTrustedSigner } from "./signerRegistry.js";

function parseSignature(value) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function resolvePayloadHash(body) {
  if (typeof body?.payload_hash === "string" && body.payload_hash.trim()) {
    return {
      value: body.payload_hash.trim(),
      source: "payload_hash"
    };
  }

  if (Object.prototype.hasOwnProperty.call(body || {}, "payload")) {
    return {
      value: payloadHash(body.payload),
      source: "payload"
    };
  }

  if (Object.prototype.hasOwnProperty.call(body || {}, "runtime")) {
    return {
      value: payloadHash(body.runtime),
      source: "runtime"
    };
  }

  if (Object.prototype.hasOwnProperty.call(body || {}, "runtime_data")) {
    return {
      value: payloadHash(body.runtime_data),
      source: "runtime_data"
    };
  }

  return {
    value: payloadHash(body || {}),
    source: "request_body"
  };
}

async function resolveVerificationKey(body) {
  const nodeId = String(body?.node_id || body?.runtime_id || "").trim();
  const keyId = String(body?.key_id || "").trim();

  const trustedSigner = await resolveTrustedSigner({ nodeId, keyId });
  if (trustedSigner) {
    return {
      ...trustedSigner,
      trustStatus: "trusted"
    };
  }

  if (keyId) {
    const asusKey = await loadPublicKeyById(keyId);
    if (asusKey) {
      return {
        ...asusKey,
        trustStatus: "trusted"
      };
    }
  }

  const inlinePublicKey = String(body?.public_key || body?.publicKey || "").trim();
  if (inlinePublicKey) {
    const publicKey = crypto.createPublicKey(inlinePublicKey);
    return {
      keyId: keyId || null,
      nodeId: nodeId || null,
      publicKey,
      publicKeyPem: inlinePublicKey,
      keyType: publicKey.asymmetricKeyType || "unknown",
      trustSource: "inline-public-key",
      trustStatus: "verified_untrusted_key"
    };
  }

  return null;
}

function validateTimestamp(body) {
  const tsValue = body?.ts ?? body?.timestamp_epoch;
  if (tsValue === undefined || tsValue === null || tsValue === "") {
    return { ok: true, reason: "not_provided" };
  }

  const ts = Number(tsValue);
  if (!Number.isFinite(ts)) {
    return { ok: false, reason: "timestamp_invalid" };
  }

  const now = Math.floor(Date.now() / 1000);
  return Math.abs(now - ts) <= config.http.clockSkewSeconds
    ? { ok: true, reason: "within_skew" }
    : { ok: false, reason: "timestamp_skew" };
}

export async function signAuthorityPayload(body = {}) {
  const keyPair = await loadActiveKeyPair();
  const resolvedHash = resolvePayloadHash(body);
  const signature = signPayloadHash(resolvedHash.value, keyPair.privateKey, keyPair.keyType);

  return {
    ok: true,
    signed: true,
    key_id: keyPair.keyId,
    algorithm: keyPair.keyType,
    payload_hash: resolvedHash.value,
    signed_input: resolvedHash.source,
    signature,
    ts: new Date().toISOString()
  };
}

export async function verifyRuntimeAttestation(body = {}) {
  const resolvedHash = resolvePayloadHash(body);
  const timestampCheck = validateTimestamp(body);
  const signature = parseSignature(body?.signature || body?.attestation_signature || body?.runtime_signature);

  if (!signature) {
    return {
      ok: true,
      verified: false,
      trust_status: "untrusted",
      payload_hash: resolvedHash.value,
      verification: "missing_signature",
      ts: new Date().toISOString()
    };
  }

  if (!timestampCheck.ok) {
    return {
      ok: true,
      verified: false,
      trust_status: "untrusted",
      payload_hash: resolvedHash.value,
      verification: timestampCheck.reason,
      ts: new Date().toISOString()
    };
  }

  const verificationKey = await resolveVerificationKey(body);
  if (!verificationKey) {
    return {
      ok: true,
      verified: false,
      trust_status: "untrusted",
      payload_hash: resolvedHash.value,
      verification: "verification_key_not_found",
      ts: new Date().toISOString()
    };
  }

  const verified = verifyPayloadHash(
    resolvedHash.value,
    signature,
    verificationKey.publicKey,
    verificationKey.keyType
  );

  return {
    ok: true,
    verified,
    trust_status: verified ? verificationKey.trustStatus : "untrusted",
    verification: verified ? "signature_verified" : "invalid_signature",
    payload_hash: resolvedHash.value,
    verified_with: verificationKey.trustSource,
    key_id: verificationKey.keyId || null,
    node_id: verificationKey.nodeId || null,
    ts: new Date().toISOString()
  };
}

export async function buildAuthorityStatus() {
  const [keyPair, signerRegistry] = await Promise.all([
    loadActiveKeyPair(),
    loadSignerRegistry()
  ]);

  const selfTestHash = payloadHash({ service: config.serviceName, probe: "self-test" });
  const signature = signPayloadHash(selfTestHash, keyPair.privateKey, keyPair.keyType);
  const verified = verifyPayloadHash(selfTestHash, signature, keyPair.publicKey, keyPair.keyType);

  return {
    ok: true,
    status: verified ? "healthy" : "degraded",
    asus: {
      online: verified,
      key_id: keyPair.keyId
    },
    signing: {
      ok: verified,
      key_id: keyPair.keyId,
      algorithm: keyPair.keyType
    },
    attestation: {
      ok: verified,
      trusted_signers: Array.isArray(signerRegistry.signers) ? signerRegistry.signers.filter((entry) => entry?.active !== false).length : 0
    },
    ts: new Date().toISOString()
  };
}
