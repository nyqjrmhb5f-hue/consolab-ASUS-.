import { Router } from "express";
import { getAsusStatus } from "../telemetry/asus.js";
import { getDellStatus } from "../telemetry/dell.js";
import { getAnchorStatus } from "../telemetry/anchor.js";
import { getLogs } from "../telemetry/logs.js";
import { getTeamRoom } from "../telemetry/teamRoom.js";
import { getVyrdoxHealth } from "../services/vyrdoxRuntime.js";

export const telemetryRouter = Router();

telemetryRouter.get("/overview", async (_req, res) => {
  const [asus, dell, anchor, vyrdox] = await Promise.all([
    getAsusStatus(),
    getDellStatus(),
    getAnchorStatus(),
    getVyrdoxHealth()
  ]);
  res.json({
    asus: { status: asus.status, systemState: asus.systemState },
    dell: { status: dell.systemState, reachable: dell.reachable },
    sealcheck: anchor.rawLog?.includes("SEALCHECK: PASS")
      ? "PASS"
      : anchor.classification === "VISIBLE"
        ? "PROXY"
        : anchor.classification === "AUTH_REQUIRED"
          ? "AUTH_REQUIRED"
          : "UNKNOWN",
    anchor: anchor.classification,
    attestation: asus.attestation || "CHECKING",
    vyrdox: vyrdox.ok ? "OK" : "UNKNOWN"
  });
});

telemetryRouter.get("/machines/asus", async (_req, res) => {
  res.json(await getAsusStatus());
});

telemetryRouter.get("/machines/dell", async (_req, res) => {
  res.json(await getDellStatus());
});

telemetryRouter.get("/anchor", async (_req, res) => {
  res.json(await getAnchorStatus());
});

telemetryRouter.get("/logs", async (req, res) => {
  const source = String(req.query.source || "dell");
  const service = String(req.query.service || "vyrdx-core.service");
  const limit = Math.min(Number(req.query.limit || 50), 200);
  const result = await getLogs({ source, service, limit });
  if (!result.ok) {
    return res.status(400).json(result);
  }
  return res.json(result);
});

telemetryRouter.get("/team-room", async (_req, res) => {
  res.json(await getTeamRoom());
});
