import ChannelSection from "../components/ChannelSection.jsx";
import { prettyJson, formatValue } from "../lib/present.js";

function pickCommercial(channels = []) {
  return channels.find((room) => String(room?.room_id || "").includes("commercial")) || null;
}

export default function CommercialOverview({ channels = [] }) {
  const commercial = pickCommercial(channels);
  const cards = (commercial?.summary || []).slice(0, 6).map((row) => ({
    label: String(row?.component || "field"),
    value: formatValue(row?.status),
    tone: /missing|unbound|hold|yellow/i.test(String(row?.status || "")) ? "warn" : "ok"
  }));

  return (
    <ChannelSection
      eyebrow="Commercial Overview"
      title="Commercial Overview"
      description="Receipts, contracts, offers, and commercial readiness from the commercial room state."
      cards={cards}
    >
      <div className="code-shell">
        <div className="code-shell-title">Commercial Room State</div>
        <pre>{prettyJson(commercial || {})}</pre>
      </div>
    </ChannelSection>
  );
}
