/**
 * In-process sliding-window rate limiter for ConsoleLab's malformed-request
 * channel.
 *
 * Defaults: 10 events / 60s per key. Configurable via deps for tests.
 *
 * TODO(authority-engine MVP): counters live in process memory and reset on
 * restart. This is acceptable for the authority engine MVP (per IQ200
 * decision Q2). If the threat model expands to attackers who can trigger
 * frequent restarts, promote this to a persisted counter — most likely
 * against a sealed redis/sqlite, NOT 04_EVIDENCE_ROOM, since persisting
 * counters into evidence would amplify writes on the exact path we want
 * cheap (a malformed-spam attacker trying to fill the vault).
 */

export const DEFAULT_LIMIT = 10;
export const DEFAULT_WINDOW_MS = 60_000;

export function createMalformedRequestRateLimiter(opts = {}) {
  const limit = Number.isFinite(opts.limit) ? Number(opts.limit) : DEFAULT_LIMIT;
  const windowMs = Number.isFinite(opts.windowMs) ? Number(opts.windowMs) : DEFAULT_WINDOW_MS;
  const now = opts.now || (() => Date.now());

  /** key → array of event timestamps inside the window */
  const events = new Map();
  /** key → last summary-row epoch ms */
  const lastSummary = new Map();

  function prune(key, currentMs) {
    const arr = events.get(key);
    if (!arr) return [];
    const cutoff = currentMs - windowMs;
    const fresh = arr.filter((t) => t > cutoff);
    if (fresh.length === 0) {
      events.delete(key);
    } else if (fresh.length !== arr.length) {
      events.set(key, fresh);
    }
    return fresh;
  }

  return {
    /**
     * @returns {{ allowed: boolean, hit_count: number, window_started_at: string, should_emit_summary: boolean }}
     */
    consume(key) {
      const currentMs = now();
      const fresh = prune(key, currentMs);

      if (fresh.length >= limit) {
        // Rate limited. Decide whether to emit a summary row this minute.
        const last = lastSummary.get(key) || 0;
        const should_emit_summary = currentMs - last >= windowMs;
        if (should_emit_summary) lastSummary.set(key, currentMs);
        return {
          allowed: false,
          hit_count: fresh.length,
          window_started_at: new Date(fresh[0]).toISOString(),
          should_emit_summary
        };
      }

      fresh.push(currentMs);
      events.set(key, fresh);
      return {
        allowed: true,
        hit_count: fresh.length,
        window_started_at: new Date(fresh[0]).toISOString(),
        should_emit_summary: false
      };
    },
    /** Test/diagnostic: clear all counters. */
    reset() {
      events.clear();
      lastSummary.clear();
    },
    get config() {
      return { limit, windowMs };
    }
  };
}

/**
 * Singleton used by decideAuthority in production. Tests inject their own
 * via deps to keep state isolated between cases.
 */
export const productionRateLimiter = createMalformedRequestRateLimiter();

/**
 * Build a rate-limit key from whatever hints we have on a malformed request.
 * Order: prefer an explicit tunnel session id, then the correlation id, then
 * the source IP, falling back to a single shared "anon" bucket so one
 * spamming source can't exhaust an unbounded number of buckets.
 */
export function buildRateLimitKey({ sourceIp, correlationId, tunnelSessionId } = {}) {
  const ip = typeof sourceIp === "string" && sourceIp.trim().length > 0 ? sourceIp.trim() : "unknown_ip";
  const session =
    (typeof tunnelSessionId === "string" && tunnelSessionId.trim().length > 0 && tunnelSessionId.trim()) ||
    (typeof correlationId === "string" && correlationId.trim().length > 0 && correlationId.trim()) ||
    "anon";
  return `${ip}|${session}`;
}
