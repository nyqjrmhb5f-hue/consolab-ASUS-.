import { startTransition, useEffect, useState } from "react";
import { api } from "./api.js";
import { prettyJson } from "./lib/present.js";
import ChannelSection from "./components/ChannelSection.jsx";
import EvidenceReviewRoom from "./pages/EvidenceReviewRoom.jsx";
import InfrastructureRoom from "./pages/InfrastructureRoom.jsx";
import KioskView from "./pages/KioskView.jsx";
import RoomArchitecture from "./pages/RoomArchitecture.jsx";
import BackboneFeed from "./pages/BackboneFeed.jsx";
import ChronosRail from "./pages/ChronosRail.jsx";
import ApprovalQueue from "./pages/ApprovalQueue.jsx";
import OperationsQueue from "./pages/OperationsQueue.jsx";
import OperatorDeck from "./pages/OperatorDeck.jsx";
import BrainModules from "./pages/BrainModules.jsx";
import TunnelFabric from "./pages/TunnelFabric.jsx";
import AgentGatewayView from "./pages/AgentGatewayView.jsx";

export default function App() {
  const [topology, setTopology] = useState(null);
  const [roomRegistry, setRoomRegistry] = useState(null);
  const [roomStates, setRoomStates] = useState(null);
  const [chronos, setChronos] = useState(null);
  const [brainModules, setBrainModules] = useState(null);
  const [tunnelFabric, setTunnelFabric] = useState(null);
  const [agentGatewayState, setAgentGatewayState] = useState(null);
  const [gatewayStatus, setGatewayStatus] = useState(null);
  const [gatewayIntakeFeed, setGatewayIntakeFeed] = useState(null);
  const [gatewayExecutionFeed, setGatewayExecutionFeed] = useState(null);
  const [approvalQueues, setApprovalQueues] = useState(null);
  const [operationsQueues, setOperationsQueues] = useState(null);
  const [evidenceSnapshot, setEvidenceSnapshot] = useState(null);
  const [telemetrySnapshot, setTelemetrySnapshot] = useState(null);
  const isKiosk = typeof window !== "undefined" && window.location.pathname === "/kiosk";

  async function loadSurface() {
    if (isKiosk) {
      const liveTvData = await api.liveTv().catch(() => ({
        error: "unavailable",
        topology: { nodes: [], edges: [], diagram: "" },
        room_registry: { system: { cockpit: "kitty", brain_shell: "zsh" }, rooms: [], engines: [] },
        room_states: { summary: { total: 0, up: 0, degraded: 0, down: 0 }, items: [] },
        chronos: { items: [] },
        brain_modules: { summary: { total: 0, up: 0, down: 0, connector_count: 0, workflow_count: 0 }, modules: [], inventory: { connectors: [] } },
        tunnel_fabric: { summary: { approvals: 0, staged_tunnels: 0, closed_tunnels: 0, session_events: 0 }, approvals: [], tunnels: [], session_control: [] },
        agent_gateway: { summary: { sessions: 0, approvals: 0, agents: 0, mcp_links: 0, tool_routes: 0 }, sessions: [], approvals: [] },
        gateway_status: { queues: {} },
        approval_queues: { executive: [], tunnel: [] },
        operations_queues: { intake: [], active: [], executed: [], rejected: [], rolled_back: [], completed: [], failed: [] },
        evidence_snapshot: { events_count: 0, seal_records_count: 0 },
        telemetry_snapshot: { infrastructure: { hostname: "unknown" } }
      }));

      return {
        liveTvData,
        topologyData: liveTvData.topology,
        roomRegistryData: liveTvData.room_registry,
        roomStatesData: liveTvData.room_states,
        chronosData: liveTvData.chronos,
        brainModulesData: liveTvData.brain_modules,
        tunnelFabricData: liveTvData.tunnel_fabric,
        agentGatewayStateData: liveTvData.agent_gateway,
        gatewayStatusData: liveTvData.gateway_status,
        gatewayIntakeFeedData: { items: [] },
        gatewayExecutionFeedData: { items: [] },
        approvalQueuesData: liveTvData.approval_queues,
        operationsQueuesData: liveTvData.operations_queues,
        evidenceSnapshotData: liveTvData.evidence_snapshot,
        telemetrySnapshotData: liveTvData.telemetry_snapshot
      };
    }

    const [
      topologyData,
      roomRegistryData,
      roomStatesData,
      chronosData,
      brainModulesData,
      tunnelFabricData,
      agentGatewayStateData,
      gatewayStatusData,
      gatewayIntakeFeedData,
      gatewayExecutionFeedData,
      approvalQueuesData,
      operationsQueuesData,
      evidenceSnapshotData,
      telemetrySnapshotData
    ] = await Promise.all([
      api.topology().catch(() => ({ error: "unavailable", nodes: [], edges: [] })),
      api.rooms().catch(() => ({ error: "unavailable", rooms: [], engines: [] })),
      api.roomStates().catch(() => ({ error: "unavailable", summary: { total: 0, up: 0, degraded: 0, down: 0 }, items: [] })),
      api.chronos().catch(() => ({ error: "unavailable", items: [] })),
      api.brainModules().catch(() => ({ error: "unavailable", summary: { total: 0, up: 0, down: 0 }, modules: [], inventory: { connectors: [] } })),
      api.tunnelFabric().catch(() => ({ error: "unavailable", summary: { approvals: 0, staged_tunnels: 0, closed_tunnels: 0, session_events: 0 }, tunnels: [], approvals: [] })),
      api.agentGatewayState().catch(() => ({ error: "unavailable", summary: { sessions: 0, approvals: 0, agents: 0, mcp_links: 0, tool_routes: 0 }, sessions: [], approvals: [] })),
      api.gatewayStatus().catch(() => ({ error: "unavailable", queues: {} })),
      api.gatewayIntakeFeed(12).catch(() => ({ error: "unavailable", items: [] })),
      api.gatewayExecutionFeed(12).catch(() => ({ error: "unavailable", items: [] })),
      api.approvalQueues().catch(() => ({ error: "unavailable", executive: [], tunnel: [] })),
      api.operationsQueues().catch(() => ({ error: "unavailable", intake: [], active: [], executed: [], rejected: [], rolled_back: [], completed: [], failed: [] })),
      api.evidenceReader(120).catch(() => ({ error: "unavailable", events_count: 0, seal_records_count: 0 })),
      api.telemetryCollector().catch(() => ({ error: "unavailable" }))
    ]);

    return {
      topologyData,
      roomRegistryData,
      roomStatesData,
      chronosData,
      brainModulesData,
      tunnelFabricData,
      agentGatewayStateData,
      gatewayStatusData,
      gatewayIntakeFeedData,
      gatewayExecutionFeedData,
      approvalQueuesData,
      operationsQueuesData,
      evidenceSnapshotData,
      telemetrySnapshotData
    };
  }

  function applySurface(data) {
    setTopology(data.topologyData);
    setRoomRegistry(data.roomRegistryData);
    setRoomStates(data.roomStatesData);
    setChronos(data.chronosData);
    setBrainModules(data.brainModulesData);
    setTunnelFabric(data.tunnelFabricData);
    setAgentGatewayState(data.agentGatewayStateData);
    setGatewayStatus(data.gatewayStatusData);
    setGatewayIntakeFeed(data.gatewayIntakeFeedData);
    setGatewayExecutionFeed(data.gatewayExecutionFeedData);
    setApprovalQueues(data.approvalQueuesData);
    setOperationsQueues(data.operationsQueuesData);
    setEvidenceSnapshot(data.evidenceSnapshotData);
    setTelemetrySnapshot(data.telemetrySnapshotData);
  }

  async function refreshSurface() {
    const data = await loadSurface();
    startTransition(() => {
      applySurface(data);
    });
  }

  useEffect(() => {
    let active = true;

    async function refresh() {
      const data = await loadSurface();

      if (!active) return;
      startTransition(() => {
        applySurface(data);
      });
    }

    refresh();
    const timer = window.setInterval(refresh, 30000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const topSignals = [
    { label: "Rooms", value: String(roomRegistry?.rooms?.length || 0) },
    { label: "Engines", value: String(roomRegistry?.engines?.length || 0) },
    { label: "Ready", value: String(roomStates?.summary?.up || 0) },
    { label: "Watch", value: String(roomStates?.summary?.degraded || 0) },
    { label: "Approvals", value: String((approvalQueues?.executive?.length || 0) + (approvalQueues?.tunnel?.length || 0)) },
    { label: "Evidence Events", value: String(evidenceSnapshot?.events_count || 0) },
    { label: "Connectors", value: String(brainModules?.summary?.connector_count || 0) },
    { label: "Next Event", value: chronos?.items?.[0]?.countdown || "n/a" },
    { label: "Host", value: telemetrySnapshot?.infrastructure?.hostname || "unknown" },
    { label: "Tunnel Sessions", value: String(tunnelFabric?.summary?.staged_tunnels || 0) },
    { label: "Brain Shell", value: roomRegistry?.system?.brain_shell || "zsh" }
  ];

  const leftRail = topSignals.slice(0, 3);
  const rightRail = [
    { label: "Cockpit", value: roomRegistry?.system?.cockpit || "kitty" },
    { label: "Brain", value: roomRegistry?.system?.brain_shell || "zsh" },
    { label: "Mode", value: "Layered Modular Build" }
  ];

  if (isKiosk) {
    return (
      <KioskView
        roomRegistry={roomRegistry}
        roomStates={roomStates}
        chronos={chronos}
        gatewayStatus={gatewayStatus}
        approvalQueues={approvalQueues}
        operationsQueues={operationsQueues}
        evidenceSnapshot={evidenceSnapshot}
        telemetrySnapshot={telemetrySnapshot}
        brainModules={brainModules}
        tunnelFabric={tunnelFabric}
        agentGatewayState={agentGatewayState}
      />
    );
  }

  return (
    <main className="container container-channel">
      <header className="hero hero-stage">
        <aside className="hero-rail">
          {leftRail.map((item) => (
            <div className="hero-tool" key={item.label}>
              <span className="hero-tool-label">{item.label}</span>
              <strong>{item.value}</strong>
            </div>
          ))}
        </aside>
        <div className="hero-center">
          <p className="hero-kicker">CONSOLELAB | KITTY COCKPIT | ZSH CENTRAL BRAIN</p>
          <div className="hero-mark">
            <span className="hero-mark-main">ConsoleLab</span>
            <span className="hero-mark-sub">Room-Based Control Surface</span>
          </div>
          <p className="hero-copy">
            One layered ConsoleLab surface with bounded rooms, named engines, a shared backbone,
            and an evidence-linked central brain.
          </p>
        </div>
        <aside className="hero-rail">
          {rightRail.map((item) => (
            <div className="hero-tool" key={item.label}>
              <span className="hero-tool-label">{item.label}</span>
              <strong>{item.value}</strong>
            </div>
          ))}
        </aside>
      </header>

      <ChannelSection
        eyebrow="Live Signals"
        title="Topline Broadcast"
        description="Fast-glance operating signals shaped for control-room clarity."
        cards={topSignals}
      >
          <div className="code-shell">
          <div className="code-shell-title">ConsoleLab Status Feed</div>
          <pre>{prettyJson({ topology, roomRegistry, roomStates, chronos, gatewayStatus, approvalQueues, operationsQueues, evidenceSnapshot, telemetrySnapshot })}</pre>
        </div>
      </ChannelSection>

      <RoomArchitecture roomRegistry={roomRegistry} roomStates={roomStates} topology={topology} />
      <ChronosRail chronos={chronos} />
      <BrainModules brainModules={brainModules} />
      <OperatorDeck
        gatewayStatus={gatewayStatus}
        gatewayFeed={{ intake: gatewayIntakeFeed, execution: gatewayExecutionFeed }}
        onRefresh={refreshSurface}
      />
      <BackboneFeed
        gatewayStatus={gatewayStatus}
        gatewayIntakeFeed={gatewayIntakeFeed}
        gatewayExecutionFeed={gatewayExecutionFeed}
      />
      <TunnelFabric tunnelFabric={tunnelFabric} onRefresh={refreshSurface} />
      <AgentGatewayView agentGatewayState={agentGatewayState} />
      <ApprovalQueue approvals={approvalQueues} onRefresh={refreshSurface} />
      <OperationsQueue queues={operationsQueues} onRefresh={refreshSurface} />
      <EvidenceReviewRoom evidenceSnapshot={evidenceSnapshot} />
      <InfrastructureRoom telemetrySnapshot={telemetrySnapshot} />
    </main>
  );
}
