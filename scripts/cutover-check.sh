#!/usr/bin/env bash
set -euo pipefail

API_BASE="${1:-https://api.vyrdx.vyrdon.com}"
ATTEST_BASE="${2:-https://attest.asusx.vyrdon.com}"
SIGN_BASE="${3:-https://sign.asusx.vyrdon.com}"

curl -fsS "$API_BASE/api/health" >/dev/null
curl -fsS "$ATTEST_BASE/healthz" >/dev/null
curl -fsS "$SIGN_BASE/healthz" >/dev/null

echo "cutover check: PASS"
