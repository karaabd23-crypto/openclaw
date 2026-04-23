# Agent Handoff: Online OpenClaw Migration (2026-04-21)

## Critical Incident Addendum (2026-04-22)

- Incident: runtime split was confirmed between local machine and Hetzner VPS.
- Impact: memory divergence (`MEMORY.md` local vs Hetzner), Dream Diary confusion, and high risk of accidental dual operation.
- Root cause: local user-level `openclaw-gateway` service was still running while Hetzner runtime was also active.
- Resolution completed:
  - Local gateway service stopped, disabled, and masked.
  - Local OpenClaw state wiped: `~/.openclaw` removed.
  - Local state backup created and preserved on Hetzner:
    - `/root/openclaw-migration-snapshots/openclaw-local-20260422T071945Z.tgz`
    - sha256: `bed3bc5348ed2c59860998e31737fd5e56d246959b5180156bc35cd4acfb5356`
  - Local `MEMORY.md` merged into Hetzner runtime workspace and reindexed.
  - Persistent local tunnel established:
    - `127.0.0.1:18789 -> 195.201.123.118:28789`
    - `127.0.0.1:18790 -> 195.201.123.118:28790`
    - service: `openclaw-hetzner-tunnel.service` (user systemd)

## Mandatory Runtime Guardrail (All Future Agents)

- Do not start or install any local OpenClaw runtime service on the operator machine.
- Treat Hetzner as the only active runtime unless Kara explicitly approves a topology change.
- Before any runtime change, run this preflight:
  - `systemctl --user status openclaw-gateway.service` (must be masked/inactive)
  - `systemctl --user status openclaw-hetzner-tunnel.service` (must be active)
  - `curl -fsS http://127.0.0.1:18789/healthz` (must return live)
- Apply runtime/config/channel changes on Hetzner only:
  - `ssh root@195.201.123.118`
- After runtime changes, verify:
  - `docker ps` healthy for `openclaw-openclaw-gateway-1`
  - `curl -fsS http://127.0.0.1:28789/healthz`
  - Telegram logs show provider startup and no active conflict loop.

## Repo vs Runtime Reality (Important)

- Hetzner runtime executes from Docker image `openclaw:latest` (`WorkingDir=/app`) with state mounts:
  - `/home/node/.openclaw <- /root/.openclaw`
  - `/home/node/.openclaw/workspace <- /root/.openclaw/workspace`
- This is not the same as the live VS Code checkout at `/home/karaa/openclaw`.
- Always assume code in VS Code repo and code running in container may differ until redeployed.

## Mandatory Read for Future Agents

- Read this file before making changes related to hosting, Telegram, autonomy, memory, or cost controls for this user.
- Treat this as the continuity doc for Codex, Claude, Copilot, and any other repo-operating agent.
- Keep this file updated when you change runtime topology, credentials wiring, ports, or operational policy.

## Session Outcome (What Was Done)

- Confirmed Hetzner VPS reachable at `195.201.123.118` with SSH user `root`.
- Generated local SSH key (first-time setup on operator machine).
- Added deploy helper script: `scripts/openclaw-hetzner-deploy.sh`.
- Installed Docker on VPS and cloned repo to `/root/openclaw`.
- Migrated OpenClaw state to VPS at `/root/.openclaw`.
- Built `openclaw:latest` on VPS and launched `openclaw-gateway` container.
- Fixed container startup blockers:
  - Resolved secrets path mismatch by rewriting `/home/karaa/.openclaw/...` -> `/home/node/.openclaw/...` in VPS config files.
  - Added Control UI origin allowances and temporary host-header fallback to pass non-loopback startup guard.
  - Disabled Bonjour via env to avoid prior runtime crash loop (`CIAO PROBING CANCELLED`).
- Locked gateway exposure to loopback host-only ports:
  - `127.0.0.1:28789 -> container 18789`
  - `127.0.0.1:28790 -> container 18790`
- Verified runtime health:
  - `docker compose ps` shows `openclaw-gateway` healthy.
  - `curl http://127.0.0.1:28789/healthz` returns `{"ok":true,"status":"live"}`.
- Performed OpenAI API-route migration (2026-04-22):
  - Added auth profile `openai:default` in `/root/.openclaw/agents/main/agent/auth-profiles.json` (provider `openai`, type `api_key`).
  - Switched default model route from `openai-codex/*` to `openai/*`.
  - Set model defaults in `/root/.openclaw/openclaw.json`:
    - `agents.defaults.model.primary = openai/gpt-5.4`
    - `agents.defaults.model.fallbacks = [openai/gpt-5.4-mini, local-default]`
  - Left Codex aliases available (`remote-strong`, `remote-fast`) but removed Codex from default/fallback path.
  - Created rollback snapshot in `/root/openclaw-migration-snapshots/*-openai-switch-retry`.
  - Removed temporary key staging file `/root/.openclaw/credentials/openai-api-key.txt` after successful migration.
  - Verified post-change startup:
    - `docker compose ps` healthy
    - `/healthz` live
    - logs show `agent model: openai/gpt-5.4`
    - Telegram provider still starts (409 polling conflict persists; unchanged).
- Applied latency/stability follow-up (2026-04-22):
  - Set `agents.defaults.thinkingDefault` from `minimal` -> `low` because `openai/gpt-5.4` rejects `minimal` and was forcing retry overhead (`Unsupported value: 'minimal'` then retry with `low`).
  - Disabled broken MCP server entry `mcp.servers.google-workspace.enabled=false` because it pointed to missing path `/home/karaa/.local/bin/uvx` on VPS and could trigger avoidable lane errors (later superseded by in-image `uvx` install + re-enable).
- Applied browser + capability baseline on Hetzner (2026-04-22):
  - Rebuilt `openclaw:latest` with durable runtime additions:
    - browser/runtime: `chromium`, `chromium-sandbox`, `xvfb`
    - media/dev utils: `ffmpeg`, `jq`, `ripgrep`, `zip`, `unzip`, `python3`, `python3-pip`, `python3-venv`
    - fonts: `fonts-noto-core`, `fonts-noto-cjk`, `fonts-noto-color-emoji`
  - Installed Playwright browser payloads at `/home/node/.cache/ms-playwright` inside the image.
  - Installed `uv`/`uvx` at `/home/node/.local/bin` in-image so MCP command path `/home/node/.local/bin/uvx` is valid.
  - Ensured `/home/node/.cache` and `/home/node/.local` are owned by `node:node` so `uvx` can initialize caches (`/home/node/.cache/uv`) without permission failures.
  - Set browser runtime config for containerized launch:
    - `browser.headless=true`
    - `browser.noSandbox=true`
  - Verified managed browser lifecycle:
    - `openclaw browser start` succeeds (Chromium detected at `/usr/bin/chromium`)
    - `openclaw browser stop` succeeds
  - Browser lock-file caveat:
    - after abrupt restarts, Chromium singleton lock symlinks under `/home/node/.openclaw/browser/openclaw/user-data/` can block start; remove `SingletonLock`, `SingletonCookie`, `SingletonSocket` and stale `/tmp/org.chromium.Chromium.*` if needed.
  - Guardrail event during rollout:
    - compose recreate briefly exposed ports on `0.0.0.0`; fixed immediately by restoring `.env` to loopback binds:
      - `OPENCLAW_GATEWAY_PORT=127.0.0.1:28789`
      - `OPENCLAW_BRIDGE_PORT=127.0.0.1:28790`

## Verified Current Runtime State (Last Check)

- Host: `195.201.123.118`
- SSH user: `root`
- Repo path: `/root/openclaw`
- State path: `/root/.openclaw`
- Container: `openclaw-openclaw-gateway-1`
- Health: `Up ... (healthy)`
- Codex CLI: installed inside running container at `/home/node/.npm-global/bin/codex` (`codex-cli 0.122.0`)
- Codex auth: present at `/home/node/.codex/auth.json`
- OpenClaw CLI backend override: `agents.defaults.cliBackends["codex-cli"].command=/home/node/.npm-global/bin/codex` (OpenAI remains default model route)
- Default model: `openai-codex/gpt-5.4`
- Fallbacks: `openai-codex/gpt-5.4-mini`, `openai-codex/gpt-5.3-codex`, `local-default` (`ollama/llama3.2:3b-local`)
- Thinking default: `low`
- Browser runtime config:
  - `browser.headless=true`
  - `browser.noSandbox=true`
  - `browser` auto-detects `/usr/bin/chromium`
- Capability binaries now present in gateway container:
  - `/usr/bin/chromium`
  - `/home/node/.local/bin/uvx`
  - `/usr/bin/ffmpeg`
  - `/usr/bin/jq`
  - `/usr/bin/rg`
- Auth profiles:
  - `ollama:manual` (marker)
  - `openai:default` (API key profile in auth store)
- `.env` values:
  - `OPENCLAW_GATEWAY_BIND=lan`
  - `OPENCLAW_GATEWAY_PORT=127.0.0.1:28789`
  - `OPENCLAW_BRIDGE_PORT=127.0.0.1:28790`
  - `OPENCLAW_DISABLE_BONJOUR=1`
  - `OPENCLAW_CONFIG_DIR=/root/.openclaw`
  - `OPENCLAW_WORKSPACE_DIR=/root/.openclaw/workspace`
  - `OPENCLAW_TZ=America/Vancouver`

## Access Pattern (How User Connects)

1. SSH to server:
   - `ssh root@195.201.123.118`
2. Local tunnel from user machine:
   - `ssh -N -L 18789:127.0.0.1:28789 root@195.201.123.118`
3. Connect clients locally:
   - `http://127.0.0.1:18789`

## Outstanding Issues (Still Needs Work)

1. Telegram polling conflict is unresolved:
   - Logs show repeated `409 Conflict: terminated by other getUpdates request`.
   - Meaning: another process is polling the same bot token.
   - Additional proof (2026-04-21): with Hetzner gateway fully stopped, a direct single-thread `getUpdates` probe loop still observed intermittent conflict, confirming at least one external poller outside this VPS.
   - Mitigation applied (2026-04-22): token rotated in BotFather and OpenClaw updated to new token (validated with `getMe` for `@SirAlfred_P_bot`).
   - Post-rotation startup no longer shows `getUpdates` 409 in recent tail windows; keep monitoring and re-check if conflicts reappear.

2. Token security incident:
   - A Telegram bot token was pasted in chat.
   - Resolved: token rotated/revoked in BotFather and VPS secrets updated.

3. Control UI policy hardening follow-up:
   - `gateway.controlUi.dangerouslyAllowHostHeaderOriginFallback` is currently unset (no break-glass fallback).
   - Keep `gateway.controlUi.allowedOrigins` aligned with actual tunnel/host access paths as topology changes.

4. Deploy script caveat:
   - `scripts/openclaw-hetzner-deploy.sh` currently writes a `docker-compose.vps.yml` ports override.
   - Base `docker-compose.yml` already maps ports, so this can create duplicate host-port binds in some runs.
   - If using this script again, validate compose port mapping logic first.

5. Provider-side hard spend cap still needs dashboard confirmation:
   - OpenClaw fallback policy is configured for cap/rate failures.
   - Actual hard monthly spend cap must be enforced in OpenAI billing/project settings.

6. CLI scope gate for some usage diagnostics:
   - `openclaw status --usage --json` works but reports:
     - `scope upgrade pending approval ... pairing required ...`
   - Non-blocking for runtime operation, but worth cleaning up for ops telemetry UX.

7. Optional MCP follow-up:
   - `google-workspace` MCP command path now resolves (`/home/node/.local/bin/uvx`) and the server is enabled.
   - If MCP startup fails later, debug `uvx workspace-mcp` runtime/env/OAuth state rather than path resolution.

## Immediate Next-Step Checklist

1. Rotate Telegram bot token and store only in VPS secret files.
2. Stop any other runtime polling the same token.
3. Restart gateway and verify Telegram channel no longer logs 409 conflicts.
4. Send DM test message to bot and confirm response latency/quality.
5. Tighten Control UI policy:
   - keep explicit `allowedOrigins`
   - remove `dangerouslyAllowHostHeaderOriginFallback` if no longer needed.
6. Re-validate with:
   - `docker compose -f docker-compose.yml ps`
   - `docker logs --tail=120 openclaw-openclaw-gateway-1`
   - `curl -fsS http://127.0.0.1:28789/healthz`
7. In OpenAI dashboard, enforce hard monthly cap (target `$25/month` unless user overrides).

## Cost and Model Intent (User Requirement)

- User priority: strong intelligence + proactivity, with strict spend control.
- Budget posture target: about `$25/month` (provider-side hard cap).
- Runtime default currently routes through Codex aliases:
  - primary `openai-codex/gpt-5.4`
  - fallbacks `openai-codex/gpt-5.4-mini`, `openai-codex/gpt-5.3-codex`, then `local-default` (Ollama local).
- Future agents should keep this default/fallback order unless user explicitly changes policy.

## Agent Rules for Future Sessions

- Do not paste or echo raw secrets in chat, logs, docs, commits, or PRs.
- Keep gateway private (loopback + SSH tunnel) unless user explicitly asks for public exposure with hardened auth/TLS.
- Before claiming runtime status, re-run live checks (container health + healthz + channel logs).
- Update this file at the end of any session that changes operational state.
