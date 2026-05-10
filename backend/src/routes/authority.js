// HTTP ingress for ConsoleLab's authority engine.
//
// This route is the canonical surface for runtime callers to ask ConsoleLab
// to render an authority decision over a structured AuthorityRequest packet.
// It is intentionally narrow:
//   1. validate the inbound packet against 06_INTERFACES/schemas
//   2. call decideAuthority()
//   3. always return an AuthorityDecision (APPROVED / NEEDS_INFO / REJECTED)
//      with the evidence stamp + signature bundle attached.
//
// Hard constraints (per ConsoleLab brief + IQ200 follow-up B):
//   - ConsoleLab is READ-ONLY relative to VYRDX runtime and the Dell host.
//     This route only calls decideAuthority(), which reads policy and writes
//     evidence. No SSH, no sockets to runtime hosts, no mutation of runtime
//     state.
//   - Schema-invalid traffic flows through handleMalformedRequest() inside
//     decideAuthority(), which writes evidence rows to audit_trails +
//     malformed_requests, rate-limits per (source_ip, correlation_id ||
//     tunnel_session_id || "anon"), and signs the request hash so the
//     rejection is non-repudiable.

import { Router } from "express";
import { decideAuthority } from "../services/authorityDecision.js";

const SOURCE_SURFACE = "gateway_api";

function getSourceIp(req) {
  return (
    req.header?.("cf-connecting-ip") ||
    req.header?.("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.socket?.remoteAddress ||
    null
  );
}

function getCorrelationId(req, body) {
  return (
    req.header?.("x-correlation-id") ||
    (typeof body?.correlation_id === "string" && body.correlation_id) ||
    null
  );
}

function getTunnelSessionId(req, body) {
  return (
    req.header?.("x-tunnel-session-id") ||
    (typeof body?.tunnel_session_id === "string" && body.tunnel_session_id) ||
    null
  );
}

/**
 * Map an AuthorityDecision packet to the HTTP status code the route returns.
 * The decision packet itself is the response body; the status code is just
 * a transport hint so callers can route on the decision class without
 * inspecting the body.
 */
export function authorityDecisionStatusCode(decision) {
  if (!decision || typeof decision !== "object") return 500;
  if (decision.decision === "APPROVED") return 200;
  if (decision.decision === "NEEDS_INFO") return 422;
  if (decision.decision === "REJECTED") {
    if (decision.reasonCode === "MALFORMED_REQUEST_RATE_LIMITED") return 429;
    if (decision.reasonCode === "MALFORMED_REQUEST") return 400;
    return 403;
  }
  return 500;
}

/**
 * Strip the internal `_meta` field from a decideAuthority() result so the
 * wire payload is pure schema-locked AuthorityDecision. `_meta` is for
 * in-process diagnostics (was evidence written? was the request rate-limited?
 * etc.) and is NOT part of the 06_INTERFACES contract.
 */
export function stripDecisionMeta(decision) {
  if (!decision || typeof decision !== "object") return decision;
  // eslint-disable-next-line no-unused-vars
  const { _meta, ...rest } = decision;
  return rest;
}

/**
 * Factory so tests can mount the route without the access-control gate while
 * production wires `requireAccess` via the module-level export below.
 */
export function createAuthorityRouter(deps = {}) {
  const router = Router();
  const requireAccess = deps.requireAccess;
  const decide = deps.decideAuthority || decideAuthority;
  const sourceSurface = deps.sourceSurface || SOURCE_SURFACE;

  const handler = async (req, res, next) => {
    try {
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const sourceIp = getSourceIp(req);
      const correlationId = getCorrelationId(req, body);
      const tunnelSessionId = getTunnelSessionId(req, body);

      const decision = await decide({
        request: body,
        deps: {
          sourceSurface,
          sourceIp,
          correlationId,
          tunnelSessionId
        }
      });

      const status = authorityDecisionStatusCode(decision);
      res.status(status).json(stripDecisionMeta(decision));
    } catch (err) {
      next(err);
    }
  };

  if (typeof requireAccess === "function") {
    router.post("/api/authority/decisions", requireAccess, handler);
  } else {
    router.post("/api/authority/decisions", handler);
  }

  return router;
}

// Production-mounted instance — index.js attaches `requireAccess` so the
// gateway access policy (Cloudflare Access JWT / service token) covers this
// surface the same way it covers /sign and /attest/verify.
export const authorityRouter = createAuthorityRouter();
