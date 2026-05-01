import fs from "node:fs/promises";
import { consoleLabPath } from "./consoleLabPaths.js";

const schedulePath = consoleLabPath("05_CENTRAL_BRAIN", "orchestration", "calendar", "chronos_schedule.json");

function pad(value) {
  return String(value).padStart(2, "0");
}

function parseDailyUtc(time) {
  const match = /^(\d{2}):(\d{2})$/.exec(String(time || ""));
  if (!match) return null;
  return { hour: Number(match[1]), minute: Number(match[2]) };
}

function nextDailyUtc(time, now) {
  const parsed = parseDailyUtc(time);
  if (!parsed) return null;

  const next = new Date(now);
  next.setUTCSeconds(0, 0);
  next.setUTCHours(parsed.hour, parsed.minute, 0, 0);
  if (next <= now) {
    next.setUTCDate(next.getUTCDate() + 1);
  }
  return next;
}

function nextInterval(minutes, now) {
  const value = Number(minutes);
  if (!Number.isFinite(value) || value <= 0) return null;

  const next = new Date(now);
  next.setUTCSeconds(0, 0);
  const currentMinute = next.getUTCMinutes();
  const offset = value - (currentMinute % value || value);
  next.setUTCMinutes(currentMinute + offset);
  return next;
}

function humanCountdown(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

function nextOccurrence(item, now) {
  if (item.type === "interval_minutes") {
    return nextInterval(item.interval_minutes, now);
  }
  if (item.type === "daily_utc") {
    return nextDailyUtc(item.time_utc, now);
  }
  return null;
}

export async function getChronosTimeline() {
  const raw = await fs.readFile(schedulePath, "utf8");
  const schedule = JSON.parse(raw);
  const now = new Date();

  const items = (schedule.items || [])
    .map((item) => {
      const next = nextOccurrence(item, now);
      const deltaMs = next ? next.getTime() - now.getTime() : null;
      return {
        ...item,
        next_occurs_at_utc: next ? next.toISOString() : null,
        countdown: next ? humanCountdown(deltaMs) : null,
        countdown_seconds: next ? Math.max(0, Math.floor(deltaMs / 1000)) : null
      };
    })
    .sort((a, b) => (a.countdown_seconds ?? Number.MAX_SAFE_INTEGER) - (b.countdown_seconds ?? Number.MAX_SAFE_INTEGER));

  return {
    timestamp: now.toISOString(),
    engine: "CHRONOS",
    source: schedulePath,
    items
  };
}
