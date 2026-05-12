#!/usr/bin/env bash
# Idempotent installer for the canonical ConsoleLab tunnel + authority backend
# user-level systemd setup (Follow-up D / D-LOCK).
#
# This script:
#   1. Verifies cloudflared is installed and reachable.
#   2. Copies the canonical tunnel config from this repo to
#      $CONSOLELAB_TUNNEL_CONFIG (default: /home/t79/ASUS/ASUSX/ops/cloudflare/
#      vyrdon-consolelab.yml). The credentials-file path inside the config is
#      NOT rewritten — you must place the tunnel's signing key JSON there
#      yourself (it never lives in this repo).
#   3. Disables every other cloudflared user unit to satisfy the "single tunnel
#      owner" rule. System-level cloudflared units (cloudflared-dell,
#      cloudflared-asusx) are left alone — they manage different hosts.
#   4. Installs cloudflared-consolelab.service + consolelab-backend.service as
#      user units and enables them.
#   5. Prints (does NOT run) the `cloudflared tunnel route dns` command. That
#      step needs interactive Cloudflare auth and must be run by the operator
#      once per hostname.
#   6. Does NOT touch Cloudflare Access policies (Zero Trust dashboard work).
#
# Hard constraints (per Follow-up D):
#   - read-only to Dell + VYRDX runtime hosts (this script only writes to ASUS)
#   - backend binds 127.0.0.1 only (enforced by the unit + the wrapper)
#   - one and only one cloudflared user unit may be active afterwards
#
# Re-run safe. Run as the user that owns the live tunnel (t79 on ASUS).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

TUNNEL_ID="${CONSOLELAB_TUNNEL_ID:-ac840436-bc21-43b0-9548-198ea7fc0ab4}"
TUNNEL_CONFIG_DST="${CONSOLELAB_TUNNEL_CONFIG:-/home/t79/ASUS/ASUSX/ops/cloudflare/vyrdon-consolelab.yml}"
USER_UNIT_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
TUNNEL_CONFIG_SRC="${REPO_ROOT}/ops/cloudflare/vyrdon-consolelab.yml"
CLOUDFLARED_UNIT_SRC="${REPO_ROOT}/ops/systemd/cloudflared-consolelab.service"
BACKEND_UNIT_SRC="${REPO_ROOT}/ops/systemd/consolelab-backend.service"

if [[ "${EUID}" -eq 0 ]]; then
  echo "install-cloudflared-consolelab: refusing to run as root — this installs a user-level unit; run as the tunnel owner (e.g. t79)" >&2
  exit 64
fi

if ! command -v cloudflared >/dev/null 2>&1; then
  echo "install-cloudflared-consolelab: cloudflared not installed. Install it before running this script." >&2
  exit 65
fi

echo "[1/5] cloudflared version: $(cloudflared --version | head -n 1)"

echo "[2/5] writing canonical tunnel config to ${TUNNEL_CONFIG_DST}"
mkdir -p "$(dirname "${TUNNEL_CONFIG_DST}")"
install -m 600 "${TUNNEL_CONFIG_SRC}" "${TUNNEL_CONFIG_DST}"

# Sanity-check the destination contains the expected tunnel UUID. If you point
# the installer at an existing config and the UUID drifts, fail loud.
if ! grep -qF "${TUNNEL_ID}" "${TUNNEL_CONFIG_DST}"; then
  echo "install-cloudflared-consolelab: tunnel UUID ${TUNNEL_ID} not found in ${TUNNEL_CONFIG_DST} — refusing to continue" >&2
  exit 66
fi

# Make sure lingering enables the user units to survive logout.
if command -v loginctl >/dev/null 2>&1; then
  if ! loginctl show-user "${USER}" 2>/dev/null | grep -q '^Linger=yes'; then
    echo "[3/5] enabling linger for ${USER} (so user units stay running after logout)"
    sudo loginctl enable-linger "${USER}" || {
      echo "install-cloudflared-consolelab: failed to enable linger (continuing — user units will only run while you're logged in)" >&2
    }
  else
    echo "[3/5] linger already enabled for ${USER}"
  fi
fi

echo "[4/6] disabling any other cloudflared user units (single-tunnel-owner rule)"
mapfile -t OTHER_UNITS < <(
  systemctl --user list-units --type=service --no-legend --all 2>/dev/null \
    | awk '{print $1}' \
    | grep -E '^cloudflared.*\.service$' \
    | grep -vx 'cloudflared-consolelab.service' || true
)
if [[ ${#OTHER_UNITS[@]} -gt 0 ]]; then
  for unit in "${OTHER_UNITS[@]}"; do
    echo "  - disabling ${unit}"
    systemctl --user disable --now "${unit}" || true
  done
else
  echo "  - no other cloudflared user units found"
fi

# Process-level dedup. A cloudflared tunnel started outside systemd (e.g.
# `cloudflared tunnel run` from a screen session) won't appear in the unit
# list and won't be stopped by the disable step above. Kill those strays
# now so the canonical user unit is the only owner left standing.
echo "[5/6] dedup cloudflared processes (only the canonical unit may run)"
mapfile -t TUNNEL_PIDS < <(pgrep -u "${USER}" -f 'cloudflared tunnel' 2>/dev/null || true)
if [[ ${#TUNNEL_PIDS[@]} -gt 0 ]]; then
  for pid in "${TUNNEL_PIDS[@]}"; do
    cmd="$(ps -p "${pid}" -o args= 2>/dev/null || true)"
    echo "  - SIGTERM pid ${pid}: ${cmd}"
    kill -TERM "${pid}" 2>/dev/null || true
  done
  # Give them 5s to exit cleanly before SIGKILL escalation.
  for _ in 1 2 3 4 5; do
    sleep 1
    if ! pgrep -u "${USER}" -f 'cloudflared tunnel' >/dev/null 2>&1; then
      break
    fi
  done
  mapfile -t STILL < <(pgrep -u "${USER}" -f 'cloudflared tunnel' 2>/dev/null || true)
  if [[ ${#STILL[@]} -gt 0 ]]; then
    for pid in "${STILL[@]}"; do
      echo "  - SIGKILL pid ${pid} (did not exit on TERM)"
      kill -KILL "${pid}" 2>/dev/null || true
    done
  fi
else
  echo "  - no cloudflared tunnel processes running"
fi

echo "[6/6] installing user units"
mkdir -p "${USER_UNIT_DIR}"
install -m 644 "${CLOUDFLARED_UNIT_SRC}" "${USER_UNIT_DIR}/cloudflared-consolelab.service"
install -m 644 "${BACKEND_UNIT_SRC}" "${USER_UNIT_DIR}/consolelab-backend.service"

systemctl --user daemon-reload
systemctl --user enable --now consolelab-backend.service
systemctl --user enable --now cloudflared-consolelab.service

echo
echo "Installed. Status:"
systemctl --user --no-pager --lines=0 status consolelab-backend.service || true
echo
systemctl --user --no-pager --lines=0 status cloudflared-consolelab.service || true

cat <<EOF

============================================================
Next steps (operator must do these — not automated):

  1. Place the tunnel signing key JSON at the path declared in
     ${TUNNEL_CONFIG_DST}'s 'credentials-file:' field.
     Default: /home/t79/.cloudflared/${TUNNEL_ID}.json

  2. Create the DNS routes (interactive Cloudflare auth required). The
     ensure-cloudflared-routes.sh wrapper does all 3 hostnames idempotently:

       bash scripts/ensure-cloudflared-routes.sh

     or run them by hand:

       cloudflared tunnel route dns ${TUNNEL_ID} consolelab.vyrdon.com
       cloudflared tunnel route dns ${TUNNEL_ID} consolab.vyrdon.com
       cloudflared tunnel route dns ${TUNNEL_ID} authority.consolelab.vyrdon.com

  3. Configure Cloudflare Zero Trust Access for the authority host.
     See 09_DEPLOYMENT/zero-trust/access-policy.md for the policy spec.

  4. Verify the lock:

       bash scripts/verify-deploy-lock.sh

  5. To roll back: bash scripts/uninstall-cloudflared-consolelab.sh
============================================================
EOF
