#!/usr/bin/env bash
set -euo pipefail

STATE_DIR="${OPENCLAW_STATE_DIR:-$HOME/.openclaw}"
CONTROL_DIR="$STATE_DIR/control-layer"
DB_PATH="$CONTROL_DIR/control.sqlite"
AUDIT_DIR="$CONTROL_DIR/audit"
OUTPUT_ARG="${1:-}"

if [[ ! -f "$DB_PATH" ]]; then
  echo "Control SQLite database not found at: $DB_PATH" >&2
  exit 1
fi

TS="$(date -u +%Y%m%dT%H%M%SZ)"
if [[ -z "$OUTPUT_ARG" ]]; then
  OUT_DIR="$STATE_DIR/backups/control-layer"
  mkdir -p "$OUT_DIR"
  ARCHIVE_PATH="$OUT_DIR/control-layer-backup-$TS.tar.gz"
elif [[ "$OUTPUT_ARG" == *.tar.gz ]]; then
  OUT_DIR="$(dirname "$OUTPUT_ARG")"
  mkdir -p "$OUT_DIR"
  ARCHIVE_PATH="$OUTPUT_ARG"
else
  OUT_DIR="$OUTPUT_ARG"
  mkdir -p "$OUT_DIR"
  ARCHIVE_PATH="$OUT_DIR/control-layer-backup-$TS.tar.gz"
fi

TMP_DIR="$(mktemp -d)"
ROOT_DIR="$TMP_DIR/control-layer-backup"
mkdir -p "$ROOT_DIR/control-layer"

cp "$DB_PATH" "$ROOT_DIR/control-layer/control.sqlite"
if [[ -d "$AUDIT_DIR" ]]; then
  mkdir -p "$ROOT_DIR/control-layer/audit"
  cp -R "$AUDIT_DIR"/. "$ROOT_DIR/control-layer/audit/"
fi

cat > "$ROOT_DIR/manifest.json" <<MANIFEST
{
  "schemaVersion": 1,
  "createdAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "stateDir": "$STATE_DIR",
  "includes": [
    "control-layer/control.sqlite",
    "control-layer/audit"
  ]
}
MANIFEST

if command -v sha256sum >/dev/null 2>&1; then
  (
    cd "$ROOT_DIR"
    find control-layer -type f -print0 | sort -z | xargs -0 sha256sum > checksums.txt
  )
fi

(
  cd "$TMP_DIR"
  tar -czf "$ARCHIVE_PATH" "control-layer-backup"
)

"$(dirname "$0")/restore.sh" "$ARCHIVE_PATH" --validate-only >/dev/null

rm -rf "$TMP_DIR"

echo "Backup created and validated: $ARCHIVE_PATH"
