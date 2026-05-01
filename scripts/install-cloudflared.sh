#!/usr/bin/env bash
set -euo pipefail

ROLE="${1:-}"
shift || true

/home/t79/ASUS/ASUSX/scripts/require-anchor-approval.sh "cloudflare-install" "$@"

if [[ "$ROLE" != "dell" && "$ROLE" != "asusx" ]]; then
  echo "usage: install-cloudflared.sh <dell|asusx> --approve ANCHOR.ACK" >&2
  exit 1
fi

if ! command -v cloudflared >/dev/null 2>&1; then
  echo "cloudflared not installed. Install it before running this script." >&2
  exit 1
fi

mkdir -p /etc/cloudflared/creds

if [[ "$ROLE" == "dell" ]]; then
  cp /home/t79/vyrdon/consolelab/ops/cloudflared/dell-config.yml /etc/cloudflared/config.yml
  cp /home/t79/vyrdon/consolelab/.secrets/cloudflare/dell-tunnel.json /etc/cloudflared/creds/dell-tunnel.json
else
  cp /home/t79/vyrdon/consolelab/ops/cloudflared/asusx-config.yml /etc/cloudflared/config.yml
  cp /home/t79/vyrdon/consolelab/.secrets/cloudflare/asusx-tunnel.json /etc/cloudflared/creds/asusx-tunnel.json
fi

chmod 600 /etc/cloudflared/config.yml /etc/cloudflared/creds/*.json

systemctl daemon-reload
if [[ "$ROLE" == "dell" ]]; then
  systemctl enable --now cloudflared-dell.service
else
  systemctl enable --now cloudflared-asusx.service
fi

systemctl status cloudflared-${ROLE}.service --no-pager -n 20
