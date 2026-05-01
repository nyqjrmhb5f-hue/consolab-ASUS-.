import fs from "node:fs/promises";
import crypto from "node:crypto";

function normalizeMode(value) {
  return String(value || "integrity_only").trim().toLowerCase() === "required"
    ? "required"
    : "integrity_only";
}

export function getAttestationMode() {
  return normalizeMode(process.env.CONSOLELAB_EVIDENCE_ATTESTATION_MODE);
}

export async function getAttestationConfig() {
  const mode = getAttestationMode();
  const signingKeyId = process.env.CONSOLELAB_EVIDENCE_SIGNING_KEY_ID || null;
  const privateKeyPath =
    process.env.CONSOLELAB_EVIDENCE_PRIVATE_KEY_PATH ||
    process.env.CONSOLELAB_EVIDENCE_SIGNING_PRIVATE_KEY_PATH ||
    "";
  const privateKeyInline = process.env.CONSOLELAB_EVIDENCE_PRIVATE_KEY || "";
  const publicKeyPath =
    process.env.CONSOLELAB_EVIDENCE_PUBLIC_KEY_PATH ||
    process.env.CONSOLELAB_EVIDENCE_SIGNING_PUBLIC_KEY_PATH ||
    "";
  const publicKeyInline = process.env.CONSOLELAB_EVIDENCE_PUBLIC_KEY || "";

  const privateKeyConfigured = Boolean(signingKeyId && (privateKeyInline || privateKeyPath));
  const verificationKeyConfigured = Boolean(publicKeyInline || publicKeyPath || privateKeyConfigured);

  return {
    mode,
    signing_key_id: signingKeyId,
    private_key_configured: privateKeyConfigured,
    verification_key_configured: verificationKeyConfigured,
    is_required: mode === "required",
    is_ready: privateKeyConfigured && verificationKeyConfigured
  };
}

async function readKeyMaterial(inlineValue, filePath) {
  if (inlineValue) {
    return inlineValue;
  }

  if (filePath) {
    return fs.readFile(filePath, "utf8");
  }

  return null;
}

export async function loadSigningKeyPair() {
  const config = await getAttestationConfig();
  try {
    const privateKeyPem = await readKeyMaterial(
      process.env.CONSOLELAB_EVIDENCE_PRIVATE_KEY || "",
      process.env.CONSOLELAB_EVIDENCE_PRIVATE_KEY_PATH ||
        process.env.CONSOLELAB_EVIDENCE_SIGNING_PRIVATE_KEY_PATH ||
        ""
    );

    if (!config.signing_key_id || !privateKeyPem) {
      return {
        ok: false,
        error: "signing_key_unavailable",
        config
      };
    }

    const privateKey = crypto.createPrivateKey(privateKeyPem);
    const publicKeyPem = await readKeyMaterial(
      process.env.CONSOLELAB_EVIDENCE_PUBLIC_KEY || "",
      process.env.CONSOLELAB_EVIDENCE_PUBLIC_KEY_PATH ||
        process.env.CONSOLELAB_EVIDENCE_SIGNING_PUBLIC_KEY_PATH ||
        ""
    );
    const publicKey = publicKeyPem
      ? crypto.createPublicKey(publicKeyPem)
      : crypto.createPublicKey(privateKey);

    return {
      ok: true,
      config,
      privateKey,
      publicKey,
      keyType: privateKey.asymmetricKeyType || "unknown"
    };
  } catch (error) {
    return {
      ok: false,
      error: "signing_key_load_failed",
      load_error: error.message,
      config
    };
  }
}

function sortValue(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => sortValue(entry));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sortValue(value[key])])
    );
  }

  return value;
}

export function stableStringify(value) {
  return JSON.stringify(sortValue(value));
}

export function buildAttestationPayload({ event_id, tx_hash, created_at, hash_algorithm = "sha256" }) {
  return stableStringify({
    created_at,
    event_id,
    hash_algorithm,
    tx_hash
  });
}

function signBuffer(payload, privateKey, keyType) {
  return keyType === "ed25519"
    ? crypto.sign(null, Buffer.from(payload), privateKey)
    : crypto.sign("sha256", Buffer.from(payload), privateKey);
}

function verifyBuffer(payload, signature, publicKey, keyType) {
  return keyType === "ed25519"
    ? crypto.verify(null, Buffer.from(payload), publicKey, signature)
    : crypto.verify("sha256", Buffer.from(payload), publicKey, signature);
}

export async function signAttestationPayload(payload) {
  const loaded = await loadSigningKeyPair();
  if (!loaded.ok) {
    return loaded;
  }

  try {
    const signature = signBuffer(payload, loaded.privateKey, loaded.keyType);
    const verified = verifyBuffer(payload, signature, loaded.publicKey, loaded.keyType);

    return {
      ok: verified,
      config: loaded.config,
      signature: signature.toString("base64"),
      signing_key_id: loaded.config.signing_key_id,
      key_type: loaded.keyType,
      verification_state: verified ? "verified" : "verify_error",
      error: verified ? null : "signature_verification_failed"
    };
  } catch (error) {
    return {
      ok: false,
      config: loaded.config,
      signing_key_id: loaded.config.signing_key_id,
      key_type: loaded.keyType,
      verification_state: "sign_error",
      error: error.message
    };
  }
}

export async function verifyAttestationSignature(attestation = {}) {
  const loaded = await loadSigningKeyPair();
  if (!loaded.ok) {
    return {
      ok: false,
      verification: "verification_key_unavailable",
      config: loaded.config
    };
  }

  if (!attestation.signature || !attestation.tx_hash || !attestation.event_id || !attestation.created_at) {
    return {
      ok: false,
      verification: "attestation_incomplete",
      config: loaded.config
    };
  }

  try {
    const payload = buildAttestationPayload(attestation);
    const signature = Buffer.from(attestation.signature, "base64");
    const verified = verifyBuffer(
      payload,
      signature,
      loaded.publicKey,
      attestation.key_type || loaded.keyType
    );

    return {
      ok: verified,
      verification: verified ? "verified" : "invalid_signature",
      config: loaded.config,
      payload
    };
  } catch (error) {
    return {
      ok: false,
      verification: "verification_error",
      error: error.message,
      config: loaded.config
    };
  }
}
