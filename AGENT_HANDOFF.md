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
- Applied cost-first hybrid routing policy (2026-04-22):
  - Confirmed live runtime (`2026.4.21`) has no native complexity-threshold model auto-router; model policy remains primary + ordered fallbacks.
  - Set default model path to local Ollama first:
    - `agents.defaults.model.primary = ollama/qwen2.5:7b`
    - `agents.defaults.model.fallbacks = [ollama/llama3.2:3b, openai/gpt-5.4-mini, openai/gpt-5.4]`
  - Added per-model thinking overrides to avoid local provider schema failures:
    - `agents.defaults.models["ollama/qwen2.5:7b"].params.thinking = off`
    - `agents.defaults.models["ollama/llama3.2:3b"].params.thinking = off`
  - Added explicit sub-agent escalation lane:
    - `agents.defaults.subagents.model.primary = openai/gpt-5.4-mini`
    - `agents.defaults.subagents.model.fallbacks = [openai/gpt-5.4]`
    - `agents.defaults.subagents.thinking = low`
  - Enabled strict embedded Pi execution contract for GPT-5-family follow-through:
    - `agents.defaults.embeddedPi.executionContract = strict-agentic`
  - Moved active-memory model off OpenAI to local Ollama:
    - `plugins.entries.active-memory.config.model = ollama/qwen2.5:7b`
  - Restarted gateway and verified health + live status with successful local test turn (`openclaw agent --agent main` returned `OK` on `ollama/qwen2.5:7b` with `requestShaping.thinking=off`).
- Applied chat-distillation + memory reliability update (2026-04-23):
  - Parsed preserved session history from live Hetzner sessions and migrated local snapshot.
  - Wrote distilled directive summary to:
    - `openclaw-context/archive/2026-04-23_vscode_chat_distillation.md`
    - `memory/2026-04-23.md`
    - appended update block in `MEMORY.md`
    - appended priority correction block in `USER.md`
  - Switched memory embeddings provider from OpenAI to local Ollama to avoid quota failures:
    - `agents.defaults.memorySearch.provider = ollama`
    - `agents.defaults.memorySearch.model = nomic-embed-text`
    - `agents.defaults.memorySearch.remote.baseUrl = http://172.17.0.1:11434`
    - `agents.defaults.memorySearch.fallback = none`
  - Verified local embeddings and successful memory indexing/search post-change.

## Verified Current Runtime State (Last Check)

- Host: `195.201.123.118`
- SSH user: `root`
- Repo path: `/root/openclaw`
- State path: `/root/.openclaw`
- Container: `openclaw-openclaw-gateway-1`
- Health: `Up ... (healthy)`
- Default model: `ollama/qwen2.5:7b`
- Fallbacks: `ollama/llama3.2:3b`, `openai/gpt-5.4-mini`, `openai/gpt-5.4`
- Thinking default: `low`
- Per-model thinking overrides:
  - `ollama/qwen2.5:7b => off`
  - `ollama/llama3.2:3b => off`
- Sub-agent model policy:
  - primary `openai/gpt-5.4-mini`
  - fallback `openai/gpt-5.4`
  - `maxSpawnDepth=2`, `maxChildrenPerAgent=4`, `runTimeoutSeconds=900`, `maxConcurrent=10`
- Embedded Pi execution contract: `strict-agentic`
- Active-memory model: `ollama/qwen2.5:7b`
- Memory search embeddings:
  - provider `ollama`
  - model `nomic-embed-text`
  - remote base URL `http://172.17.0.1:11434`
- Telegram session pins verified on local model:
  - `agent:main:telegram:direct:232973295 -> ollama/qwen2.5:7b`
  - `agent:main:telegram:slash:232973295 -> ollama/qwen2.5:7b`
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

1. Telegram conflict monitoring remains required:
   - No recent `getUpdates` `409 Conflict` events were found in current 12-hour log windows.
   - Keep monitoring because historical conflict came from an external poller.

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

8. Complexity auto-routing limitations:
   - Current runtime version does not expose a native complexity threshold router (for example "switch to model X when task is hard").
   - Practical policy is local-first defaults + explicit sub-agent escalation + OpenAI fallback chain.
   - If a session was previously pinned to legacy `codex-cli/*`, reset it with `/model local-main` (or any supported model alias) in that session.

9. IELTS/CELPIP execution gap (non-technical):
   - Both IELTS and CELPIP are active business tracks, but offer/funnel assets are still partially specified in context files.
   - CELPIP currently has stronger near-term monetization potential; do not deprioritize it.

10. Google Analytics and AdSense access gap (AUDIT 2026-04-23):
    - IELTScorner site has GA4 (`G-G0WCV3WJ44`) and AdSense (`ca-pub-5615542310815721`) already embedded in the site code.
    - OpenClaw has NO programmatic access to GA4 data or AdSense reports.
    - The `google-workspace` MCP only covers gmail/drive/calendar — NOT Analytics or Search Console.
    - To fix: add Google Analytics Data API MCP or expose GA4/Search Console via a custom MCP tool.
    - Immediate manual workaround: Kara reviews GA4 + Search Console dashboards and summarizes findings for OpenClaw context.

11. IELTScorner repo access gap (AUDIT 2026-04-23):
    - IELTScorner repo: `karaabd23-crypto/ieltscorner-site` at `/mnt/c/Users/Karaa/Documents/ieltscorner-site` locally.
    - OpenClaw has NO configured GitHub MCP or filesystem path pointing to the IELTScorner repo on Hetzner.
    - OpenClaw CAN access the repo locally via VS Code + MCP (if the workspace is open in VS Code), but cannot on Hetzner.
    - To fix on Hetzner: either clone the repo to `/root/ieltscorner-site` on Hetzner and mount it in the container, or add a GitHub MCP server.

12. VS Code access gap (AUDIT 2026-04-23):
    - OpenClaw IS accessible FROM VS Code via `.vscode/mcp.json` (openclaw MCP server configured).
    - OpenClaw does NOT have the ability to control VS Code (open files, run tasks, etc.) — this is one-way.
    - The Copilot agent (this session) fills this gap in VS Code sessions.
    - For Hetzner-side OpenClaw to act in VS Code: no path currently exists without a VS Code extension MCP server.

13. Hetzner git remote mismatch (URGENT - AUDIT 2026-04-23):
    - Local repo `origin` now points to `karaabd23-crypto/openclaw` (personal fork).
    - Hetzner `/root/openclaw` `origin` still points to `openclaw/openclaw.git` (org — read-only for karaabd23-crypto).
    - Pull/push from Hetzner will fail or pull wrong commits.
    - To fix: `ssh root@195.201.123.118 'cd /root/openclaw && git remote set-url origin https://github.com/karaabd23-crypto/openclaw.git'`

14. Brave search plugin not configured (AUDIT 2026-04-23):
    - The `brave` extension is present but has empty config `{}` in openclaw.json.
    - Not functional until a Brave Search API key is added.
    - Exa search plugin: same status — not confirmed configured.

## Immediate Next-Step Checklist

1. Lock IELTS + CELPIP offer stacks v1 in context docs:
   - one core offer per track
   - one upsell per track
   - one CTA path to booking/payment per track
2. Keep runtime preflight discipline:
   - local gateway masked/inactive
   - tunnel active
   - local tunnel health live
3. Keep cost policy live:
   - local-first default
   - OpenAI only via escalation/fallback
   - check spend cap in OpenAI dashboard
4. Weekly verification:
   - `openclaw models status`
   - telegram session pin check
   - `/healthz` + container health + channel startup logs
5. Publish one IELTS unit and one CELPIP unit per cycle:
   - long-form or core content unit per track
   - derivatives per track
   - single CTA into each offer flow

## Cost and Model Intent (User Requirement)

- User priority: strong intelligence + proactivity, with strict spend control.
- Budget posture target: about `$25/month` (provider-side hard cap).
- Runtime default now routes local-first:
  - primary `ollama/qwen2.5:7b`
  - fallbacks `ollama/llama3.2:3b`, `openai/gpt-5.4-mini`, `openai/gpt-5.4`
- Sub-agent escalation route:
  - primary `openai/gpt-5.4-mini`, fallback `openai/gpt-5.4`
- Telegram direct and slash sessions are pinned back to local model path after cleanup.
- Future agents should preserve this spend-control posture unless user explicitly changes policy.

## IELTS + CELPIP Handoff (Business Continuity)

- Business focus:
  - Equal split between IELTS Corner and CELPIP Corner.
  - CELPIP has higher near-term monetization potential at the moment.
- Mandatory continuity behaviors:
  - Start work by anchoring to `openclaw-context/core/01_projects.md`, `openclaw-context/core/02_businesses_and_offers.md`, and `openclaw-context/active/08_now.md`.
  - Preserve runtime integrity and cost policy while executing business/content tasks.
  - Do not replace shipping tasks with broad planning-only loops.
- Expected weekly outputs:
  - shipped content artifact(s) with CTA for both tracks
  - one offer/funnel improvement in each track
  - one brief handoff/context refresh
- Quality gate:
  - if business claims are uncertain, mark `Needs verification` and create a concrete verification action.

## Agent Rules for Future Sessions

- Do not paste or echo raw secrets in chat, logs, docs, commits, or PRs.
- Keep gateway private (loopback + SSH tunnel) unless user explicitly asks for public exposure with hardened auth/TLS.
- Before claiming runtime status, re-run live checks (container health + healthz + channel logs).
- Update this file at the end of any session that changes operational state.
