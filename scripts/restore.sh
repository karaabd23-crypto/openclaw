#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: scripts/restore.sh <archive.tar.gz> [target-control-dir] [--validate-only]" >&2
  exit 1
fi

ARCHIVE_PATH="$1"
shift || true

VALIDATE_ONLY=0
TARGET_CONTROL_DIR=""

for arg in "$@"; do
  if [[ "$arg" == "--validate-only" ]]; then
    VALIDATE_ONLY=1
  elif [[ -z "$TARGET_CONTROL_DIR" ]]; then
    TARGET_CONTROL_DIR="$arg"
  else
    echo "Unexpected argument: $arg" >&2
    exit 1
  fi
done

if [[ ! -f "$ARCHIVE_PATH" ]]; then
  echo "Archive not found: $ARCHIVE_PATH" >&2
  exit 1
fi

STATE_DIR="${OPENCLAW_STATE_DIR:-$HOME/.openclaw}"
if [[ -z "$TARGET_CONTROL_DIR" ]]; then
  TARGET_CONTROL_DIR="$STATE_DIR/control-layer"
fi

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

tar -xzf "$ARCHIVE_PATH" -C "$TMP_DIR"
ROOT_DIR="$TMP_DIR/control-layer-backup"

if [[ ! -d "$ROOT_DIR/control-layer" ]]; then
  echo "Invalid archive layout: missing control-layer directory" >&2
  exit 1
fi

if [[ -f "$ROOT_DIR/checksums.txt" ]] && command -v sha256sum >/dev/null 2>&1; then
  (
    cd "$ROOT_DIR"
    sha256sum -c checksums.txt >/dev/null
  )
fi

DB_RESTORE_PATH="$ROOT_DIR/control-layer/control.sqlite"
if [[ ! -f "$DB_RESTORE_PATH" ]]; then
  echo "Invalid archive: missing control-layer/control.sqlite" >&2
  exit 1
fi

node - "$DB_RESTORE_PATH" <<'NODE'
const dbPath = process.argv[2];
if (!dbPath) {
  throw new Error("missing sqlite path");
}
const { DatabaseSync } = require("node:sqlite");
const db = new DatabaseSync(dbPath, { readonly: true });
const quickCheck = db.prepare("PRAGMA quick_check;").get();
const quickCheckResult = Object.values(quickCheck ?? {})[0];
if (quickCheckResult !== "ok") {
  throw new Error(`sqlite quick_check failed: ${String(quickCheckResult)}`);
}
const tasksTable = db
  .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='control_tasks';")
  .get();
if (!tasksTable) {
  throw new Error("control_tasks table not found in restore candidate");
}
db.close();
NODE

if [[ "$VALIDATE_ONLY" -eq 1 ]]; then
  echo "Restore validation passed for: $ARCHIVE_PATH"
  exit 0
fi

mkdir -p "$TARGET_CONTROL_DIR"
cp "$DB_RESTORE_PATH" "$TARGET_CONTROL_DIR/control.sqlite"

if [[ -d "$ROOT_DIR/control-layer/audit" ]]; then
  mkdir -p "$TARGET_CONTROL_DIR/audit"
  cp -R "$ROOT_DIR/control-layer/audit"/. "$TARGET_CONTROL_DIR/audit/"
fi

echo "Restore completed: $TARGET_CONTROL_DIR"
