import { test } from "node:test";
import assert from "node:assert/strict";
import {
  dayKeyFor,
  daysBetween,
  isValidDayKey,
  parseEventTimestamp,
  previousDayKey,
  splitDayKey
} from "../lib/dates.js";

test("parseEventTimestamp handles ISO-8601, room filename form, and rejects garbage", () => {
  const iso = parseEventTimestamp("2026-04-03T03:33:08.493Z");
  assert.ok(iso instanceof Date);
  assert.equal(iso?.toISOString(), "2026-04-03T03:33:08.493Z");

  const fromName = parseEventTimestamp("20260403T042509415Z-e969e1fa.json");
  assert.ok(fromName instanceof Date);
  assert.equal(fromName?.toISOString(), "2026-04-03T04:25:09.415Z");

  assert.equal(parseEventTimestamp(""), null);
  assert.equal(parseEventTimestamp("not-a-date"), null);
  assert.equal(parseEventTimestamp(null), null);
});

test("dayKeyFor pins the calendar-day in the requested IANA zone", () => {
  const ts = new Date("2026-04-03T22:30:00Z");
  assert.equal(dayKeyFor(ts, "UTC"), "2026-04-03");
  // Sydney is UTC+10 in April → same instant is already the 4th there.
  assert.equal(dayKeyFor(ts, "Australia/Sydney"), "2026-04-04");
});

test("previousDayKey returns the prior calendar day in the report TZ", () => {
  // Pick noon UTC so DST transitions don't matter for this assertion.
  const today = new Date("2026-04-03T12:00:00Z");
  assert.equal(previousDayKey(today, "UTC"), "2026-04-02");
});

test("isValidDayKey enforces YYYY-MM-DD shape", () => {
  assert.ok(isValidDayKey("2026-04-03"));
  assert.ok(!isValidDayKey("2026-4-3"));
  assert.ok(!isValidDayKey("yesterday"));
});

test("splitDayKey + daysBetween round-trip", () => {
  const parts = splitDayKey("2026-04-03");
  assert.deepEqual(parts, { year: "2026", month: "04", day: "03" });
  assert.equal(daysBetween("2026-04-01", "2026-04-03"), 2);
  assert.equal(daysBetween("2025-04-03", "2026-04-03"), 365);
});
