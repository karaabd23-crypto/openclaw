# VS Code + OpenClaw Chat Distillation (through 2026-04-23)

## Source coverage

- Consolidated from preserved session history in:
  - current Hetzner session store (`/root/.openclaw/agents/main/sessions/*.jsonl`)
  - migrated local backup snapshot (`openclaw-local-20260422T071945Z.tgz`)
- Processed corpus stats:
  - total messages scanned: 2423
  - raw user messages: 500
  - cleaned unique user directives: 149

## Durable directives and decisions

1. Runtime topology

- Hetzner is the single production runtime.
- Local machine should remain tunnel-only.
- Runtime changes must happen on Hetzner and be verified with health checks.

2. Cost and model policy

- Strong pressure to reduce OpenAI API spend.
- Prefer local Ollama/subscription-backed paths when quality permits.
- Do not sacrifice quality just to reduce cost.
- Use stronger cloud models when complexity/risk requires escalation.

3. Autonomy expectations

- Operate proactively and independently.
- Continue useful work while user is offline.
- Surface implementation-ready outputs for approval.

4. Multi-agent quality control intent

- User explicitly requested Operator/Critic/Controller style execution.
- Critic loop should iterate when quality is weak, not stop after first pass.

5. Business focus correction (latest)

- IELTS and CELPIP are equal-split tracks on the website/business surface.
- CELPIP currently has stronger near-term monetization potential.
- Do not enforce IELTS-first bias.

6. Revenue execution intent

- Improve conversion funnels and design quality.
- Use analytics-driven prioritization where data is available.
- Keep direct CTA paths from content to paid offers.

7. Channel and growth intent

- Telegram remains a key acquisition channel.
- CELPIP-focused Telegram audiences are seen as high-value prospects.
- Substack/social publishing should support business and long-term positioning.

8. Tooling and workflow intent

- User wants collaboration with VS Code-side agents (Codex/Copilot).
- Branch-based Git workflow preferred for agent coordination.
- Durable handoffs/context should be kept current to avoid drift.

9. Approval boundary

- Important outward-facing actions should require explicit user approval.

## Notes

- This distillation captures stable directives/patterns, not every message.
- Operational state still lives in active handoff/context files.
