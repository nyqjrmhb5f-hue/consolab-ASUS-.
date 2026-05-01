import ChannelSection from "../components/ChannelSection.jsx";

export default function EvidenceRoom() {
  return (
    <ChannelSection
      eyebrow="Channel 04"
      title="Evidence Channel"
      description="Everything visible here must resolve to evidence, reasons, and next action."
      cards={[
        { label: "Write Rule", value: "Append Only", tone: "ok" },
        { label: "Freeze Mode", value: "Protected", tone: "ok" },
        { label: "Bare Numbers", value: "Not Allowed", tone: "warn" }
      ]}
    >
      <p className="channel-note">
        Evidence capture remains append-only during freeze. If a signal cannot resolve to reason and
        evidence, it does not belong on screen.
      </p>
    </ChannelSection>
  );
}
