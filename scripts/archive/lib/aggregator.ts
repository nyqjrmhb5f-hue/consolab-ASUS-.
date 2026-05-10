/**
 * Pure aggregator: given a repo root, a target day, and a timezone, walk the
 * room directories the daily-report contract pins and return a structured
 * summary that the renderer can turn into Markdown.
 *
 * No process exits, no console output, no file writes — this module is
 * unit-testable in isolation.
 */

import fs from "node:fs";
import path from "node:path";
import { dayKeyFor, parseEventTimestamp, type DayKey } from "./dates.js";

/**
 * Directories declared by the daily-report contract. Order is significant
 * for the rendered "rooms walked" section so reviewers see the same shape
 * every day.
 */
export const ROOM_TARGETS: ReadonlyArray<{ room: string; subdirs: ReadonlyArray<string> }> = [
  { room: "05_CENTRAL_BRAIN", subdirs: ["commands", "telemetry", "workflows"] },
  { room: "10_SHARED_BACKBONE", subdirs: ["gateway_api", "agent_gateway", "server"] },
  { room: "04_EVIDENCE_ROOM", subdirs: ["audit_trails", "signer_events", "release_gates", "proofs"] },
  { room: "07_INTELLIGENCE_TUNNEL", subdirs: ["approvals", "audit", "session_control", "relay"] },
  { room: "09_DEPLOYMENT", subdirs: ["release", "healthchecks", "rollback"] }
] as const;

export interface RoomScan {
  room: string;
  subdir: string;
  absolutePath: string;
  exists: boolean;
  matchedFiles: number;
  matchedEntries: number;
  /** events/files we couldn't time-attribute go here; surfaced in next-actions. */
  untimedFiles: number;
}

export interface EvidenceArtifactCount {
  artifact: string;
  total: number;
  firstTxHash: string | null;
  lastTxHash: string | null;
  byComponent: Record<string, number>;
}

export interface ApprovalRecord {
  source: string;
  trackingId: string;
  action: string | null;
  status: "pending" | "approved" | "rejected" | "unknown";
  approver: string | null;
  at: string | null;
}

export interface ReleaseRecord {
  kind: "rollback" | "release_strategy" | "healthcheck";
  source: string;
  at: string | null;
  detail: string;
}

export interface NextAction {
  reason: string;
  ref: string;
}

export interface DailyReport {
  dayKey: DayKey;
  timeZone: string;
  generatedAt: string;
  gitSha: string | null;
  gitShaShort: string | null;
  repoRoot: string;
  rooms: RoomScan[];
  evidence: EvidenceArtifactCount[];
  approvals: {
    pending: ApprovalRecord[];
    approved: ApprovalRecord[];
    rejected: ApprovalRecord[];
  };
  releases: ReleaseRecord[];
  workflowsTouched: number;
  commandsIntake: number;
  commandsExecution: number;
  nextActions: NextAction[];
}

interface AggregateInputs {
  repoRoot: string;
  dayKey: DayKey;
  timeZone: string;
  generatedAt: Date;
  gitSha: string | null;
}

export function aggregateDailyReport(input: AggregateInputs): DailyReport {
  const { repoRoot, dayKey, timeZone } = input;
  const rooms: RoomScan[] = [];
  const evidence: EvidenceArtifactCount[] = [];
  const approvalsBuckets: DailyReport["approvals"] = { pending: [], approved: [], rejected: [] };
  const releases: ReleaseRecord[] = [];
  const nextActions: NextAction[] = [];

  let workflowsTouched = 0;
  let commandsIntake = 0;
  let commandsExecution = 0;

  for (const target of ROOM_TARGETS) {
    for (const subdir of target.subdirs) {
      const abs = path.join(repoRoot, target.room, subdir);
      const scan = scanDir(abs, dayKey, timeZone);
      rooms.push({ room: target.room, subdir, absolutePath: abs, ...scan });
      if (!scan.exists) {
        nextActions.push({
          reason: `room directory missing — create or stop referencing it`,
          ref: `${target.room}/${subdir}/`
        });
      }
    }
  }

  // Evidence Room artifact summaries (separate from the room-walk so we can
  // expose tx-hash boundaries which the contract calls "evidence stamp summary").
  const evidenceArtifacts = ["tx_hashes", "audit_trails", "signer_events", "attestations", "runtime_journals"];
  for (const artifact of evidenceArtifacts) {
    const file = path.join(repoRoot, "04_EVIDENCE_ROOM", artifact, "events.jsonl");
    evidence.push(summarizeEvidenceArtifact(artifact, file, dayKey, timeZone));
  }

  // Approvals across the three rooms that own approval state.
  collectApprovals(repoRoot, dayKey, timeZone, approvalsBuckets);

  // Release activity from 09_DEPLOYMENT.
  collectReleases(repoRoot, dayKey, timeZone, releases);

  // Workflow + command activity counters.
  workflowsTouched = countDayMatchedFiles(
    path.join(repoRoot, "05_CENTRAL_BRAIN", "workflows"),
    dayKey,
    timeZone
  );
  commandsIntake = countJsonlLinesOnDay(
    path.join(repoRoot, "10_SHARED_BACKBONE", "agent_gateway", "command_intake.jsonl"),
    dayKey,
    timeZone
  );
  commandsExecution = countJsonlLinesOnDay(
    path.join(repoRoot, "10_SHARED_BACKBONE", "agent_gateway", "command_execution.jsonl"),
    dayKey,
    timeZone
  );

  // Derive next-actions from things that look unfinished.
  for (const approval of approvalsBuckets.pending) {
    nextActions.push({
      reason: `approval still pending`,
      ref: `${approval.source} :: ${approval.trackingId}${approval.action ? ` (${approval.action})` : ""}`
    });
  }
  for (const release of releases) {
    if (release.kind === "rollback") {
      nextActions.push({ reason: `rollback recorded — confirm release follow-up`, ref: release.source });
    }
  }

  return {
    dayKey,
    timeZone,
    generatedAt: input.generatedAt.toISOString(),
    gitSha: input.gitSha,
    gitShaShort: input.gitSha ? input.gitSha.slice(0, 12) : null,
    repoRoot,
    rooms,
    evidence,
    approvals: approvalsBuckets,
    releases,
    workflowsTouched,
    commandsIntake,
    commandsExecution,
    nextActions: dedupeNextActions(nextActions)
  };
}

function dedupeNextActions(entries: NextAction[]): NextAction[] {
  const seen = new Set<string>();
  const out: NextAction[] = [];
  for (const entry of entries) {
    const key = `${entry.reason}::${entry.ref}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(entry);
  }
  return out;
}

function safeReaddir(dir: string): string[] {
  try {
    return fs.readdirSync(dir).filter((name) => !name.startsWith("."));
  } catch {
    return [];
  }
}

function scanDir(
  abs: string,
  dayKey: DayKey,
  timeZone: string
): { exists: boolean; matchedFiles: number; matchedEntries: number; untimedFiles: number } {
  let exists = false;
  try {
    const stat = fs.statSync(abs);
    exists = stat.isDirectory();
  } catch {
    exists = false;
  }
  if (!exists) return { exists, matchedFiles: 0, matchedEntries: 0, untimedFiles: 0 };

  let matchedFiles = 0;
  let matchedEntries = 0;
  let untimedFiles = 0;

  const walk = (dir: string) => {
    for (const name of safeReaddir(dir)) {
      const full = path.join(dir, name);
      let stat: fs.Stats;
      try {
        stat = fs.statSync(full);
      } catch {
        continue;
      }
      if (stat.isDirectory()) {
        walk(full);
        continue;
      }
      if (name.endsWith(".jsonl")) {
        const lines = readJsonlLines(full);
        for (const line of lines) {
          const ts = inferTimestamp(line);
          if (ts && dayKeyFor(ts, timeZone) === dayKey) {
            matchedEntries++;
          }
        }
        if (lines.length > 0) matchedFiles++;
        continue;
      }
      if (name.endsWith(".json")) {
        const ts = inferTimestampForJsonFile(full, name);
        if (ts && dayKeyFor(ts, timeZone) === dayKey) {
          matchedFiles++;
          matchedEntries++;
        } else if (!ts) {
          untimedFiles++;
        }
        continue;
      }
      // README/yaml/config files are ignored for time-bucketing.
    }
  };

  walk(abs);
  return { exists, matchedFiles, matchedEntries, untimedFiles };
}

function readJsonlLines(file: string): Array<Record<string, unknown>> {
  let text = "";
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    return [];
  }
  const out: Array<Record<string, unknown>> = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    try {
      const parsed = JSON.parse(line);
      if (parsed && typeof parsed === "object") out.push(parsed as Record<string, unknown>);
    } catch {
      // ignore malformed lines; they are the operator's problem, not ours.
    }
  }
  return out;
}

function readJsonFile(file: string): Record<string, unknown> | null {
  try {
    const text = fs.readFileSync(file, "utf8");
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function inferTimestamp(record: Record<string, unknown>): Date | null {
  const candidates = [
    "timestamp",
    "created_at",
    "recorded_at",
    "received_at",
    "approved_at",
    "executed_at",
    "ts"
  ];
  for (const key of candidates) {
    if (key in record) {
      const t = parseEventTimestamp(record[key]);
      if (t) return t;
    }
  }
  // entry.timestamp pattern from runtime_journals
  if (record.entry && typeof record.entry === "object") {
    const inner = record.entry as Record<string, unknown>;
    if ("timestamp" in inner) {
      const t = parseEventTimestamp(inner.timestamp);
      if (t) return t;
    }
  }
  return null;
}

function inferTimestampForJsonFile(file: string, name: string): Date | null {
  const fromFilename = parseEventTimestamp(name);
  if (fromFilename) return fromFilename;
  const json = readJsonFile(file);
  if (!json) return null;
  return inferTimestamp(json);
}

function summarizeEvidenceArtifact(
  artifact: string,
  file: string,
  dayKey: DayKey,
  timeZone: string
): EvidenceArtifactCount {
  const result: EvidenceArtifactCount = {
    artifact,
    total: 0,
    firstTxHash: null,
    lastTxHash: null,
    byComponent: {}
  };
  for (const record of readJsonlLines(file)) {
    const ts = inferTimestamp(record);
    if (!ts || dayKeyFor(ts, timeZone) !== dayKey) continue;
    result.total++;
    const tx = typeof record.tx_hash === "string" ? record.tx_hash : null;
    if (tx) {
      if (!result.firstTxHash) result.firstTxHash = tx;
      result.lastTxHash = tx;
    }
    const component = readEvidenceComponent(record);
    if (component) {
      result.byComponent[component] = (result.byComponent[component] ?? 0) + 1;
    }
  }
  return result;
}

function readEvidenceComponent(record: Record<string, unknown>): string | null {
  if (typeof record.component === "string") return record.component;
  if (record.entry && typeof record.entry === "object") {
    const inner = record.entry as Record<string, unknown>;
    if (typeof inner.component === "string") return inner.component;
  }
  return null;
}

function collectApprovals(
  repoRoot: string,
  dayKey: DayKey,
  timeZone: string,
  buckets: DailyReport["approvals"]
): void {
  const sources = [
    { source: "07_INTELLIGENCE_TUNNEL/approvals", dir: path.join(repoRoot, "07_INTELLIGENCE_TUNNEL", "approvals") },
    { source: "10_SHARED_BACKBONE/agent_gateway/approvals", dir: path.join(repoRoot, "10_SHARED_BACKBONE", "agent_gateway", "approvals") },
    { source: "01_EXECUTIVE/approvals/pending", dir: path.join(repoRoot, "01_EXECUTIVE", "approvals", "pending") },
    { source: "01_EXECUTIVE/approvals/signed", dir: path.join(repoRoot, "01_EXECUTIVE", "approvals", "signed") }
  ];

  for (const { source, dir } of sources) {
    for (const name of safeReaddir(dir)) {
      if (!name.endsWith(".json")) continue;
      const full = path.join(dir, name);
      const json = readJsonFile(full);
      if (!json) continue;
      const ts = inferTimestamp(json) ?? parseEventTimestamp(name);
      if (!ts || dayKeyFor(ts, timeZone) !== dayKey) continue;

      const trackingId = typeof json.tracking_id === "string" ? json.tracking_id : name.replace(/\.json$/, "");
      const action = typeof json.action === "string" ? json.action : null;
      const record = derivedApprovalRecord(source, trackingId, action, json);
      if (record.status === "approved") buckets.approved.push(record);
      else if (record.status === "rejected") buckets.rejected.push(record);
      else buckets.pending.push(record);
    }
  }
}

function derivedApprovalRecord(
  source: string,
  trackingId: string,
  action: string | null,
  json: Record<string, unknown>
): ApprovalRecord {
  const directStatus = typeof json.status === "string" ? json.status : null;
  const approvalState = (json.approval_state ?? {}) as Record<string, { status?: string; approved_by?: string; approved_at?: string }>;
  const states = Object.values(approvalState);
  let status: ApprovalRecord["status"] = "unknown";
  let approver: string | null = null;
  let at: string | null = null;

  if (states.length > 0) {
    const allApproved = states.every((s) => s?.status === "approved");
    const anyRejected = states.some((s) => s?.status === "rejected");
    if (anyRejected) status = "rejected";
    else if (allApproved) status = "approved";
    else status = "pending";
    const last = states.find((s) => s?.approved_at);
    approver = last?.approved_by ?? null;
    at = last?.approved_at ?? null;
  } else if (directStatus === "pending_approval" || directStatus === "pending") {
    status = "pending";
  } else if (directStatus === "approved") {
    status = "approved";
  } else if (directStatus === "rejected") {
    status = "rejected";
  }

  return { source, trackingId, action, status, approver, at };
}

function collectReleases(
  repoRoot: string,
  dayKey: DayKey,
  timeZone: string,
  out: ReleaseRecord[]
): void {
  const releaseDir = path.join(repoRoot, "09_DEPLOYMENT", "release");
  for (const name of safeReaddir(releaseDir)) {
    if (!(name.endsWith(".yaml") || name.endsWith(".yml") || name.endsWith(".json"))) continue;
    out.push({
      kind: "release_strategy",
      source: `09_DEPLOYMENT/release/${name}`,
      at: null,
      detail: "release strategy reference"
    });
  }

  const rollbackDir = path.join(repoRoot, "09_DEPLOYMENT", "rollback");
  for (const name of safeReaddir(rollbackDir)) {
    if (!name.endsWith(".json")) continue;
    const json = readJsonFile(path.join(rollbackDir, name));
    if (!json) continue;
    const ts = inferTimestamp(json) ?? parseEventTimestamp(name);
    if (!ts || dayKeyFor(ts, timeZone) !== dayKey) continue;
    out.push({
      kind: "rollback",
      source: `09_DEPLOYMENT/rollback/${name}`,
      at: ts.toISOString(),
      detail: typeof json.action === "string" ? json.action : "rollback event"
    });
  }

  const healthDir = path.join(repoRoot, "09_DEPLOYMENT", "healthchecks");
  for (const name of safeReaddir(healthDir)) {
    if (!name.endsWith(".json") && !name.endsWith(".jsonl")) continue;
    out.push({
      kind: "healthcheck",
      source: `09_DEPLOYMENT/healthchecks/${name}`,
      at: null,
      detail: "healthcheck artifact"
    });
  }
}

function countDayMatchedFiles(dir: string, dayKey: DayKey, timeZone: string): number {
  let n = 0;
  for (const name of safeReaddir(dir)) {
    if (!name.endsWith(".json")) continue;
    const ts = parseEventTimestamp(name) ?? inferTimestamp(readJsonFile(path.join(dir, name)) ?? {});
    if (ts && dayKeyFor(ts, timeZone) === dayKey) n++;
  }
  return n;
}

function countJsonlLinesOnDay(file: string, dayKey: DayKey, timeZone: string): number {
  let n = 0;
  for (const record of readJsonlLines(file)) {
    const ts = inferTimestamp(record);
    if (ts && dayKeyFor(ts, timeZone) === dayKey) n++;
  }
  return n;
}
