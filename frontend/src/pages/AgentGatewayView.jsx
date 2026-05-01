import ChannelSection from "../components/ChannelSection.jsx";
import { prettyJson } from "../lib/present.js";

export default function AgentGatewayView({ agentGatewayState }) {
  const sessions = agentGatewayState?.sessions || [];
  const approvals = agentGatewayState?.approvals || [];

  return (
    <ChannelSection
      eyebrow="Shared Backbone"
      title="AGENT-GATEWAY"
      description="Resident agent broker state spanning session envelopes, approval mirrors, MCP link artifacts, and tool routing surfaces."
      cards={[
        { label: "Sessions", value: String(agentGatewayState?.summary?.sessions || 0), tone: "ok" },
        { label: "Approvals", value: String(agentGatewayState?.summary?.approvals || 0), tone: approvals.length ? "warn" : "ok" },
        { label: "Agents", value: String(agentGatewayState?.summary?.agents || 0), tone: "ok" },
        { label: "MCP Links", value: String(agentGatewayState?.summary?.mcp_links || 0), tone: "ok" },
        { label: "Tool Routes", value: String(agentGatewayState?.summary?.tool_routes || 0), tone: "ok" }
      ]}
    >
      <div className="matrix-wrap">
        <div className="code-shell matrix-detail-shell">
          <div className="code-shell-title">Recent Sessions</div>
          <pre>{prettyJson(sessions)}</pre>
        </div>
        <div className="code-shell matrix-detail-shell">
          <div className="code-shell-title">Gateway Snapshot</div>
          <pre>{prettyJson(agentGatewayState || {})}</pre>
        </div>
      </div>
    </ChannelSection>
  );
}
