import ChannelSection from "../components/ChannelSection.jsx";
import { prettyJson } from "../lib/present.js";

export default function EvidenceReviewRoom({ evidenceSnapshot }) {
  const cards = [
    { label: "Events", value: String(evidenceSnapshot?.events_count || 0), tone: "ok" },
    { label: "Seal Records", value: String(evidenceSnapshot?.seal_records_count || 0), tone: "ok" },
    { label: "Mode", value: "Append-only", tone: "ok" }
  ];

  return (
    <ChannelSection
      eyebrow="Evidence Review Room"
      title="Evidence Review Room"
      description="Runtime evidence logs and seal records read through evidence reader."
      cards={cards}
    >
      <div className="code-shell">
        <div className="code-shell-title">Evidence Snapshot</div>
        <pre>{prettyJson(evidenceSnapshot || {})}</pre>
      </div>
    </ChannelSection>
  );
}
