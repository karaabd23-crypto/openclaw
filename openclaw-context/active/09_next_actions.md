# Next Actions

## Quick wins (next 24-48h)

- Run runtime preflight before any ops work:
  - `systemctl --user status openclaw-gateway.service`
  - `systemctl --user status openclaw-hetzner-tunnel.service`
  - `curl -fsS http://127.0.0.1:18789/healthz`
- Read and follow `active/10_hetzner_cutover_incident_2026-04-22.md`.
- **FIX - Hetzner git remote:** `ssh root@195.201.123.118 'cd /root/openclaw && git remote set-url origin https://github.com/karaabd23-crypto/openclaw.git'`
- Lock and record 8 decisions (4 per track):
  - IELTS: primary student profile, core outcome, main offer format, one upsell
  - CELPIP: primary student profile, core outcome, main offer format, one upsell
- Update `core/02_businesses_and_offers.md` with both chosen offer structures.
- Draft one Substack post outline and 3 X/social derivative posts from same topic.

## Medium tasks (this week)

- Add a weekly runtime-integrity check:
  - confirm local gateway remains masked/inactive
  - confirm tunnel service is active
  - confirm Hetzner container is healthy
- **IELTScorner analytics workaround:** Manually pull GA4 key metrics weekly (sessions, top pages, bounce rate, conversion events) and paste summary into `openclaw-context/active/` for agent reference.
- **IELTScorner repo access on Hetzner (optional):** If OpenClaw needs to push changes to `karaabd23-crypto/ieltscorner-site`, clone the repo to Hetzner and mount it in the container, or add a GitHub MCP server with a GitHub personal access token.
- **Enable google-workspace MCP extra tools (optional):** Add `docs sheets search` to the `--tools` arg in `openclaw.json` MCP server config. Full supported list: `gmail drive calendar docs sheets chat forms slides tasks contacts search appscript`.
- Write one IELTS offer matrix and one CELPIP offer matrix:
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
- Draft CELPIP vs IELTS scope split in one page (equal split; CELPIP monetization upside currently higher).
- Create job application tracker fields and add first 5 target roles.
- **Brave/Exa search:** Get Brave Search API key from developer.search.brave.com, add to Hetzner openclaw.json `plugins.entries.brave` config. Will unlock web research for IELTS content tasks.

## Deeper tasks (2-week window)

- Process chat export into session summaries under `archive/`.
- Add a "runtime topology check" step to all handoff templates.
- Build weekly operating cadence:
  - top 3 deliverables
  - ship log
  - blockers
  - adjustments
- Run local-first model routing review using weekly report template.
- Complexity routing: evaluate if a prompt-length or keyword heuristic could auto-escalate from local model to gpt-5.4 without manual `/model` commands.
- Analytics API access for OpenClaw: evaluate adding Google Analytics Data API or Search Console API as an MCP tool so OpenClaw can query IELTScorner data without manual export.

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
