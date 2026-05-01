import ChannelSection from "../components/ChannelSection.jsx";
import { prettyJson } from "../lib/present.js";

export default function ChronosRail({ chronos }) {
  const items = chronos?.items || [];
  const cards = items.slice(0, 4).map((item) => ({
    label: item.label,
    value: item.countdown || "n/a",
    tone: "ok"
  }));

  return (
    <ChannelSection
      eyebrow="Central Brain"
      title="Chronos Rail"
      description="Timeline rail driven by the Central Brain cadence schedule for room refresh, evidence sealing, reporting, and deployment review."
      cards={cards}
    >
      <div className="matrix-wrap">
        <div className="code-shell matrix-detail-shell">
          <div className="code-shell-title">Next Scheduled Events</div>
          <pre>{prettyJson(items)}</pre>
        </div>
        <div className="code-shell matrix-detail-shell">
          <div className="code-shell-title">Chronos Source</div>
          <pre>{prettyJson({ engine: chronos?.engine, source: chronos?.source, timestamp: chronos?.timestamp })}</pre>
        </div>
      </div>
    </ChannelSection>
  );
}
