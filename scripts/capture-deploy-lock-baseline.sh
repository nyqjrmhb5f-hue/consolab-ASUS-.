#!/usr/bin/env bash
# Phase 0 baseline capture for D-LOCK / PR A (tunnel 1033 fix).
#
# Read-only. Captures the current state of the ConsoleLab host into a
# timestamped markdown file under 04_EVIDENCE_ROOM/runtime_journals/ so we
# have a frozen "before" snapshot before any tunnel/systemd mutation.
#
# Run on the ASUS host as the tunnel owner (e.g. t79). Re-runnable — every
# invocation writes a fresh file; nothing is overwritten.
#
# Hard rules:
#   - read-only to runtime hosts
#   - NEVER prints secrets (no env, no creds, no auth headers)
#   - writes inside 04_EVIDENCE_ROOM/runtime_journals/ only

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
TS="$(date -u +%Y%m%dT%H%M%SZ)"
OUT_DIR="${REPO_ROOT}/04_EVIDENCE_ROOM/runtime_journals"
OUT_FILE="${OUT_DIR}/deploy-lock-baseline-${TS}.md"

mkdir -p "${OUT_DIR}"

# Run a labeled command, captured to the baseline file. Stderr is merged so
# the operator sees failures inline. Never fails the script — baseline is
# best-effort by design.
run() {
  local label="$1"; shift
  {
    printf '\n## %s\n\n' "${label}"
    printf '```\n$ %s\n' "$*"
    "$@" 2>&1 || true
    printf '```\n'
  } >> "${OUT_FILE}"
}

# Header
{
  printf '# ConsoleLab D-LOCK baseline — %s\n\n' "${TS}"
  printf '_Captured by `scripts/capture-deploy-lock-baseline.sh`. Read-only._\n'
} > "${OUT_FILE}"

run "identity"            hostname
run "user"                whoami
run "cwd"                 pwd
run "git remote -v"       git -C "${REPO_ROOT}" remote -v
run "git HEAD"            git -C "${REPO_ROOT}" rev-parse --short HEAD
run "git status (short)"  git -C "${REPO_ROOT}" status --short --branch

# Systemd user units of interest (consolelab/tunnel/authority/attest/sign/engine)
run "user units (active)" \
  bash -c 'systemctl --user list-units --all --no-legend 2>/dev/null | grep -iE "console|cloudflared|asusx|attest|sign|engine" || echo "(none matched)"'
run "user unit files" \
  bash -c 'systemctl --user list-unit-files --no-legend 2>/dev/null | grep -iE "console|cloudflared|asusx|attest|sign|engine" || echo "(none matched)"'

# Cloudflared process count — directly answers the single-owner rule.
run "cloudflared processes" \
  bash -c 'ps -ef | grep -i cloudflared | grep -v grep || echo "(no cloudflared processes)"'

# Listening sockets on every port that matters for the lock + ConsoleLab UI.
run "listening sockets (ports of interest)" \
  bash -c "ss -ltnp 2>/dev/null | grep -E ':8080|:7821|:18080|:9101|:9102|:4000' || echo '(none listening on the watched ports)'"

# Local /health probes. Captures HTTP status + first 200 chars of body so we
# can prove which control-surface port is live without leaking secrets.
probe_local() {
  local url="$1"
  local code body
  code="$(curl -s -o /dev/null -w '%{http_code}' -m 3 "${url}" 2>/dev/null || echo 000)"
  body="$(curl -s -m 3 "${url}" 2>/dev/null | head -c 200 | tr -d '\r' || true)"
  printf 'HTTP %s\n%s\n' "${code}" "${body}"
}
run "local /health on :18080" probe_local "http://127.0.0.1:18080/health"
run "local /health on :8080"  probe_local "http://127.0.0.1:8080/health"
run "local /health on :7821"  probe_local "http://127.0.0.1:7821/health"

# Public HEAD probes. These can return Cloudflare error pages (1033 etc.); we
# capture the response line + headers so the failure mode is obvious.
probe_public() {
  local url="$1"
  curl -s -I -m 10 "${url}" 2>&1 | head -n 20 || true
}
run "public HEAD consolelab.vyrdon.com"            probe_public "https://consolelab.vyrdon.com/health"
run "public HEAD consolab.vyrdon.com"              probe_public "https://consolab.vyrdon.com/health"
run "public HEAD authority.consolelab.vyrdon.com"  probe_public "https://authority.consolelab.vyrdon.com/health"

# Tunnel route table — if cloudflared is installed and the operator is
# authenticated, this reveals which hostnames are bound to which tunnel.
run "cloudflared tunnel list" \
  bash -c 'command -v cloudflared >/dev/null 2>&1 && cloudflared tunnel list 2>&1 || echo "(cloudflared not installed or not authenticated)"'
run "cloudflared tunnel route list" \
  bash -c 'command -v cloudflared >/dev/null 2>&1 && cloudflared tunnel route ip list 2>&1 || echo "(cloudflared not installed; or no IP routes)"'

printf '\n---\nBaseline written to %s\n' "${OUT_FILE}"
echo "Baseline: ${OUT_FILE}"
