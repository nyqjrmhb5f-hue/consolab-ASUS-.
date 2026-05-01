import { useState } from "react";
import { api } from "../api.js";
import ChannelSection from "../components/ChannelSection.jsx";
import { prettyJson } from "../lib/present.js";

export default function TunnelFabric({ tunnelFabric, onRefresh }) {
  const [busyId, setBusyId] = useState("");
  const [message, setMessage] = useState("");
  const approvals = tunnelFabric?.approvals || [];
  const tunnels = tunnelFabric?.tunnels || [];
  const sessionControl = tunnelFabric?.session_control || [];
  const activeTunnels = tunnels.filter((item) => item?.status !== "closed");

  async function handleClose(trackingId) {
    setBusyId(trackingId);
    setMessage("");

    try {
      await api.closeTunnel(trackingId, {
        closed_by: "consolelab-cockpit",
        reason: "operator_closed_from_ui"
      });
      setMessage(`Tunnel ${trackingId} closed through SYNAPSE-BRIDGE.`);
      if (onRefresh) {
        await onRefresh();
      }
    } catch (error) {
      const detail = error?.payload ? prettyJson(error.payload) : error?.message || "Tunnel close failed.";
      setMessage(detail);
    } finally {
      setBusyId("");
    }
  }

  return (
    <ChannelSection
      eyebrow="Intelligence Tunnel"
      title="SYNAPSE-BRIDGE Fabric"
      description="Zero-trust tunnel approvals, staged tunnel definitions, and close events controlled through the tunnel fabric."
      cards={[
        { label: "Pending Approvals", value: String(tunnelFabric?.summary?.approvals || 0), tone: tunnelFabric?.summary?.approvals ? "warn" : "ok" },
        { label: "Staged Tunnels", value: String(tunnelFabric?.summary?.staged_tunnels || 0), tone: activeTunnels.length ? "warn" : "ok" },
        { label: "Closed", value: String(tunnelFabric?.summary?.closed_tunnels || 0), tone: "ok" },
        { label: "Session Events", value: String(tunnelFabric?.summary?.session_events || 0), tone: "ok" }
      ]}
    >
      {message ? <div className={`status-banner ${/failed|error/i.test(message) ? "bad" : "ok"}`}>{message}</div> : null}

      <div className="queue-lanes">
        {activeTunnels.length ? (
          activeTunnels.map((item) => (
            <article key={item.tracking_id} className="queue-item">
              <div className="queue-item-header">
                <div>
                  <p className="queue-item-title">{item.action || "open_remote_tunnel"}</p>
                  <p className="queue-item-subtitle">{item.tracking_id}</p>
                </div>
                <span className="queue-chip warn">{item.status || "approved_staged"}</span>
              </div>
              <p className="queue-item-copy">
                Target: {item.target || "unknown"} | Created: {item.created_at || "unknown"}
              </p>
              <div className="queue-item-actions">
                <button
                  type="button"
                  className="action-button secondary"
                  onClick={() => handleClose(item.tracking_id)}
                  disabled={busyId === item.tracking_id}
                >
                  {busyId === item.tracking_id ? "Closing..." : "Close Tunnel"}
                </button>
              </div>
            </article>
          ))
        ) : (
          <div className="queue-empty">No staged tunnels currently open.</div>
        )}
      </div>

      <div className="matrix-wrap">
        <div className="code-shell matrix-detail-shell">
          <div className="code-shell-title">Tunnel Approvals</div>
          <pre>{prettyJson(approvals)}</pre>
        </div>
        <div className="code-shell matrix-detail-shell">
          <div className="code-shell-title">Session Control Events</div>
          <pre>{prettyJson(sessionControl)}</pre>
        </div>
      </div>
    </ChannelSection>
  );
}
