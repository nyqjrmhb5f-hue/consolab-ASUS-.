import { useEffect, useMemo, useState } from "react";
import ChannelSection from "../components/ChannelSection.jsx";
import { prettyJson } from "../lib/present.js";

function inferTone(value) {
  const text = String(value ?? "unknown").toLowerCase();
  if (/(ok|pass|live|active|ready|green|structured|locked|up)/.test(text)) return "ok";
  if (/(warn|hold|pending|degraded|unknown|planned)/.test(text)) return "warn";
  return "bad";
}

export default function RoomArchitecture({ roomRegistry, roomStates, topology }) {
  const rooms = roomRegistry?.rooms || [];
  const engines = roomRegistry?.engines || [];
  const liveStates = roomStates?.items || [];
  const [selectedRoomId, setSelectedRoomId] = useState(rooms[0]?.id || null);

  useEffect(() => {
    if (!rooms.find((room) => room.id === selectedRoomId)) {
      setSelectedRoomId(rooms[0]?.id || null);
    }
  }, [rooms, selectedRoomId]);

  const selectedRoom = rooms.find((room) => room.id === selectedRoomId) || rooms[0] || null;
  const selectedLiveState = liveStates.find((state) => state.room_id === selectedRoom?.id) || null;
  const roomEngines = useMemo(
    () =>
      engines.filter(
        (engine) =>
          engine.room_id === selectedRoom?.id || engine.serves_room_id === selectedRoom?.id
      ),
    [engines, selectedRoom]
  );

  return (
    <ChannelSection
      eyebrow="ConsoleLab Rooms"
      title="Room Architecture"
      description="The live ConsoleLab surface is organized as bounded rooms with named engines, clear authority flow, and explicit shared-backbone links."
      cards={[
        { label: "Rooms", value: String(rooms.length), tone: "ok" },
        { label: "Ready", value: String(roomStates?.summary?.up || 0), tone: "ok" },
        { label: "Watch", value: String(roomStates?.summary?.degraded || 0), tone: "warn" },
        { label: "Links", value: String(topology?.edges?.length || 0), tone: "ok" },
        { label: "Cockpit", value: roomRegistry?.system?.cockpit || "kitty", tone: "ok" }
      ]}
    >
      <div className="channel-room-layout">
        <section className="room-tiles">
          {rooms.map((room) => {
            const liveState = liveStates.find((state) => state.room_id === room.id);
            return (
              <button
                type="button"
                key={room.id}
                className={`room-tile tone-${inferTone(liveState?.overall_status || room.state)} ${selectedRoomId === room.id ? "active" : ""}`}
                onClick={() => setSelectedRoomId(room.id)}
              >
                <span className="room-tile-name">{room.id}</span>
                <strong className="room-tile-status">{room.primary_engine}</strong>
                <span className="room-tile-copy">
                  {(liveState?.overall_status || room.state)}: {room.role}
                </span>
              </button>
            );
          })}
        </section>

        <div className="code-shell room-detail-shell">
          <div className="code-shell-title">{selectedRoom?.title || "Room"} Contract</div>
          <pre>{prettyJson({ room: selectedRoom, live_state: selectedLiveState, engines: roomEngines })}</pre>
        </div>
      </div>

      <div className="matrix-wrap">
        <div className="code-shell matrix-detail-shell">
          <div className="code-shell-title">Topology Diagram</div>
          <pre>{topology?.diagram || "No topology available."}</pre>
        </div>
        <div className="code-shell matrix-detail-shell">
          <div className="code-shell-title">Live Room Checks</div>
          <pre>{prettyJson(selectedLiveState || roomStates || {})}</pre>
        </div>
      </div>
    </ChannelSection>
  );
}
