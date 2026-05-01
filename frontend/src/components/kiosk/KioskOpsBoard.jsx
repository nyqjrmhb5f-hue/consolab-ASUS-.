import { toneForStatus } from "../../lib/liveTv.js";

function metric(label, value, tone = "ok") {
  return { label, value, tone };
}

export default function KioskOpsBoard({
  gatewayStatus,
  approvalQueues,
  operationsQueues,
  tunnelFabric,
  evidenceSnapshot,
  brainModules,
  agentGatewayState
}) {
  const metrics = [
    metric("Gateway Intake", String(gatewayStatus?.queues?.intake || 0), gatewayStatus?.queues?.intake ? "warn" : "ok"),
    metric("Exec Gates", String(approvalQueues?.executive?.length || 0), approvalQueues?.executive?.length ? "warn" : "ok"),
    metric("Tunnel Gates", String(approvalQueues?.tunnel?.length || 0), approvalQueues?.tunnel?.length ? "warn" : "ok"),
    metric("OPS Active", String(operationsQueues?.active?.length || 0), operationsQueues?.active?.length ? "warn" : "ok"),
    metric("Evidence", String(evidenceSnapshot?.events_count || 0), "ok"),
    metric("Connectors", String(brainModules?.summary?.connector_count || 0), "ok"),
    metric("Staged Tunnels", String(tunnelFabric?.summary?.staged_tunnels || 0), tunnelFabric?.summary?.staged_tunnels ? "warn" : "ok"),
    metric("Agent Sessions", String(agentGatewayState?.summary?.sessions || 0), "ok")
  ];

  return (
    <section className="tv-panel">
      <div className="tv-panel-head">
        <div>
          <p className="tv-panel-kicker">LIVE OPS</p>
          <h2>Operations Board</h2>
        </div>
        <span className="tv-panel-meta">bounded room signals</span>
      </div>

      <div className="tv-metric-grid">
        {metrics.map((item) => (
          <article className={`tv-metric tone-${toneForStatus(item.tone)}`} key={item.label}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </article>
        ))}
      </div>
    </section>
  );
}
