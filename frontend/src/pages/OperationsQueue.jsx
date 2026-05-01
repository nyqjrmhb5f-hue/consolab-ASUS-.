import { useState } from "react";
import { api } from "../api.js";
import ChannelSection from "../components/ChannelSection.jsx";
import { prettyJson } from "../lib/present.js";

function pendingApprovals(item) {
  return (item.approvals_required || []).filter(
    (scope) => item.approval_state?.[scope]?.status !== "approved"
  );
}

function OperationsLane({ title, items, busyId, onDispatch }) {
  return (
    <section className="queue-lane">
      <div className="queue-lane-header">
        <h3>{title}</h3>
        <span className="queue-count">{items.length} jobs</span>
      </div>

      <div className="queue-list">
        {items.length ? (
          items.map((item) => {
            const approvals = pendingApprovals(item);
            const canDispatch = title === "Intake" && approvals.length === 0;

            return (
              <article key={item.tracking_id} className="queue-item">
                <div className="queue-item-header">
                  <div>
                    <p className="queue-item-title">{item.action}</p>
                    <p className="queue-item-subtitle">{item.tracking_id}</p>
                  </div>
                  <span className={`queue-chip ${item.status === "failed" ? "bad" : item.status === "completed" ? "ok" : "warn"}`}>
                    {item.status || "pending"}
                  </span>
                </div>

                <div className="queue-meta">
                  <span className="queue-chip">{item.target || "no target"}</span>
                  <span className={`queue-chip ${approvals.length ? "warn" : "ok"}`}>
                    approvals: {approvals.length ? approvals.join(", ") : "clear"}
                  </span>
                  {item.result?.kind ? <span className="queue-chip ok">{item.result.kind}</span> : null}
                </div>

                <p className="queue-item-copy">
                  {item.dispatch_state?.completed_at
                    ? `Completed: ${item.dispatch_state.completed_at}`
                    : item.received_at
                      ? `Received: ${item.received_at}`
                      : "Awaiting dispatch state."}
                </p>

                {canDispatch ? (
                  <div className="queue-item-actions">
                    <button
                      type="button"
                      className="action-button secondary"
                      onClick={() => onDispatch(item.tracking_id)}
                      disabled={busyId === item.tracking_id}
                    >
                      {busyId === item.tracking_id ? "Dispatching..." : "Dispatch"}
                    </button>
                  </div>
                ) : null}
              </article>
            );
          })
        ) : (
          <div className="queue-empty">No jobs in this lane right now.</div>
        )}
      </div>
    </section>
  );
}

export default function OperationsQueue({ queues, onRefresh }) {
  const intake = queues?.intake || [];
  const active = queues?.active || [];
  const completed = queues?.completed || [];
  const rolledBack = queues?.rolled_back || [];
  const failed = queues?.failed || [];
  const [busyId, setBusyId] = useState("");
  const [message, setMessage] = useState("");

  async function handleDispatch(trackingId) {
    setBusyId(trackingId);
    setMessage("");

    try {
      await api.dispatchCommand(trackingId, {
        dispatched_by: "consolelab-cockpit"
      });
      setMessage(`OPS-MATRIX dispatched ${trackingId}.`);
      if (onRefresh) {
        await onRefresh();
      }
    } catch (error) {
      const detail = error?.payload ? prettyJson(error.payload) : error?.message || "Dispatch failed.";
      setMessage(detail);
    } finally {
      setBusyId("");
    }
  }

  return (
    <ChannelSection
      eyebrow="Operations Room"
      title="OPS-MATRIX Queues"
      description="Live job movement through intake, active execution, completed results, and failures."
      cards={[
        { label: "Intake", value: String(intake.length), tone: intake.length ? "warn" : "ok" },
        { label: "Active", value: String(active.length), tone: active.length ? "warn" : "ok" },
        { label: "Completed", value: String(completed.length), tone: "ok" },
        { label: "Rolled Back", value: String(rolledBack.length), tone: rolledBack.length ? "warn" : "ok" },
        { label: "Failed", value: String(failed.length), tone: failed.length ? "bad" : "ok" }
      ]}
    >
      {message ? <div className={`status-banner ${/failed|error/i.test(message) ? "bad" : "ok"}`}>{message}</div> : null}

      <div className="queue-lanes">
        <OperationsLane title="Intake" items={intake} busyId={busyId} onDispatch={handleDispatch} />
        <OperationsLane title="Active" items={active} busyId={busyId} onDispatch={handleDispatch} />
        <OperationsLane title="Completed" items={completed} busyId={busyId} onDispatch={handleDispatch} />
        <OperationsLane title="Rolled Back" items={rolledBack} busyId={busyId} onDispatch={handleDispatch} />
        <OperationsLane title="Failed" items={failed} busyId={busyId} onDispatch={handleDispatch} />
      </div>

      <div className="matrix-wrap">
        <div className="code-shell matrix-detail-shell">
          <div className="code-shell-title">Intake / Active</div>
          <pre>{prettyJson({ intake, active })}</pre>
        </div>
        <div className="code-shell matrix-detail-shell">
          <div className="code-shell-title">Completed / Rolled Back / Failed</div>
          <pre>{prettyJson({ completed, rolled_back: rolledBack, failed })}</pre>
        </div>
      </div>
    </ChannelSection>
  );
}
