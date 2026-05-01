import fs from "node:fs";
import { config } from "../config.js";
import { createAccessVerifier } from "../lib/accessJwt.js";
import { writeEvidence } from "./evidenceWriter.js";

let verifier = null;

function loadSecret(pathValue, fallback) {
  if (fallback) return fallback;
  try {
    const raw = fs.readFileSync(pathValue, "utf8").trim();
    return raw || "";
  } catch {
    return "";
  }
}

function resolveServiceToken() {
  return {
    id: loadSecret(config.cloudflare.serviceTokenIdPath, config.cloudflare.serviceTokenId),
    secret: loadSecret(config.cloudflare.serviceTokenSecretPath, config.cloudflare.serviceTokenSecret)
  };
}

function getSourceIp(req) {
  const remoteAddress = req.socket.remoteAddress || "unknown";
  const isLoopbackProxy = remoteAddress === "127.0.0.1"
    || remoteAddress === "::1"
    || remoteAddress === "::ffff:127.0.0.1";

  if (isLoopbackProxy) {
    return req.header("x-forwarded-for")?.split(",")[0]?.trim() || remoteAddress;
  }

  return remoteAddress;
}

function getSealId(req) {
  return req.header("cf-ray") || "local";
}

function normalizeIp(value) {
  if (!value) return "";
  return value.startsWith("::ffff:") ? value.slice(7) : value;
}

function isPrivateRange(ip) {
  const normalized = normalizeIp(ip);
  if (!normalized) return false;
  if (normalized === "127.0.0.1" || normalized === "::1") return true;
  if (normalized.startsWith("10.") || normalized.startsWith("192.168.")) return true;
  if (normalized.startsWith("100.")) return true;

  const parts = normalized.split(".").map(Number);
  if (parts.length === 4 && parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)) {
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  }

  return false;
}

export function requireAccess(req, res, next) {
  if (req.path === "/health") return next();

  const source_ip = getSourceIp(req);
  const seal_id = getSealId(req);

  if (config.security.allowLocalApi && isPrivateRange(source_ip)) {
    writeEvidence({
      component: "access",
      action: "verify",
      result: "allow",
      source_ip,
      seal_id,
      details: { mode: "local-internal" }
    }).catch(() => {});
    req.access = { mode: "local-internal" };
    return next();
  }

  const serviceToken = resolveServiceToken();
  const headerId = req.header("CF-Access-Client-Id");
  const headerSecret = req.header("CF-Access-Client-Secret");
  if (serviceToken.id && serviceToken.secret && headerId === serviceToken.id && headerSecret === serviceToken.secret) {
    writeEvidence({ component: "access", action: "verify", result: "allow", source_ip, seal_id, details: { mode: "service-token" } }).catch(() => {});
    req.access = { mode: "service-token" };
    return next();
  }

  const jwtHeader = req.header("CF-Access-Jwt-Assertion");
  if (!jwtHeader) {
    writeEvidence({ component: "access", action: "verify", result: "deny", source_ip, seal_id, details: { reason: "missing_access_jwt" } }).catch(() => {});
    return res.status(401).json({ ok: false, error: "missing_access_jwt" });
  }

  try {
    if (!verifier) {
      verifier = createAccessVerifier({
        teamDomain: config.cloudflare.accessTeamDomain,
        aud: config.cloudflare.accessAud
      });
    }
  } catch (error) {
    writeEvidence({ component: "access", action: "verify", result: "deny", source_ip, seal_id, details: { reason: error.message } }).catch(() => {});
    return res.status(500).json({ ok: false, error: error.message });
  }

  verifier(jwtHeader)
    .then((decoded) => {
      writeEvidence({ component: "access", action: "verify", result: "allow", source_ip, seal_id, details: { mode: "jwt" } }).catch(() => {});
      req.access = { mode: "jwt", decoded };
      next();
    })
    .catch((error) => {
      writeEvidence({ component: "access", action: "verify", result: "deny", source_ip, seal_id, details: { reason: error.message } }).catch(() => {});
      res.status(401).json({ ok: false, error: "invalid_access_jwt" });
    });
}
