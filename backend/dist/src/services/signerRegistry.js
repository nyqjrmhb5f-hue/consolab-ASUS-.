import fs from "node:fs";
import fsp from "node:fs/promises";
import crypto from "node:crypto";
import { config } from "../config.js";

function safeJsonParse(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export async function loadSignerRegistry() {
  if (!fs.existsSync(config.signerRegistryFile)) {
    return { signers: [] };
  }

  const raw = await fsp.readFile(config.signerRegistryFile, "utf8");
  const parsed = safeJsonParse(raw, { signers: [] });
  return Array.isArray(parsed.signers) ? parsed : { signers: [] };
}

async function resolvePublicKeyPem(signer) {
  if (typeof signer.public_key === "string" && signer.public_key.trim()) {
    return signer.public_key.trim();
  }

  if (typeof signer.public_key_path === "string" && signer.public_key_path.trim()) {
    return fsp.readFile(signer.public_key_path.trim(), "utf8");
  }

  return null;
}

export async function resolveTrustedSigner({ nodeId, keyId }) {
  if (!nodeId || !keyId) {
    return null;
  }

  const registry = await loadSignerRegistry();
  const signer = registry.signers.find((entry) => {
    if (!entry || entry.active === false) return false;
    return String(entry.node_id || "") === String(nodeId) && String(entry.key_id || "") === String(keyId);
  });

  if (!signer) {
    return null;
  }

  const publicKeyPem = await resolvePublicKeyPem(signer);
  if (!publicKeyPem) {
    return null;
  }

  const publicKey = crypto.createPublicKey(publicKeyPem);

  return {
    keyId,
    nodeId,
    publicKeyPem,
    publicKey,
    keyType: publicKey.asymmetricKeyType || "unknown",
    trustSource: "signer-registry"
  };
}
