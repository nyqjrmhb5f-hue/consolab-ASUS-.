import fs from "node:fs/promises";
import os from "node:os";
import { config } from "../src/config.js";
import { fetchJson } from "../src/lib/http.js";
import { getAsusStatus } from "../src/telemetry/asus.js";
import { getDellStatus } from "../src/telemetry/dell.js";
import { getVyrdoxHealth, getVyrdoxStatus } from "../src/services/vyrdoxRuntime.js";

function bytesToGiB(value) {
  return Number((value / (1024 ** 3)).toFixed(2));
}

async function diskStats(targetPath) {
  try {
    const stats = await fs.statfs(targetPath);
    const total = stats.blocks * stats.bsize;
    const free = stats.bavail * stats.bsize;
    const used = total - free;
    const usedPct = total > 0 ? Number(((used / total) * 100).toFixed(2)) : 0;
    return {
      path: targetPath,
      total_gib: bytesToGiB(total),
      used_gib: bytesToGiB(used),
      free_gib: bytesToGiB(free),
      used_pct: usedPct
    };
  } catch {
    return {
      path: targetPath,
      status: "unavailable"
    };
  }
}

export async function collectTelemetrySnapshot() {
  const [asus, dell, vyrdoxHealth, vyrdoxStatus, runtimeMetrics, rootDisk, baselineDisk] = await Promise.all([
    getAsusStatus(),
    getDellStatus(),
    getVyrdoxHealth(),
    getVyrdoxStatus(),
    fetchJson(config.dell.runtimeMetricsUrl, { timeout: 2500 }),
    diskStats("/"),
    diskStats(config.baselineDir)
  ]);

  return {
    timestamp: new Date().toISOString(),
    infrastructure: {
      hostname: os.hostname(),
      platform: `${os.platform()}-${os.arch()}`,
      uptime_seconds: os.uptime(),
      load_avg: os.loadavg(),
      cpu_count: os.cpus().length,
      memory_total_gib: bytesToGiB(os.totalmem()),
      memory_free_gib: bytesToGiB(os.freemem()),
      disks: [rootDisk, baselineDisk]
    },
    services: {
      asus,
      dell,
      vyrdox_health: vyrdoxHealth.ok ? vyrdoxHealth.data : { status: "unreachable", error: vyrdoxHealth.error || vyrdoxHealth.data },
      vyrdox_status: vyrdoxStatus.ok ? vyrdoxStatus.data : { status: "unreachable", error: vyrdoxStatus.error || vyrdoxStatus.data },
      runtime_metrics: runtimeMetrics.ok ? runtimeMetrics.data : { status: "unavailable", error: runtimeMetrics.error || runtimeMetrics.data }
    }
  };
}
