#!/usr/bin/env -S node --import tsx
/**
 * ConsoleLab daily authority report writer.
 *
 *   archives/daily/YYYY/MM/DD/CONSOLELAB_DAILY_REPORT_YYYY-MM-DD.md
 *
 * Walks the room directories pinned by the daily-report contract, summarises
 * evidence stamps / approvals / releases / activity for the target day, and
 * appends a "next actions" list. Reports are immutable: the script refuses
 * to overwrite an existing report. Corrections must be filed as an addendum
 * via `--addendum` which writes a sibling
 * `CONSOLELAB_DAILY_REPORT_YYYY-MM-DD_ADDENDUM_YYYY-MM-DD.md`.
 *
 * Usage:
 *   node --import tsx scripts/archive/consolab-daily-report.ts
 *   node --import tsx scripts/archive/consolab-daily-report.ts --date 2026-04-03
 *   node --import tsx scripts/archive/consolab-daily-report.ts --addendum --date 2026-04-03 --note "fix typo"
 *   node --import tsx scripts/archive/consolab-daily-report.ts --no-rotate
 *   node --import tsx scripts/archive/consolab-daily-report.ts --tz UTC
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { aggregateDailyReport } from "./lib/aggregator.js";
import { renderDailyReportMarkdown } from "./lib/rendering.js";
import { rotateDailyArchives } from "./lib/rotation.js";
import { resolveGitSha } from "./lib/git.js";
import { dayKeyFor, isValidDayKey, previousDayKey, splitDayKey, type DayKey } from "./lib/dates.js";

interface CliOptions {
  date: DayKey | null;
  timeZone: string;
  addendum: boolean;
  note: string | null;
  rotate: boolean;
  retentionDays: number;
  repoRoot: string;
  archivesRoot: string;
}

function defaultRepoRoot(): string {
  // scripts/archive/consolab-daily-report.ts → repo root is two levels up.
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, "..", "..");
}

function defaultTimeZone(): string {
  if (process.env.CONSOLAB_REPORT_TZ && process.env.CONSOLAB_REPORT_TZ.trim()) {
    return process.env.CONSOLAB_REPORT_TZ.trim();
  }
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function parseArgs(argv: string[]): CliOptions {
  const repoRoot = process.env.CONSOLAB_REPO_ROOT?.trim() || defaultRepoRoot();
  const opts: CliOptions = {
    date: null,
    timeZone: defaultTimeZone(),
    addendum: false,
    note: null,
    rotate: true,
    retentionDays: 365,
    repoRoot,
    archivesRoot: path.join(repoRoot, "archives", "daily")
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--date": {
        const v = argv[++i];
        if (!v || !isValidDayKey(v)) throw new Error(`--date requires a YYYY-MM-DD value, got: ${String(v)}`);
        opts.date = v;
        break;
      }
      case "--tz":
      case "--timezone": {
        const v = argv[++i];
        if (!v) throw new Error("--tz requires an IANA timezone string");
        opts.timeZone = v;
        break;
      }
      case "--addendum":
        opts.addendum = true;
        break;
      case "--note": {
        const v = argv[++i];
        if (!v) throw new Error("--note requires a value");
        opts.note = v;
        break;
      }
      case "--no-rotate":
        opts.rotate = false;
        break;
      case "--retention-days": {
        const v = argv[++i];
        const n = Number(v);
        if (!Number.isFinite(n) || n < 1) throw new Error("--retention-days requires a positive integer");
        opts.retentionDays = Math.floor(n);
        break;
      }
      case "--repo-root": {
        const v = argv[++i];
        if (!v) throw new Error("--repo-root requires a path");
        opts.repoRoot = path.resolve(v);
        opts.archivesRoot = path.join(opts.repoRoot, "archives", "daily");
        break;
      }
      case "--archives-root": {
        const v = argv[++i];
        if (!v) throw new Error("--archives-root requires a path");
        opts.archivesRoot = path.resolve(v);
        break;
      }
      case "-h":
      case "--help":
        printHelp();
        process.exit(0);
        break;
      default:
        throw new Error(`unknown argument: ${arg}`);
    }
  }
  return opts;
}

function printHelp(): void {
  process.stdout.write(`consolab-daily-report — archive a CONSOLELAB daily authority report.

Options:
  --date YYYY-MM-DD       Target report date (default: yesterday in --tz).
  --tz IANA               Report timezone (default: $CONSOLAB_REPORT_TZ or system).
  --addendum              Write a sibling addendum file instead of the primary.
  --note TEXT             Free-form note to embed at the top of an addendum.
  --no-rotate             Skip the >365-day rotation pass.
  --retention-days N      Override retention window (default: 365).
  --repo-root PATH        Repo root (default: derived from script location).
  --archives-root PATH    Output root (default: REPO_ROOT/archives/daily).
  -h, --help              Show this help.

The script is immutable-by-default: it refuses to overwrite an existing
primary report, and appends addenda as sibling files. See archives/daily/README.md.
`);
}

interface ReportPaths {
  dayKey: DayKey;
  dayDir: string;
  primary: string;
  addendum: string;
}

function reportPaths(archivesRoot: string, dayKey: DayKey, generatedDayKey: DayKey): ReportPaths {
  const { year, month, day } = splitDayKey(dayKey);
  const dayDir = path.join(archivesRoot, year, month, day);
  const primary = path.join(dayDir, `CONSOLELAB_DAILY_REPORT_${dayKey}.md`);
  const addendum = path.join(dayDir, `CONSOLELAB_DAILY_REPORT_${dayKey}_ADDENDUM_${generatedDayKey}.md`);
  return { dayKey, dayDir, primary, addendum };
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const now = new Date();
  const targetDate: DayKey = opts.date ?? previousDayKey(now, opts.timeZone);
  const generatedDayKey: DayKey = dayKeyFor(now, opts.timeZone);

  const paths = reportPaths(opts.archivesRoot, targetDate, generatedDayKey);
  fs.mkdirSync(paths.dayDir, { recursive: true });

  const report = aggregateDailyReport({
    repoRoot: opts.repoRoot,
    dayKey: targetDate,
    timeZone: opts.timeZone,
    generatedAt: now,
    gitSha: resolveGitSha(opts.repoRoot)
  });

  let body = renderDailyReportMarkdown(report);

  if (opts.addendum) {
    if (!fs.existsSync(paths.primary)) {
      throw new Error(
        `cannot write addendum: primary report does not exist at ${paths.primary}. Run without --addendum first.`
      );
    }
    if (fs.existsSync(paths.addendum)) {
      throw new Error(
        `addendum already exists at ${paths.addendum}; pick a later --date or extend with a new addendum tomorrow.`
      );
    }
    const header =
      `> Addendum to \`CONSOLELAB_DAILY_REPORT_${targetDate}.md\` — filed ${generatedDayKey} (${opts.timeZone}).\n` +
      (opts.note ? `>\n> Note: ${opts.note}\n` : "") +
      "\n";
    fs.writeFileSync(paths.addendum, header + body, "utf8");
    process.stdout.write(`wrote addendum: ${paths.addendum}\n`);
  } else {
    if (fs.existsSync(paths.primary)) {
      throw new Error(
        `report already exists at ${paths.primary}. Reports are immutable — file an addendum with --addendum.`
      );
    }
    fs.writeFileSync(paths.primary, body, "utf8");
    process.stdout.write(`wrote report: ${paths.primary}\n`);
  }

  if (opts.rotate) {
    const rotation = rotateDailyArchives({
      archivesRoot: opts.archivesRoot,
      today: now,
      timeZone: opts.timeZone,
      retentionDays: opts.retentionDays
    });
    if (rotation.deletedDirectories.length > 0) {
      process.stdout.write(`rotated ${rotation.deletedDirectories.length} directories older than ${rotation.retentionDays} days\n`);
    }
    for (const err of rotation.errors) {
      process.stderr.write(`rotation error: ${err}\n`);
    }
  }
}

const isDirectInvocation = (() => {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return path.resolve(entry) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
})();

if (isDirectInvocation) {
  main().catch((err) => {
    process.stderr.write(`${(err as Error).message}\n`);
    process.exit(1);
  });
}

export { main };
