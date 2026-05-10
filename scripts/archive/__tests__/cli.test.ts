import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";

import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.resolve(HERE, "..", "consolab-daily-report.ts");

function makeRepo(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "consolab-cli-"));
}

function runScript(args: string[], opts: { repoRoot: string; archivesRoot: string }): { stdout: string; stderr: string } {
  try {
    const stdout = execFileSync(
      process.execPath,
      ["--import", "tsx", SCRIPT, "--repo-root", opts.repoRoot, "--archives-root", opts.archivesRoot, ...args],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
    );
    return { stdout, stderr: "" };
  } catch (err) {
    const e = err as NodeJS.ErrnoException & { stdout?: Buffer; stderr?: Buffer };
    const stdout = e.stdout?.toString("utf8") ?? "";
    const stderr = e.stderr?.toString("utf8") ?? "";
    throw Object.assign(new Error(stderr || e.message), { stdout, stderr });
  }
}

test("CLI writes a primary report, refuses overwrite, and accepts a single addendum", () => {
  const repo = makeRepo();
  const archives = path.join(repo, "archives", "daily");

  // Run #1: write the primary report for an explicit date.
  const first = runScript(["--date", "2026-04-03", "--tz", "UTC", "--no-rotate"], {
    repoRoot: repo,
    archivesRoot: archives
  });
  const primary = path.join(archives, "2026", "04", "03", "CONSOLELAB_DAILY_REPORT_2026-04-03.md");
  assert.ok(fs.existsSync(primary), "primary report must be written");
  assert.match(first.stdout, /wrote report:/);
  const content = fs.readFileSync(primary, "utf8");
  assert.match(content, /CONSOLELAB DAILY REPORT — 2026-04-03/);
  assert.match(content, /Immutable\./);

  // Run #2: same args → must refuse.
  let refused: Error | null = null;
  try {
    runScript(["--date", "2026-04-03", "--tz", "UTC", "--no-rotate"], { repoRoot: repo, archivesRoot: archives });
  } catch (err) {
    refused = err as Error;
  }
  assert.ok(refused, "second run for the same date must fail");
  assert.match(String(refused?.message ?? ""), /already exists/);

  // Run #3: addendum succeeds.
  const addendumOut = runScript(
    ["--date", "2026-04-03", "--tz", "UTC", "--addendum", "--note", "fix typo", "--no-rotate"],
    { repoRoot: repo, archivesRoot: archives }
  );
  assert.match(addendumOut.stdout, /wrote addendum:/);
  const addendumGlob = fs
    .readdirSync(path.join(archives, "2026", "04", "03"))
    .filter((name) => name.includes("ADDENDUM"));
  assert.equal(addendumGlob.length, 1, "exactly one addendum file should exist");
  const addendumPath = path.join(archives, "2026", "04", "03", addendumGlob[0]!);
  assert.match(fs.readFileSync(addendumPath, "utf8"), /Note: fix typo/);

  // Run #4: same-day addendum → must refuse (one addendum per filing day).
  let secondAddendumErr: Error | null = null;
  try {
    runScript(
      ["--date", "2026-04-03", "--tz", "UTC", "--addendum", "--note", "second try", "--no-rotate"],
      { repoRoot: repo, archivesRoot: archives }
    );
  } catch (err) {
    secondAddendumErr = err as Error;
  }
  assert.ok(secondAddendumErr, "second addendum on the same filing day must fail");
  assert.match(String(secondAddendumErr?.message ?? ""), /addendum already exists/);

  fs.rmSync(repo, { recursive: true, force: true });
});

test("CLI rejects --addendum when no primary report exists", () => {
  const repo = makeRepo();
  const archives = path.join(repo, "archives", "daily");

  let err: Error | null = null;
  try {
    runScript(["--date", "2026-04-03", "--tz", "UTC", "--addendum", "--no-rotate"], {
      repoRoot: repo,
      archivesRoot: archives
    });
  } catch (e) {
    err = e as Error;
  }
  assert.ok(err);
  assert.match(String(err?.message ?? ""), /primary report does not exist/);

  fs.rmSync(repo, { recursive: true, force: true });
});
