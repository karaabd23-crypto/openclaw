# Workflows

## Runtime operations workflow (mandatory)

- Assume Hetzner-only runtime unless user explicitly changes policy.
- Start every runtime session with topology preflight:
  - local gateway service must be masked/inactive
  - tunnel service must be active
  - localhost health check must return live
- Execute runtime changes on Hetzner over SSH, not on local host.
- Post-change verification:
  - container health
  - `/healthz`
  - channel/provider startup logs
- If local runtime appears active again, stop and remediate immediately before other work.

## Coding workflow

- Scope task first: small/medium/large and reversible/irreversible.
- Use local-first for low-risk execution; escalate to remote for high-stakes/ambiguous work.
- Keep changes focused and verifiable.
- Validate claims against local evidence before marking done.

## Content workflow

- Start from one core idea per cycle.
- Produce channel-specific outputs:
  - Substack long-form version.
  - X/social short-form derivatives.
- Keep voice direct and utility-first.
- Include one clear CTA per content unit.

## Website workflow

- Define page goal first (capture, conversion, booking, or trust).
- Keep copy aligned with selected offer and target student.
- Review CTA path from landing to payment/booking.
- Domain/repo implementation details: Needs verification.

## Job application workflow

- Build role-targeted resume/cover narrative per application cluster.
- Keep a simple pipeline:
  - target role list
  - tailored application assets
  - submission log
  - follow-up steps
- Reuse proven bullets and outcomes; avoid rewriting from scratch every time.
- Tooling specifics in workspace: Needs verification.

## Review/QA expectations

- Prioritize impact, correctness, and execution speed.
- Mark weak claims as `Needs verification`.
- Explicitly call out assumptions.

## Preferred way agents should operate

- Be direct, concise, and execution-first.
- Break tasks into concrete steps.
- Challenge weak ideas and wasted effort.
- Never act on irreversible/public-facing actions without approval.
