import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { config } from "../src/config.js";
import { fetchJson } from "../src/lib/http.js";
import { getVyrdoxHealth, getVyrdoxStatus } from "../src/services/vyrdoxRuntime.js";

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeRoom(room, idx = 0) {
  if (!isObject(room)) {
    return {
      room_id: `room_${idx}`,
      title: `Room ${idx}`,
      status_color: "white",
      summary: []
    };
  }

  return {
    room_id: room.room_id || room.id || `room_${idx}`,
    title: room.title || room.name || room.room_id || `Room ${idx}`,
    updated_at_utc: room.updated_at_utc || room.updatedAt || new Date().toISOString(),
    status_color: room.status_color || room.status || "white",
    summary: Array.isArray(room.summary) ? room.summary : []
  };
}

async function fetchRuntimeRoomsFromEndpoints() {
  const candidateUrls = [
    `${config.vyrdox.internalBase}/rooms`,
    `${config.vyrdox.internalBase}/terminal/rooms`,
    `${config.vyrdox.internalBase}/control/rooms`,
    `${config.vyrdox.internalBase}/room-status`
  ];

  for (const url of candidateUrls) {
    const result = await fetchJson(url, { timeout: 2500 });
    if (!result.ok) continue;

    const payload = result.data;
    const rooms = Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.items)
        ? payload.items
        : Array.isArray(payload?.rooms)
          ? payload.rooms
          : null;

    if (!rooms) continue;

    return {
      source: url,
      rooms: rooms.map((entry, index) => normalizeRoom(entry, index))
    };
  }

  return null;
}

async function readRoomsFromFilesystem(roomsDir) {
  if (!roomsDir || !fs.existsSync(roomsDir)) {
    return [];
  }

  const entries = await fsp.readdir(roomsDir, { withFileTypes: true });
  const rooms = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const filePath = path.join(roomsDir, entry.name, "room_state.json");
    if (!fs.existsSync(filePath)) continue;

    try {
      const payload = JSON.parse(await fsp.readFile(filePath, "utf8"));
      rooms.push(normalizeRoom(payload, rooms.length));
    } catch {
      // Skip broken room payload and continue processing.
    }
  }

  return rooms;
}

async function fetchRuntimeRooms() {
  const runtimeEndpoint = await fetchRuntimeRoomsFromEndpoints();
  if (runtimeEndpoint) {
    return {
      source: runtimeEndpoint.source,
      rooms: runtimeEndpoint.rooms
    };
  }

  const roomPathCandidates = [
    process.env.VYRDX_ROOMS_DIR,
    "/home/t79/vyrdon/vyrdx/terminal/rooms",
    "/home/t79/VYRDON/vyrdx/terminal/rooms",
    "/home/t79/ASUS/ASUSX/control-room/rooms"
  ].filter(Boolean);

  for (const roomPath of roomPathCandidates) {
    const rooms = await readRoomsFromFilesystem(roomPath);
    if (rooms.length) {
      return {
        source: roomPath,
        rooms
      };
    }
  }

  return {
    source: "none",
    rooms: []
  };
}

export async function getRuntimeBridgeState() {
  const [health, status, runtimeRooms] = await Promise.all([
    getVyrdoxHealth(),
    getVyrdoxStatus(),
    fetchRuntimeRooms()
  ]);

  return {
    timestamp: new Date().toISOString(),
    runtime: {
      health: health.ok ? health.data : { status: "unreachable", error: health.error || health.data },
      status: status.ok ? status.data : { status: "unreachable", error: status.error || status.data }
    },
    room_outputs: runtimeRooms.rooms,
    room_source: runtimeRooms.source,
    room_count: runtimeRooms.rooms.length,
    state: health.ok || status.ok ? "linked" : "degraded"
  };
}
