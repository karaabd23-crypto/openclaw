# Current Priorities

1. Close top regression risks in core gateway

- Why it matters:
  - Prevents trust loss and support churn.
- What done looks like:
  - No known high-severity regressions in touched surfaces.
- First next step:
  - Run `pnpm check:changed` and list failing lanes with owner/action.

2. Improve onboarding/setup reliability

- Why it matters:
  - Setup failure blocks adoption.
- What done looks like:
  - Reproducible happy-path and documented recovery for common failures.
- First next step:
  - Review `docs/start/*` + recent setup fixes in `CHANGELOG.md`; open a concrete fix list.

3. Harden memory failure behavior

- Why it matters:
  - Memory errors can break ongoing sessions.
- What done looks like:
  - Memory recall failures degrade safely without turn failure.
- First next step:
  - Run and summarize relevant `qa/scenarios/memory/*` cases.

4. Stabilize highest-traffic channels

- Why it matters:
  - Channel reliability is core product value.
- What done looks like:
  - Stable send/receive/pairing on top channel paths.
- First next step:
  - Build a channel issue shortlist from `docs/channels/troubleshooting.md` and recent changelog fixes.

5. Protect plugin/core architecture boundaries

- Why it matters:
  - Prevents long-term maintenance debt.
- What done looks like:
  - No new core special-cases that belong in extension contracts.
- First next step:
  - Audit current branch touches against `src/plugins/AGENTS.md` and root architecture rules.

6. Complete Android E2E/release hardening checklist

- Why it matters:
  - Android release readiness is still open.
- What done looks like:
  - Remaining hardening item in `apps/android/README.md` is closed.
- First next step:
  - Convert remaining checklist into tracked tasks with assignees.

7. Reduce test flake and hot-lane runtime

- Why it matters:
  - Faster stable feedback accelerates safe merges.
- What done looks like:
  - Touched lanes run reliably with lower median runtime.
- First next step:
  - Identify top slow/flaky suites and create 1 fix PR per hotspot.

8. Keep docs/config contracts in sync

- Why it matters:
  - Drift causes operator and contributor errors.
- What done looks like:
  - No config/docs drift on touched changes.
- First next step:
  - Add drift-check commands to PR checklist for config-affecting changes.

9. Harden iOS beta path reliability

- Why it matters:
  - iOS node reliability is still fragile.
- What done looks like:
  - Repeatable beta archive/upload path without manual firefighting.
- First next step:
  - Validate the `apps/ios/README.md` maintainer release checklist end-to-end.

10. Clarify business priorities and offers

- Why it matters:
  - Needed for roadmap and focus tradeoffs.
- What done looks like:
  - Confirmed priorities and offer model documented.
- First next step:
  - Needs verification from owner input.
