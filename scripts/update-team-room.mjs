#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";

import { config } from "../backend/src/config.js";
import { runCommand } from "../backend/src/lib/command.js";
import { getAnchorStatus } from "../backend/src/telemetry/anchor.js";
import { getAsusStatus } from "../backend/src/telemetry/asus.js";
import { getDellStatus } from "../backend/src/telemetry/dell.js";
import { getLogs } from "../backend/src/telemetry/logs.js";

const AUTO_START = "<!-- AUTO-GENERATED:START -->";
const AUTO_END = "<!-- AUTO-GENERATED:END -->";

function formatLocalDate(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(now);
}

function formatLocalTime(now = new Date()) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZoneName: "short"
  }).format(now);
}

function bullet(lines) {
  return lines.filter(Boolean).map((line) => `- ${line}`).join("\n");
}

function safeText(value, fallback = "unavailable") {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text ? text : fallback;
}

async function fileTail(filePath, maxLines = 20) {
  try {
    const content = await fs.readFile(filePath, "utf8");
    const lines = content.split("\n").filter((line) => line.trim().length > 0);
    return lines.slice(-maxLines).join("\n");
  } catch {
    return "";
  }
}

function extractSection(markdown, heading) {
  const lines = markdown.split("\n");
  const start = lines.findIndex((line) => line.trim() === `## ${heading}`);
  if (start === -1) return "";
  const out = [];
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().startsWith("## ")) break;
    out.push(line);
  }
  return out.join("\n").trim();
}

function bulletsFromSection(section, { limit = 8 } = {}) {
  return section
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .slice(0, limit)
    .map((line) => line.replace(/^- /, ""));
}

async function summarizeAsusDailyReport(filePath) {
  try {
    const md = await fs.readFile(filePath, "utf8");
    const riskMatch = md.match(/Current risk level:\s*\*\*([A-Z]+)\*\*/i);
    const achievements = bulletsFromSection(extractSection(md, "Achievements (Today)"), { limit: 6 });
    const risks = extractSection(md, "Risks / Damage Watch")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 4);

    const lines = [];
    if (riskMatch?.[1]) lines.push(`Daily report risk: ${riskMatch[1].toUpperCase()}`);
    if (achievements.length) lines.push(`Daily report achievements: ${achievements.join(" | ")}`);
    if (risks.length) lines.push(`Daily report risks: ${risks.join(" | ")}`);
    return lines;
  } catch {
    return [];
  }
}

async function summarizeAsusDailyOperation(filePath) {
  try {
    const md = await fs.readFile(filePath, "utf8");
    const runtime = bulletsFromSection(extractSection(md, "Runtime Status"), { limit: 12 });
    const workspace = bulletsFromSection(extractSection(md, "Workspace Snapshot"), { limit: 8 });
    const risk = bulletsFromSection(extractSection(md, "Risk Classification"), { limit: 8 });

    const findByPrefix = (arr, prefix) => arr.find((item) => item.toLowerCase().startsWith(prefix.toLowerCase()));

    const codexApi = findByPrefix(runtime, "Codex API:");
    const activeTask = findByPrefix(workspace, "Active task id:");
    const activeState = findByPrefix(workspace, "Active task state:");
    const riskLevel = findByPrefix(risk, "Level:");
    const riskNotes = findByPrefix(risk, "Notes:");

    const lines = [];
    if (codexApi) lines.push(`Daily operation ${codexApi}`);
    if (activeTask || activeState) lines.push(`Workspace: ${activeTask || "Active task id: n/a"} | ${activeState || "Active task state: n/a"}`);
    if (riskLevel || riskNotes) lines.push(`Daily operation risk: ${riskLevel || "Level: n/a"} | ${riskNotes || "Notes: n/a"}`);
    return lines;
  } catch {
    return [];
  }
}

async function latestByMtime(dirPath, { suffix = ".md", limit = 1, maxDepth = 2 } = {}) {
  const walkFiles = async (currentPath, depth) => {
    if (depth > maxDepth) return [];
    try {
      const entries = await fs.readdir(currentPath, { withFileTypes: true });
      const out = [];
      for (const entry of entries) {
        const fullPath = path.join(currentPath, entry.name);
        if (entry.isFile()) {
          if (!suffix || entry.name.endsWith(suffix)) out.push(fullPath);
          continue;
        }
        if (entry.isDirectory()) {
          out.push(...(await walkFiles(fullPath, depth + 1)));
        }
      }
      return out;
    } catch {
      return [];
    }
  };

  const files = await walkFiles(dirPath, 0);
  const stats = await Promise.all(
    files.map(async (fullPath) => {
      try {
        const st = await fs.stat(fullPath);
        return { name: path.basename(fullPath), fullPath, mtimeMs: st.mtimeMs };
      } catch {
        return null;
      }
    })
  );

  return stats
    .filter(Boolean)
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .slice(0, limit);
}

async function gitRecent(repoPath, { since = "24 hours ago", limit = 6 } = {}) {
  const result = await runCommand("git", [
    "-C",
    repoPath,
    "log",
    `--since=${since}`,
    "-n",
    String(limit),
    "--pretty=format:%h %ad %s",
    "--date=short"
  ]);
  if (!result.ok) return [];
  const lines = (result.stdout || "").split("\n").map((line) => line.trim()).filter(Boolean);
  return lines;
}

function deriveChallenges({ asus, dell, anchor, riskAlertTail }) {
  const challenges = [];

  if (asus?.baseline?.allPresent === false) {
    challenges.push("ASUS baseline docs incomplete (governance state not GREEN).");
  }
  if (asus?.systemState && String(asus.systemState).trim() !== "running") {
    challenges.push(`ASUS system state: ${asus.systemState}`);
  }

  if (dell?.reachable === false) {
    challenges.push("DELL unreachable (no proxy + no SSH visibility).");
  }
  if (dell?.authRequired) {
    challenges.push("DELL telemetry blocked: SSH auth required (set up read-only SSH identity).");
  }

  const anchorState = safeText(anchor?.classification, "");
  if (anchorState && !["ANCHORED", "ALREADY_SEEN", "VISIBLE"].includes(anchorState)) {
    challenges.push(`Anchor status not stable: ${anchorState}`);
  }

  if (riskAlertTail.includes("| HIGH |")) {
    challenges.push("Risk alerts present (HIGH). Review latest alerts log.");
  }

  return challenges;
}

async function buildTeamRoomMarkdown({ manualNotes, asus, dell, anchor, archives, archiveSummary, riskAlertTail, git }) {
  const now = new Date();
  const localDate = formatLocalDate(now);
  const localTime = formatLocalTime(now);

  const overviewLines = [
    `ASUS: status=${safeText(asus?.status)} system=${safeText(asus?.systemState)} tailscale=${safeText(asus?.tailscale)} disk=${safeText(asus?.resources?.disk?.raw)}`,
    `DELL: reachable=${dell?.reachable ? "yes" : "no"} system=${safeText(dell?.systemState)} auth=${dell?.authRequired ? "required" : "ok"} role=${safeText(dell?.role, "DELL")}`,
    `Anchor: mode=${safeText(anchor?.mode)} classification=${safeText(anchor?.classification)} next=${safeText(anchor?.nextTimer)} tx=${safeText(anchor?.lastTxHash, "n/a")}`
  ];

  const archiveLines = [];
  if (archives?.dailyReport?.name) {
    archiveLines.push(`ASUS daily report: ${archives.dailyReport.fullPath}`);
  }
  if (archives?.dailyOperation?.name) {
    archiveLines.push(`ASUS daily operation: ${archives.dailyOperation.fullPath}`);
  }
  if (archiveLines.length === 0) {
    archiveLines.push("No ASUS daily archive files detected.");
  }

  const archiveSummaryLines = Array.isArray(archiveSummary) ? archiveSummary.filter(Boolean) : [];

  const logBlocks = [];
  const [dellCore, dellAttest, asusTailscaled] = await Promise.all([
    getLogs({ source: "dell", service: "vyrdx-core.service", limit: 20 }),
    getLogs({ source: "dell", service: "vyrdx-attestation-refresh.service", limit: 20 }),
    getLogs({ source: "asus", service: "tailscaled.service", limit: 15 })
  ]);

  if (dellCore.ok) logBlocks.push(["DELL vyrdx-core.service (tail)", dellCore.output]);
  if (dellAttest.ok) logBlocks.push(["DELL vyrdx-attestation-refresh.service (tail)", dellAttest.output]);
  if (asusTailscaled.ok) logBlocks.push(["ASUS tailscaled.service (tail)", asusTailscaled.output]);

  const challenges = deriveChallenges({ asus, dell, anchor, riskAlertTail });
  const needs = [];
  if (dell?.authRequired) {
    needs.push("Set `DELL_SSH_IDENTITY_FILE` + `DELL_SSH_KNOWN_HOSTS` in `/home/t79/vyrdon/consolelab/.env` (read-only key).");
  }
  if (riskAlertTail.includes("Codex health endpoint unavailable")) {
    needs.push("Check ASUS Codex engine health on `http://127.0.0.1:4000/health`.");
  }
  if (asus?.baseline?.allPresent === false) {
    needs.push("Confirm baseline docs under `/home/t79/VYRDON/baseline` (visibility only).");
  }

  const sections = [
    `# Team Room`,
    ``,
    `${AUTO_START}`,
    `## Daily Update — ${localDate}`,
    ``,
    `Updated: ${localTime}`,
    ``,
    `### Overview`,
    bullet(overviewLines),
    ``,
    `### Builds / Changes (last 24h)`,
    `ASUS repo:`,
    git.asus.length ? bullet(git.asus) : "- (no commits detected)",
    ``,
    `Lab console repo:`,
    git.lab.length ? bullet(git.lab) : "- (no commits detected)",
    ``,
    `### Archives (ASUS)`,
    bullet(archiveLines),
    ``,
    `### Archive Summary (ASUS)`,
    archiveSummaryLines.length ? bullet(archiveSummaryLines) : "- (no summary available)",
    ``,
    `### Alerts (ASUS)`,
    riskAlertTail ? `\n${riskAlertTail}\n` : "\n(no alerts file found)\n",
    `### Challenges`,
    challenges.length ? bullet(challenges) : "- none detected",
    ``,
    `### Needed / Next`,
    needs.length ? bullet(needs) : "- none",
    ``,
    `### Service Logs (tail)`,
    ...logBlocks.flatMap(([title, content]) => {
      const safe = safeText(content, "(empty)");
      return [`[${title}]`, safe, ``];
    }),
    `${AUTO_END}`,
    ``,
    `## Manual Notes`,
    manualNotes?.trim()
      ? manualNotes.trim()
      : [
          "- Keep Lab Console read-only.",
          "- Don’t store passwords in files or repos.",
          "- Add any human context below this line."
        ].join("\n")
  ];

  return sections.join("\n").replace(/\n{3,}/g, "\n\n");
}

function extractManualNotes(existing) {
  const needle = "\n## Manual Notes";
  const idx = existing.indexOf(needle);
  if (idx === -1) return "";
  return existing.slice(idx + needle.length).trimStart();
}

async function updateTeamRoomFile(content, { existing, hadMarkers }) {
  const filePath = path.join(config.docsDir, "team-room.md");

  if (!hadMarkers) {
    await fs.writeFile(filePath, content, "utf8");
    return { filePath, mode: existing ? "migrated" : "created" };
  }

  const before = existing.split(AUTO_START)[0];
  const after = existing.split(AUTO_END)[1] ?? "";
  const generated = content.split(AUTO_START)[1]?.split(AUTO_END)[0] ?? "";

  const next = `${before}${AUTO_START}${generated}${AUTO_END}${after}`.replace(/\n{3,}/g, "\n\n");
  await fs.writeFile(filePath, next, "utf8");
  return { filePath, mode: "updated" };
}

async function writeDailySnapshot(content) {
  const now = new Date();
  const day = formatLocalDate(now);
  const dir = path.join(config.docsDir, "team-room-daily");
  const filePath = path.join(dir, `${day}.md`);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(filePath, content, "utf8");
  return filePath;
}

async function main() {
  const teamRoomPath = path.join(config.docsDir, "team-room.md");
  let existing = "";
  try {
    existing = await fs.readFile(teamRoomPath, "utf8");
  } catch {
    existing = "";
  }

  const hadMarkers = existing.includes(AUTO_START) && existing.includes(AUTO_END);
  const manualNotes = extractManualNotes(existing) || (hadMarkers ? "" : existing);

  const [asus, dell, anchor] = await Promise.all([getAsusStatus(), getDellStatus(), getAnchorStatus()]);
  const [dailyReport] = await latestByMtime("/home/t79/ASUS/archive/ARCHIVE_DAILY_REPORT", { limit: 1 });
  const [dailyOperation] = await latestByMtime("/home/t79/ASUS/archive/ARCHIVE_DAILY_OPERATION", { limit: 1 });
  const riskAlertTail = await fileTail("/home/t79/ASUS/archive/ALERTS/risk-alerts.log", 12);

  const [dailyReportSummary, dailyOperationSummary] = await Promise.all([
    dailyReport?.fullPath ? summarizeAsusDailyReport(dailyReport.fullPath) : Promise.resolve([]),
    dailyOperation?.fullPath ? summarizeAsusDailyOperation(dailyOperation.fullPath) : Promise.resolve([])
  ]);

  const [gitAsus, gitLab] = await Promise.all([
    gitRecent("/home/t79/ASUS"),
    gitRecent("/home/t79/vyrdon/consolelab")
  ]);

  const content = await buildTeamRoomMarkdown({
    manualNotes,
    asus,
    dell,
    anchor,
    archives: {
      dailyReport: dailyReport || null,
      dailyOperation: dailyOperation || null
    },
    archiveSummary: [...dailyReportSummary, ...dailyOperationSummary],
    riskAlertTail,
    git: { asus: gitAsus, lab: gitLab }
  });

  const snapshotPath = await writeDailySnapshot(content);
  const { filePath, mode } = await updateTeamRoomFile(content, { existing, hadMarkers });

  process.stdout.write(`team-room: ${mode} ${filePath}\n`);
  process.stdout.write(`team-room snapshot: ${snapshotPath}\n`);
}

main().catch((error) => {
  process.stderr.write(`team-room update failed: ${error?.stack || error}\n`);
  process.exitCode = 1;
});
