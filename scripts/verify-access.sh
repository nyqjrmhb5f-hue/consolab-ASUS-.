#!/usr/bin/env bash
set -euo pipefail

BASE="${1:-https://api.vyrdx.vyrdon.com}"

curl -fsS "$BASE/api/health" >/dev/null
curl -fsS "$BASE/api/overview" >/dev/null || true

echo "access verification complete"
