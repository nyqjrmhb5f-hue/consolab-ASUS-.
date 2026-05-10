import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

import { aggregateDailyReport, ROOM_TARGETS } from "../lib/aggregator.js";

function makeTempRepo(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "consolab-aggregator-"));
}

function writeJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value), "utf8");
}

function appendJsonl(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, `${JSON.stringify(value)}\n`, "utf8");
}

test("aggregator covers every contracted room/subdir even when missing on disk", () => {
  const repo = makeTempRepo();
  const report = aggregateDailyReport({
    repoRoot: repo,
    dayKey: "2026-04-03",
    timeZone: "UTC",
    generatedAt: new Date("2026-04-04T00:03:00Z"),
    gitSha: "deadbeefcafef00d"
  });

  const expectedPairs = ROOM_TARGETS.flatMap((t) => t.subdirs.map((s) => `${t.room}/${s}`));
  const actualPairs = report.rooms.map((r) => `${r.room}/${r.subdir}`);
  assert.deepEqual(actualPairs, expectedPairs, "rooms walked must match the contract, in declared order");

  for (const room of report.rooms) {
    assert.equal(room.exists, false, `${room.room}/${room.subdir} should be reported missing`);
    assert.equal(room.matchedFiles, 0);
    assert.equal(room.matchedEntries, 0);
  }

  // Every missing subdir must produce a next-action entry.
  const missingActions = report.nextActions.filter((a) => a.reason.includes("room directory missing"));
  assert.equal(missingActions.length, expectedPairs.length);

  fs.rmSync(repo, { recursive: true, force: true });
});

test("aggregator scopes events to the report day in the requested TZ", () => {
  const repo = makeTempRepo();
  const targetDay = "2026-04-03";

  // tx_hash event INSIDE the day in UTC
  appendJsonl(path.join(repo, "04_EVIDENCE_ROOM", "tx_hashes", "events.jsonl"), {
    event_id: "evt-in",
    tx_hash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    component: "codex",
    action: "seed",
    result: "ok",
    created_at: "2026-04-03T12:00:00.000Z"
  });
  // tx_hash event OUTSIDE the day
  appendJsonl(path.join(repo, "04_EVIDENCE_ROOM", "tx_hashes", "events.jsonl"), {
    event_id: "evt-out",
    tx_hash: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    component: "codex",
    action: "seed",
    result: "ok",
    created_at: "2026-04-04T12:00:00.000Z"
  });
  // audit_trails entry, same day
  appendJsonl(path.join(repo, "04_EVIDENCE_ROOM", "audit_trails", "events.jsonl"), {
    event_id: "audit-in",
    tx_hash: "ccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
    component: "ops",
    action: "approve",
    result: "ok",
    recorded_at: "2026-04-03T20:00:00.000Z"
  });
  // pending approval in 07
  writeJson(
    path.join(repo, "07_INTELLIGENCE_TUNNEL", "approvals", "20260403T042509415Z-e969e1fa.json"),
    {
      tracking_id: "20260403T042509415Z-e969e1fa",
      action: "open_remote_tunnel",
      received_at: "2026-04-03T04:25:09.415Z",
      approval_state: {
        executive: { status: "approved", approved_by: "alice", approved_at: "2026-04-03T05:00:00Z" },
        tunnel: { status: "pending" }
      }
    }
  );
  // approved approval (all sub-states approved) in agent_gateway
  writeJson(
    path.join(repo, "10_SHARED_BACKBONE", "agent_gateway", "approvals", "20260403T060018679Z-313cef75.json"),
    {
      tracking_id: "20260403T060018679Z-313cef75",
      action: "rotate_keys",
      received_at: "2026-04-03T06:00:18.679Z",
      approval_state: {
        executive: { status: "approved", approved_by: "bob", approved_at: "2026-04-03T06:30:00Z" }
      }
    }
  );
  // rollback today
  writeJson(
    path.join(repo, "09_DEPLOYMENT", "rollback", "20260403T081614284Z-41ec3c58.json"),
    {
      tracking_id: "20260403T081614284Z-41ec3c58",
      action: "rollback_revert",
      recorded_at: "2026-04-03T08:16:14.284Z"
    }
  );
  // workflow today + workflow on a different day
  writeJson(
    path.join(repo, "05_CENTRAL_BRAIN", "workflows", "20260403T042509415Z-e969e1fa.json"),
    { tracking_id: "20260403T042509415Z-e969e1fa", action: "open_remote_tunnel" }
  );
  writeJson(
    path.join(repo, "05_CENTRAL_BRAIN", "workflows", "20260404T042509415Z-other.json"),
    { tracking_id: "20260404T042509415Z-other", action: "noop" }
  );
  // command intake/exec
  appendJsonl(
    path.join(repo, "10_SHARED_BACKBONE", "agent_gateway", "command_intake.jsonl"),
    { tracking_id: "cmd-1", timestamp: "2026-04-03T07:00:00Z", action: "read_status" }
  );
  appendJsonl(
    path.join(repo, "10_SHARED_BACKBONE", "agent_gateway", "command_intake.jsonl"),
    { tracking_id: "cmd-2", timestamp: "2026-04-04T07:00:00Z", action: "read_status" }
  );
  appendJsonl(
    path.join(repo, "10_SHARED_BACKBONE", "agent_gateway", "command_execution.jsonl"),
    { tracking_id: "cmd-1", timestamp: "2026-04-03T07:00:01Z", action: "read_status" }
  );

  const report = aggregateDailyReport({
    repoRoot: repo,
    dayKey: targetDay,
    timeZone: "UTC",
    generatedAt: new Date("2026-04-04T00:03:00Z"),
    gitSha: null
  });

  // evidence: only the in-day tx hash counts
  const txArtifact = report.evidence.find((e) => e.artifact === "tx_hashes");
  assert.equal(txArtifact?.total, 1);
  assert.equal(txArtifact?.firstTxHash, "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
  assert.equal(txArtifact?.lastTxHash, "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
  const auditArtifact = report.evidence.find((e) => e.artifact === "audit_trails");
  assert.equal(auditArtifact?.total, 1);

  // approvals
  assert.equal(report.approvals.pending.length, 1, "the partially-approved request should still be pending");
  assert.equal(report.approvals.approved.length, 1);
  assert.equal(report.approvals.rejected.length, 0);

  // releases
  const rollbacks = report.releases.filter((r) => r.kind === "rollback");
  assert.equal(rollbacks.length, 1);

  // counters
  assert.equal(report.workflowsTouched, 1);
  assert.equal(report.commandsIntake, 1);
  assert.equal(report.commandsExecution, 1);

  // next actions: pending approval gets surfaced; rollback gets surfaced
  const reasons = report.nextActions.map((a) => a.reason);
  assert.ok(reasons.some((r) => r.includes("approval still pending")));
  assert.ok(reasons.some((r) => r.includes("rollback recorded")));

  fs.rmSync(repo, { recursive: true, force: true });
});
