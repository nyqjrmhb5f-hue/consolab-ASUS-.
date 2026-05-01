import ChannelSection from "../components/ChannelSection.jsx";
import { prettyJson, summarizeObject } from "../lib/present.js";

export default function VYRDOXStatus({ data }) {
  const cards = summarizeObject(data, ["status", "mode", "classification", "bridge"], 6);

  return (
    <ChannelSection
      eyebrow="Channel 02"
      title="Runtime Channel"
      description="Execution and runtime visibility stay separate from authority, but the visible experience remains calm and readable."
      cards={cards}
    >
      <div className="code-shell">
        <div className="code-shell-title">Runtime Feed</div>
        <pre>{prettyJson(data)}</pre>
      </div>
    </ChannelSection>
  );
}
