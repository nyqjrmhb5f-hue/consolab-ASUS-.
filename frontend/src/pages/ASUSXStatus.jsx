import ChannelSection from "../components/ChannelSection.jsx";
import { prettyJson, summarizeObject } from "../lib/present.js";

export default function ASUSXStatus({ data }) {
  const cards = summarizeObject(data, ["status", "attestation", "signing", "active_key_id"], 6);

  return (
    <ChannelSection
      eyebrow="Channel 01"
      title="Authority Channel"
      description="Trusted gate status, signatures, attestation, and policy posture. Internal engine names stay behind this layer."
      cards={cards}
    >
      <div className="code-shell">
        <div className="code-shell-title">Authority Feed</div>
        <pre>{prettyJson(data)}</pre>
      </div>
    </ChannelSection>
  );
}
