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

# Export .env so required variables are guaranteed available for this process.
set -a
# shellcheck disable=SC1091
source .env
set +a

require_non_empty_env() {
  local name="$1"
  local value="${!name:-}"
  if [[ -z "${value//[[:space:]]/}" ]]; then
    echo "Missing required environment variable: $name" >&2
    echo "Set $name in .env before running deploy." >&2
    exit 1
  fi
}

require_non_empty_env OPENCLAW_CONFIG_DIR
require_non_empty_env OPENCLAW_WORKSPACE_DIR

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

# Resolve image tag once so explicit build and compose runtime stay aligned.
IMAGE_REF="${OPENCLAW_IMAGE:-}"
if [[ -z "$IMAGE_REF" ]]; then
  IMAGE_REF="$(grep -E '^[[:space:]]*OPENCLAW_IMAGE=' .env | tail -n 1 | cut -d= -f2- | tr -d '\r')"
fi
if [[ -z "$IMAGE_REF" ]]; then
  IMAGE_REF="openclaw:local"
fi
export OPENCLAW_IMAGE="$IMAGE_REF"
COMPOSE=(docker compose --env-file .env)

# Validate compose before build/start.
"${COMPOSE[@]}" config -q

DOCKER_BUILDKIT=1 docker build --pull -t "$OPENCLAW_IMAGE" -f Dockerfile .
"${COMPOSE[@]}" up -d openclaw-gateway

bash scripts/healthcheck.sh

echo "Deployment completed at commit: $(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
