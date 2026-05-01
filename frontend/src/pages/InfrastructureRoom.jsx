import ChannelSection from "../components/ChannelSection.jsx";
import { prettyJson } from "../lib/present.js";

export default function InfrastructureRoom({ telemetrySnapshot }) {
  const infra = telemetrySnapshot?.infrastructure || {};
  const cards = [
    { label: "Host", value: infra.hostname || "unknown", tone: "ok" },
    { label: "CPU", value: String(infra.cpu_count || 0), tone: "ok" },
    { label: "Load Avg", value: Array.isArray(infra.load_avg) ? infra.load_avg.join(", ") : "n/a", tone: "warn" },
    { label: "Memory GiB", value: `${infra.memory_free_gib || 0}/${infra.memory_total_gib || 0}`, tone: "ok" }
  ];

  return (
    <ChannelSection
      eyebrow="Infrastructure Room"
      title="Infrastructure Room"
      description="Infrastructure and service metrics collected from local host and runtime endpoints."
      cards={cards}
    >
      <div className="code-shell">
        <div className="code-shell-title">Telemetry Snapshot</div>
        <pre>{prettyJson(telemetrySnapshot || {})}</pre>
      </div>
    </ChannelSection>
  );
}
