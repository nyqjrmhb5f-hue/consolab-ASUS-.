/**
 * Tiny helper for resolving the current git SHA. Falls back to `null` if the
 * working tree is not a git repo or `git` is unavailable.
 */

import { execFileSync } from "node:child_process";

export function resolveGitSha(repoRoot: string): string | null {
  try {
    const out = execFileSync("git", ["-C", repoRoot, "rev-parse", "HEAD"], {
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf8"
    });
    const sha = out.trim();
    return /^[0-9a-f]{7,64}$/.test(sha) ? sha : null;
  } catch {
    return null;
  }
}
