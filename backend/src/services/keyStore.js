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

function readMetaSync() {
  if (!fs.existsSync(config.keyMetaFile)) {
    return { active_key_id: null, keys: {} };
  }
  return safeJsonParse(fs.readFileSync(config.keyMetaFile, "utf8"), { active_key_id: null, keys: {} });
}

function createKeyInfo(keyId, record) {
  return {
    keyId,
    record,
    privateKeyPath: record.private_key_path,
    publicKeyPath: record.public_key_path
  };
}

export async function loadActiveKeyInfo() {
  const meta = readMetaSync();
  const keyId = meta.active_key_id || null;
  if (!keyId || !meta.keys?.[keyId] || meta.keys[keyId].revoked) {
    throw new Error("active_asus_key_not_available");
  }

  return createKeyInfo(keyId, meta.keys[keyId]);
}

export async function loadActiveKeyPair() {
  const keyInfo = await loadActiveKeyInfo();
  const [privateKeyPem, publicKeyPem] = await Promise.all([
    fsp.readFile(keyInfo.privateKeyPath, "utf8"),
    fsp.readFile(keyInfo.publicKeyPath, "utf8")
  ]);

  const privateKey = crypto.createPrivateKey(privateKeyPem);
  const publicKey = crypto.createPublicKey(publicKeyPem);

  return {
    ...keyInfo,
    privateKey,
    publicKey,
    keyType: privateKey.asymmetricKeyType || publicKey.asymmetricKeyType || "unknown"
  };
}

export async function loadPublicKeyById(keyId) {
  const meta = readMetaSync();
  const record = keyId ? meta.keys?.[keyId] : null;
  if (!record || record.revoked) {
    return null;
  }
  const publicKeyPem = await fsp.readFile(record.public_key_path, "utf8");
  return {
    keyId,
    publicKeyPem,
    publicKey: crypto.createPublicKey(publicKeyPem),
    keyType: crypto.createPublicKey(publicKeyPem).asymmetricKeyType || "unknown",
    trustSource: "asus-key-store"
  };
}

function verifyWithKey(payloadValue, signatureB64, publicKey, keyType) {
  const signature = Buffer.from(signatureB64, "base64");
  return keyType === "ed25519"
    ? crypto.verify(null, Buffer.from(payloadValue), publicKey, signature)
    : crypto.verify("sha256", Buffer.from(payloadValue), publicKey, signature);
}

export function signPayloadHash(payloadHashValue, privateKey, keyType) {
  const signature = keyType === "ed25519"
    ? crypto.sign(null, Buffer.from(payloadHashValue), privateKey)
    : crypto.sign("sha256", Buffer.from(payloadHashValue), privateKey);

  return signature.toString("base64");
}

export function verifyPayloadHash(payloadHashValue, signatureB64, publicKey, keyType) {
  return verifyWithKey(payloadHashValue, signatureB64, publicKey, keyType);
}
