# Hetzner Cutover Incident (2026-04-22)

## What happened

- Two OpenClaw runtimes were active at once:
  - local machine runtime
  - Hetzner runtime (`195.201.123.118`)
- This caused split state and confusing behavior (memory/diary mismatch risk).

## Why this was severe

- Different runtimes can answer from different memory stores.
- Agents can appear inconsistent or "forgetful" even when each instance is behaving correctly.
- Parallel Telegram/runtime activity can create operational instability.

## Resolution applied

- Local runtime fully deactivated:
  - `openclaw-gateway.service` stopped/disabled/masked
  - local state removed: `~/.openclaw`
- Local state backup preserved on Hetzner:
  - `/root/openclaw-migration-snapshots/openclaw-local-20260422T071945Z.tgz`
  - sha256 `bed3bc5348ed2c59860998e31737fd5e56d246959b5180156bc35cd4acfb5356`
- Durable memory consolidated to Hetzner:
  - local `MEMORY.md` merged into `/root/.openclaw/workspace/MEMORY.md`
  - memory index refreshed on Hetzner.
- Access path unified:
  - local `127.0.0.1:18789` now tunnels to Hetzner `127.0.0.1:28789`
  - local `127.0.0.1:18790` now tunnels to Hetzner `127.0.0.1:28790`
  - service: `openclaw-hetzner-tunnel.service`

## Mandatory behavior for all agents

1. Assume Hetzner is the only production runtime.
2. Never start local OpenClaw runtime services without explicit user approval.
3. Preflight before runtime work:
   - `systemctl --user status openclaw-gateway.service`
   - `systemctl --user status openclaw-hetzner-tunnel.service`
   - `curl -fsS http://127.0.0.1:18789/healthz`
4. Make runtime changes on Hetzner over SSH.
5. After changes, verify health and channel startup on Hetzner.

## Current status snapshot (post-cutover)

- Runtime currently healthy at Hetzner `/healthz`.
- Local runtime remains masked/inactive; tunnel service remains active.
- Model policy is local-first with remote escalation:
  - primary local Ollama model
  - ordered OpenAI fallback/escalation path
- This incident file remains mandatory pre-read before hosting/runtime edits.

## Handoff note

- Business continuity runs IELTS and CELPIP as equal tracks.
- CELPIP currently has stronger near-term monetization potential and should not be deprioritized.
- Runtime integrity is a prerequisite, not the business objective.
- After runtime checks pass, move directly to active dual-track deliverables in:
  - `active/07_current_priorities.md`
  - `active/09_next_actions.md`

## Repo/runtime clarification

- VS Code repo: `/home/karaa/openclaw` (development checkout).
- Hetzner runtime: Docker image `openclaw:latest`, state under `/root/.openclaw`.
- Do not assume code in VS Code checkout is what the live container currently executes.
