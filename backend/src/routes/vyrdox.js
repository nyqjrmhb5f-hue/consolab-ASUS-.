import { Router } from "express";
import { getVyrdoxHealth, getVyrdoxStatus } from "../services/vyrdoxRuntime.js";

export const vyrdoxRouter = Router();

vyrdoxRouter.get("/vyrdox/health", async (_req, res) => {
  const result = await getVyrdoxHealth();
  res.status(result.ok ? 200 : 502).json(result.ok ? result.data : result);
});

vyrdoxRouter.get("/vyrdox/status", async (_req, res) => {
  const result = await getVyrdoxStatus();
  res.status(result.ok ? 200 : 502).json(result.ok ? result.data : result);
});
