#!/usr/bin/env bash
# Wrapper invoked by consolelab-backend.service. Resolves an fnm-managed (or
# system) node before invoking the backend, since systemd user units don't
# inherit the interactive shell's PATH.
#
# Hard constraint: the backend must bind 127.0.0.1 only. HOST + PORT come from
# the unit's Environment= lines; this wrapper does not override them.

set -euo pipefail

cd "$(dirname "$0")/../backend"

# backend/src/config.js reads CONSOLELAB_BIND_HOST (preferred) or LAB_CONSOLE_HOST
# and CONSOLELAB_BIND_PORT (preferred) or PORT. Enforce localhost-only here so
# the unit cannot accidentally publish 0.0.0.0 via an env-file override.
BIND_HOST="${CONSOLELAB_BIND_HOST:-${LAB_CONSOLE_HOST:-}}"
BIND_PORT="${CONSOLELAB_BIND_PORT:-${PORT:-}}"

if [[ "${BIND_HOST}" != "127.0.0.1" ]]; then
  echo "consolelab-backend: refusing to start — CONSOLELAB_BIND_HOST must be 127.0.0.1 (got: ${BIND_HOST:-unset})" >&2
  exit 64
fi

if [[ -z "${BIND_PORT}" ]]; then
  echo "consolelab-backend: refusing to start — CONSOLELAB_BIND_PORT (or PORT) must be set (expected: 18080)" >&2
  exit 64
fi

# fnm-aware: prefer fnm's default node, fall back to system node.
if command -v fnm >/dev/null 2>&1; then
  eval "$(fnm env --use-on-cd)"
fi

if ! command -v node >/dev/null 2>&1; then
  echo "consolelab-backend: node not found on PATH" >&2
  exit 65
fi

exec node src/index.js
