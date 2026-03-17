# Dollar Bar Club Pilot (Austin)

This repository contains the full pilot framework for Dollar Bar Club (DBC), operated by BarGlance.

Current state: the pilot is deployed and live. The marketing site, member app, admin console, and API are all accessible at `dollarbarclub.com`. The API runs on Render backed by SQLite, the member app supports branded onboarding, venue browse/detail, geolocation redemption, and a PWA shell. The internal BarGlance admin console supports venue curation, offer management, redemption reporting, and curated venue profile overrides behind an access key gate.

## Live URLs

| Surface | URL | Hosting |
|---|---|---|
| Marketing site | `dollarbarclub.com` | Vercel |
| Member app | `dollarbarclub.com/app` | Vercel |
| Admin console | `dollarbarclub.com/admin` | Vercel (access key protected) |
| API | `dollarbarclub.com/api/*` | Vercel proxy → Render |
| API (direct) | `dbc-api.onrender.com` | Render |

## Goals
- On-site drink redemption with single-use validation
- Fast setup for Austin pilot bars
- Basic internal operator/admin workflows
- Clear audit trail of redemptions

## Project Structure
- `apps/api`: Express API for offers, members, venues, and redemption processing
- `apps/member`: Mobile-first member-facing SPA source (branded onboarding, venue browse/detail, geolocation redemption, PWA shell)
- `apps/web`: Internal BarGlance operations console source (venue sync/curation, offer management, redemption reporting)
- `website/`: Vercel deployment root containing the marketing site and deployed copies of the member app and admin console
  - `website/index.html`: marketing site landing page
  - `website/app/`: deployed member app (copied from `apps/member/public`, paths adjusted for `/app` mount)
  - `website/admin/`: deployed admin console (copied from `apps/web/public`, paths adjusted for `/admin` mount)
  - `website/api/`: Vercel serverless functions for waitlist signup, bar signup, and stats (backed by Supabase)
  - `website/vercel.json`: routing — SPA fallbacks for `/app` and `/admin`, API proxy to Render
- `data/schema.sql`: SQLite schema reference snapshot
- `data/dbc.sqlite`: local pilot database (created on API startup, gitignored)
- `apps/api/src/migrations.js`: runtime DB migrations applied automatically on boot
- `apps/api/src/catalog.js`: seed catalog boundary for local pilot defaults
- `apps/api/src/barglance.js`: BarGlance client and payload mapping
- `docs/architecture.md`: system architecture and rollout guidance
- `docs/deployment.md`: deployment layout reference
- `railway.json`, `Procfile`: Render/Railway deployment config

## Hosting Architecture

### Vercel
Deploys from the `website/` directory of this repo. Serves:
- `/` → marketing site (`website/index.html`)
- `/app/*` → member app SPA (`website/app/`)
- `/admin/*` → admin console SPA (`website/admin/`)
- `/api/signup`, `/api/stats`, `/api/bar-signup` → Vercel serverless functions (Supabase-backed waitlist)
- `/api/*` (all other paths) → proxied to Render via rewrite

### Render
Deploys from the repo root via public repo URL. Runs the Express API (`npm start`) with SQLite at `data/dbc.sqlite` on a persistent disk (paid tier, $7/mo). The database is auto-created with seed data on first boot. Runtime migrations run automatically on startup. Because the repo is connected as a public URL (not GitHub integration), **Render does not auto-deploy on push** — use Manual Deploy in the Render dashboard after pushing API changes.

### GitHub
Single monorepo at `github.com/jessekasser-atr/Dollar-Bar-Club`. Vercel auto-deploys on push. Render requires manual deploy.

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
- `DELETE /admin/offers/:id`
  - Requires `X-Admin-Key`
  - Deletes the offer and associated member entitlements
- `DELETE /admin/venues/:id`
  - Requires `X-Admin-Key`
  - Deletes the venue, its offers, and associated member entitlements
- `GET /venues/:id?membershipToken=...` (single venue with offers and entitlement statuses)
- `POST /redeem`
  - Requires `membershipToken`, `offerId`, `venueId`
  - Enforces single-use entitlement
  - Duplicate submissions return a stable approved response with the original `redeemedAt`
- `GET /admin/venues`
  - Requires `X-Admin-Key`
- `POST /admin/venues` (create manual venue)
  - Requires `X-Admin-Key`
- `POST /admin/venues/:id/enabled`
  - Requires `X-Admin-Key`
- `POST /admin/venues/:id/profile`
  - Requires `X-Admin-Key`
- `POST /admin/venues/:id/profile/reset`
  - Requires `X-Admin-Key`
- `POST /admin/sync/barglance`
  - Requires `X-Admin-Key`
- `GET /admin/redemptions`
  - Requires `X-Admin-Key`
- `GET /venues`
  - Returns enabled pilot venues only

## Quick Start (Local Development)
1. Install dependencies:
   - `npm install`
2. Set environment variables:
   - Copy `.env.example` to `.env` and fill in values
   - Required: `ADMIN_ACCESS_KEY`
   - Optional: `BARGLANCE_API_KEY` (for venue sync)
   - Optional: `ALLOWED_ORIGINS` (defaults to `http://localhost:5173,http://localhost:5174`)
3. Run API:
   - `npm run dev:api` (port 8787)
   - Auto-creates `data/dbc.sqlite` and applies runtime migrations
4. Run member app:
   - `npm run dev:member` (port 5174)
5. Run admin console:
   - `npm run dev:web` (port 5173)

## Environment Variables

### Render (API)
| Variable | Required | Description |
|---|---|---|
| `PORT` | Yes | API listen port (`8787`) |
| `ADMIN_ACCESS_KEY` | Yes | Shared secret for admin console and protected API routes |
| `ALLOWED_ORIGINS` | Yes | Comma-separated list of allowed CORS origins |
| `BARGLANCE_API_KEY` | Optional | BarGlance partner API key for venue sync |

### Vercel (Website)
Managed via Vercel project settings. The serverless functions in `website/api/` use:
| Variable | Required | Description |
|---|---|---|
| `SUPABASE_URL` | Yes | Supabase project URL for waitlist signups |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service role key |
| `RESEND_API_KEY` | Optional | Resend key for confirmation/notification emails |
| `FROM_EMAIL` | Optional | Sender email for transactional emails |

## Production Config
- Database: SQLite at `data/dbc.sqlite` on Render (paid tier with persistent disk)
- API CORS: allowlisted via `ALLOWED_ORIGINS` (production: `https://dollarbarclub.com`)
- Admin auth: shared `ADMIN_ACCESS_KEY` gate — the admin console prompts for it before loading, API routes validate via `X-Admin-Key` header
- Member app API base: resolves to `/api` in production (same-origin, proxied to Render by Vercel)
- Admin console API base: resolves to `/api` in production (same-origin, proxied to Render by Vercel)
- Rate limiting: in-memory, resets on API restart
  - `POST /memberships/claim`: 5 requests per IP per 15 minutes
  - `POST /redeem`: 12 requests per IP per 5 minutes
- Render paid tier ($7/mo): persistent disk, no spin-down, always-on
- Venue profile source of truth:
  - BarGlance sync provides the base venue data layer
  - Local curated profile fields override the base layer for member-facing display
  - Manual venues are stored locally and behave as fully curated records
- Synced BarGlance venues: imported disabled by default until explicitly enabled
- Seed venues (The Roosevelt Room, Whisler's) are auto-created on every fresh database boot

## Local Dev URLs
- Member app: `http://localhost:5174`
- Admin console: `http://localhost:5173`
- API health: `http://localhost:8787/health`

## Deploying Changes
- **Push to `main`** → Vercel auto-deploys the website, member app, and admin console
- **Push to `main`** → Render does NOT auto-deploy (public repo URL). Go to Render dashboard > dbc-api > Manual Deploy > Deploy latest commit
- Member app changes in `apps/member/public/` must be copied to `website/app/` before pushing
- Admin console changes in `apps/web/public/` must be copied to `website/admin/` before pushing

## Current Production Venues
- Seed venues (auto-created on boot): The Roosevelt Room, Whisler's
- BarGlance venues (synced and enabled): Casino El Camino, Continental Club, Lazarus Brewing Co., Radio Coffee & Beer, Zanzibar
- Active offers:
  - The Roosevelt Room: `$1 House Cocktail`
  - Whisler's: `Complimentary Mocktail`
  - Casino El Camino: `BOGO Wings`
  - Continental Club: `$1 Stage Door Highball`
  - Lazarus Brewing Co.: `$1 House Lager`
  - Radio Coffee & Beer: `$1 Draft Pour`
  - Zanzibar: `$1 Rooftop Daiquiri`
- 150 additional Austin BarGlance venues are synced but disabled — enable via the admin console as needed

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
- Implemented: curated real Austin BarGlance venues and sample offers for member-app testing
- Implemented: full production deployment — Vercel (marketing site, member app, admin console) + Render (API)
- Implemented: Vercel `/api/*` proxy to Render with serverless function passthrough for Supabase endpoints
- Implemented: admin console deployed at `/admin` with access key gate
- Implemented: BarGlance venue sync working in production (150 Austin venues imported)
- Implemented: admin offer deletion with entitlement cleanup
- Implemented: member app UI pass — "Get Directions" link, updated homepage copy, larger offer titles on venue cards
- Implemented: 3-step redeem instructions on venue detail page (tap Redeem, show screen, press Done)
- Implemented: "Powered by BarGlance" linked to barglance.com in member app
- Implemented: Contact nav link and Instagram footer link on marketing site
- Implemented: multi-offer support — venues can have multiple offers, each with independent Redeem flow
- Implemented: venue list cards show first offer title + "+X more" when multiple offers exist
- Implemented: admin venue deletion with cascade cleanup (offers + entitlements)
- Implemented: Render upgraded to paid tier with persistent disk — database survives restarts
- Not yet implemented: durable shared secret management, production-grade rate limiting

## Notes
- This is intentionally minimal for pilot speed.
- `data/schema.sql` is the reference schema snapshot; runtime migrations are the active bootstrap path.
- The two seed pilot venues are auto-created on every fresh database boot.
- BarGlance venues are importable via the admin console sync tab, but do not appear in the member app until enabled.
- The repo includes `.env.example` as the baseline local config template.
- Venue data shown to members uses the merged effective profile: curated override values win, synced/base values fill gaps.
- The admin console uses a shared `ADMIN_ACCESS_KEY` gate rather than a full user account system.
- Rate limiters are in-memory and reset when the API process restarts.
- Render is on the paid tier with persistent disk. The SQLite database persists across deploys and restarts. Seed data is only created on first boot if the database does not already exist.
- BarGlance sync imports venues as disabled by default. Re-syncing updates venue metadata without resetting the enabled/disabled state.
- Member app styling is aligned with the `website/` brand direction.
