#!/usr/bin/env bash
set -euo pipefail

# OpenClaw Hetzner deploy/migrate script (run from your local machine).
# What it does:
# - Verifies SSH access to VPS
# - Optionally uploads local ~/.openclaw state
# - Bootstraps Docker on VPS
# - Clones/updates OpenClaw repo on VPS
# - Backs up existing remote state before overwrite
# - Configures Docker env + loopback-only host port exposure
# - Builds image, runs doctor migration, starts openclaw-gateway
#
# Required:
#   VPS_IP=<server-ip>
# Optional:
#   SSH_USER=root
#   SSH_PORT=22
#   OPENCLAW_TZ=America/Vancouver
#   LOCAL_STATE_DIR=$HOME/.openclaw
#   REMOTE_HOME=/root
#   REMOTE_BRANCH=main
#   SKIP_STATE_UPLOAD=0
#   OPENCLAW_GATEWAY_PORT=28789
#   OPENCLAW_BRIDGE_PORT=28790
#   OPENCLAW_DISABLE_BONJOUR=1

if [[ -z "${VPS_IP:-}" ]]; then
  echo "ERROR: VPS_IP is required. Example:" >&2
  echo "  VPS_IP=1.2.3.4 bash scripts/openclaw-hetzner-deploy.sh" >&2
  exit 1
fi

SSH_USER="${SSH_USER:-root}"
SSH_PORT="${SSH_PORT:-22}"
OPENCLAW_TZ="${OPENCLAW_TZ:-America/Vancouver}"
LOCAL_STATE_DIR="${LOCAL_STATE_DIR:-$HOME/.openclaw}"
REMOTE_HOME="${REMOTE_HOME:-/root}"
REMOTE_REPO_DIR="${REMOTE_HOME}/openclaw"
REMOTE_STATE_DIR="${REMOTE_HOME}/.openclaw"
REMOTE_BACKUP_DIR="${REMOTE_BACKUP_DIR:-${REMOTE_HOME}/openclaw-backups}"
REMOTE_BRANCH="${REMOTE_BRANCH:-main}"
SKIP_STATE_UPLOAD="${SKIP_STATE_UPLOAD:-0}"
OPENCLAW_GATEWAY_PORT="${OPENCLAW_GATEWAY_PORT:-28789}"
OPENCLAW_BRIDGE_PORT="${OPENCLAW_BRIDGE_PORT:-28790}"
OPENCLAW_DISABLE_BONJOUR="${OPENCLAW_DISABLE_BONJOUR:-1}"
REMOTE_STATE_ARCHIVE="${REMOTE_HOME}/openclaw-state.tgz"

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || { echo "Missing required command: $1" >&2; exit 1; }
}

is_truthy() {
  local raw
  raw="$(printf '%s' "${1:-}" | tr '[:upper:]' '[:lower:]')"
  case "$raw" in
    1 | true | yes | on) return 0 ;;
    *) return 1 ;;
  esac
}

need_cmd ssh
need_cmd scp
need_cmd tar

if ! is_truthy "$SKIP_STATE_UPLOAD"; then
  if [[ ! -d "$LOCAL_STATE_DIR" ]]; then
    echo "ERROR: Local state dir not found: $LOCAL_STATE_DIR" >&2
    exit 1
  fi
fi

SSH_TARGET="${SSH_USER}@${VPS_IP}"
SSH_OPTS=(
  -p "$SSH_PORT"
  -o ServerAliveInterval=30
  -o ServerAliveCountMax=10
)
SCP_OPTS=(
  -P "$SSH_PORT"
  -o ServerAliveInterval=30
  -o ServerAliveCountMax=10
)

echo "[1/7] Checking SSH connectivity to ${SSH_TARGET}:${SSH_PORT}"
ssh "${SSH_OPTS[@]}" "$SSH_TARGET" "echo connected >/dev/null"

tmp_tar=""
if ! is_truthy "$SKIP_STATE_UPLOAD"; then
  tmp_tar="$(mktemp /tmp/openclaw-state.XXXXXX.tgz)"
  trap '[[ -n "$tmp_tar" ]] && rm -f "$tmp_tar"' EXIT

  echo "[2/7] Packaging local OpenClaw state from $LOCAL_STATE_DIR"
  tar -C "$(dirname "$LOCAL_STATE_DIR")" -czf "$tmp_tar" "$(basename "$LOCAL_STATE_DIR")"

  echo "[3/7] Uploading state archive to VPS"
  scp "${SCP_OPTS[@]}" "$tmp_tar" "${SSH_TARGET}:${REMOTE_STATE_ARCHIVE}"
else
  echo "[2/7] Skipping local state packaging (SKIP_STATE_UPLOAD=$SKIP_STATE_UPLOAD)"
  echo "[3/7] Skipping state upload"
fi

echo "[4/7] Bootstrapping VPS (Docker + repo + safe state restore)"
ssh "${SSH_OPTS[@]}" "$SSH_TARGET" "bash -s" <<REMOTE_BOOTSTRAP
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

apt-get update
apt-get install -y git curl ca-certificates python3

if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi

mkdir -p "$REMOTE_HOME"
if [[ ! -d "$REMOTE_REPO_DIR/.git" ]]; then
  git clone https://github.com/openclaw/openclaw.git "$REMOTE_REPO_DIR"
  git -C "$REMOTE_REPO_DIR" checkout "$REMOTE_BRANCH"
else
  git -C "$REMOTE_REPO_DIR" fetch --tags origin "$REMOTE_BRANCH"
  if git -C "$REMOTE_REPO_DIR" show-ref --verify --quiet "refs/heads/$REMOTE_BRANCH"; then
    git -C "$REMOTE_REPO_DIR" checkout "$REMOTE_BRANCH"
  else
    git -C "$REMOTE_REPO_DIR" checkout -b "$REMOTE_BRANCH" "origin/$REMOTE_BRANCH"
  fi
  git -C "$REMOTE_REPO_DIR" pull --ff-only origin "$REMOTE_BRANCH"
fi

# Stop gateway before changing mounted state.
if [[ -f "$REMOTE_REPO_DIR/docker-compose.yml" ]]; then
  docker compose -f "$REMOTE_REPO_DIR/docker-compose.yml" stop openclaw-gateway >/dev/null 2>&1 || true
fi

rm -f "$REMOTE_HOME/.openclaw-last-migration-backup"
if [[ -f "$REMOTE_STATE_ARCHIVE" ]]; then
  if [[ -d "$REMOTE_STATE_DIR" ]] && [[ -n "\$(ls -A "$REMOTE_STATE_DIR" 2>/dev/null)" ]]; then
    mkdir -p "$REMOTE_BACKUP_DIR"
    backup_path="$REMOTE_BACKUP_DIR/openclaw-state-pre-migration-\$(date -u +%Y%m%dT%H%M%SZ).tgz"
    tar -C "$REMOTE_HOME" -czf "\$backup_path" ".openclaw"
    printf '%s\n' "\$backup_path" > "$REMOTE_HOME/.openclaw-last-migration-backup"
  fi
  rm -rf "$REMOTE_STATE_DIR"
  tar -C "$REMOTE_HOME" -xzf "$REMOTE_STATE_ARCHIVE"
  rm -f "$REMOTE_STATE_ARCHIVE"
fi

# Normalize migrated state paths so container runtime always uses /home/node/.openclaw.
if [[ -f "$REMOTE_STATE_DIR/openclaw.json" ]]; then
  python3 - "$REMOTE_STATE_DIR/openclaw.json" <<'PY'
import json
import re
import sys
from pathlib import Path

path = Path(sys.argv[1])
raw = json.loads(path.read_text(encoding="utf-8"))
pattern = re.compile(r"/(?:home/[^/]+|Users/[^/]+)/\\.openclaw")

def normalize(value):
    if isinstance(value, str):
        return pattern.sub("/home/node/.openclaw", value)
    if isinstance(value, list):
        return [normalize(item) for item in value]
    if isinstance(value, dict):
        return {key: normalize(item) for key, item in value.items()}
    return value

updated = normalize(raw)
if updated != raw:
    path.write_text(json.dumps(updated, indent=2) + "\n", encoding="utf-8")
PY
fi

mkdir -p "$REMOTE_STATE_DIR/workspace"
if [[ -d "$REMOTE_STATE_DIR" ]]; then
  # Match container user ownership (uid 1000 in image)
  chown -R 1000:1000 "$REMOTE_STATE_DIR"
fi
REMOTE_BOOTSTRAP

echo "[5/7] Writing runtime env + secure docker override"
ssh "${SSH_OPTS[@]}" "$SSH_TARGET" "bash -s" <<REMOTE_CONFIG
set -euo pipefail

cd "$REMOTE_REPO_DIR"

cat > .env <<ENVEOF
OPENCLAW_IMAGE=openclaw:latest
OPENCLAW_GATEWAY_BIND=lan
OPENCLAW_GATEWAY_PORT=$OPENCLAW_GATEWAY_PORT
OPENCLAW_BRIDGE_PORT=$OPENCLAW_BRIDGE_PORT
OPENCLAW_DISABLE_BONJOUR=$OPENCLAW_DISABLE_BONJOUR
OPENCLAW_CONFIG_DIR=$REMOTE_STATE_DIR
OPENCLAW_WORKSPACE_DIR=$REMOTE_STATE_DIR/workspace
OPENCLAW_TZ=$OPENCLAW_TZ
ENVEOF

# Keep container internal bind as-is; replace base ports with loopback-only ports.
cat > docker-compose.vps.yml <<'YAMLEOF'
services:
  openclaw-gateway:
    ports: !override
      - "127.0.0.1:\${OPENCLAW_GATEWAY_PORT:-18789}:18789"
      - "127.0.0.1:\${OPENCLAW_BRIDGE_PORT:-18790}:18790"
YAMLEOF
REMOTE_CONFIG

echo "[6/7] Building, migrating state with doctor, and starting gateway"
ssh "${SSH_OPTS[@]}" "$SSH_TARGET" "bash -s" <<REMOTE_DEPLOY
set -euo pipefail
cd "$REMOTE_REPO_DIR"
DOCKER_BUILDKIT=1 docker compose -f docker-compose.yml -f docker-compose.vps.yml build openclaw-gateway
docker compose -f docker-compose.yml -f docker-compose.vps.yml run --rm --no-deps --entrypoint node openclaw-gateway \
  dist/index.js doctor --fix --non-interactive
docker compose -f docker-compose.yml -f docker-compose.vps.yml up -d openclaw-gateway

for _ in \$(seq 1 30); do
  if curl -fsS "http://127.0.0.1:${OPENCLAW_GATEWAY_PORT}/healthz" >/dev/null; then
    break
  fi
  sleep 2
done
curl -fsS "http://127.0.0.1:${OPENCLAW_GATEWAY_PORT}/healthz" >/dev/null

docker compose -f docker-compose.yml -f docker-compose.vps.yml ps
REMOTE_DEPLOY

echo "[7/7] Done"
backup_hint="$(ssh "${SSH_OPTS[@]}" "$SSH_TARGET" "cat '$REMOTE_HOME/.openclaw-last-migration-backup' 2>/dev/null || true")"
cat <<DONE

OpenClaw is deployed on $SSH_TARGET.

Next:
1) Open an SSH tunnel from your local machine:
   ssh -N -L 18789:127.0.0.1:${OPENCLAW_GATEWAY_PORT} -p $SSH_PORT $SSH_TARGET

2) Open Control UI locally:
   http://127.0.0.1:18789/

$(if [[ -n "$backup_hint" ]]; then printf '%s\n\n' "Remote pre-migration backup: $backup_hint"; fi)

Useful remote logs:
  ssh -p $SSH_PORT $SSH_TARGET 'cd $REMOTE_REPO_DIR && docker compose -f docker-compose.yml -f docker-compose.vps.yml logs -f openclaw-gateway'

DONE
