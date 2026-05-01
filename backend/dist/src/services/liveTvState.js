import { readEvidenceSnapshot } from "../../evidence_reader/evidenceReader.js";
import { collectTelemetrySnapshot } from "../../telemetry_collector/telemetryCollector.js";
import { getAgentGatewayState } from "./agentGateway.js";
import { getBrainModules } from "./brainModules.js";
import { getChronosTimeline } from "./chronosTimeline.js";
import { getGatewayStatus } from "./commandIntake.js";
import { getApprovalQueues, getOperationsQueues } from "./commandWorkflow.js";
import { getRoomRegistry, getRoomTopology } from "./roomRegistry.js";
import { getConsoleLabRoomStates } from "./roomState.js";
import { getTunnelFabricState } from "./tunnelFabric.js";

function trimItems(items = [], limit = 6) {
  return Array.isArray(items) ? items.slice(0, limit) : [];
}

function trimTopology(payload) {
  return {
    timestamp: payload.timestamp,
    system: payload.system,
    nodes: payload.nodes,
    edges: payload.edges
  };
}

function trimRoomStates(payload) {
  return {
    ...payload,
    items: (payload.items || []).map((item) => ({
      room_id: item.room_id,
      title: item.title,
      primary_engine: item.primary_engine,
      role: item.role,
      overall_status: item.overall_status,
      up: item.up,
      degraded: item.degraded,
      down: item.down,
      checks: trimItems(item.checks, 3)
    }))
  };
}

function trimEvidence(payload) {
  return {
    timestamp: payload.timestamp,
    events_count: payload.events_count,
    seal_records_count: payload.seal_records_count,
    events: trimItems(payload.events, 6).map((item) => ({
      event_id: item.event_id,
      tx_hash: item.tx_hash,
      timestamp: item.entry?.timestamp || null,
      component: item.entry?.component || null,
      action: item.entry?.action || null,
      result: item.entry?.result || null
    })),
    seal_records: trimItems(payload.seal_records, 3)
  };
}

function trimTelemetry(payload) {
  return {
    timestamp: payload.timestamp,
    infrastructure: payload.infrastructure,
    services: {
      asus: payload.services?.asus
        ? {
            machine: payload.services.asus.machine,
            status: payload.services.asus.status,
            systemState: payload.services.asus.systemState,
            attestation: payload.services.asus.attestation
          }
        : null,
      dell: payload.services?.dell
        ? {
            machine: payload.services.dell.machine,
            reachable: payload.services.dell.reachable,
            systemState: payload.services.dell.systemState
          }
        : null,
      runtime_metrics: payload.services?.runtime_metrics
        ? {
            status: payload.services.runtime_metrics.status
          }
        : null
    }
  };
}

export async function getLiveTvState() {
  const [
    roomRegistry,
    topology,
    roomStates,
    chronos,
    brainModules,
    tunnelFabric,
    agentGateway,
    gatewayStatus,
    approvalQueues,
    operationsQueues,
    evidenceSnapshot,
    telemetrySnapshot
  ] = await Promise.all([
    Promise.resolve(getRoomRegistry()),
    Promise.resolve(getRoomTopology()),
    Promise.resolve(getConsoleLabRoomStates()),
    getChronosTimeline(),
    getBrainModules(),
    getTunnelFabricState(),
    getAgentGatewayState(),
    getGatewayStatus(),
    getApprovalQueues(),
    getOperationsQueues(),
    readEvidenceSnapshot(24),
    collectTelemetrySnapshot()
  ]);

  const approvalCount = (approvalQueues.executive?.length || 0) + (approvalQueues.tunnel?.length || 0);

  return {
    timestamp: new Date().toISOString(),
    system: roomRegistry.system,
    summary: {
      rooms: roomRegistry.rooms.length,
      ready: roomStates.summary.up,
      watch: roomStates.summary.degraded,
      down: roomStates.summary.down,
      approvals: approvalCount,
      intake: gatewayStatus.queues?.intake || 0,
      connectors: brainModules.summary?.connector_count || 0,
      workflows: brainModules.summary?.workflow_count || 0,
      staged_tunnels: tunnelFabric.summary?.staged_tunnels || 0,
      evidence_events: evidenceSnapshot.events_count || 0,
      host: telemetrySnapshot.infrastructure?.hostname || "unknown",
      next_event: chronos.items?.[0]?.label || null,
      next_event_at_utc: chronos.items?.[0]?.next_occurs_at_utc || null
    },
    topology: trimTopology(topology),
    room_registry: roomRegistry,
    room_states: trimRoomStates(roomStates),
    chronos,
    brain_modules: {
      ...brainModules,
      modules: trimItems(brainModules.modules, 6)
    },
    tunnel_fabric: {
      ...tunnelFabric,
      approvals: trimItems(tunnelFabric.approvals, 6),
      tunnels: trimItems(tunnelFabric.tunnels, 6),
      approved_audit: trimItems(tunnelFabric.approved_audit, 4),
      session_control: trimItems(tunnelFabric.session_control, 6),
      closed_audit: trimItems(tunnelFabric.closed_audit, 6)
    },
    agent_gateway: {
      ...agentGateway,
      sessions: trimItems(agentGateway.sessions, 6),
      approvals: trimItems(agentGateway.approvals, 6),
      agents: trimItems(agentGateway.agents, 4),
      mcp_links: trimItems(agentGateway.mcp_links, 4),
      tool_routes: trimItems(agentGateway.tool_routes, 4)
    },
    gateway_status: gatewayStatus,
    approval_queues: {
      ...approvalQueues,
      executive: trimItems(approvalQueues.executive, 6),
      tunnel: trimItems(approvalQueues.tunnel, 6)
    },
    operations_queues: {
      ...operationsQueues,
      intake: trimItems(operationsQueues.intake, 6),
      active: trimItems(operationsQueues.active, 6),
      completed: trimItems(operationsQueues.completed, 6),
      failed: trimItems(operationsQueues.failed, 6)
    },
    evidence_snapshot: trimEvidence(evidenceSnapshot),
    telemetry_snapshot: trimTelemetry(telemetrySnapshot)
  };
}
