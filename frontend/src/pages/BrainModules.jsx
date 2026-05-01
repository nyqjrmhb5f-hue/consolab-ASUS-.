import ChannelSection from "../components/ChannelSection.jsx";
import { prettyJson } from "../lib/present.js";

export default function BrainModules({ brainModules }) {
  const modules = brainModules?.modules || [];
  const inventory = brainModules?.inventory || {};

  return (
    <ChannelSection
      eyebrow="Central Brain"
      title="CORE-PRIME Modules"
      description="Live module inventory for CORE-PRIME, MEMORY, RAG, MCP-BRAIN, CHRONOS, and LEDGERD inside the Central Brain."
      cards={[
        { label: "Modules", value: String(brainModules?.summary?.total || 0), tone: "ok" },
        { label: "Up", value: String(brainModules?.summary?.up || 0), tone: "ok" },
        { label: "Down", value: String(brainModules?.summary?.down || 0), tone: brainModules?.summary?.down ? "bad" : "ok" },
        { label: "Connectors", value: String(brainModules?.summary?.connector_count || 0), tone: "ok" },
        { label: "Workflows", value: String(brainModules?.summary?.workflow_count || 0), tone: "ok" }
      ]}
    >
      <div className="queue-lanes">
        {modules.map((item) => (
          <article key={item.id} className="queue-item">
            <div className="queue-item-header">
              <div>
                <p className="queue-item-title">{item.id}</p>
                <p className="queue-item-subtitle">{item.path}</p>
              </div>
              <span className={`queue-chip ${item.status === "UP" ? "ok" : "bad"}`}>{item.status}</span>
            </div>
            <p className="queue-item-copy">{item.detail}</p>
            <div className="queue-meta">
              {Object.entries(item)
                .filter(([key]) => !["id", "path", "status", "detail"].includes(key))
                .map(([key, value]) => (
                  <span className="queue-chip" key={`${item.id}-${key}`}>
                    {key}: {String(value)}
                  </span>
                ))}
            </div>
          </article>
        ))}
      </div>

      <div className="matrix-wrap">
        <div className="code-shell matrix-detail-shell">
          <div className="code-shell-title">MCP Inventory</div>
          <pre>{prettyJson(inventory)}</pre>
        </div>
        <div className="code-shell matrix-detail-shell">
          <div className="code-shell-title">Brain Module Snapshot</div>
          <pre>{prettyJson(brainModules || {})}</pre>
        </div>
      </div>
    </ChannelSection>
  );
}
