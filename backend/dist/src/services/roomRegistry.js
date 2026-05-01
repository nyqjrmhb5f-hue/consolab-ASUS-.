import fs from "node:fs";
import { consoleLabPath } from "./consoleLabPaths.js";

const registryPath = consoleLabPath("05_CENTRAL_BRAIN", "docs", "room_registry.json");

const fallbackRegistry = {
  system: {
    name: "ConsoleLab",
    cockpit: "kitty",
    brain_shell: "zsh",
    updated_at: "unknown"
  },
  rooms: [],
  engines: [],
  links: []
};

function toNodeId(roomId) {
  return `R_${String(roomId).replace(/[^A-Za-z0-9]/g, "_")}`;
}

export function getRoomRegistry() {
  try {
    const raw = fs.readFileSync(registryPath, "utf8");
    const parsed = JSON.parse(raw);
    return {
      ...fallbackRegistry,
      ...parsed,
      rooms: Array.isArray(parsed.rooms) ? parsed.rooms : [],
      engines: Array.isArray(parsed.engines) ? parsed.engines : [],
      links: Array.isArray(parsed.links) ? parsed.links : []
    };
  } catch {
    return fallbackRegistry;
  }
}

export function getRoomTopology() {
  const registry = getRoomRegistry();

  const nodes = registry.rooms.map((room) => ({
    id: room.id,
    label: room.title,
    type: "room",
    engine: room.primary_engine,
    state: room.state,
    path: room.path
  }));

  const diagramLines = [
    "flowchart TD",
    ...registry.rooms.map((room) => {
      const nodeId = toNodeId(room.id);
      return `    ${nodeId}["${room.id}<br/>${room.primary_engine}"]`;
    }),
    "",
    ...registry.links.map(([source, target]) => `    ${toNodeId(source)} --> ${toNodeId(target)}`)
  ];

  return {
    timestamp: new Date().toISOString(),
    system: registry.system,
    nodes,
    edges: registry.links,
    diagram: diagramLines.join("\n")
  };
}
