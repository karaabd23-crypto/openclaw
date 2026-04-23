# Now

## What appears active right now

- Runtime integrity after cutover incident:
  - Hetzner is the only active runtime.
  - local machine is tunnel-only (`127.0.0.1:18789` -> Hetzner `127.0.0.1:28789`).
  - incident details: `active/10_hetzner_cutover_incident_2026-04-22.md`
- Local-first model routing policy is live:
  - default `ollama/llama3.2:1b` (`local-main`)
  - local context windows raised (Llama profiles `65536`, Qwen `32768`)
  - cloud escalation path is intentionally not in active fallback chain right now
- IELTS Corner and CELPIP Corner are equal-split business tracks.
- CELPIP currently has stronger near-term monetization upside.
- Offer and conversion execution work is active (not fully locked yet).

## Current tools/setup

- VS Code + WSL + terminal-first workflow.
- OpenClaw + Codex for execution support.
- `/openclaw-context` as memory source of truth.
- Hetzner runtime host: `195.201.123.118` (SSH `root`).
- Local systemd tunnel service: `openclaw-hetzner-tunnel.service`.
- Chat export ingestion in progress (Needs verification until delivered).

## Current bottlenecks

- Some context files still carry `Needs verification` placeholders where decisions should be explicit.
- Risk of local runtime reactivation if guardrails are skipped.
- IELTS/CELPIP offer structures and conversion steps are not yet fully locked.
- Business tasks can drift into planning-heavy loops unless weekly outputs are enforced.
- OpenClaw has no programmatic access to Google Analytics or Search Console for IELTScorner.
- OpenClaw has no configured access to the IELTScorner GitHub repo on Hetzner.
- Brave/Exa search plugins installed but not configured (empty API key).
- Copilot subscription auth is present in VS Code agent context but not yet bridged into Hetzner runtime.
- GitHub device-code endpoint from Hetzner has returned transient `HTTP 503`, blocking direct Copilot login until retry succeeds.

## Open decisions

- Primary IELTS segment and primary CELPIP segment for aggressive conversion push.
- Core offer packaging constraints for both tracks.
- First upsell paired to each core offer.
- First channel path per track for conversion (web/WhatsApp/Telegram).
- Whether to add Google Analytics MCP or rely on manual data pasting to OpenClaw context.
- Whether to clone IELTScorner repo on Hetzner or rely on VS Code workspace sessions for repo access.
- Whether to get Brave Search API key to enable Brave plugin (currently has empty config).

## Last audit

- Full capability audit completed 2026-04-23.
- Full findings in `AGENT_HANDOFF.md` outstanding issues 10-14.
- Tunnel: healthy (`openclaw-hetzner-tunnel.service` active 22h, /healthz: ok).
- Local gateway: masked/inactive (correct).
- Hetzner docker container: healthy.
