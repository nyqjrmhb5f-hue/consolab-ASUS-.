import { useState } from "react";
import { api } from "../api.js";
import ChannelSection from "../components/ChannelSection.jsx";
import { prettyJson } from "../lib/present.js";

const presets = [
  {
    id: "refresh-brain",
    label: "Refresh Brain",
    description: "Ask OPS-MATRIX to refresh the live state for the Central Brain room.",
    payload: {
      action: "refresh_room_state",
      target: "05_CENTRAL_BRAIN",
      requested_by: "consolelab-operator",
      source: "operator_console",
      details: {
        room_id: "05_CENTRAL_BRAIN"
      }
    }
  },
  {
    id: "read-chronos",
    label: "Read Chronos",
    description: "Pull the latest CHRONOS timeline and countdown rail through the gateway.",
    payload: {
      action: "read_chronos",
      target: "05_CENTRAL_BRAIN",
      requested_by: "consolelab-operator",
      source: "operator_console",
      details: {}
    }
  },
  {
    id: "read-gateway",
    label: "Read Gateway",
    description: "Check GATEWAY-API service status and recent brokered command feed.",
    payload: {
      action: "read_gateway_status",
      target: "10_SHARED_BACKBONE",
      requested_by: "consolelab-operator",
      source: "operator_console",
      details: {}
    }
  },
  {
    id: "stage-tunnel",
    label: "Stage Tunnel",
    description: "Create a high-risk tunnel request that must pass executive and tunnel approvals.",
    payload: {
      action: "open_remote_tunnel",
      target: "07_INTELLIGENCE_TUNNEL",
      requested_by: "consolelab-operator",
      source: "operator_console",
      details: {
        target: "ops-node-01",
        purpose: "remote_diagnostics"
      }
    }
  },
  {
    id: "deploy-feature-gate",
    label: "Deploy Gate",
    description: "Run a rollback-capable runtime mutation through OPS-MATRIX. This preset simulates a failed feature-gate deploy so the rollback lane is exercised.",
    payload: {
      action: "deploy_feature_gate",
      target: "03_OPERATIONS_ROOM",
      requested_by: "consolelab-operator",
      source: "operator_console",
      details: {
        gate_id: "withdrawals",
        enabled: false,
        simulate_failure: true
      }
    }
  }
];

function stringifyDetails(value) {
  return JSON.stringify(value || {}, null, 2);
}

function buildFormState(payload = presets[0].payload) {
  return {
    action: payload.action || "",
    target: payload.target || "",
    requested_by: payload.requested_by || "consolelab-operator",
    source: payload.source || "operator_console",
    details: stringifyDetails(payload.details)
  };
}

function normalizeError(error) {
  if (error?.payload) {
    return JSON.stringify(error.payload, null, 2);
  }
  return error?.message || "Command failed.";
}

function summarizeFeed(items = []) {
  return items.map((item) => ({
    timestamp: item.timestamp,
    tracking_id: item.tracking_id,
    action: item.action,
    lifecycle_state: item.lifecycle_state,
    event_kind: item.event_kind,
    control_state: item.control_state,
    status: item.status,
    command_class: item.command_class
  }));
}

export default function OperatorDeck({ gatewayStatus, gatewayFeed, onRefresh }) {
  const [selectedPresetId, setSelectedPresetId] = useState(presets[0].id);
  const [form, setForm] = useState(() => buildFormState(presets[0].payload));
  const [submitting, setSubmitting] = useState(false);
  const [latestResult, setLatestResult] = useState(null);
  const [submitError, setSubmitError] = useState("");

  function selectPreset(presetId) {
    const preset = presets.find((entry) => entry.id === presetId);
    if (!preset) return;
    setSelectedPresetId(presetId);
    setForm(buildFormState(preset.payload));
    setSubmitError("");
  }

  function updateField(name, value) {
    setForm((current) => ({
      ...current,
      [name]: value
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setSubmitError("");

    try {
      const detailsText = form.details.trim();
      const parsedDetails = detailsText ? JSON.parse(detailsText) : {};

      if (!parsedDetails || typeof parsedDetails !== "object" || Array.isArray(parsedDetails)) {
        throw new Error("details_must_be_json_object");
      }

      const response = await api.submitCommand({
        action: form.action.trim(),
        target: form.target.trim() || null,
        requested_by: form.requested_by.trim() || "consolelab-operator",
        source: form.source.trim() || "operator_console",
        details: parsedDetails
      });

      setLatestResult(response);
      if (onRefresh) {
        await onRefresh();
      }
    } catch (error) {
      setSubmitError(normalizeError(error));
    } finally {
      setSubmitting(false);
    }
  }

  const intakeItems = gatewayFeed?.intake?.items || [];
  const executionItems = gatewayFeed?.execution?.items || [];
  const focusReceipt = latestResult?.receipt || latestResult?.staged || null;

  return (
    <ChannelSection
      eyebrow="Operator Console"
      title="Command Deck"
      description="Submit structured actions into GATEWAY-API, stage high-risk work for approval, and keep the cockpit tied to the live room workflow."
      cards={[
        { label: "Service", value: gatewayStatus?.service || "GATEWAY-API", tone: "ok" },
        { label: "Intake", value: String(gatewayStatus?.queues?.intake || 0), tone: "ok" },
        { label: "Exec Gates", value: String(gatewayStatus?.queues?.executive_approvals || 0), tone: "warn" },
        { label: "Tunnel Gates", value: String(gatewayStatus?.queues?.tunnel_approvals || 0), tone: "warn" }
      ]}
    >
      <div className="operator-grid">
        <form className="code-shell operator-form-shell" onSubmit={handleSubmit}>
          <div className="code-shell-title">Launch Lane</div>
          <div className="operator-form">
            <div className="preset-row">
              {presets.map((preset) => (
                <button
                  type="button"
                  key={preset.id}
                  className={`action-button ${selectedPresetId === preset.id ? "" : "ghost"}`}
                  onClick={() => selectPreset(preset.id)}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <p className="operator-hint">
              {presets.find((preset) => preset.id === selectedPresetId)?.description}
            </p>

            <div className="field-grid">
              <label className="field-group">
                <span className="field-label">Action</span>
                <input
                  className="text-input"
                  value={form.action}
                  onChange={(event) => updateField("action", event.target.value)}
                  placeholder="read_gateway_status"
                />
              </label>

              <label className="field-group">
                <span className="field-label">Target</span>
                <input
                  className="text-input"
                  value={form.target}
                  onChange={(event) => updateField("target", event.target.value)}
                  placeholder="05_CENTRAL_BRAIN"
                />
              </label>

              <label className="field-group">
                <span className="field-label">Requested By</span>
                <input
                  className="text-input"
                  value={form.requested_by}
                  onChange={(event) => updateField("requested_by", event.target.value)}
                  placeholder="consolelab-operator"
                />
              </label>

              <label className="field-group">
                <span className="field-label">Source</span>
                <input
                  className="text-input"
                  value={form.source}
                  onChange={(event) => updateField("source", event.target.value)}
                  placeholder="operator_console"
                />
              </label>
            </div>

            <label className="field-group">
              <span className="field-label">Details JSON</span>
              <textarea
                className="text-area"
                value={form.details}
                onChange={(event) => updateField("details", event.target.value)}
                spellCheck="false"
              />
            </label>

            {submitError ? <div className="status-banner bad">{submitError}</div> : null}

            <div className="button-row">
              <button type="submit" className="action-button" disabled={submitting}>
                {submitting ? "Submitting..." : "Send To Gateway"}
              </button>
              <button
                type="button"
                className="action-button ghost"
                disabled={submitting}
                onClick={() => selectPreset(selectedPresetId)}
              >
                Reset Preset
              </button>
            </div>
          </div>
        </form>

        <div className="stack-panel">
          <div className="code-shell">
            <div className="code-shell-title">Latest Receipt</div>
            <pre>{prettyJson(focusReceipt || { status: "idle", note: "Submit a command from the deck to populate a live receipt." })}</pre>
          </div>
          <div className="code-shell">
            <div className="code-shell-title">Ingress Feed</div>
            <pre>{prettyJson(summarizeFeed(intakeItems.slice(0, 6)))}</pre>
          </div>
          <div className="code-shell">
            <div className="code-shell-title">Execution Feed</div>
            <pre>{prettyJson(summarizeFeed(executionItems.slice(0, 6)))}</pre>
          </div>
        </div>
      </div>
    </ChannelSection>
  );
}
