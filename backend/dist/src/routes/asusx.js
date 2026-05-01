import { Router } from "express";
import { getAsusxStatus, verifyAttestation, signPayload } from "../services/asusxAttestation.js";
import { getAsusxChannel, getAsusxChannels } from "../services/asusxChannels.js";
import { writeEvidence } from "../services/evidenceWriter.js";

export const asusxRouter = Router();

function getSourceIp(req) {
  return req.header("x-forwarded-for")?.split(",")[0]?.trim() || req.socket.remoteAddress || "unknown";
}

function getSealId(req) {
  return req.header("cf-ray") || "unknown";
}

asusxRouter.get("/asusx/status", async (req, res) => {
  const result = await getAsusxStatus();
  await writeEvidence({
    component: "asusx",
    action: "status",
    result: result.ok ? "ok" : "fail",
    source_ip: getSourceIp(req),
    seal_id: getSealId(req)
  }).catch(() => {});
  res.status(result.ok ? 200 : 502).json(result.ok ? result.data : result);
});

asusxRouter.get("/asusx/channels", async (req, res) => {
  const data = getAsusxChannels();
  await writeEvidence({
    component: "asusx",
    action: "channels",
    result: "ok",
    source_ip: getSourceIp(req),
    seal_id: getSealId(req)
  }).catch(() => {});
  res.json({
    generatedAtUtc: new Date().toISOString(),
    items: data
  });
});

asusxRouter.get("/asusx/channels/:roomId", async (req, res) => {
  const data = getAsusxChannel(req.params.roomId);
  const result = data ? "ok" : "missing";
  await writeEvidence({
    component: "asusx",
    action: "channel.detail",
    result,
    source_ip: getSourceIp(req),
    seal_id: getSealId(req)
  }).catch(() => {});
  if (!data) {
    return res.status(404).json({ ok: false, error: "room_not_found" });
  }
  return res.json(data);
});

asusxRouter.post("/asusx/attest/verify", async (req, res) => {
  const result = await verifyAttestation(req.body || {});
  await writeEvidence({
    component: "asusx",
    action: "attest.verify",
    result: result.ok ? "ok" : "fail",
    source_ip: getSourceIp(req),
    seal_id: getSealId(req)
  }).catch(() => {});
  res.status(result.ok ? 200 : 502).json(result.ok ? result.data : result);
});

asusxRouter.post("/asusx/sign", async (req, res) => {
  const result = await signPayload(req.body || {});
  await writeEvidence({
    component: "asusx",
    action: "sign",
    result: result.ok ? "ok" : "fail",
    source_ip: getSourceIp(req),
    seal_id: getSealId(req)
  }).catch(() => {});
  res.status(result.ok ? 200 : 502).json(result.ok ? result.data : result);
});
