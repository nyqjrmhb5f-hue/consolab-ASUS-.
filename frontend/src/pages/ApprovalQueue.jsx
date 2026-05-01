import { useState } from "react";
import { api } from "../api.js";
import ChannelSection from "../components/ChannelSection.jsx";
import { prettyJson } from "../lib/present.js";

function ApprovalLane({ title, scope, items, busyKey, onApprove }) {
  return (
    <section className="queue-lane">
      <div className="queue-lane-header">
        <h3>{title}</h3>
        <span className="queue-count">{items.length} pending</span>
      </div>

      <div className="queue-list">
        {items.length ? (
          items.map((item) => {
            const key = `${scope}:${item.tracking_id}`;
            const waitingOn = (item.approvals_required || []).filter(
              (approvalScope) => item.approval_state?.[approvalScope]?.status !== "approved"
            );

            return (
              <article key={item.tracking_id} className="queue-item">
                <div className="queue-item-header">
                  <div>
                    <p className="queue-item-title">{item.action}</p>
                    <p className="queue-item-subtitle">{item.tracking_id}</p>
                  </div>
                  <span className={`queue-chip ${item.risk === "high" ? "warn" : "ok"}`}>{item.risk || "standard"}</span>
                </div>

                <div className="queue-meta">
                  <span className="queue-chip">{item.requested_by || "operator"}</span>
                  <span className="queue-chip">{item.source || "gateway_api"}</span>
                  <span className={`queue-chip ${waitingOn.length ? "warn" : "ok"}`}>
                    waiting: {waitingOn.length ? waitingOn.join(", ") : "clear"}
                  </span>
                </div>

                <p className="queue-item-copy">
                  Target: {item.target || "none"} | Received: {item.received_at || "unknown"}
                </p>

                <div className="queue-item-actions">
                  <button
                    type="button"
                    className="action-button"
                    onClick={() => onApprove(item.tracking_id, scope)}
                    disabled={busyKey === key}
                  >
                    {busyKey === key ? "Signing..." : `Sign ${scope}`}
                  </button>
                </div>
              </article>
            );
          })
        ) : (
          <div className="queue-empty">No pending approvals in this lane.</div>
        )}
      </div>
    </section>
  );
}

export default function ApprovalQueue({ approvals, onRefresh }) {
  const executive = approvals?.executive || [];
  const tunnel = approvals?.tunnel || [];
  const [busyKey, setBusyKey] = useState("");
  const [message, setMessage] = useState("");

  async function handleApprove(trackingId, scope) {
    const key = `${scope}:${trackingId}`;
    setBusyKey(key);
    setMessage("");

    try {
      if (scope === "executive") {
        await api.signExecutiveApproval(trackingId, {
          approved_by: "consolelab-codex",
          note: "Approved from the ConsoleLab cockpit."
        });
      } else {
        await api.signTunnelApproval(trackingId, {
          approved_by: "consolelab-codex",
          note: "Tunnel scope approved from the ConsoleLab cockpit."
        });
      }

      setMessage(`${scope} approval signed for ${trackingId}.`);
      if (onRefresh) {
        await onRefresh();
      }
    } catch (error) {
      const detail = error?.payload ? prettyJson(error.payload) : error?.message || "Approval failed.";
      setMessage(detail);
    } finally {
      setBusyKey("");
    }
  }

  return (
    <ChannelSection
      eyebrow="Executive Gates"
      title="Approval Queue"
      description="High-risk actions pause here until governance and tunnel sign-offs are complete."
      cards={[
        { label: "Executive Pending", value: String(executive.length), tone: executive.length ? "warn" : "ok" },
        { label: "Tunnel Pending", value: String(tunnel.length), tone: tunnel.length ? "warn" : "ok" },
        { label: "Human Loop", value: "Active", tone: "ok" }
      ]}
    >
      {message ? <div className={`status-banner ${/failed|error|pending/i.test(message) ? "warn" : "ok"}`}>{message}</div> : null}

      <div className="queue-lanes">
        <ApprovalLane title="Executive Sign-Off" scope="executive" items={executive} busyKey={busyKey} onApprove={handleApprove} />
        <ApprovalLane title="Tunnel Sign-Off" scope="tunnel" items={tunnel} busyKey={busyKey} onApprove={handleApprove} />
      </div>

      <div className="matrix-wrap">
        <div className="code-shell matrix-detail-shell">
          <div className="code-shell-title">Executive Approval Queue</div>
          <pre>{prettyJson(executive)}</pre>
        </div>
        <div className="code-shell matrix-detail-shell">
          <div className="code-shell-title">Tunnel Approval Queue</div>
          <pre>{prettyJson(tunnel)}</pre>
        </div>
      </div>
    </ChannelSection>
  );
}
