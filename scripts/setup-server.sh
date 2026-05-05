#!/usr/bin/env bash
set -euo pipefail

# Idempotent runtime host preparation for OpenClaw on Ubuntu/Debian.
# Safe scope: Docker + base packages + persistent directories.

OPENCLAW_BASE_DIR="${OPENCLAW_BASE_DIR:-/opt/openclaw}"
OPENCLAW_STATE_DIR="${OPENCLAW_STATE_DIR:-$OPENCLAW_BASE_DIR/state}"
OPENCLAW_WORKSPACE_DIR="${OPENCLAW_WORKSPACE_DIR:-$OPENCLAW_STATE_DIR/workspace}"
OPENCLAW_BACKUP_DIR="${OPENCLAW_BACKUP_DIR:-$OPENCLAW_BASE_DIR/backups}"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "This script must run as root (use sudo)." >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive

apt-get update
apt-get install -y --no-install-recommends \
  ca-certificates \
  curl \
  git \
  gnupg \
  lsb-release \
  openssl \
  ufw

if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi

if ! docker compose version >/dev/null 2>&1; then
  apt-get update
  apt-get install -y --no-install-recommends docker-compose-plugin
fi

systemctl enable docker >/dev/null 2>&1 || true
systemctl start docker

mkdir -p "$OPENCLAW_STATE_DIR" "$OPENCLAW_WORKSPACE_DIR" "$OPENCLAW_BACKUP_DIR"
# Container runtime user is uid/gid 1000 (`node` in the image).
chown -R 1000:1000 "$OPENCLAW_STATE_DIR"
chmod 700 "$OPENCLAW_STATE_DIR"
chmod 700 "$OPENCLAW_WORKSPACE_DIR"

cat <<DONE
Server setup complete.

Prepared directories:
- state:    $OPENCLAW_STATE_DIR
- workspace:$OPENCLAW_WORKSPACE_DIR
- backups:  $OPENCLAW_BACKUP_DIR

Next:
1) Clone repo under $OPENCLAW_BASE_DIR/repo (or your preferred path)
2) Copy .env.example to .env and set secrets
3) Run: bash scripts/deploy.sh
DONE
