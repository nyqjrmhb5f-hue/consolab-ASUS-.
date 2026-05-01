import ChannelSection from "../components/ChannelSection.jsx";
import { prettyJson, summarizeObject, formatValue } from "../lib/present.js";

function pickRoom(channels = [], keyword) {
  return channels.find((room) => String(room?.room_id || "").includes(keyword)) || null;
}

export default function AuthorityRoom({ data, channels = [] }) {
  const authorityRoom = pickRoom(channels, "authority");
  const cards = [
    ...summarizeObject(data, ["status", "attestation", "signing"], 4),
    {
      label: "Authority Room State",
      value: formatValue(authorityRoom?.status_color || "unknown"),
      tone: String(authorityRoom?.status_color || "").includes("green") ? "ok" : "warn"
    }
  ].slice(0, 6);

  return (
    <ChannelSection
      eyebrow="Authority Room"
      title="ASUS Authority Room"
      description="Signing, attestation, and policy authority state from ASUS control data and authority APIs."
      cards={cards}
    >
      <div className="matrix-wrap">
        <div className="code-shell matrix-detail-shell">
          <div className="code-shell-title">Authority API Feed</div>
          <pre>{prettyJson(data || {})}</pre>
        </div>
        <div className="code-shell matrix-detail-shell">
          <div className="code-shell-title">Authority Room State</div>
          <pre>{prettyJson(authorityRoom || {})}</pre>
        </div>
      </div>
    </ChannelSection>
  );
}
