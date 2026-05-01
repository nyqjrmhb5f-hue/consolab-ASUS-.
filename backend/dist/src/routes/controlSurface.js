import { Router } from "express";
import { getRuntimeBridgeState } from "../../runtime_bridge/runtimeBridge.js";
import { readEvidenceSnapshot } from "../../evidence_reader/evidenceReader.js";
import { collectTelemetrySnapshot } from "../../telemetry_collector/telemetryCollector.js";
import { getIntegrationStatus, getResponsibilityBoundary } from "../services/integrationStatus.js";
import { getRoomRegistry, getRoomTopology } from "../services/roomRegistry.js";
import { getConsoleLabRoomStates } from "../services/roomState.js";
import { getChronosTimeline } from "../services/chronosTimeline.js";
import { getBrainModules } from "../services/brainModules.js";
import { getAgentGatewayState } from "../services/agentGateway.js";
import { getTunnelFabricState } from "../services/tunnelFabric.js";
import { getLiveTvState } from "../services/liveTvState.js";
import { writeEvidence } from "../services/evidenceWriter.js";

export const controlSurfaceRouter = Router();

function getSourceIp(req) {
  return req.header("x-forwarded-for")?.split(",")[0]?.trim() || req.socket.remoteAddress || "unknown";
}

function getSealId(req) {
  return req.header("cf-ray") || "unknown";
}

controlSurfaceRouter.get("/control-surface/topology", async (req, res) => {
  const payload = getRoomTopology();

  await writeEvidence({
    component: "control_surface",
    action: "topology.read",
    result: "ok",
    source_ip: getSourceIp(req),
    seal_id: getSealId(req),
    details: { nodes: payload.nodes.length, edges: payload.edges.length }
  }).catch(() => {});

  res.json(payload);
});

controlSurfaceRouter.get("/control-surface/rooms", async (req, res) => {
  const payload = getRoomRegistry();

  await writeEvidence({
    component: "control_surface",
    action: "rooms.read",
    result: "ok",
    source_ip: getSourceIp(req),
    seal_id: getSealId(req),
    details: {
      room_count: payload.rooms.length,
      engine_count: payload.engines.length
    }
  }).catch(() => {});

  res.json(payload);
});

controlSurfaceRouter.get("/control-surface/room-states", async (req, res) => {
  const payload = getConsoleLabRoomStates();

  await writeEvidence({
    component: "control_surface",
    action: "room_states.read",
    result: payload.summary.overall === "HEALTHY" ? "ok" : "watch",
    source_ip: getSourceIp(req),
    seal_id: getSealId(req),
    details: payload.summary
  }).catch(() => {});

  res.json(payload);
});

controlSurfaceRouter.get("/control-surface/integrations", async (req, res) => {
  const payload = await getIntegrationStatus();
  await writeEvidence({
    component: "control_surface",
    action: "integrations.read",
    result: payload.summary.overall === "HEALTHY" ? "ok" : "degraded",
    source_ip: getSourceIp(req),
    seal_id: getSealId(req),
    details: payload.summary
  }).catch(() => {});
  res.json(payload);
});

controlSurfaceRouter.get("/control-surface/responsibilities", async (req, res) => {
  const payload = getResponsibilityBoundary();
  await writeEvidence({
    component: "control_surface",
    action: "responsibilities.read",
    result: "ok",
    source_ip: getSourceIp(req),
    seal_id: getSealId(req),
    details: { mode: payload.responsibilities.runtime_access_mode }
  }).catch(() => {});
  res.json(payload);
});

controlSurfaceRouter.get("/control-surface/runtime-bridge", async (req, res) => {
  const payload = await getRuntimeBridgeState();
  await writeEvidence({
    component: "runtime_bridge",
    action: "read.state",
    result: payload.state === "linked" ? "ok" : "degraded",
    source_ip: getSourceIp(req),
    seal_id: getSealId(req),
    details: { room_count: payload.room_count, room_source: payload.room_source }
  }).catch(() => {});
  res.json(payload);
});

controlSurfaceRouter.get("/control-surface/evidence-reader", async (req, res) => {
  const limit = Math.max(1, Math.min(Number(req.query.limit || 100), 500));
  const payload = await readEvidenceSnapshot(limit);
  await writeEvidence({
    component: "evidence_reader",
    action: "read.snapshot",
    result: "ok",
    source_ip: getSourceIp(req),
    seal_id: getSealId(req),
    details: { events_count: payload.events_count, seal_records_count: payload.seal_records_count }
  }).catch(() => {});
  res.json(payload);
});

controlSurfaceRouter.get("/control-surface/telemetry-collector", async (req, res) => {
  const payload = await collectTelemetrySnapshot();
  await writeEvidence({
    component: "telemetry_collector",
    action: "collect.metrics",
    result: "ok",
    source_ip: getSourceIp(req),
    seal_id: getSealId(req),
    details: {
      hostname: payload.infrastructure.hostname,
      cpu_count: payload.infrastructure.cpu_count,
      load_avg: payload.infrastructure.load_avg
    }
  }).catch(() => {});
  res.json(payload);
});

controlSurfaceRouter.get("/control-surface/chronos", async (req, res) => {
  const payload = await getChronosTimeline();
  await writeEvidence({
    component: "chronos",
    action: "timeline.read",
    result: "ok",
    source_ip: getSourceIp(req),
    seal_id: getSealId(req),
    details: { item_count: payload.items.length, next: payload.items[0]?.id || null }
  }).catch(() => {});
  res.json(payload);
});

controlSurfaceRouter.get("/control-surface/brain-modules", async (req, res) => {
  const payload = await getBrainModules();
  await writeEvidence({
    component: "core_prime",
    action: "brain_modules.read",
    result: payload.summary.down > 0 ? "watch" : "ok",
    source_ip: getSourceIp(req),
    seal_id: getSealId(req),
    details: payload.summary
  }).catch(() => {});
  res.json(payload);
});

controlSurfaceRouter.get("/control-surface/agent-gateway", async (req, res) => {
  const payload = await getAgentGatewayState();
  await writeEvidence({
    component: "agent_gateway",
    action: "state.read",
    result: "ok",
    source_ip: getSourceIp(req),
    seal_id: getSealId(req),
    details: payload.summary
  }).catch(() => {});
  res.json(payload);
});

controlSurfaceRouter.get("/control-surface/tunnel-fabric", async (req, res) => {
  const payload = await getTunnelFabricState();
  await writeEvidence({
    component: "synapse_bridge",
    action: "fabric.read",
    result: payload.summary.approvals > 0 ? "watch" : "ok",
    source_ip: getSourceIp(req),
    seal_id: getSealId(req),
    details: payload.summary
  }).catch(() => {});
  res.json(payload);
});

controlSurfaceRouter.get("/control-surface/live-tv", async (req, res) => {
  const payload = await getLiveTvState();
  await writeEvidence({
    component: "control_surface",
    action: "live_tv.read",
    result: payload.summary.watch > 0 || payload.summary.down > 0 ? "watch" : "ok",
    source_ip: getSourceIp(req),
    seal_id: getSealId(req),
    details: payload.summary
  }).catch(() => {});
  res.json(payload);
});
