# Deployment Plan

## Recommended Production Shape

- `https://dollarbarclub.com/`
  - Marketing site from `website/`
- `https://dollarbarclub.com/app`
  - Member app from `apps/member`
- `https://dollarbarclub.com/api/*`
  - Reverse-proxied to the Railway API service
- Internal ops console
  - Keep off the public marketing root flow when possible
  - If needed temporarily, serve it behind a protected internal URL and `ADMIN_ACCESS_KEY`

## Hosting Split

### Vercel

Use Vercel for the public web surfaces:

- `website/` as the marketing site
- `apps/member` as the member app

Recommended routing goal:

- `/` -> marketing site
- `/app` -> member app
- `/api/*` -> proxy to Railway

The member app and internal ops console now default to same-origin `/api` in production. Local development still defaults to `http://localhost:8787`.

### Railway

Use Railway for the always-on Node API in `apps/api`.

Reasons:

- long-running Node process
- SQLite with persistent disk
- simpler than serverless for the current pilot architecture

## Railway Environment Variables

Required:

- `PORT`
- `ADMIN_ACCESS_KEY`
- `ALLOWED_ORIGINS`

Optional / feature-dependent:

- `BARGLANCE_API_KEY`

Suggested production values:

- `PORT=8787`
- `ALLOWED_ORIGINS=https://dollarbarclub.com`

If you deploy the internal ops console on a separate origin, include it in `ALLOWED_ORIGINS` as a comma-separated list.

## SQLite on Railway

The API now uses the repo-root `data/dbc.sqlite` path consistently. In production, Railway must mount persistent storage so `data/dbc.sqlite` survives restarts and deploys.

Production requirement:

- persistent volume attached to the service
- `data/` directory stored on that volume

Operational recommendation:

- add a backup/export routine before launch

## Frontend API Behavior

Both frontend apps use this resolution order:

1. `window.__DBC_API_BASE__` if injected
2. `http://localhost:8787` in local development
3. `/api` in production

That means the intended production setup is same-origin API calls via a proxy, not direct browser calls to the raw Railway hostname.

## Recommended Rollout

1. Keep the current marketing site on Vercel.
2. Add the member app at `/app`.
3. Proxy `/api/*` to Railway.
4. Switch the website CTA from waitlist to app entry when launch is open.
5. Keep the internal ops console on a protected internal URL or separate deployment path.

## Pre-Launch Checklist

- Confirm Railway persistent storage is attached
- Set `ADMIN_ACCESS_KEY`
- Set `ALLOWED_ORIGINS`
- Set `BARGLANCE_API_KEY` if venue sync is needed
- Verify `/api/health` through the public domain
- Verify member claim, offers, redemption, and admin access through deployed routing
