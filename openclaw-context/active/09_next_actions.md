# Next Actions

## Quick wins

- Run runtime preflight before any ops work:
  - `systemctl --user status openclaw-gateway.service`
  - `systemctl --user status openclaw-hetzner-tunnel.service`
  - `curl -fsS http://127.0.0.1:18789/healthz`
- Read and follow `active/10_hetzner_cutover_incident_2026-04-22.md`.
- Re-run memory prompt and verify output includes:
  - Kara Abdolmaleki
  - IELTS Corner
  - CELPIP Corner
- Choose and record 4 decisions:
  - primary student
  - core outcome
  - main offer type
  - one upsell
- Update `core/02_businesses_and_offers.md` with chosen offer structure.
- Draft one Substack post outline and 3 X/social derivative posts from same topic.

## Medium tasks

- Add a weekly runtime-integrity check:
  - confirm local gateway remains masked/inactive
  - confirm tunnel service is active
  - confirm Hetzner container is healthy
- Write one IELTS offer matrix:
  - target student
  - problem
  - promised outcome
  - format
  - components
  - turnaround/duration
  - price placeholder
  - upsell
  - exclusions
- Define one concrete conversion path:
  - content piece
  - CTA
  - landing/booking step
  - payment step
  - follow-up step
- Draft CELPIP vs IELTS scope split in one page.
- Create job application tracker fields and add first 5 target roles.

## Deeper tasks

- Process chat export into session summaries under `archive/`.
- Add a "runtime topology check" step to all handoff templates.
- Build weekly operating cadence:
  - top 3 deliverables
  - ship log
  - blockers
  - adjustments
- Plan local-first model routing pilot review using weekly report template.

## Weekly Usage Report Template (Model Routing Policy v1)

- Week:
- Date range:
- Total turns:
- Local turns (%):
- Remote turns (%):
- Escalations count:
- Top escalation triggers:
- Failed first pass:
  - Local:
  - Remote:
- Estimated API cost trend (week-over-week):
- Quality incidents caught (wrong/uncertain outputs):
- Policy adjustments proposed (max 3):
