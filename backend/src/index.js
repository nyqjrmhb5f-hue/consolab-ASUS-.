import express from "express";
import { config } from "./config.js";
import { appendEvidence } from "./services/evidenceStore.js";
import { verifyAccessRequest } from "./services/accessControl.js";
import { buildAuthorityStatus, signAuthorityPayload, verifyRuntimeAttestation } from "./services/authorityService.js";
import { getStatusPayload, renderStatusPage } from "./services/statusPage.js";

const app = express();
const CANONICAL_AUTHORITY_HOST = "consolelab.vyrdon.com";
const LEGACY_AUTHORITY_HOSTS = new Set(["consolab.vyrdon.com"]);

function requestId(req) {
  return req.header("cf-ray") || req.header("x-request-id") || cryptoRandomId();
}

function cryptoRandomId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function applySecurityHeaders(req, res, next) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  res.setHeader("Cache-Control", req.path === "/" ? "no-cache" : "no-store");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; script-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
  );
  next();
}

function normalizeHost(input) {
  return String(input || "").split(":")[0].trim().toLowerCase();
}

function enforceCanonicalAuthorityHost(req, res, next) {
  const incomingHost = normalizeHost(req.header("x-forwarded-host") || req.header("host") || req.hostname);
  if (!LEGACY_AUTHORITY_HOSTS.has(incomingHost)) {
    return next();
  }

  const target = `https://${CANONICAL_AUTHORITY_HOST}${req.originalUrl || "/"}`;
  return res.redirect(308, target);
}

async function logAccessDecision(req, outcome) {
  await appendEvidence({
    action: "access.verify",
    result: outcome.ok ? "allow" : "deny",
    requestId: requestId(req),
    method: req.method,
    path: req.path,
    sourceIp: outcome.sourceIp,
    host: req.hostname,
    accessMode: outcome.mode || null,
    details: {
      error: outcome.error || null,
      principal: outcome.principal || null,
      access_jwt_details: outcome.details || null
    }
  }).catch(() => {});
}

async function requireAccess(req, res, next) {
  const outcome = await verifyAccessRequest(req);
  await logAccessDecision(req, outcome);

  if (!outcome.ok) {
    return res.status(outcome.status || 401).json({
      ok: false,
      error: outcome.error
    });
  }

  req.access = outcome;
  return next();
}

function sourceIp(req) {
  return req.access?.sourceIp
    || req.header("cf-connecting-ip")
    || req.header("x-forwarded-for")?.split(",")[0]?.trim()
    || req.socket.remoteAddress
    || "unknown";
}

app.disable("x-powered-by");
app.set("trust proxy", true);
app.use(applySecurityHeaders);
app.use(enforceCanonicalAuthorityHost);
app.use(express.json({ limit: config.http.jsonLimit, type: ["application/json", "application/*+json"] }));

app.get("/health", async (_req, res) => {
  res.json({
    ok: true,
    service: config.serviceName,
    status: "healthy",
    ts: new Date().toISOString()
  });
});

app.get("/api/health", async (_req, res) => {
  res.json({
    ok: true,
    service: config.serviceName,
    status: "healthy",
    ts: new Date().toISOString()
  });
});

app.get("/", requireAccess, async (_req, res, next) => {
  try {
    const status = await getStatusPayload();
    res.type("html").send(renderStatusPage(status));
  } catch (error) {
    next(error);
  }
});

async function handleStatus(req, res, next) {
  try {
    const status = await getStatusPayload();
    await appendEvidence({
      action: "status.read",
      result: "ok",
      requestId: requestId(req),
      method: req.method,
      path: req.path,
      sourceIp: sourceIp(req),
      host: req.hostname,
      accessMode: req.access?.mode || null,
      details: {
        authority_status: status.authority.status,
        evidence_events: status.evidence.events
      }
    });
    res.json(status);
  } catch (error) {
    next(error);
  }
}

app.get("/status", requireAccess, handleStatus);
app.get("/api/status", requireAccess, handleStatus);

async function handleSign(req, res, next) {
  try {
    const signed = await signAuthorityPayload(req.body || {});
    await appendEvidence({
      action: "sign",
      result: "ok",
      requestId: requestId(req),
      method: req.method,
      path: req.path,
      sourceIp: sourceIp(req),
      host: req.hostname,
      accessMode: req.access?.mode || null,
      keyId: signed.key_id,
      details: {
        payload_hash: signed.payload_hash,
        signed_input: signed.signed_input
      }
    });
    res.json(signed);
  } catch (error) {
    next(error);
  }
}

async function handleAttestVerify(req, res, next) {
  try {
    const verified = await verifyRuntimeAttestation(req.body || {});
    await appendEvidence({
      action: "attest.verify",
      result: verified.verified ? "ok" : "fail",
      requestId: requestId(req),
      method: req.method,
      path: req.path,
      sourceIp: sourceIp(req),
      host: req.hostname,
      accessMode: req.access?.mode || null,
      keyId: verified.key_id || null,
      trustStatus: verified.trust_status,
      details: {
        payload_hash: verified.payload_hash,
        verification: verified.verification,
        verified_with: verified.verified_with || null
      }
    });
    res.status(verified.verified ? 200 : 409).json(verified);
  } catch (error) {
    next(error);
  }
}

app.post("/sign", requireAccess, handleSign);
app.post("/api/sign", requireAccess, handleSign);
app.post("/attest/verify", requireAccess, handleAttestVerify);
app.post("/api/attest/verify", requireAccess, handleAttestVerify);

app.use(async (req, res) => {
  if (req.path !== "/favicon.ico") {
    await appendEvidence({
      action: "route.reject",
      result: "not_found",
      requestId: requestId(req),
      method: req.method,
      path: req.path,
      sourceIp: sourceIp(req),
      host: req.hostname,
      accessMode: req.access?.mode || null
    }).catch(() => {});
  }

  res.status(404).json({
    ok: false,
    error: "not_found"
  });
});

app.use(async (error, req, res, _next) => {
  await appendEvidence({
    action: "route.error",
    result: "error",
    requestId: requestId(req),
    method: req.method,
    path: req.path,
    sourceIp: sourceIp(req),
    host: req.hostname,
    accessMode: req.access?.mode || null,
    details: {
      message: error?.message || "internal_error"
    }
  }).catch(() => {});

  if (error?.type === "entity.too.large") {
    return res.status(413).json({ ok: false, error: "payload_too_large" });
  }

  return res.status(500).json({ ok: false, error: error?.message || "internal_error" });
});

app.listen(config.port, config.host, async () => {
  const authority = await buildAuthorityStatus().catch(() => null);
  await appendEvidence({
    action: "service.start",
    result: authority?.status === "healthy" ? "ok" : "degraded",
    method: "BOOT",
    path: "startup",
    sourceIp: "127.0.0.1",
    host: config.host,
    keyId: authority?.asus?.key_id || null,
    details: {
      port: config.port,
      host: config.host,
      service: config.serviceName
    }
  }).catch(() => {});

  process.stdout.write(
    `[consolelab-authority] listening on http://${config.host}:${config.port}\n`
  );
});
