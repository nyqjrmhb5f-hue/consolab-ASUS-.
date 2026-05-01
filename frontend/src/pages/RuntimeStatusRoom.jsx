import ChannelSection from "../components/ChannelSection.jsx";
import { prettyJson, summarizeObject, formatValue } from "../lib/present.js";

export default function RuntimeStatusRoom({ runtimeData, runtimeBridge }) {
  const cards = [
    ...summarizeObject(runtimeData, ["status", "mode", "classification"], 4),
    {
      label: "Bridge State",
      value: formatValue(runtimeBridge?.state || "unknown"),
      tone: runtimeBridge?.state === "linked" ? "ok" : "warn"
    },
    {
      label: "Room Outputs",
      value: formatValue(runtimeBridge?.room_count || 0),
      tone: (runtimeBridge?.room_count || 0) > 0 ? "ok" : "warn"
    }
  ].slice(0, 6);

  return (
    <ChannelSection
      eyebrow="Runtime Status Room"
      title="VYRDx Runtime Status"
      description="Runtime state and terminal room outputs read through the runtime bridge."
      cards={cards}
    >
      <div className="matrix-wrap">
        <div className="code-shell matrix-detail-shell">
          <div className="code-shell-title">Runtime Feed</div>
          <pre>{prettyJson(runtimeData || {})}</pre>
        </div>
        <div className="code-shell matrix-detail-shell">
          <div className="code-shell-title">Runtime Bridge</div>
          <pre>{prettyJson(runtimeBridge || {})}</pre>
        </div>
      </div>
    </ChannelSection>
  );
}
