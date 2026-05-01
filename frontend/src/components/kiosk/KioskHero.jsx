import { buildWallAlerts, countdownForItem, formatWallClock, toneForStatus } from "../../lib/liveTv.js";

export default function KioskHero({
  roomRegistry,
  roomStates,
  chronos,
  gatewayStatus,
  approvalQueues,
  evidenceSnapshot,
  telemetrySnapshot,
  brainModules,
  tunnelFabric,
  now
}) {
  const rooms = roomRegistry?.rooms || [];
  const alerts = buildWallAlerts({ roomStates, approvalQueues, tunnelFabric, evidenceSnapshot, brainModules });
  const ticker = [
    { label: "Rooms", value: String(rooms.length) },
    { label: "Ready", value: String(roomStates?.summary?.up || 0) },
    { label: "Watch", value: String(roomStates?.summary?.degraded || 0) },
    { label: "Approvals", value: String((approvalQueues?.executive?.length || 0) + (approvalQueues?.tunnel?.length || 0)) },
    { label: "Next Event", value: countdownForItem(chronos?.items?.[0], now) },
    { label: "Connectors", value: String(brainModules?.summary?.connector_count || 0) },
    { label: "Tunnels", value: String(tunnelFabric?.summary?.staged_tunnels || 0) },
    { label: "Host", value: telemetrySnapshot?.infrastructure?.hostname || "UNKNOWN" }
  ];

  const leftRail = [
    { label: "Cockpit", value: roomRegistry?.system?.cockpit || "kitty" },
    { label: "Brain", value: roomRegistry?.system?.brain_shell || "zsh" },
    { label: "Gateway", value: gatewayStatus?.service || "GATEWAY-API" }
  ];

  const rightRail = [
    { label: "Clock", value: formatWallClock(new Date(now)) },
    { label: "Next", value: chronos?.items?.[0]?.label || "No scheduled event" },
    { label: "Mode", value: "Live TV Wall" }
  ];

  return (
    <section className="tv-hero">
      <aside className="tv-rail">
        {leftRail.map((item) => (
          <article className="tv-tool" key={item.label}>
            <span className="tv-tool-label">{item.label}</span>
            <strong>{item.value}</strong>
          </article>
        ))}
      </aside>

      <section className="tv-center">
        <p className="tv-kicker">CONSOLELAB | LIVE TV WALL | KITTY COCKPIT | ZSH CENTRAL BRAIN</p>
        <div className="tv-mark">
          <span className="tv-mark-main">ConsoleLab</span>
          <span className="tv-mark-sub">Sharp Layered Broadcast Surface</span>
        </div>
        <div className="tv-strip">
          {ticker.map((item) => (
            <article className={`tv-strip-item tone-${toneForStatus(item.value)}`} key={item.label}>
              <span className="tv-strip-label">{item.label}</span>
              <strong>{item.value}</strong>
            </article>
          ))}
        </div>
        <div className="tv-alerts">
          {alerts.length ? (
            alerts.map((alert) => (
              <span className="tv-alert-chip" key={alert}>
                {alert}
              </span>
            ))
          ) : (
            <span className="tv-alert-chip">No live alerts</span>
          )}
        </div>
      </section>

      <aside className="tv-rail">
        {rightRail.map((item) => (
          <article className="tv-tool" key={item.label}>
            <span className="tv-tool-label">{item.label}</span>
            <strong>{item.value}</strong>
          </article>
        ))}
      </aside>
    </section>
  );
}
