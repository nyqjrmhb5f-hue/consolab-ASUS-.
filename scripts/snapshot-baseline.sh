#!/usr/bin/env bash
set -euo pipefail

ROOT="/home/t79/vyrdon/consolelab/ops/baselines"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"

mkdir -p "$ROOT/ports" "$ROOT/journals" "$ROOT/routes" "$ROOT/evidence" "$ROOT/access" "$ROOT/tunnels"

ss -tulpn > "$ROOT/ports/ports-$STAMP.txt" 2>/dev/null || true
systemctl list-units --type=service --all > "$ROOT/journals/systemd-services-$STAMP.txt" 2>/dev/null || true
systemctl list-timers --all > "$ROOT/journals/systemd-timers-$STAMP.txt" 2>/dev/null || true
journalctl -n 200 --no-pager -l > "$ROOT/journals/journal-$STAMP.txt" 2>/dev/null || true
ip route show > "$ROOT/routes/routes-$STAMP.txt" 2>/dev/null || true
if command -v tailscale >/dev/null 2>&1; then
  tailscale status > "$ROOT/access/tailscale-$STAMP.txt" 2>/dev/null || true
else
  echo "tailscale not installed" > "$ROOT/access/tailscale-$STAMP.txt"
fi

echo "snapshot_utc=$STAMP" > "$ROOT/evidence/snapshot-$STAMP.txt"

echo "baseline snapshot recorded"
