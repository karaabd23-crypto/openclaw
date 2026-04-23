# Constraints

## Confidentiality constraints

- Never store or expose passwords, keys, tokens, or private credentials.
- Personal identifier allowed in memory: name only (`Kara Abdolmaleki` / `Kara`).
- Treat local credential/config stores as sensitive.

## Public vs private claims

- No fake certainty.
- No hallucinated facts, data, or metrics.
- Only assert what workspace evidence or explicit user instruction supports.
- Mark weak claims as `Needs verification`.

## Business/technical limitations

- Avoid overengineering and unnecessary complexity.
- Prefer function over aesthetics.
- For ambiguous/high-cost decisions, escalate to stronger model or user review.

## Runtime topology constraints (critical)

- Hetzner is the only active OpenClaw runtime host:
  - `195.201.123.118`
- Local machine must remain tunnel-only for OpenClaw access.
- Do not start local OpenClaw runtime services unless user explicitly approves topology change.
- Before runtime edits, run:
  - `systemctl --user status openclaw-gateway.service`
  - `systemctl --user status openclaw-hetzner-tunnel.service`
  - `curl -fsS http://127.0.0.1:18789/healthz`
- Incident reference: `openclaw-context/active/10_hetzner_cutover_incident_2026-04-22.md`.

## Agent operating restrictions

- Never without explicit user approval:
  - deleting or overwriting files
  - major architecture changes
  - deploys/push to production
  - sending outreach/messages on user's behalf
  - committing or pushing to git
  - creating new workflow-shaping systems
- When unclear:
  - make the most reasonable reversible assumption
  - flag the assumption explicitly
  - ask only if high-risk or irreversible

## Common failure modes to avoid

- Inventing user/business details.
- Mixing stable context and temporary context.
- Safe but vague plans with no executable next step.
- Soft feedback when brutal critique is requested.
