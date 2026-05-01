#!/usr/bin/env bash
set -euo pipefail
cd /home/t79/vyrdon/consolelab
npm run dev:backend &
BACK_PID=$!
npm run dev:frontend &
FRONT_PID=$!
trap 'kill $BACK_PID $FRONT_PID' EXIT
wait
