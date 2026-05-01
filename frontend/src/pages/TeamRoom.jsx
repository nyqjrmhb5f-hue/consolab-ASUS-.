import { useEffect, useState } from "react";
import { api } from "../api.js";
import ChannelSection from "../components/ChannelSection.jsx";

export default function TeamRoom() {
  const [content, setContent] = useState("Loading team room...");

  useEffect(() => {
    api.teamRoom()
      .then((data) => setContent(data?.content || "No team room content available."))
      .catch(() => setContent("Unable to load team room."));
  }, []);

  return (
    <ChannelSection
      eyebrow="Channel 05"
      title="Team Channel"
      description="Daily action plan, market notes, implementation steps, updates, and reports in one shared operator feed."
      cards={[
        { label: "Action Plan", value: "Daily", tone: "ok" },
        { label: "Market Notes", value: "Tracked", tone: "ok" },
        { label: "Reports", value: "Shared", tone: "ok" }
      ]}
    >
      <div className="code-shell">
        <div className="code-shell-title">Team Feed</div>
        <pre className="markdown">{content}</pre>
      </div>
    </ChannelSection>
  );
}
