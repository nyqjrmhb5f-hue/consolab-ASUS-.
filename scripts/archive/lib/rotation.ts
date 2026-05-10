/**
 * 365-day rotation for `archives/daily/`. Deletes any `YYYY/MM/DD/` whose
 * date is strictly more than `retentionDays` days before `today` in the
 * report timezone. README files at any level are preserved.
 */

import fs from "node:fs";
import path from "node:path";
import { dayKeyFor, isValidDayKey, daysBetween, type DayKey } from "./dates.js";

export interface RotationResult {
  retentionDays: number;
  todayKey: DayKey;
  deletedDirectories: string[];
  preservedReadmes: string[];
  errors: string[];
}

interface RotateInputs {
  archivesRoot: string;
  today: Date;
  timeZone: string;
  retentionDays?: number;
}

const DEFAULT_RETENTION = 365;

export function rotateDailyArchives(input: RotateInputs): RotationResult {
  const retentionDays = input.retentionDays ?? DEFAULT_RETENTION;
  const todayKey = dayKeyFor(input.today, input.timeZone);
  const result: RotationResult = {
    retentionDays,
    todayKey,
    deletedDirectories: [],
    preservedReadmes: [],
    errors: []
  };

  let years: string[];
  try {
    years = fs.readdirSync(input.archivesRoot).filter((name) => /^\d{4}$/.test(name));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return result;
    result.errors.push(`failed to read archives root: ${(err as Error).message}`);
    return result;
  }

  for (const year of years) {
    const yearDir = path.join(input.archivesRoot, year);
    let months: string[];
    try {
      months = fs.readdirSync(yearDir);
    } catch {
      continue;
    }
    for (const month of months) {
      if (!/^\d{2}$/.test(month)) continue;
      const monthDir = path.join(yearDir, month);
      let days: string[];
      try {
        days = fs.readdirSync(monthDir);
      } catch {
        continue;
      }
      for (const day of days) {
        if (!/^\d{2}$/.test(day)) continue;
        const dayKey = `${year}-${month}-${day}` as DayKey;
        if (!isValidDayKey(dayKey)) continue;
        const age = daysBetween(dayKey, todayKey);
        if (age <= retentionDays) continue;
        const dayDir = path.join(monthDir, day);
        try {
          fs.rmSync(dayDir, { recursive: true, force: true });
          result.deletedDirectories.push(dayDir);
        } catch (err) {
          result.errors.push(`failed to delete ${dayDir}: ${(err as Error).message}`);
        }
      }
      pruneIfEmpty(monthDir, result);
    }
    pruneIfEmpty(yearDir, result);
  }

  return result;
}

function pruneIfEmpty(dir: string, result: RotationResult): void {
  let entries: string[];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return;
  }
  if (entries.length === 0) {
    try {
      fs.rmdirSync(dir);
    } catch (err) {
      result.errors.push(`failed to remove empty ${dir}: ${(err as Error).message}`);
    }
    return;
  }
  if (entries.length === 1 && entries[0] === "README.md") {
    result.preservedReadmes.push(path.join(dir, "README.md"));
  }
}
