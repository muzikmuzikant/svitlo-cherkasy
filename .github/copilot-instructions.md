# GitHub Copilot / Coding Agent Instructions

The product and owner speak Ukrainian. Always read [AGENTS.md](../AGENTS.md) and all documents in [docs/AI_CONTINUITY_INDEX.md](../docs/AI_CONTINUITY_INDEX.md) before changing code. The documents preserve owner requirements, historical regressions, acceptance criteria and the Beta-first workflow.

## Non-negotiable

- Work from current `staging` for functionality; commit only to a feature/fix branch and open a PR targeting `staging`. **Never merge or deploy to `main` without explicit owner approval for that release.**
- Never mix Production and Beta API hosts, VAPID keys, persistent volumes, manifests, `push-config.json`, `CNAME`, verification file or data snapshots.
- Do not invent outage information or map-based electrical queue assignments; no published daily schedule in the PWA means display **«Світло весь день»**.
- Premium light iOS-like UI, preserve original icons, implement **enter and exit** animations, respect reduced motion; no mobile horizontal overflow, accidental zoom, broken transitions or tab cooldown.
- Public Ukrainian release notes must be user-facing, natural, without em dash or internal infrastructure terminology.
- Real server state is authoritative for user Inbox and support tickets; deletions must propagate without app restart and old caches must not resurrect records.
- Web Push: one event = one notification; do not test by mass-sending to real subscribers.
- Ad system remains off in Production; support/donations must stay independent.
- Don't print secrets or expose private user data. Never destroy Railway persistent data.
- Reproduce bugs, identify root cause, add regression tests, run Python/Node/build, inspect actual staged deployment, disclose unverified iPhone/manual tests. Report exact commit and PR URLs instead of empty completion claims.

Current system names and versions in documents are **dated snapshots from 2026-10-20**: verify before reliance. Production was `main` v7.9.10, Beta `staging` v7.9.13 at that time.

**Docs to follow:** `DESIGN_RULES.md`, `SCHEDULE_DISPLAY_CONTRACT.md`, `docs/AI_HANDOFF_MASTER.md`, `docs/AI_PRODUCT_AND_UX.md`, `docs/AI_OPERATIONS_RUNBOOK.md`, `docs/AI_BACKLOG_AND_RELEASE.md`, `docs/OWNER_GUIDE.md`.
