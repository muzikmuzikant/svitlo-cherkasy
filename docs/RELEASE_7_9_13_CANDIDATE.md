# Production 7.9.13: release candidate (25.10.2026)
**DRAFT. Не зливати без прямого дозволу власника.**

## Технічна основа
- Branch created from `main` SHA `a63aff2c134b1d570645db727ddec9db8fa74bdf`, with selected updated 7.9.13 files from `staging` SHA `19a3ca1ac5a0e901b879edea141feb2993de4612`.
- Not a direct branch merge. Production `data/*`, `CNAME`, `manifest.webmanifest`, `push-config.json`, `robots.txt`, published schedules, source reviews, Google verification and PWA identity remain from latest known Production head.
- Keep Production advertising and app-config safety gates intact. Beta-only experiments `ux-rebuild.*` and abandoned `redesign-7913.js` are excluded. Home and Settings remain in their reverted original design.
- No Railway configuration, volume, credentials or VAPID mutation.

## Release gates
- Run full candidate GitHub CI and read-only browser smoke on this PR final SHA, including today’s Kyiv DST fallback 04:00 to 03:00.
- Beta core CI currently fails due an obsolete Settings selector. The test-only correction is isolated in PR #90 and not merged.
- Verify 12-subqueue PNG, real smartphone micro-animations, dark theme, Inbox scrolling, support real-time, privacy/access controls, manual schedule editor, maintenance fallback and accurate official addresses.
- Check Production Rails/PWA release commit parity; test one private iOS Push subscription both OFF and ON without sending anything to real users.
- Update with the latest `main` immediately before approval because schedules/alerts are modified automatically.
- Merge and production deployment only on the owner's explicit command, with rollback SHA recorded, no database reset and no paid backup by default.

## User-facing update
Full details are in `release.json`. No developer terminology in public release banner.

**Known limitation:** Branch construction transfers code for validation; passing checks and runtime compatibility are NOT asserted here.
