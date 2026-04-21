# Workflows

## Coding workflow

- Run docs index first (`pnpm docs:list`), then only relevant docs.
- Follow root/scoped `AGENTS.md` before touching subtrees.
- Keep changes focused by topic.
- Preferred local gate: `pnpm check:changed` + targeted tests.
- Preserve boundaries: core generic, extension-specific behavior in extensions.

## Content workflow

- Update docs when behavior/API changes.
- Use `plugin/plugins` terminology in docs/UI/changelog.
- Keep changelog user-facing.
- Keep generated docs/config artifacts aligned when touched.

## Website workflow

- Website is referenced as sibling project `../openclaw.ai`.
- Detailed website workflow in this workspace: Needs verification.

## Review/QA expectations

- Prioritize regressions, behavior risk, missing tests.
- Keep format/lint/type/build/tests green for touched scope.
- Use `qa/scenarios/*` where relevant.

## Preferred way agents should operate

- Use local evidence unless instructed otherwise.
- Mark uncertain claims as `Needs verification`.
- Do not expose secrets.
- Merge existing content; avoid destructive overwrite.
