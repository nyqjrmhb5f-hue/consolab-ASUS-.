#!/usr/bin/env bash
set -euo pipefail

systemctl --user disable --now vyrdon-lab-team-room.timer || true
systemctl --user stop vyrdon-lab-team-room.service || true
systemctl --user daemon-reload || true

rm -f "${HOME}/.config/systemd/user/vyrdon-lab-team-room.timer"
rm -f "${HOME}/.config/systemd/user/vyrdon-lab-team-room.service"

systemctl --user daemon-reload || true
echo "Removed: vyrdon-lab-team-room.*"

