import { countdownForItem, toneForStatus } from "../../lib/liveTv.js";

export default function KioskTimelineBoard({ chronos, now }) {
  const items = chronos?.items || [];

  return (
    <section className="tv-panel tv-panel-timeline">
      <div className="tv-panel-head">
        <div>
          <p className="tv-panel-kicker">CHRONOS</p>
          <h2>Timeline Rail</h2>
        </div>
        <span className="tv-panel-meta">{items.length} events</span>
      </div>

      <div className="tv-event-list">
        {items.map((item) => (
          <article className={`tv-event tone-${toneForStatus(item.countdown || "ok")}`} key={item.id}>
            <div>
              <p className="tv-event-title">{item.label}</p>
              <p className="tv-event-copy">{item.target_room || "room not set"}</p>
            </div>
            <div className="tv-event-time">
              <strong>{countdownForItem(item, now)}</strong>
              <span>{item.next_occurs_at_utc || "n/a"}</span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
