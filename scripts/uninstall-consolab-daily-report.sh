#!/usr/bin/env bash
set -euo pipefail

# Remove the ConsoleLab daily archive report timer and service.

systemctl --user disable --now consolab-daily-report.timer || true
systemctl --user stop consolab-daily-report.service || true
systemctl --user daemon-reload || true

rm -f "${HOME}/.config/systemd/user/consolab-daily-report.timer"
rm -f "${HOME}/.config/systemd/user/consolab-daily-report.service"

systemctl --user daemon-reload || true
echo "Removed: consolab-daily-report.*"
