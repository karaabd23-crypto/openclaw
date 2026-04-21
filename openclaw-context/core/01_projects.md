# Projects

## OpenClaw

- What it is:
  - Open-source self-hosted AI gateway/personal assistant platform.
- Main goal:
  - Reliable, secure assistant behavior across channels/devices.
- Main assets/repos/domains/files:
  - Repo: `openclaw`.
  - Surfaces: `src/`, `extensions/`, `docs/`, `ui/`, `apps/`.
  - References: `openclaw.ai`, `docs.openclaw.ai`, `clawhub.com`.
- Immediate risks/blockers:
  - High regression risk from broad integration surface.
  - Security and compatibility constraints across many channels/tools.
- Next likely milestone:
  - Needs verification.

## iOS companion app (`apps/ios`)

- What it is:
  - iOS node app for connecting to Gateway.
- Main goal:
  - Reliable node pairing/push behavior.
- Main assets/repos/domains/files:
  - `apps/ios/README.md`, `apps/ios/VERSIONING.md`, `apps/ios/version.json`, `apps/ios/CHANGELOG.md`.
- Immediate risks/blockers:
  - Release and runtime hardening workload.
- Next likely milestone:
  - Needs verification.

## Android companion app (`apps/android`)

- What it is:
  - Android node app for connect/chat/voice/device flows.
- Main goal:
  - Stable release-ready node experience.
- Main assets/repos/domains/files:
  - `apps/android/README.md`, `apps/android/app/build.gradle.kts`.
- Immediate risks/blockers:
  - E2E QA and release hardening workload.
  - Play policy constraints for restricted permissions.
- Next likely milestone:
  - Needs verification.

## Swabble (`Swabble/`)

- What it is:
  - Swift wake-word hook daemon + `SwabbleKit` utilities.
- Main goal:
  - Local speech-triggered automation.
- Main assets/repos/domains/files:
  - `Swabble/README.md`, `Swabble/docs/spec.md`.
- Immediate risks/blockers:
  - Service-control and detection hardening.
- Next likely milestone:
  - Needs verification.

## `openclaw.ai` sibling website

- What it is:
  - Website/installer surface referenced by repo guidance.
- Main goal:
  - Product/install web surface.
- Main assets/repos/domains/files:
  - Referenced sibling path `../openclaw.ai`.
- Immediate risks/blockers:
  - Not present in this workspace; Needs verification.
- Next likely milestone:
  - Needs verification.
