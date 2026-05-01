import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { config } from "../config.js";
import { stableStringify, sha256 } from "../lib/stableJson.js";

let writeChain = Promise.resolve();
let lastHash = null;
let initialized = false;

function isSensitiveKey(key) {
  const normalized = String(key || "").toLowerCase();
  return [
    "secret",
    "token",
    "authorization",
    "cookie",
    "password",
    "private_key",
    "privatekey",
    "signature"
  ].some((fragment) => normalized.includes(fragment));
}

function sanitizeValue(value, depth = 0) {
  if (depth > 4) {
    return "[MAX_DEPTH]";
  }

  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeValue(entry, depth + 1));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [
        key,
        isSensitiveKey(key) ? "[REDACTED]" : sanitizeValue(nestedValue, depth + 1)
      ])
    );
  }

  if (typeof value === "string" && value.length > 512) {
    return `${value.slice(0, 256)}...[TRUNCATED]`;
  }

  return value;
}

async function ensureStoreReady() {
  if (initialized) {
    return;
  }

  await fsp.mkdir(config.evidence.dir, { recursive: true, mode: 0o700 });
  await fsp.chmod(config.evidence.dir, 0o700).catch(() => {});

  if (fs.existsSync(config.evidence.file)) {
    const raw = await fsp.readFile(config.evidence.file, "utf8");
    const lines = raw.split("\n").filter(Boolean);
    if (lines.length > 0) {
      try {
        const record = JSON.parse(lines.at(-1));
        lastHash = record?.hash || null;
      } catch {
        lastHash = null;
      }
    }
  }

  initialized = true;
}

function createRecord(payload) {
  const timestamp = payload.timestamp || new Date().toISOString();
  const id = payload.id || crypto.randomUUID();
  const baseRecord = {
    id,
    timestamp,
    action: payload.action,
    result: payload.result,
    request_id: payload.requestId || null,
    method: payload.method || null,
    path: payload.path || null,
    source_ip: payload.sourceIp || null,
    host: payload.host || null,
    access_mode: payload.accessMode || null,
    key_id: payload.keyId || null,
    trust_status: payload.trustStatus || null,
    previous_hash: lastHash,
    details: sanitizeValue(payload.details || {})
  };

  const hash = sha256(stableStringify(baseRecord));

  return {
    ...baseRecord,
    hash
  };
}

export async function appendEvidence(payload) {
  await ensureStoreReady();

  writeChain = writeChain.then(async () => {
    const record = createRecord(payload);
    await fsp.appendFile(config.evidence.file, `${JSON.stringify(record)}\n`, "utf8");
    await fsp.chmod(config.evidence.file, 0o600).catch(() => {});
    lastHash = record.hash;
    return record;
  });

  return writeChain;
}

export async function readRecentEvidence(limit = config.http.statusLogLimit) {
  await ensureStoreReady();

  if (!fs.existsSync(config.evidence.file)) {
    return [];
  }

  const raw = await fsp.readFile(config.evidence.file, "utf8");
  const rows = raw
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  return rows.slice(-Math.max(1, limit)).reverse();
}

export async function evidenceStats() {
  await ensureStoreReady();

  if (!fs.existsSync(config.evidence.file)) {
    return {
      file: config.evidence.file,
      events: 0,
      last_hash: lastHash
    };
  }

  const raw = await fsp.readFile(config.evidence.file, "utf8");
  const events = raw.split("\n").filter(Boolean).length;
  return {
    file: config.evidence.file,
    events,
    last_hash: lastHash
  };
}
