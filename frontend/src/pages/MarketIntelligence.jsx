import ChannelSection from "../components/ChannelSection.jsx";
import { prettyJson, formatValue } from "../lib/present.js";

function pickMarket(channels = []) {
  return channels.find((room) => String(room?.room_id || "").includes("market")) || null;
}

export default function MarketIntelligence({ channels = [] }) {
  const market = pickMarket(channels);
  const cards = (market?.summary || []).slice(0, 6).map((row) => ({
    label: String(row?.component || "field"),
    value: formatValue(row?.status),
    tone: /missing|unbound|hold|yellow/i.test(String(row?.status || "")) ? "warn" : "ok"
  }));

  return (
    <ChannelSection
      eyebrow="Market Intelligence"
      title="Market Intelligence"
      description="Live market signals, momentum, target readiness, and demand bindings from market room state."
      cards={cards}
    >
      <div className="code-shell">
        <div className="code-shell-title">Market Room State</div>
        <pre>{prettyJson(market || {})}</pre>
      </div>
    </ChannelSection>
  );
}
