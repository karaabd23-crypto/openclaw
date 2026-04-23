# Now

## What appears active right now

- Runtime integrity and continuity after dual-runtime incident:
  - Hetzner is the only active OpenClaw runtime.
  - Local machine is tunnel-only (`127.0.0.1:18789` -> Hetzner).
  - Incident details: `active/10_hetzner_cutover_incident_2026-04-22.md`.
- Memory/context correction so OpenClaw recognizes Kara + IELTS/CELPIP priorities.
- Offer definition and monetization planning for IELTS Corner.
- Brand-scope split work between IELTS Corner and CELPIP Corner.
- Funnel-path design from content to paid conversion.

## Current tools/setup

- VS Code + WSL + terminal-first workflow.
- OpenClaw + Codex for execution support.
- `/openclaw-context` as memory source of truth.
- Hetzner runtime host: `195.201.123.118` (SSH `root`).
- Local systemd tunnel service: `openclaw-hetzner-tunnel.service`.
- Chat export ingestion in progress (Needs verification until delivered).

## Current bottlenecks

- Inconsistent context files causing wrong assistant retrieval.
- Risk of accidental local runtime reactivation if guardrails are ignored.
- Offer/pricing/funnel not fully locked.
- Too many parallel tracks without one dominant revenue focus.

## Open decisions

- Primary IELTS customer segment to target first.
- First core offer format and delivery model.
- One upsell to pair with the core offer.
- Channel priority for first conversion path (web/WhatsApp/Telegram).
