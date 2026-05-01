import fs from "node:fs";
import path from "node:path";

const ASUSX_ROOMS_ROOT = "/home/t79/ASUS/ASUSX/control-room/rooms";

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

export function getAsusxChannels() {
  if (!fs.existsSync(ASUSX_ROOMS_ROOT)) {
    return [];
  }

  return fs
    .readdirSync(ASUSX_ROOMS_ROOT)
    .sort()
    .map((roomId) => {
      const room = readJson(path.join(ASUSX_ROOMS_ROOT, roomId, "room_state.json"));
      return room && typeof room === "object" ? room : null;
    })
    .filter(Boolean);
}

export function getAsusxChannel(roomId) {
  if (!/^[A-Za-z0-9_-]+$/.test(String(roomId || ""))) {
    return null;
  }
  const roomPath = path.join(ASUSX_ROOMS_ROOT, roomId, "room_state.json");
  return readJson(roomPath);
}
