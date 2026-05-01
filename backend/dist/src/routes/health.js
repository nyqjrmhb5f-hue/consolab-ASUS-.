import { Router } from "express";

export const healthRouter = Router();

healthRouter.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "vyrdon-lab-console", utc: new Date().toISOString() });
});
