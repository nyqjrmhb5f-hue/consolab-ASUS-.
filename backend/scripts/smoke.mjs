import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const baseUrl = process.env.CONSOLELAB_SMOKE_URL || "http://127.0.0.1:18080";
const tokenIdPath = process.env.CF_SERVICE_TOKEN_ID_PATH || path.join(rootDir, "..", ".secrets", "access", "service-token-id");
const tokenSecretPath = process.env.CF_SERVICE_TOKEN_SECRET_PATH || path.join(rootDir, "..", ".secrets", "access", "service-token-secret");

const [tokenId, tokenSecret] = await Promise.all([
  fs.readFile(tokenIdPath, "utf8"),
  fs.readFile(tokenSecretPath, "utf8")
]);

const headers = {
  "Content-Type": "application/json",
  "CF-Access-Client-Id": tokenId.trim(),
  "CF-Access-Client-Secret": tokenSecret.trim()
};

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  if (!response.ok) {
    throw new Error(`${url} -> ${response.status} ${JSON.stringify(body)}`);
  }
  return body;
}

const signed = await requestJson(`${baseUrl}/sign`, {
  method: "POST",
  headers,
  body: JSON.stringify({
    payload: {
      system: "consolelab",
      action: "smoke-test"
    }
  })
});

const verified = await requestJson(`${baseUrl}/attest/verify`, {
  method: "POST",
  headers,
  body: JSON.stringify({
    payload_hash: signed.payload_hash,
    signature: signed.signature,
    key_id: signed.key_id
  })
});

const status = await requestJson(`${baseUrl}/status`, {
  headers
});

if (!signed.signed || !verified.verified || status?.authority?.signing?.ok !== true) {
  throw new Error("smoke validation failed");
}

process.stdout.write("consolelab authority smoke passed\n");
