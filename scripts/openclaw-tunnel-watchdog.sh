#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  scripts/openclaw-tunnel-watchdog.sh --ssh-target user@host [options]

Options:
  --ssh-target <target>         SSH target (required unless OPENCLAW_TUNNEL_SSH_TARGET is set)
  --local-port <port>           Local forwarded gateway port (default: 18789)
  --remote-port <port>          Remote gateway port (default: 28789)
  --aux-local-port <port>       Optional second local forward (default: 18790)
  --aux-remote-port <port>      Optional second remote forward (default: 28790)
  --probe-timeout-ms <ms>       Probe timeout for gateway status (default: 3000)
  --interval-s <seconds>        Loop interval (default: 15)
  --max-failures <count>        Consecutive failures before tunnel restart (default: 2)
  --openclaw-cmd <cmd>          Command used for gateway probes (default: auto-detect)
  --log-file <path>             Append logs to this file
  --once                        Run one probe cycle and exit
  --dry-run                     Print actions, do not kill/start ssh
  --help                        Show this help

Examples:
  scripts/openclaw-tunnel-watchdog.sh --ssh-target root@example.com
  scripts/openclaw-tunnel-watchdog.sh --ssh-target root@example.com --once --dry-run
EOF
}

SSH_TARGET="${OPENCLAW_TUNNEL_SSH_TARGET:-}"
LOCAL_PORT=18789
REMOTE_PORT=28789
AUX_LOCAL_PORT=18790
AUX_REMOTE_PORT=28790
PROBE_TIMEOUT_MS=3000
INTERVAL_S=15
MAX_FAILURES=2
OPENCLAW_CMD=""
LOG_FILE=""
ONCE=0
DRY_RUN=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --ssh-target)
      SSH_TARGET="${2:-}"
      shift 2
      ;;
    --local-port)
      LOCAL_PORT="${2:-}"
      shift 2
      ;;
    --remote-port)
      REMOTE_PORT="${2:-}"
      shift 2
      ;;
    --aux-local-port)
      AUX_LOCAL_PORT="${2:-}"
      shift 2
      ;;
    --aux-remote-port)
      AUX_REMOTE_PORT="${2:-}"
      shift 2
      ;;
    --probe-timeout-ms)
      PROBE_TIMEOUT_MS="${2:-}"
      shift 2
      ;;
    --interval-s)
      INTERVAL_S="${2:-}"
      shift 2
      ;;
    --max-failures)
      MAX_FAILURES="${2:-}"
      shift 2
      ;;
    --openclaw-cmd)
      OPENCLAW_CMD="${2:-}"
      shift 2
      ;;
    --log-file)
      LOG_FILE="${2:-}"
      shift 2
      ;;
    --once)
      ONCE=1
      shift
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 2
      ;;
  esac
done

if [[ -z "${SSH_TARGET}" ]]; then
  echo "--ssh-target is required (or set OPENCLAW_TUNNEL_SSH_TARGET)." >&2
  exit 2
fi

if [[ -z "${OPENCLAW_CMD}" ]]; then
  if command -v openclaw >/dev/null 2>&1; then
    OPENCLAW_CMD="openclaw"
  elif [[ -f "scripts/run-node.mjs" ]]; then
    OPENCLAW_CMD="node scripts/run-node.mjs"
  else
    echo "Unable to auto-detect OpenClaw command. Pass --openclaw-cmd." >&2
    exit 2
  fi
fi

log() {
  local ts
  ts="$(date -Is)"
  local line="[$ts] $*"
  echo "${line}"
  if [[ -n "${LOG_FILE}" ]]; then
    printf '%s\n' "${line}" >>"${LOG_FILE}"
  fi
}

is_integer() {
  [[ "$1" =~ ^[0-9]+$ ]]
}

for value in "${LOCAL_PORT}" "${REMOTE_PORT}" "${AUX_LOCAL_PORT}" "${AUX_REMOTE_PORT}" "${PROBE_TIMEOUT_MS}" "${INTERVAL_S}" "${MAX_FAILURES}"; do
  if ! is_integer "${value}"; then
    echo "Numeric option expected, got: ${value}" >&2
    exit 2
  fi
done

find_tunnel_pids() {
  pgrep -af "ssh" \
    | awk -v lp="${LOCAL_PORT}" -v rp="${REMOTE_PORT}" -v tgt="${SSH_TARGET}" '
      index($0, "-L 127.0.0.1:" lp ":127.0.0.1:" rp) > 0 && index($0, tgt) > 0 { print $1 }
    '
}

restart_tunnel() {
  local pids
  pids="$(find_tunnel_pids || true)"
  if [[ -n "${pids}" ]]; then
    log "Stopping tunnel pid(s): ${pids}"
    if [[ "${DRY_RUN}" -eq 0 ]]; then
      # shellcheck disable=SC2086
      kill ${pids}
      sleep 1
    fi
  else
    log "No matching existing tunnel process found."
  fi

  local start_cmd=(
    ssh -fNT
    -o BatchMode=yes
    -o ExitOnForwardFailure=yes
    -o ServerAliveInterval=30
    -o ServerAliveCountMax=3
    -o StrictHostKeyChecking=accept-new
    -L "127.0.0.1:${LOCAL_PORT}:127.0.0.1:${REMOTE_PORT}"
    -L "127.0.0.1:${AUX_LOCAL_PORT}:127.0.0.1:${AUX_REMOTE_PORT}"
    "${SSH_TARGET}"
  )
  log "Starting tunnel: ${start_cmd[*]}"
  if [[ "${DRY_RUN}" -eq 0 ]]; then
    "${start_cmd[@]}"
  fi
}

probe_status() {
  local tmp
  tmp="$(mktemp)"
  local probe_cmd=(
    ${OPENCLAW_CMD}
    gateway status
    --json
    --url "ws://127.0.0.1:${LOCAL_PORT}"
    --timeout "${PROBE_TIMEOUT_MS}"
  )
  if ! "${probe_cmd[@]}" >"${tmp}" 2>/dev/null; then
    rm -f "${tmp}"
    echo "cmd_failed"
    return
  fi

  local result
  result="$(
    node -e '
      const fs = require("node:fs");
      const p = process.argv[1];
      let text = fs.readFileSync(p, "utf8").trim();
      if (!text) {
        console.log("invalid_json");
        process.exit(0);
      }
      let obj;
      try {
        obj = JSON.parse(text);
      } catch {
        console.log("invalid_json");
        process.exit(0);
      }
      const rpc = obj?.rpc;
      if (!rpc || typeof rpc.ok !== "boolean") {
        console.log("missing_rpc");
        process.exit(0);
      }
      if (rpc.ok) {
        console.log("ok");
      } else {
        const err = typeof rpc.error === "string" ? rpc.error : "probe_failed";
        console.log("fail:" + err);
      }
    ' "${tmp}"
  )"
  rm -f "${tmp}"
  echo "${result}"
}

consecutive_failures=0

log "Watchdog starting (target=${SSH_TARGET}, local=${LOCAL_PORT}, remote=${REMOTE_PORT}, max_failures=${MAX_FAILURES}, interval_s=${INTERVAL_S}, dry_run=${DRY_RUN})"

while true; do
  probe_result="$(probe_status)"
  case "${probe_result}" in
    ok)
      if [[ "${consecutive_failures}" -gt 0 ]]; then
        log "Probe recovered after ${consecutive_failures} failure(s)."
      fi
      consecutive_failures=0
      log "Probe OK."
      ;;
    fail:*)
      consecutive_failures=$((consecutive_failures + 1))
      log "Probe failed (${probe_result#fail:}); consecutive_failures=${consecutive_failures}"
      if [[ "${consecutive_failures}" -ge "${MAX_FAILURES}" ]]; then
        log "Failure threshold reached. Restarting tunnel."
        restart_tunnel
        consecutive_failures=0
      fi
      ;;
    *)
      consecutive_failures=$((consecutive_failures + 1))
      log "Probe error (${probe_result}); consecutive_failures=${consecutive_failures}"
      if [[ "${consecutive_failures}" -ge "${MAX_FAILURES}" ]]; then
        log "Failure threshold reached. Restarting tunnel."
        restart_tunnel
        consecutive_failures=0
      fi
      ;;
  esac

  if [[ "${ONCE}" -eq 1 ]]; then
    log "Single-cycle run complete."
    exit 0
  fi

  sleep "${INTERVAL_S}"
done
