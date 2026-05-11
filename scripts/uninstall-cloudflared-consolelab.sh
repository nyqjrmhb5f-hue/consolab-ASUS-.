#!/usr/bin/env bash
# Rollback for the canonical ConsoleLab tunnel + authority backend user-level
# systemd setup (Follow-up D / D-LOCK).
#
# Does NOT delete the tunnel config or signing key — it only stops + disables
# the user units, so re-running install-cloudflared-consolelab.sh leaves the
# operator-supplied credentials intact.

set -euo pipefail

USER_UNIT_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"

if [[ "${EUID}" -eq 0 ]]; then
  echo "uninstall-cloudflared-consolelab: refusing to run as root — this manages user-level units" >&2
  exit 64
fi

for unit in cloudflared-consolelab.service consolelab-backend.service; do
  if systemctl --user is-enabled --quiet "${unit}" 2>/dev/null || systemctl --user is-active --quiet "${unit}" 2>/dev/null; then
    echo "disabling ${unit}"
    systemctl --user disable --now "${unit}" || true
  fi
  if [[ -f "${USER_UNIT_DIR}/${unit}" ]]; then
    rm -f "${USER_UNIT_DIR}/${unit}"
    echo "removed ${USER_UNIT_DIR}/${unit}"
  fi
done

systemctl --user daemon-reload

cat <<EOF

Uninstalled the canonical units. The tunnel config and credentials JSON were
left in place. To fully rollback the deploy lock, you may also want to:

  - Re-enable any previous cloudflared user units that were disabled by
    install-cloudflared-consolelab.sh
  - Remove the DNS route:
      cloudflared tunnel route dns --remove authority.consolelab.vyrdon.com
  - Remove the Cloudflare Access application for authority.consolelab.vyrdon.com
EOF
