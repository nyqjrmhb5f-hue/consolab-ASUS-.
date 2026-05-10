#!/usr/bin/env bash
# Resolve a usable `node` + `npx` even when invoked from a non-interactive
# systemd user session, then run consolab-daily-report.ts.
#
# Why: ConsoleLab boxes run fnm-managed node, which only attaches itself to
# PATH inside an interactive shell that has sourced `fnm env`. systemd user
# services do not inherit that environment, so a hardcoded /usr/bin/npx
# would fail every night at 00:03.
#
# This script tries, in order:
#   1. Source `fnm env` if fnm is on PATH.
#   2. Walk $FNM_DIR/node-versions (or ~/.local/share/fnm/node-versions) and
#      pick the highest-versioned installation.
#   3. Fall back to /usr/local/bin and /usr/bin if a system node is present.
#
# Forwards every CLI argument to the TS entry point.

set -euo pipefail

REPO_ROOT="${CONSOLAB_REPO_ROOT:-/home/t79/vyrdon/consolelab}"

# Make sure a few well-known directories are on PATH so `fnm` itself can be
# located when the unit fires from a clean systemd user environment.
for candidate in "${HOME}/.fnm" "${HOME}/.local/share/fnm" "${HOME}/.local/bin" /usr/local/bin /usr/bin; do
  if [[ -d "${candidate}" && ":${PATH-}:" != *":${candidate}:"* ]]; then
    PATH="${candidate}:${PATH-}"
  fi
done
export PATH

if command -v fnm >/dev/null 2>&1; then
  # `fnm env` prints `export` statements for the active version.
  eval "$(fnm env --use-on-cd 2>/dev/null || true)"
fi

if ! command -v node >/dev/null 2>&1; then
  fnm_root="${FNM_DIR:-${HOME}/.local/share/fnm}"
  if [[ -d "${fnm_root}/node-versions" ]]; then
    latest="$(ls -1 "${fnm_root}/node-versions" 2>/dev/null | sort -V | tail -1 || true)"
    if [[ -n "${latest}" && -x "${fnm_root}/node-versions/${latest}/installation/bin/node" ]]; then
      PATH="${fnm_root}/node-versions/${latest}/installation/bin:${PATH}"
      export PATH
    fi
  fi
fi

if ! command -v node >/dev/null 2>&1; then
  echo "consolab-daily-report: no usable node binary found on PATH (${PATH})" >&2
  exit 127
fi

cd "${REPO_ROOT}"
exec npx --yes tsx scripts/archive/consolab-daily-report.ts "$@"
