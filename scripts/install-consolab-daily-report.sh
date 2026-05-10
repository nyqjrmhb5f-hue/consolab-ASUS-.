#!/usr/bin/env bash
set -euo pipefail

# Install the ConsoleLab daily archive report as a user-level systemd timer
# (matches scripts/install-team-room-timer.sh; runs as the ConsoleLab user
# so the script writes archives/daily/ inside the repo it owns).
#
# Idempotent — re-running upgrades unit files and re-enables the timer.

UNIT_DIR="${HOME}/.config/systemd/user"
REPO_ROOT="${CONSOLAB_REPO_ROOT:-/home/t79/vyrdon/consolelab}"

mkdir -p "${UNIT_DIR}"

cp -f "${REPO_ROOT}/scripts/systemd/consolab-daily-report.service" "${UNIT_DIR}/"
cp -f "${REPO_ROOT}/scripts/systemd/consolab-daily-report.timer"   "${UNIT_DIR}/"

systemctl --user daemon-reload
systemctl --user enable --now consolab-daily-report.timer

echo "Installed and started: consolab-daily-report.timer"
echo
echo "Verify (proof for the anchor order):"
echo "  systemctl --user is-enabled consolab-daily-report.timer"
echo "  systemctl --user is-active  consolab-daily-report.timer"
echo "  systemctl --user list-timers consolab-daily-report.timer --no-pager"
echo "  systemctl --user status     consolab-daily-report.timer --no-pager -l"
echo "  journalctl --user -u consolab-daily-report.service -n 50 --no-pager -l"
echo
echo "Trigger a manual run:"
echo "  systemctl --user start consolab-daily-report.service"
