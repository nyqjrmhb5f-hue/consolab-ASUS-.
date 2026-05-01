import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { config } from "../config.js";
import { fetchJson } from "../lib/http.js";

function tcpProbe(host, port, timeoutMs = 2000) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let done = false;

    const finish = (ok, message) => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve({ ok, message });
    };

    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish(true, `connected ${host}:${port}`));
    socket.once("timeout", () => finish(false, `timeout ${host}:${port}`));
    socket.once("error", (error) => finish(false, error?.message || `error ${host}:${port}`));

    try {
      socket.connect(port, host);
    } catch (error) {
      finish(false, error?.message || `error ${host}:${port}`);
    }
  });
}

function normalizeStatus(name, result, details = {}) {
  return {
    name,
    status: result.ok ? "UP" : "DOWN",
    detail: result.message,
    ...details
  };
}

async function checkHttp(name, url) {
  const result = await fetchJson(url, { timeout: 2500 });
  return normalizeStatus(name, {
    ok: result.ok,
    message: result.ok ? `http ${url}` : result.error || `status ${result.status}`
  }, { url });
}

async function checkTcp(name, host, port) {
  const result = await tcpProbe(host, port, 2000);
  return normalizeStatus(name, result, { host, port });
}

function checkEvidenceStore() {
  const storePath = config.integrations.evidenceStoreDir;
  const exists = fs.existsSync(storePath);
  const writable = exists
    ? (() => {
        try {
          fs.accessSync(storePath, fs.constants.R_OK | fs.constants.W_OK);
          return true;
        } catch {
          return false;
        }
      })()
    : false;

  return {
    name: "filesystem_evidence_store",
    status: exists ? (writable ? "UP" : "DEGRADED") : "DOWN",
    detail: exists ? (writable ? "read/write" : "read-only or blocked") : "missing path",
    path: storePath,
    eventsFile: path.join(storePath, "events.jsonl")
  };
}

function cloudflareConfigPresence() {
  const cfDir = "/home/t79/vyrdon/consolelab/ops/cloudflare";
  const files = ["dell-config.yml", "asusx-config.yml", "routes.md"];
  const missing = files.filter((name) => !fs.existsSync(path.join(cfDir, name)));
  return {
    name: "cloudflare_config",
    status: missing.length ? "DEGRADED" : "UP",
    detail: missing.length ? `missing: ${missing.join(", ")}` : "config present",
    path: cfDir
  };
}

export async function getIntegrationStatus() {
  const eventStreamMode = config.integrations.eventStream === "kafka" ? "kafka" : "nats";

  const checks = await Promise.all([
    checkHttp("cloudflare_tunnel", config.cloudflare.tunnelStatusUrl),
    checkTcp("postgresql", config.integrations.postgresHost, config.integrations.postgresPort),
    checkTcp("redis", config.integrations.redisHost, config.integrations.redisPort),
    eventStreamMode === "kafka"
      ? checkTcp("kafka", config.integrations.kafkaHost, config.integrations.kafkaPort)
      : checkTcp("nats", config.integrations.natsHost, config.integrations.natsPort),
    checkHttp("prometheus", config.integrations.prometheusUrl),
    checkHttp("grafana", config.integrations.grafanaUrl)
  ]);

  const evidenceStore = checkEvidenceStore();
  const cloudflareConfig = cloudflareConfigPresence();

  const all = [...checks, cloudflareConfig, evidenceStore];
  const up = all.filter((entry) => entry.status === "UP").length;
  const down = all.filter((entry) => entry.status === "DOWN").length;
  const degraded = all.filter((entry) => entry.status === "DEGRADED").length;

  return {
    timestamp: new Date().toISOString(),
    summary: {
      total: all.length,
      up,
      degraded,
      down,
      overall: down > 0 ? "DEGRADED" : degraded > 0 ? "WATCH" : "HEALTHY"
    },
    event_stream_mode: eventStreamMode,
    items: all
  };
}

export function getResponsibilityBoundary() {
  return {
    timestamp: new Date().toISOString(),
    hostnames: {
      consolelab: config.hostnames.consolelab,
      product_console: config.hostnames.productConsole,
      product_api: config.hostnames.productApi,
      authority_sign: config.hostnames.asusSign,
      authority_attest: config.hostnames.asusAttest
    },
    responsibilities: {
      must_do: [
        "monitor_authority",
        "monitor_runtime",
        "review_evidence",
        "track_commercial_state",
        "track_market_intelligence",
        "supervise_infrastructure",
        "coordinate_team_execution"
      ],
      must_not_do: [
        "run_market_engines",
        "run_commercial_engines",
        "run_runtime_jobs",
        "write_direct_runtime_mutations"
      ],
      runtime_access_mode: "read_only"
    },
    boundary: {
      consolelab_stack: "separate_service_stack_on_dell",
      runtime_write_path: "denied",
      trust_boundary: "sealed_evidence_read_instead_of_raw_runtime_logs",
      access_control: "cloudflare_access_sso_mfa"
    }
  };
}
