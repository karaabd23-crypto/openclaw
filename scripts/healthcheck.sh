#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is not installed." >&2
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "docker compose plugin is missing." >&2
  exit 1
fi

if [[ -f .env ]]; then
  # shellcheck disable=SC1091
  source .env
fi

host_bind="${OPENCLAW_GATEWAY_HOST_BIND:-127.0.0.1}"
if [[ "$host_bind" == "0.0.0.0" || "$host_bind" == "::" ]]; then
  host_bind="127.0.0.1"
fi

gateway_port="${OPENCLAW_GATEWAY_PORT:-18789}"

container_id="$(docker compose ps -q openclaw-gateway)"
if [[ -z "$container_id" ]]; then
  echo "openclaw-gateway container is not running." >&2
  exit 1
fi

running_state="$(docker inspect --format '{{.State.Status}}' "$container_id")"
if [[ "$running_state" != "running" ]]; then
  echo "openclaw-gateway state is '$running_state' (expected running)." >&2
  exit 1
fi

health_state="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$container_id")"
if [[ "$health_state" != "healthy" && "$health_state" != "none" ]]; then
  echo "openclaw-gateway health is '$health_state' (expected healthy)." >&2
  exit 1
fi

curl -fsS "http://${host_bind}:${gateway_port}/healthz" >/dev/null
curl -fsS "http://${host_bind}:${gateway_port}/readyz" >/dev/null

docker compose ps openclaw-gateway

echo "Healthcheck passed: http://${host_bind}:${gateway_port}/healthz"
