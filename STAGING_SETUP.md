# Світло Черкаси Beta: staging

This branch is an isolated preview **based on v7.9.8**, not a public release.

## Implemented

- `release.json`: version `7.9.8`, `channel: beta`.
- Dedicated PWA identity and name in `manifest.webmanifest`, plus a visible BETA badge.
- Staging service worker cache suffix from `scripts/build_pages.py`.
- No production `CNAME`. Robots are disallowed (this does **not** provide access control).
- `push-config.json` intentionally points to `https://staging-api.invalid` and has no Push key.
  Production telemetry/admin/push traffic must NEVER be routed from this branch.
- Existing GitHub Pages workflow deploys `main` only.

## Publish the private preview

1. Connect the repository `muzikmuzikant/svitlo-cherkasy` to a **separate Cloudflare Pages project**.
2. Use `staging` as the production branch for that Pages project. Build command:
   `python scripts/build_pages.py`; output directory: `_site`.
3. Before sharing or installing, protect **both** the custom staging hostname
   (`test.svitlo-cherkasy.pp.ua`) and any `*.pages.dev` project/preview URLs
   with Cloudflare Access. Allow only the tester's account.
4. Attach custom domain and add the DNS records given by Cloudflare; do not modify
   DNS or the active origin of `svitlo-cherkasy.pp.ua`.
5. Open the HTTPS staging hostname on iPhone Safari, authenticate, and install
   “Світло Черкаси Beta” from Add to Home Screen.

## Enable isolated backend functionality

Use a **separate Railway project/service + storage volume**, never the live
subscription store. Provide:

- Unique `APP_ORIGIN` exactly matching the private staging PWA origin.
- Unique strong `ADMIN_PASSWORD` (not the production secret).
- New **staging-only VAPID key pair** and `PUSH_CONTACT`.
- Separate `DATA_FILE` on staging storage; never point it at the production volume.
- `SCHEDULE_URL` referencing a safe *read-only* schedule source, or a staging data endpoint.
- Any mutable admin settings and notifications must live only in staging.

After setting up the backend, update **only the staging branch**
`push-config.json` with the new Railway API hostname and public VAPID key.
Run an iPhone Push test. Keep the production schedule cron, customer data,
and admin mutations fully isolated.

**Never merge this branch directly into main:** it contains intentionally
non-production manifest, API, hostname and robot settings. Move approved
feature commits selectively to a release branch and test before deploying main.
