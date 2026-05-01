import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";
import { consoleLabRoot } from "./consoleLabPaths.js";
import { mirrorEvidenceEvent } from "./evidenceRoomWriter.js";

function isSensitiveKey(key) {
  const normalized = key.toLowerCase();
  return [
    "secret",
    "token",
    "password",
    "cookie",
    "authorization",
    "private",
    "admin"
  ].some((fragment) => normalized.includes(fragment));
}

function sanitizeValue(value) {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [
        key,
        isSensitiveKey(key) ? "[REDACTED]" : sanitizeValue(nested)
      ])
    );
  }

  if (typeof value === "string" && value.length > 256) {
    return `${value.slice(0, 128)}...[TRUNCATED]`;
  }

  return value;
}

export async function writeEvidence({ component, action, result, source_ip, seal_id, details = {} }) {
  const dir = path.resolve(config.baselineDir, "evidence");
  await fs.mkdir(dir, { recursive: true });
  await fs.chmod(dir, 0o700).catch(() => {});
  const filePath = path.join(dir, "events.jsonl");
  const entry = {
    timestamp: new Date().toISOString(),
    component,
    action,
    result,
    source_ip,
    seal_id,
    details: sanitizeValue(details)
  };
  const line = JSON.stringify(entry) + "\n";
  const mirroredPromise = mirrorEvidenceEvent(entry);
  await Promise.all([
    fs.appendFile(filePath, line, "utf8"),
    mirroredPromise
  ]);
  await fs.chmod(filePath, 0o600).catch(() => {});
  const roomRef = await mirroredPromise;
  const baselineRelative = path.relative(consoleLabRoot, filePath).replace(/\\/g, "/");

  return {
    recorded_at: entry.timestamp,
    baseline_ref: {
      file_path: filePath,
      consolelab_path: baselineRelative && !baselineRelative.startsWith("..") ? baselineRelative : null,
      format: "jsonl"
    },
    room_ref: roomRef
  };
}
