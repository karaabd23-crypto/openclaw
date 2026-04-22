# Agent Handoff: Online OpenClaw Migration (2026-04-21)

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

## Verified Current Runtime State (Last Check)

- Host: `195.201.123.118`
- SSH user: `root`
- Repo path: `/root/openclaw`
- State path: `/root/.openclaw`
- Container: `openclaw-openclaw-gateway-1`
- Health: `Up ... (healthy)`
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
   - Required fix: ensure exactly one poller for this bot token, or move OpenClaw to a different dedicated bot token.

2. Token security incident:
   - A Telegram bot token was pasted in chat.
   - Required fix: rotate/revoke that token in BotFather and update VPS secret file(s).

3. Temporary security downgrade remains enabled:
   - `gateway.controlUi.dangerouslyAllowHostHeaderOriginFallback=true`.
   - Required follow-up: keep explicit `gateway.controlUi.allowedOrigins` and remove dangerous fallback once final access paths are stable.

4. Deploy script caveat:
   - `scripts/openclaw-hetzner-deploy.sh` currently writes a `docker-compose.vps.yml` ports override.
   - Base `docker-compose.yml` already maps ports, so this can create duplicate host-port binds in some runs.
   - If using this script again, validate compose port mapping logic first.

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

## Cost and Model Intent (User Requirement)

- User priority: strong intelligence + proactivity, but strict spend control.
- Budget posture target: about `$25/month`.
- Existing runtime log shows active model `openai-codex/gpt-5.4-mini`.
- Future agents should preserve low-cost defaults and gate strong-model usage.

## Agent Rules for Future Sessions

- Do not paste or echo raw secrets in chat, logs, docs, commits, or PRs.
- Keep gateway private (loopback + SSH tunnel) unless user explicitly asks for public exposure with hardened auth/TLS.
- Before claiming runtime status, re-run live checks (container health + healthz + channel logs).
- Update this file at the end of any session that changes operational state.
