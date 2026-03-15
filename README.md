# Dollar Bar Club Pilot (Austin)

This repository contains a lightweight pilot framework for Dollar Bar Club (DBC), operated by BarGlance.

Current state: the core pilot loop is working end to end. The API is backed by SQLite, the member app supports branded onboarding -> browse -> venue detail -> geolocated redeem with launch-ready member states and a working PWA shell, BarGlance venue sync is wired with richer venue metadata, and the internal BarGlance console supports venue curation, offer management, redemption reporting, and curated venue profile overrides behind an internal access gate. Deployment prep is now aligned around Vercel for the website/member app and Railway for the API.

## Goals
- On-site drink redemption with single-use validation
- Fast setup for Austin pilot bars
- Basic internal operator/admin workflows
- Clear audit trail of redemptions

## Project Structure
- `apps/api`: Node API for offers, members, venues, and redemption processing
- `apps/member`: Mobile-first member-facing SPA (branded onboarding, venue browse/detail, geolocation redemption, PWA shell)
- `apps/web`: Internal BarGlance operations console for venue sync/curation, offer management, and redemption reporting
- `data/schema.sql`: SQLite schema reference snapshot
- `data/dbc.sqlite`: local pilot database created on API startup
- `apps/api/src/migrations.js`: runtime DB migrations applied automatically on boot
- `apps/api/src/catalog.js`: seed catalog boundary for local pilot defaults
- `apps/api/src/barglance.js`: BarGlance client and payload mapping
- `docs/architecture.md`: system architecture and rollout guidance
- `docs/deployment.md`: recommended Vercel + Railway deployment layout

## Pilot Redemption Flow
1. Member opens the member app and selects an eligible live offer.
2. The member app verifies on-site presence via geolocation.
3. The API validates: active offer, eligibility, not already redeemed.
4. The API records redemption with venue and audit metadata.
5. BarGlance monitors redemption activity internally, while venue staff only need reporting visibility.

## API (Current v1 Pilot)
- `GET /health`
- `POST /memberships/claim`
  - Requires `email` + Austin `zipCode` (`73301` or `787xx`)
- `GET /offers/active?membershipToken=...&venueId=...` (includes venue details in response)
- `POST /offers`
  - Requires `X-Admin-Key`
  - Requires `id`, `venueId`, `title`, `startsAt`, `endsAt`
  - Persists the offer and issues entitlements to existing members
- `GET /admin/session`
  - Requires `X-Admin-Key`
- `GET /admin/offers`
  - Requires `X-Admin-Key`
- `POST /admin/offers/:id/active`
  - Requires `X-Admin-Key`
- `GET /venues/:id?membershipToken=...` (single venue with offers and entitlement statuses)
- `POST /redeem`
  - Requires `membershipToken`, `offerId`, `venueId`
  - Enforces single-use entitlement
  - Duplicate submissions return a stable approved response with the original `redeemedAt`
- `GET /admin/venues`
  - Requires `X-Admin-Key`
- `POST /admin/venues/:id/enabled`
  - Requires `X-Admin-Key`
- `POST /admin/sync/barglance`
  - Requires `X-Admin-Key`
- `GET /admin/redemptions`
  - Requires `X-Admin-Key`
- `GET /venues`
  - Returns enabled pilot venues only

## Quick Start
1. Install dependencies:
   - `npm install`
2. Set environment variables:
   - Copy `.env.example` into your preferred local env setup
   - Required for internal ops access: `ADMIN_ACCESS_KEY`
   - Required for BarGlance sync: `BARGLANCE_API_KEY`
   - Optional for browser/API origin control: `ALLOWED_ORIGINS`
3. Run API:
   - `npm run dev:api` (port 8787)
   - This auto-creates `data/dbc.sqlite` and applies runtime migrations
4. Run member app:
   - `npm run dev:member` (port 5174)
5. Run internal ops console:
   - `npm run dev:web` (port 5173)

## Deployment Direction
- Marketing site: `dollarbarclub.com/`
- Member app: `dollarbarclub.com/app`
- API: same-origin `/api/*` proxied to Railway
- Internal ops console: protected internal surface, not part of the public member flow

## Current Config
- Database: local SQLite at `data/dbc.sqlite`
- BarGlance API key: read from `BARGLANCE_API_KEY`
- Internal ops access key: read from `ADMIN_ACCESS_KEY`
- Allowed browser origins: read from `ALLOWED_ORIGINS` as a comma-separated list
  - Defaults locally to `http://localhost:5173,http://localhost:5174`
- Example env template: `.env.example`
- BarGlance import path: `POST /admin/sync/barglance`
- Member-visible venues: enabled venues only
- Venue profile source of truth:
  - BarGlance sync provides the base venue data layer
  - Local curated profile fields override the base layer for member-facing display
  - Manual venues are stored locally and behave as fully curated records
- Synced BarGlance venues: imported disabled by default until explicitly enabled for pilot use
- BarGlance venue enrichment stored locally: `open_now`, `price_level`, `hours_summary`, ratings, review counts, and raw payload JSON
- Local seed venues remain available for fallback/demo coverage
- Member app API base:
  - Local dev defaults to `http://localhost:8787`
  - Production defaults to same-origin `/api`
  - An injected `window.__DBC_API_BASE__` can override the default
- Member app shell:
  - `manifest.json` + `service-worker.js` are wired for installability/offline shell behavior
  - App icon path is `apps/member/public/icons/icon.svg`
- API CORS: allowlisted via `ALLOWED_ORIGINS`
- Default API port: `8787`
- Member app port: `5174`
- Internal ops console port: `5173`
- Current local dev URLs:
  - Member app: `http://localhost:5174`
  - Internal ops console: `http://localhost:5173`
  - API health: `http://localhost:8787/health`
- Admin auth behavior:
  - The internal ops console prompts for the current access key before loading
  - Protected API requests use the `X-Admin-Key` header
  - Public member endpoints remain open
- Current API abuse controls:
  - `POST /memberships/claim`: 5 requests per IP per 15 minutes
  - `POST /redeem`: 12 requests per IP per 5 minutes

## Current Local Test Venues
- Seed/demo venues enabled: The Roosevelt Room, Whisler's
- Real BarGlance venues enabled: Casino El Camino, Continental Club, Lazarus Brewing Co., Radio Coffee & Beer, Zanzibar
- Active sample offers on imported venues:
  - Casino El Camino: `BOGO Wings`
  - Continental Club: `$1 Stage Door Highball`
  - Lazarus Brewing Co.: `$1 House Lager`
  - Radio Coffee & Beer: `$1 Draft Pour`
  - Zanzibar: `$1 Rooftop Daiquiri`

## Progress Snapshot
- Implemented: SQLite-backed memberships, venues, offers, entitlements, and redemption logging
- Implemented: runtime DB migrations on API startup
- Implemented: BarGlance Austin venue sync into local SQLite with richer venue metadata backfill
- Implemented: pilot venue curation via enabled/disabled venue state
- Implemented: branded member onboarding, venue list/detail flow, geolocation check, and redeemed state
- Implemented: launch-ready member detail states for live, redeemed, no-live-offer, and unavailable venues
- Implemented: clearer member onboarding and venue-list states for returning members, empty offers, and redeemed/live summaries
- Implemented: member app PWA shell wiring, icon asset, and service worker registration
- Implemented: internal ops console venue sync and enable/disable controls
- Implemented: curated venue profile override layer on top of BarGlance base data
- Implemented: admin venue profile editing for displayed name, description, image, address, website, phone, neighborhood, and type
- Implemented: admin `POST /offers` path with entitlement backfill for existing members
- Implemented: internal ops console offer management with load/search/filter and active/inactive toggles
- Implemented: internal ops console redemption reporting with search/filter summary
- Implemented: internal ops console cleanup to match the BarGlance-only workflow
- Implemented: internal ops access gate on the web console and protected admin API routes
- Implemented: in-memory rate limiting on membership claim and redemption
- Implemented: env-driven CORS allowlist instead of permissive `*`
- Implemented: stable repo-root SQLite path so local/dev boot uses the expected shared database
- Implemented: production frontend API defaults to same-origin `/api`
- Implemented: deployment documentation for the Vercel + Railway split
- Implemented: curated real Austin BarGlance venues and sample offers for member-app testing
- Not implemented yet: Railway/Vercel deployment wiring, durable shared secret management, production-grade rate limiting/storage-backed throttling, final UI pass

## Notes
- This is intentionally minimal for pilot speed.
- `data/schema.sql` is the reference schema snapshot; runtime migrations are the active bootstrap path.
- The two original local pilot venues remain enabled by default.
- BarGlance venues are now importable and stored locally, but they do not appear in the member app until enabled.
- The local database currently includes real imported Austin bars plus seed/demo venues for pilot iteration.
- The running local API can be started with `BARGLANCE_API_KEY` in the environment to make venue sync available.
- The repo includes `.env.example` as the baseline deployment/local-config template.
- The public deployment target is Vercel for frontend surfaces and Railway for the API; see `docs/deployment.md`.
- The intended public entry point is the marketing site at `/`, with the member app mounted at `/app`.
- The member app and internal ops console default to `/api` in production unless `window.__DBC_API_BASE__` is injected.
- Venue data shown to members is now the merged effective profile: curated override values win, synced/base values fill any remaining gaps.
- The internal ops console currently uses a shared `ADMIN_ACCESS_KEY` gate rather than a full user account system.
- The current local API process may have a temporary `ADMIN_ACCESS_KEY` set for testing; use environment configuration rather than hardcoding a key in code.
- The current rate limiters are in-memory and reset when the API process restarts.
- Move rate limiting and shared secret handling to a more durable production setup before scaling.
- Member app styling is now aligned with the `website/` brand direction.
