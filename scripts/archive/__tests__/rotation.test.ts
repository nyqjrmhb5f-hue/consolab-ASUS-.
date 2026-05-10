import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

import { rotateDailyArchives } from "../lib/rotation.js";

function makeRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "consolab-rotation-"));
}

function seedDay(root: string, dayKey: string): string {
  const [y, m, d] = dayKey.split("-") as [string, string, string];
  const dir = path.join(root, y, m, d);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `CONSOLELAB_DAILY_REPORT_${dayKey}.md`), `# ${dayKey}\n`, "utf8");
  return dir;
}

test("rotation deletes only directories older than the retention window", () => {
  const root = makeRoot();
  const today = new Date("2026-05-01T00:03:00Z");

  const keepFresh = seedDay(root, "2026-04-30"); // 1 day old → keep
  const keepEdge = seedDay(root, "2025-05-01");  // exactly 365 days old → keep
  const dropOld = seedDay(root, "2025-04-30");   // 366 days old → drop

  // Drop a README at the year level — must be preserved if it's the only entry.
  fs.writeFileSync(path.join(root, "README.md"), "marker\n", "utf8");

  const result = rotateDailyArchives({
    archivesRoot: root,
    today,
    timeZone: "UTC",
    retentionDays: 365
  });

  assert.ok(fs.existsSync(keepFresh), "yesterday must be preserved");
  assert.ok(fs.existsSync(keepEdge), "exactly-365 days must be preserved (boundary)");
  assert.ok(!fs.existsSync(dropOld), "366+ days must be deleted");
  assert.ok(result.deletedDirectories.includes(dropOld));

  // README at root is preserved.
  assert.ok(fs.existsSync(path.join(root, "README.md")));

  fs.rmSync(root, { recursive: true, force: true });
});

test("rotation tolerates a missing archives root", () => {
  const root = path.join(os.tmpdir(), `consolab-missing-${Date.now()}`);
  const result = rotateDailyArchives({
    archivesRoot: root,
    today: new Date("2026-05-01T00:03:00Z"),
    timeZone: "UTC"
  });
  assert.deepEqual(result.deletedDirectories, []);
  assert.deepEqual(result.errors, []);
});

test("rotation prunes empty year/month directories left behind by deletion", () => {
  const root = makeRoot();
  const today = new Date("2026-05-01T00:03:00Z");

  // Old day inside an old year/month with no other tenants.
  seedDay(root, "2024-01-15");

  rotateDailyArchives({
    archivesRoot: root,
    today,
    timeZone: "UTC",
    retentionDays: 365
  });

  assert.ok(!fs.existsSync(path.join(root, "2024")), "empty year dir should be pruned");

  fs.rmSync(root, { recursive: true, force: true });
});
