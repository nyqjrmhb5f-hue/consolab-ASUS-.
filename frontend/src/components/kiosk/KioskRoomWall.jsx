import { humanizeKey } from "../../lib/present.js";
import { toneForStatus } from "../../lib/liveTv.js";

export default function KioskRoomWall({ roomRegistry, roomStates }) {
  const rooms = roomRegistry?.rooms || [];
  const liveStates = roomStates?.items || [];

  return (
    <section className="tv-panel tv-panel-wall">
      <div className="tv-panel-head">
        <div>
          <p className="tv-panel-kicker">ROOM WALL</p>
          <h2>Layered Room Grid</h2>
        </div>
        <span className="tv-panel-meta">{rooms.length} rooms</span>
      </div>

      <div className="tv-room-grid">
        {rooms.map((room) => {
          const liveState = liveStates.find((state) => state.room_id === room.id);
          const roomEngines = (roomRegistry?.engines || []).filter(
            (engine) => engine.room_id === room.id || engine.serves_room_id === room.id
          );
          const keyChecks = (liveState?.checks || []).slice(0, 3);

          return (
            <article className={`tv-room-card tone-${toneForStatus(liveState?.overall_status || room.state)}`} key={room.id}>
              <div className="tv-room-top">
                <div>
                  <p className="tv-room-title">{room.id}</p>
                  <p className="tv-room-engine">{room.primary_engine}</p>
                </div>
                <span className={`tv-room-status tone-${toneForStatus(liveState?.overall_status || room.state)}`}>
                  {liveState?.overall_status || room.state}
                </span>
              </div>

              <p className="tv-room-copy">{room.role}</p>

              <div className="tv-room-checks">
                {keyChecks.map((check) => (
                  <div className="tv-room-check" key={`${room.id}-${check.name}`}>
                    <span>{humanizeKey(check.name)}</span>
                    <strong>{check.detail}</strong>
                  </div>
                ))}
              </div>

              <div className="tv-room-engines">
                {roomEngines.slice(0, 3).map((entry) => (
                  <span className="tv-room-chip" key={`${room.id}-${entry.id}`}>
                    {humanizeKey(entry.id)}
                  </span>
                ))}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
