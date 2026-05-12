#!/usr/bin/env bash
# Verifies Follow-up D / D-LOCK invariants on the live ASUS host:
#
#   1. Authority backend is listening on 127.0.0.1:18080 and ONLY on 127.0.0.1.
#   2. /health returns 200 locally.
#   3. Exactly one 'cloudflared tunnel' process is running.
#   4. The cloudflared-consolelab.service user unit is active.
#   5. https://authority.consolelab.vyrdon.com/health responds with an
#      authentication challenge (302/401/403) when not authenticated — i.e.
#      Cloudflare Access is in front. A 200 here unauthenticated WOULD MEAN
#      Access is missing or misconfigured, which is a critical failure.
#
# Exits non-zero on any failure. Re-runnable.
#
# Read-only to runtime hosts: this script only reads. It does not modify
# Dell/VYRDX state, does not SSH into any runtime host.

set -euo pipefail

AUTHORITY_LOCAL_URL="${AUTHORITY_LOCAL_URL:-http://127.0.0.1:18080/health}"
AUTHORITY_PUBLIC_URL="${AUTHORITY_PUBLIC_URL:-https://authority.consolelab.vyrdon.com/health}"
CONTROL_LOCAL_URL="${CONTROL_LOCAL_URL:-http://127.0.0.1:8080/health}"
CONTROL_PUBLIC_URL="${CONTROL_PUBLIC_URL:-https://consolelab.vyrdon.com/health}"

FAILED=0
fail() { echo "FAIL: $*" >&2; FAILED=$((FAILED + 1)); }
ok()   { echo "OK:   $*"; }

echo "=== [1/5] backend bind ==="
if command -v ss >/dev/null 2>&1; then
  bind_line="$(ss -ltnH 'sport = :18080' 2>/dev/null | head -n 1 || true)"
  if [[ -z "${bind_line}" ]]; then
    fail "nothing listening on :18080"
  elif echo "${bind_line}" | grep -qE '127\.0\.0\.1:18080|\[::1\]:18080'; then
    ok "authority backend listening on 127.0.0.1:18080 (localhost only)"
  elif echo "${bind_line}" | grep -qE '0\.0\.0\.0:18080|\[::\]:18080'; then
    fail "authority backend is bound to 0.0.0.0:18080 — MUST be 127.0.0.1 only"
  else
    fail "unexpected bind for :18080: ${bind_line}"
  fi
else
  fail "ss not installed; cannot verify bind address"
fi

echo
echo "=== [2/5] local /health ==="
if curl -fsS -m 5 "${AUTHORITY_LOCAL_URL}" >/dev/null 2>&1; then
  ok "authority ${AUTHORITY_LOCAL_URL} returns 2xx"
else
  fail "authority ${AUTHORITY_LOCAL_URL} did not return 2xx"
fi
if curl -fsS -m 5 "${CONTROL_LOCAL_URL}" >/dev/null 2>&1; then
  ok "control surface ${CONTROL_LOCAL_URL} returns 2xx"
else
  echo "WARN: control ${CONTROL_LOCAL_URL} did not return 2xx (non-fatal for authority D-LOCK)"
fi

echo
echo "=== [3/5] single cloudflared tunnel process ==="
mapfile -t TUNNEL_PIDS < <(pgrep -f 'cloudflared tunnel' || true)
case "${#TUNNEL_PIDS[@]}" in
  0) fail "no 'cloudflared tunnel' process running" ;;
  1) ok  "exactly one cloudflared tunnel process (pid ${TUNNEL_PIDS[0]})" ;;
  *) fail "multiple cloudflared tunnel processes running — single-owner rule violated: ${TUNNEL_PIDS[*]}" ;;
esac

echo
echo "=== [4/5] cloudflared-consolelab.service unit state ==="
if systemctl --user is-active --quiet cloudflared-consolelab.service 2>/dev/null; then
  ok "cloudflared-consolelab.service is active (user unit)"
else
  fail "cloudflared-consolelab.service is not active (user unit)"
fi
if systemctl --user is-active --quiet consolelab-backend.service 2>/dev/null; then
  ok "consolelab-backend.service is active (user unit)"
else
  fail "consolelab-backend.service is not active (user unit)"
fi

echo
echo "=== [5/5] public authority host shows Access challenge ==="
public_code="$(curl -s -o /dev/null -w '%{http_code}' -I -m 10 "${AUTHORITY_PUBLIC_URL}" || echo 000)"
case "${public_code}" in
  302|401|403)
    ok "${AUTHORITY_PUBLIC_URL} returned ${public_code} (Cloudflare Access challenge — expected when unauthenticated)" ;;
  200)
    fail "${AUTHORITY_PUBLIC_URL} returned 200 unauthenticated — Cloudflare Access is NOT enforcing. CRITICAL." ;;
  000)
    fail "${AUTHORITY_PUBLIC_URL} did not respond (DNS/tunnel/connectivity issue)" ;;
  *)
    fail "${AUTHORITY_PUBLIC_URL} returned unexpected status ${public_code}" ;;
esac

echo
if [[ "${FAILED}" -eq 0 ]]; then
  echo "D-LOCK: SEALED"
  exit 0
else
  echo "D-LOCK: FAILED (${FAILED} check(s) failed)"
  exit 1
fi
