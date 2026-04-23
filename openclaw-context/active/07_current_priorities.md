# Current Priorities

1. Keep single-runtime integrity (Hetzner-only)

- Why it matters:
  - Runtime split creates memory drift and bad decisions.
- Done looks like:
  - local gateway stays masked/inactive
  - tunnel path stays healthy
  - runtime changes happen on Hetzner only
- First next step:
  - run the preflight triad in `active/10_hetzner_cutover_incident_2026-04-22.md`

2. Run dual-track revenue path (IELTS + CELPIP)

- Why it matters:
  - Website and business flow are split across both tests.
  - CELPIP currently has stronger near-term monetization potential.
- Done looks like:
  - one core offer + one upsell + one CTA flow documented and active for each test track
- First next step:
  - finalize both offer stacks in `core/02_businesses_and_offers.md`

3. Enforce equal-split execution discipline

- Why it matters:
  - unbalanced attention creates avoidable revenue loss.
- Done looks like:
  - IELTS and CELPIP each get explicit weekly deliverables.
  - CELPIP monetization experiments are not deprioritized.
- First next step:
  - keep the equal-split policy explicit in active briefs and handoffs

4. Run weekly content-to-conversion loop

- Why it matters:
  - publishing without conversion path wastes effort.
- Done looks like:
  - each cycle ships content and CTA steps for both IELTS and CELPIP tracks
- First next step:
  - pick this week’s topic and CTA destination

5. Keep cost policy strict while preserving quality

- Why it matters:
  - spend must stay controlled without quality collapse.
- Done looks like:
  - local-first model usage by default
  - remote escalation only for hard/high-stakes tasks
- First next step:
  - review weekly usage with `active/09_next_actions.md` template

6. Maintain handoff hygiene

- Why it matters:
  - stale handoffs cause wrong agent behavior.
- Done looks like:
  - `AGENT_HANDOFF.md` + active context files reflect current state and priorities
- First next step:
  - refresh handoffs at least weekly or after major runtime/business changes
