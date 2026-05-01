import { config } from "../config.js";
import { fetchJson } from "../lib/http.js";

export async function getVyrdoxHealth() {
  return fetchJson(`${config.vyrdox.internalBase}/health`);
}

export async function getVyrdoxStatus() {
  return fetchJson(`${config.vyrdox.internalBase}/status`);
}
