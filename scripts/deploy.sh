#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

SKIP_PULL="${OPENCLAW_DEPLOY_SKIP_PULL:-0}"
PRE_DEPLOY_BACKUP="${OPENCLAW_PRE_DEPLOY_BACKUP:-0}"

is_truthy() {
  local raw
  raw="$(printf '%s' "${1:-}" | tr '[:upper:]' '[:lower:]')"
  case "$raw" in
    1|true|yes|on) return 0 ;;
    *) return 1 ;;
  esac
}

if [[ ! -f .env ]]; then
  echo "Missing .env in repo root. Create it from .env.example first." >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is not installed. Run scripts/setup-server.sh first." >&2
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "docker compose plugin is missing. Run scripts/setup-server.sh first." >&2
  exit 1
fi

if [[ -d .git ]] && ! is_truthy "$SKIP_PULL"; then
  if ! git diff --quiet || ! git diff --cached --quiet; then
    echo "Refusing to pull: tracked git changes are present in this checkout." >&2
    echo "Commit/stash changes or set OPENCLAW_DEPLOY_SKIP_PULL=1." >&2
    exit 1
  fi

  current_branch="$(git rev-parse --abbrev-ref HEAD)"
  if [[ "$current_branch" != "HEAD" ]]; then
    git fetch --prune origin "$current_branch"
    git pull --ff-only origin "$current_branch"
  else
    echo "Detached HEAD detected, skipping git pull."
  fi
fi

if is_truthy "$PRE_DEPLOY_BACKUP"; then
  bash scripts/backup.sh
fi

# Validate compose before build/start.
docker compose config -q

DOCKER_BUILDKIT=1 docker compose build --pull openclaw-gateway openclaw-cli
docker compose up -d openclaw-gateway

bash scripts/healthcheck.sh

echo "Deployment completed at commit: $(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
