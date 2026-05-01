import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";

function redactPayload(payload) {
  if (Array.isArray(payload)) return payload.map(redactPayload);
  if (payload && typeof payload === "object") {
    return Object.fromEntries(
      Object.entries(payload).map(([key, value]) => {
        const lowered = key.toLowerCase();
        if (["secret", "token", "password", "cookie", "authorization", "private"].some((term) => lowered.includes(term))) {
          return [key, "[REDACTED]"];
        }
        return [key, redactPayload(value)];
      })
    );
  }
  return payload;
}

export async function appendEvidence(fileName, payload) {
  const dir = path.resolve(config.baselineDir, "evidence");
  await fs.mkdir(dir, { recursive: true });
  await fs.chmod(dir, 0o700).catch(() => {});
  const filePath = path.join(dir, fileName);
  const line = JSON.stringify({ ts: new Date().toISOString(), ...redactPayload(payload) }) + "\n";
  await fs.appendFile(filePath, line, "utf8");
  await fs.chmod(filePath, 0o600).catch(() => {});
}
