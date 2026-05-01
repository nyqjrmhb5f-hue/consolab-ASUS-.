import { useEffect, useMemo, useState } from "react";
import ChannelSection from "../components/ChannelSection.jsx";
import { humanizeKey, prettyJson } from "../lib/present.js";

function inferTone(value) {
  const text = String(value ?? "unknown").toLowerCase();
  if (/(ok|pass|live|active|ready|connected|green)/.test(text)) return "ok";
  if (/(warn|pending|hold|unbound|unknown|degraded|proxy)/.test(text)) return "warn";
  return "bad";
}

export default function ControlRoom({ overview, asusx, vyrdox, vyrdoxStatus, channels = [] }) {
  const rows = useMemo(() => ([
    {
      key: "authority",
      label: "ASUSX Authority",
      status: asusx?.status || overview?.asus?.status || "UNKNOWN",
      detail: asusx?.attestation || asusx?.signing || "Sign / attest / policy",
      next: "Protect local-only authority plane",
      payload: asusx || overview?.asus || {}
    },
    {
      key: "runtime",
      label: "VYRDOX Runtime",
      status: vyrdoxStatus?.status || overview?.dell?.status || vyrdox?.status || "UNKNOWN",
      detail: vyrdoxStatus?.mode || vyrdox?.mode || "Runtime mirror health",
      next: overview?.dell?.reachable ? "Monitor runtime only" : "Repair DELL runtime surfaces",
      payload: vyrdoxStatus || vyrdox || overview?.dell || {}
    },
    {
      key: "anchor",
      label: "Anchor Path",
      status: overview?.sealcheck || "UNKNOWN",
      detail: overview?.anchor || "Anchor classification unavailable",
      next: overview?.sealcheck === "PASS" ? "Keep evidence steady" : "Inspect anchor and release path",
      payload: overview || {}
    },
    {
      key: "consolelab",
      label: "ConsoleLab Surface",
      status: "INTERNAL",
      detail: "Read-only operator surface",
      next: "Keep local/tailnet access quiet",
      payload: {
        mode: "internal",
        execution_from_console: "denied",
        urls: {
          consolelab: "http://100.127.85.101:4010",
          kiosk: "http://100.127.85.101:4010/kiosk"
        }
      }
    }
  ]), [overview, asusx, vyrdox, vyrdoxStatus]);

  const roomList = channels || [];
  const [selectedKey, setSelectedKey] = useState(rows[0]?.key || "authority");
  const [selectedRoomId, setSelectedRoomId] = useState(roomList[0]?.room_id || null);

  useEffect(() => {
    if (!rows.find((row) => row.key === selectedKey)) {
      setSelectedKey(rows[0]?.key || "authority");
    }
  }, [rows, selectedKey]);

  useEffect(() => {
    if (!roomList.find((room) => room.room_id === selectedRoomId)) {
      setSelectedRoomId(roomList[0]?.room_id || null);
    }
  }, [roomList, selectedRoomId]);

  const selectedRow = rows.find((row) => row.key === selectedKey) || rows[0];
  const selectedRoom = roomList.find((room) => room.room_id === selectedRoomId) || roomList[0];

  return (
    <ChannelSection
      eyebrow="Channel 00"
      title="Control Channel"
      description="The base surface now shows actual ASUSX, Anchor, ConsoleLab, and VYRDOX link state. Click a row or room to inspect the live detail behind it."
      cards={[
        { label: "Mode", value: "Read Only", tone: "ok" },
        { label: "Execution From Console", value: "Denied", tone: "warn" },
        { label: "DELL Link", value: overview?.dell?.reachable ? "Connected" : "Degraded", tone: overview?.dell?.reachable ? "ok" : "warn" },
        { label: "Sealcheck", value: overview?.sealcheck || "UNKNOWN", tone: inferTone(overview?.sealcheck) }
      ]}
    >
      <div className="matrix-wrap">
        <section className="matrix-table">
          <div className="matrix-head">
            <span>Surface</span>
            <span>Status</span>
            <span>Detail</span>
            <span>Next</span>
          </div>
          {rows.map((row) => (
            <button
              type="button"
              key={row.key}
              className={`matrix-row ${selectedKey === row.key ? "active" : ""} tone-${inferTone(row.status)}`}
              onClick={() => setSelectedKey(row.key)}
            >
              <span className="matrix-title">{row.label}</span>
              <span className="matrix-status">{row.status}</span>
              <span className="matrix-detail">{row.detail}</span>
              <span className="matrix-next">{row.next}</span>
            </button>
          ))}
        </section>

        <div className="code-shell matrix-detail-shell">
          <div className="code-shell-title">{selectedRow?.label || "Detail"} Feed</div>
          <pre>{prettyJson(selectedRow?.payload || {})}</pre>
        </div>
      </div>

      <div className="channel-room-layout">
        <section className="room-tiles">
          {roomList.map((room) => {
            const firstReason = room.status_reasons?.[0];
            return (
              <button
                type="button"
                key={room.room_id}
                className={`room-tile tone-${inferTone(room.status_color)} ${selectedRoomId === room.room_id ? "active" : ""}`}
                onClick={() => setSelectedRoomId(room.room_id)}
              >
                <span className="room-tile-name">{room.title || room.room_id}</span>
                <strong className="room-tile-status">{String(room.status_color || "UNKNOWN").toUpperCase()}</strong>
                <span className="room-tile-copy">
                  {firstReason?.reason_text || room.summary?.[0]?.detail || "No room reason available"}
                </span>
              </button>
            );
          })}
        </section>

        <div className="code-shell room-detail-shell">
          <div className="code-shell-title">{selectedRoom?.title || "ASUSX Room"} State</div>
          <pre>{prettyJson(selectedRoom || {})}</pre>
        </div>
      </div>

      <p className="channel-note">
        The screen stays calm, but the payloads stay exact. Green must be earned. Yellow stays visible until the reason and next action are explicit.
      </p>
    </ChannelSection>
  );
}
