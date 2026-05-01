#!/usr/bin/env bash
set -euo pipefail

FILE="${1:-04_EVIDENCE_ROOM/actions/events.jsonl}"
LIMIT_MB="${LIMIT_MB:-45}"

if [ ! -f "$FILE" ]; then
  echo "NO_FILE:$FILE"
  exit 0
fi

SIZE_MB=$(du -m "$FILE" | awk '{print $1}')

if [ "$SIZE_MB" -lt "$LIMIT_MB" ]; then
  echo "OK:${FILE}:${SIZE_MB}MB"
  exit 0
fi

STAMP=$(date -u +%Y%m%dT%H%M%SZ)
ARCHIVE_DIR="archives/evidence/${STAMP}"
mkdir -p "$ARCHIVE_DIR"

mv "$FILE" "$ARCHIVE_DIR/events.jsonl"
gzip -9 "$ARCHIVE_DIR/events.jsonl"

mkdir -p "$(dirname "$FILE")"
: > "$FILE"

echo "ROTATED:${ARCHIVE_DIR}/events.jsonl.gz"
