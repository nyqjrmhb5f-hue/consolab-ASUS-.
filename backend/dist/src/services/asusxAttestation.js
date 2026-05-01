import fs from "node:fs";
import { config } from "../config.js";
import { fetchJson } from "../lib/http.js";

function loadSecret(pathValue, fallback) {
  if (fallback) return fallback;
  try {
    const raw = fs.readFileSync(pathValue, "utf8").trim();
    return raw || "";
  } catch {
    return "";
  }
}

function authHeaders() {
  const id = loadSecret(config.cloudflare.serviceTokenIdPath, config.cloudflare.serviceTokenId);
  const secret = loadSecret(config.cloudflare.serviceTokenSecretPath, config.cloudflare.serviceTokenSecret);
  if (!id || !secret) return {};
  return {
    "CF-Access-Client-Id": id,
    "CF-Access-Client-Secret": secret
  };
}

async function fetchWithFallback(primaryUrl, fallbackUrl, options = {}) {
  const primary = await fetchJson(primaryUrl, options);
  if (primary.ok || !fallbackUrl || primary.status) {
    return primary;
  }
  return fetchJson(fallbackUrl, options);
}

export async function getAsusxStatus() {
  return fetchWithFallback(
    `${config.asusx.attestBase}/status`,
    `${config.asusx.localAttestBase}/status`,
    { headers: authHeaders() }
  );
}

export async function verifyAttestation(payload) {
  return fetchWithFallback(
    `${config.asusx.attestBase}/attest/verify`,
    `${config.asusx.localAttestBase}/attest/verify`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(payload)
    }
  );
}

export async function signPayload(payload) {
  return fetchWithFallback(
    `${config.asusx.signBase}/sign`,
    `${config.asusx.localSignBase}/sign`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(payload)
    }
  );
}
