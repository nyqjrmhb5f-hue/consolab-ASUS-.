#!/usr/bin/env bash
set -euo pipefail

UNIT_DIR="${HOME}/.config/systemd/user"
mkdir -p "${UNIT_DIR}"

cp -f /home/t79/vyrdon/consolelab/scripts/systemd/vyrdon-lab-team-room.service "${UNIT_DIR}/"
cp -f /home/t79/vyrdon/consolelab/scripts/systemd/vyrdon-lab-team-room.timer "${UNIT_DIR}/"

systemctl --user daemon-reload
systemctl --user enable --now vyrdon-lab-team-room.timer

echo "Installed and started: vyrdon-lab-team-room.timer"
echo "Check:"
echo "  systemctl --user status vyrdon-lab-team-room.timer --no-pager -l"
echo "  journalctl --user -u vyrdon-lab-team-room.service -n 50 --no-pager -l"

