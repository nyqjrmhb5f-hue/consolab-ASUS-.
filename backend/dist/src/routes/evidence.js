import { Router } from "express";
import { getEvidenceRecord, getEvidenceStatus, getEvidenceTail, verifyEvidenceAttestation, verifyEvidenceHash } from "../services/evidenceVerifier.js";
import { writeEvidence } from "../services/evidenceWriter.js";

export const evidenceRouter = Router();

function getSourceIp(req) {
  return req.header("x-forwarded-for")?.split(",")[0]?.trim() || req.socket.remoteAddress || "unknown";
}

function getSealId(req) {
  return req.header("cf-ray") || "unknown";
}

evidenceRouter.get("/evidence/status", async (req, res) => {
  const payload = await getEvidenceStatus();
  await writeEvidence({
    component: "evidence_api",
    action: "status.read",
    result: ["attestation_ready", "attestation_enforced"].includes(payload.status) ? "ok" : "watch",
    source_ip: getSourceIp(req),
    seal_id: getSealId(req),
    details: {
      status: payload.status,
      counts: payload.counts,
      signing: payload.signing
    }
  }).catch(() => {});
  res.json(payload);
});

evidenceRouter.get("/evidence/tail", async (req, res) => {
  const payload = await getEvidenceTail(req.query.limit || 8);
  await writeEvidence({
    component: "evidence_api",
    action: "tail.read",
    result: "ok",
    source_ip: getSourceIp(req),
    seal_id: getSealId(req),
    details: {
      runtime_count: payload.runtime_journals.length,
      hash_count: payload.tx_hashes.length,
      signer_count: payload.signer_events.length
    }
  }).catch(() => {});
  res.json(payload);
});

evidenceRouter.get("/evidence/verify/:hash", async (req, res) => {
  const payload = await verifyEvidenceHash(req.params.hash);
  await writeEvidence({
    component: "evidence_api",
    action: "verify.hash",
    result: payload.found ? "ok" : "watch",
    source_ip: getSourceIp(req),
    seal_id: getSealId(req),
    details: {
      tx_hash: payload.tx_hash,
      verification: payload.verification,
      attested: payload.attested
    }
  }).catch(() => {});
  res.status(payload.found ? 200 : 404).json(payload);
});

evidenceRouter.get("/evidence/attestation/:id/verify", async (req, res) => {
  const payload = await verifyEvidenceAttestation(req.params.id);
  await writeEvidence({
    component: "evidence_api",
    action: "verify.attestation",
    result: payload?.ok ? "ok" : "watch",
    source_ip: getSourceIp(req),
    seal_id: getSealId(req),
    details: {
      query: req.params.id,
      found: Boolean(payload?.found),
      verification: payload?.verification || "not_found"
    }
  }).catch(() => {});

  if (!payload) {
    return res.status(404).json({ ok: false, error: "not_found" });
  }

  return res.status(payload.ok ? 200 : 409).json(payload);
});

evidenceRouter.get("/evidence/:id", async (req, res) => {
  const payload = await getEvidenceRecord(req.params.id);
  await writeEvidence({
    component: "evidence_api",
    action: "record.read",
    result: payload ? "ok" : "watch",
    source_ip: getSourceIp(req),
    seal_id: getSealId(req),
    details: {
      query: req.params.id,
      found: Boolean(payload)
    }
  }).catch(() => {});

  if (!payload) {
    return res.status(404).json({ ok: false, error: "not_found" });
  }

  return res.json(payload);
});
