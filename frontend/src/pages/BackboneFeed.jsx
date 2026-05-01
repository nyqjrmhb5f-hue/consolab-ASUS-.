import ChannelSection from "../components/ChannelSection.jsx";
import { prettyJson } from "../lib/present.js";

function summarizeFeed(items = []) {
  return items.map((item) => ({
    timestamp: item.timestamp,
    tracking_id: item.tracking_id,
    action: item.action,
    lifecycle_state: item.lifecycle_state,
    event_kind: item.event_kind,
    control_state: item.control_state,
    status: item.status,
    command_class: item.command_class,
    detail: item.detail || null
  }));
}

export default function BackboneFeed({ gatewayStatus, gatewayIntakeFeed, gatewayExecutionFeed }) {
  const intakeItems = gatewayIntakeFeed?.items || [];
  const executionItems = gatewayExecutionFeed?.items || [];

  const cards = [
    { label: "Service", value: gatewayStatus?.service || "GATEWAY-API", tone: "ok" },
    { label: "Intake", value: String(gatewayStatus?.queues?.intake || 0), tone: "ok" },
    { label: "Execution Feed", value: String(executionItems.length), tone: executionItems.length ? "ok" : "warn" },
    { label: "Exec Approvals", value: String(gatewayStatus?.queues?.executive_approvals || 0), tone: "warn" },
    { label: "Tunnel Approvals", value: String(gatewayStatus?.queues?.tunnel_approvals || 0), tone: "warn" },
    { label: "Agent Sessions", value: String(gatewayStatus?.queues?.agent_sessions || 0), tone: "ok" }
  ];

  return (
    <ChannelSection
      eyebrow="Shared Backbone"
      title="Gateway Feed"
      description="Recent command envelopes staged by the Shared Backbone and brokered into the room tree."
      cards={cards}
    >
      <div className="matrix-wrap">
        <div className="code-shell matrix-detail-shell">
          <div className="code-shell-title">Gateway Status</div>
          <pre>{prettyJson(gatewayStatus || {})}</pre>
        </div>
        <div className="code-shell matrix-detail-shell">
          <div className="code-shell-title">Ingress Feed</div>
          <pre>{prettyJson(summarizeFeed(intakeItems))}</pre>
        </div>
        <div className="code-shell matrix-detail-shell">
          <div className="code-shell-title">Execution Feed</div>
          <pre>{prettyJson(summarizeFeed(executionItems))}</pre>
        </div>
      </div>
    </ChannelSection>
  );
}
