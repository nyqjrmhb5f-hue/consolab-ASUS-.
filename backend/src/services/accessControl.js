import fs from "node:fs";
import crypto from "node:crypto";
import { config } from "../config.js";
import { createAccessVerifier } from "../lib/accessJwt.js";

let jwtVerifier = null;

function readSecret(filePath, fallback) {
  if (fallback) {
    return fallback;
  }

  try {
    const raw = fs.readFileSync(filePath, "utf8").trim();
    return raw || "";
  } catch {
    return "";
  }
}

function timingSafeEqualText(expected, actual) {
  const left = Buffer.from(String(expected || ""));
  const right = Buffer.from(String(actual || ""));
  return left.length > 0 && left.length === right.length && crypto.timingSafeEqual(left, right);
}

function getServiceTokenConfig() {
  return {
    id: readSecret(config.access.serviceTokenIdPath, config.access.serviceTokenId),
    secret: readSecret(config.access.serviceTokenSecretPath, config.access.serviceTokenSecret)
  };
}

export function accessConfiguration() {
  const serviceToken = getServiceTokenConfig();
  return {
    serviceTokenConfigured: Boolean(serviceToken.id && serviceToken.secret),
    jwtConfigured: Boolean(config.access.teamDomain)
  };
}

export async function verifyAccessRequest(req) {
  const sourceIp = req.header("cf-connecting-ip")
    || req.header("x-forwarded-for")?.split(",")[0]?.trim()
    || req.socket.remoteAddress
    || "unknown";

  const serviceToken = getServiceTokenConfig();
  const clientId = String(req.header("CF-Access-Client-Id") || "");
  const clientSecret = String(req.header("CF-Access-Client-Secret") || "");
  const accessJwt = String(req.header("CF-Access-Jwt-Assertion") || "");
  const headerState = {
    hasServiceTokenIdHeader: Boolean(clientId),
    hasServiceTokenSecretHeader: Boolean(clientSecret),
    hasAccessJwt: Boolean(accessJwt)
  };

  if (serviceToken.id && serviceToken.secret) {
    if (timingSafeEqualText(serviceToken.id, clientId) && timingSafeEqualText(serviceToken.secret, clientSecret)) {
      return {
        ok: true,
        mode: "service-token",
        sourceIp
      };
    }
  }

  if (accessJwt) {
    if (!config.access.teamDomain) {
      return {
        ok: false,
        status: 503,
        error: "access_jwt_validation_not_configured",
        sourceIp,
        details: headerState
      };
    }

    if (!jwtVerifier) {
      jwtVerifier = createAccessVerifier({
        teamDomain: config.access.teamDomain,
        aud: config.access.audience
      });
    }

    try {
      const decoded = await jwtVerifier(accessJwt);
      return {
        ok: true,
        mode: "access-jwt",
        sourceIp,
        principal: decoded?.email || decoded?.sub || "cloudflare-access-user"
      };
    } catch (error) {
      return {
        ok: false,
        status: 401,
        error: "invalid_access_jwt",
        sourceIp,
        details: {
          ...headerState,
          reason: error.message
        }
      };
    }
  }

  if (clientId || clientSecret) {
    return {
      ok: false,
      status: 401,
      error: "invalid_service_token",
      sourceIp,
      details: headerState
    };
  }

  if (serviceToken.id && serviceToken.secret) {
    return {
      ok: false,
      status: 401,
      error: "missing_service_token",
      sourceIp,
      details: headerState
    };
  }

  return {
    ok: false,
    status: 503,
    error: "access_not_configured",
    sourceIp,
    details: headerState
  };
}
