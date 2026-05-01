import ChannelSection from "../components/ChannelSection.jsx";

export default function AccessEvents() {
  return (
    <ChannelSection
      eyebrow="Channel 06"
      title="Access Channel"
      description="Identity, tunnel policy, and operator access remain visible without exposing raw internal credentials."
      cards={[
        { label: "Identity Gate", value: "Cloudflare Access", tone: "ok" },
        { label: "Exposure Model", value: "Policy Controlled", tone: "ok" },
        { label: "Operator Rule", value: "No Direct Runtime Entry", tone: "warn" }
      ]}
    >
      <p className="channel-note">
        Cloudflare access events stay visible through audit logs and policy records. This surface
        does not expose credentials, tunnel secrets, or raw authority internals.
      </p>
    </ChannelSection>
  );
}
