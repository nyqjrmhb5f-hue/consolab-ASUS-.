import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { config } from "../src/config.js";

function safeParseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

async function readJsonlTail(filePath, limit = 100) {
  if (!fs.existsSync(filePath)) {
    return [];
  }

  const raw = await fsp.readFile(filePath, "utf8");
  const lines = raw.split("\n").filter(Boolean);
  const tail = lines.slice(-limit);
  return tail.map((line) => safeParseJson(line) || { raw: line });
}

async function listSealRecords(limit = 100) {
  const candidates = [
    "/home/t79/consolelab/04_EVIDENCE_ROOM/attestations",
    "/home/t79/consolelab/04_EVIDENCE_ROOM/proofs",
    "/home/t79/consolelab/04_EVIDENCE_ROOM/snapshots",
    "/home/t79/consolelab/04_EVIDENCE_ROOM/signer_events",
    "/home/t79/consolelab/04_EVIDENCE_ROOM/audit_trails",
    path.join(config.baselineDir, "evidence")
  ];

  const records = [];

  for (const dir of candidates) {
    if (!fs.existsSync(dir)) continue;

    let names = [];
    try {
      names = await fsp.readdir(dir);
    } catch {
      continue;
    }

    for (const name of names) {
      const full = path.join(dir, name);
      let stat;
      try {
        stat = await fsp.stat(full);
      } catch {
        continue;
      }

      if (!stat.isFile()) continue;
      if (!(name.endsWith(".json") || name.endsWith(".jsonl") || name.endsWith(".sig") || name.endsWith(".seal") || name.endsWith(".md"))) {
        continue;
      }

      records.push({
        file: full,
        relative: path.relative("/home/t79", full),
        bytes: stat.size,
        modified_at_utc: stat.mtime.toISOString()
      });
    }
  }

  return records
    .sort((a, b) => b.modified_at_utc.localeCompare(a.modified_at_utc))
    .slice(0, limit);
}

export async function readEvidenceSnapshot(limit = 100) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 100, 500));
  const eventsPath = path.join(config.baselineDir, "evidence", "events.jsonl");
  const roomEventsPath = "/home/t79/consolelab/04_EVIDENCE_ROOM/runtime_journals/events.jsonl";

  const [events, seals] = await Promise.all([
    fs.existsSync(roomEventsPath) ? readJsonlTail(roomEventsPath, safeLimit) : readJsonlTail(eventsPath, safeLimit),
    listSealRecords(safeLimit)
  ]);

  return {
    timestamp: new Date().toISOString(),
    events_file: eventsPath,
    room_events_file: roomEventsPath,
    events_count: events.length,
    events,
    seal_records_count: seals.length,
    seal_records: seals
  };
}
