#!/usr/bin/env bash
# Persistent reverse SSH tunnel: Hetzner port 11434 -> local Ollama (Windows host).

set -euo pipefail

HETZNER_HOST='195.201.123.118'
HETZNER_USER='root'
SSH_KEY='/home/karaa/.ssh/id_ed25519'
REMOTE_PORT='11434'
LOCAL_TARGET='127.0.0.1:11434'

if ! command -v ssh >/dev/null 2>&1; then
  echo 'ssh is not installed.' >&2
  exit 1
fi

if [ ! -f "$SSH_KEY" ]; then
  echo "SSH key not found at $SSH_KEY" >&2
  exit 1
fi

echo "Starting reverse tunnel: ${HETZNER_HOST}:${REMOTE_PORT} -> ${LOCAL_TARGET}"

# Keep reconnecting if the tunnel drops.
while true; do
  ssh -i "$SSH_KEY" \
    -NT \
    -o BatchMode=yes \
    -o ExitOnForwardFailure=yes \
    -o ServerAliveInterval=30 \
    -o ServerAliveCountMax=3 \
    -o StrictHostKeyChecking=accept-new \
    -R "${REMOTE_PORT}:${LOCAL_TARGET}" \
    "${HETZNER_USER}@${HETZNER_HOST}" || true

  echo 'Tunnel disconnected. Reconnecting in 2 seconds...'
  sleep 2
done
