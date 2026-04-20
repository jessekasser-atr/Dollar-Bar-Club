# Dollar Bar Club Pilot (Austin)

Monorepo for Dollar Bar Club (DBC), operated by BarGlance. The pilot is live in Austin, TX.

Dollar Bar Club is a BarGlance product. The public DBC experience sits on top of a DBC-specific app layer and backend service, while using the BarGlance API to help populate venue data. Dollar Bar Club started as a marketing website with a waitlist flow, then expanded into a live member app, internal admin console, and Render-hosted backend service. Today the repo contains both the public website stack and the product stack that powers the Austin pilot. The member app is live as a web app/PWA and as a native iOS app in the App Store, both built from the same codebase via Capacitor.

## Current Scope

- Public marketing site at `dollarbarclub.com`
- Waitlist and bar-interest serverless flows backed by Supabase
- Live member web app at `dollarbarclub.com/app`
- Internal BarGlance admin console at `dollarbarclub.com/admin` for updating app content
- Backend service on Render backed by SQLite
- BarGlance API integration for venue/bar data population
- Native iOS app live in the App Store (Capacitor-wrapped member app)

## Live URLs

| Surface | URL | Hosting |
|---|---|---|
| Marketing site | `dollarbarclub.com` | Vercel |
| Member app | `dollarbarclub.com/app` | Vercel |
| Admin console | `dollarbarclub.com/admin` | Vercel (access-key protected) |
| Website waitlist APIs | `dollarbarclub.com/api/signup`, `dollarbarclub.com/api/stats`, `dollarbarclub.com/api/bar-signup` | Vercel Functions |
| App backend routes | `dollarbarclub.com/api/*` | Vercel proxy -> Render |
| App backend (direct) | `dbc-api.onrender.com` | Render |
| iOS app | `com.barglance.dollarbarclub` | Apple App Store |

## Product Goals

- On-site drink redemption with once-per-week, per-offer validation
- Per-offer weekday scheduling so bars can run specials only on selected days
- Fast setup for Austin pilot bars
- Basic internal operator/admin workflows
- Clear audit trail of redemptions
- Preserve the original marketing and lead-capture flows while the product expands

## Project Timeline

1. The public website launched first with marketing copy and a waitlist signup flow.
2. Waitlist leads and related form activity were stored via Vercel serverless functions backed by Supabase.
3. The member app, admin console, and API were added next and deployed live on Vercel and Render.
4. The web app went live as the first production experience.
5. The member app was packaged for iOS via Capacitor and released on the App Store in April 2026.

## Source Of Truth

Use this map when deciding where to work:

| If you are changing... | Primary source of truth |
|---|---|
| Marketing site | `website/index.html`, `website/privacy.html`, `website/hero.jpg` |
| Waitlist and bar-interest flows | `website/api/*` |
| Member app product code | `apps/member/public/*` |
| Admin console product code | `apps/web/public/*` |
| App backend service | `apps/api/src/*` |
| iOS/App Store packaging | `apps/member/*` including `capacitor.config.json` |

Important deployment detail:

- `website/app/` is the Vercel-served copy of the member app.
- `website/admin/` is the Vercel-served copy of the admin console.
- `apps/member/public/` and `apps/web/public/` are the working source directories used in local development.
- When frontend source changes need to go live on Vercel, the corresponding files must be synced into `website/app/` (member app) or `website/admin/` (admin console) before pushing.

### Member app: use `npm run sync:app`

Do **not** hand-copy `apps/member/public/` into `website/app/`. The two files are **not identical** — the deployed copy needs absolute URLs prefixed with `/app/` (e.g. `/app/app.js`, `/app/manifest.json`, `/app/icons/...`) because Vercel serves `website/app/` under `/app/...`, whereas the local dev server serves `apps/member/public/` at the root. Hand-mirroring flattens those paths and produces a blank screen in production.

Run this before committing any member app change:

```bash
npm run sync:app
```

It:

1. Clean-copies `apps/member/public/` into `website/app/`.
2. Rewrites root-relative URLs in `index.html` to include the `/app/` prefix.
3. Stamps the service worker's `CACHE_NAME` with the current git short SHA so returning PWA users pick up the new build instead of hanging on stale cached assets.

Commit both the source change and the resulting `website/app/` diff in the same commit.

### Admin console: still hand-mirrored (for now)

`apps/web/public/` → `website/admin/` does not yet have a sync script. The two diverge on more than just URL prefixes (e.g. `favicon.svg` exists only in the deployed copy, and file names differ). When touching the admin console, mirror changes manually and spot-check `website/admin/index.html` for correct `/admin/`-prefixed paths. A future cleanup will give admin the same treatment as the member app.

## Project Structure

```text
├── apps/
│   ├── api/              Express backend service for memberships, venues, offers, and redemption
│   │   ├── src/
│   │   │   ├── server.js       Express routes, middleware, CORS, admin auth, rate limits
│   │   │   ├── db.js           SQLite queries, transactions, seed logic, entitlement logic
│   │   │   ├── migrations.js   Runtime numbered migrations
│   │   │   ├── catalog.js      Local pilot seed catalog
│   │   │   └── barglance.js    BarGlance partner API client
│   │   └── package.json
│   ├── member/           Member-facing app source
│   │   ├── public/            Static web app assets (index.html, app.js, manifest, SW, icons)
│   │   ├── src/dev-server.js  Plain Node HTTP dev server (port 5174)
│   │   ├── capacitor.config.json
│   │   └── package.json
│   └── web/              Internal BarGlance admin console source
│       ├── public/            Static admin assets (index.html, app.js)
│       ├── src/dev-server.js  Plain Node HTTP dev server (port 5173)
│       └── package.json
├── website/              Vercel deployment root
│   ├── index.html            Marketing site landing page
│   ├── privacy.html          Website privacy page
│   ├── vercel.json           Routing and rewrites
│   ├── app/                  Deployed member app copy for Vercel
│   ├── admin/                Deployed admin console copy for Vercel
│   └── api/                  Vercel serverless functions for marketing/waitlist flows
│       ├── signup.js             Waitlist signup + confirmation email
│       ├── bar-signup.js         Bar interest form
│       └── stats.js              Waitlist stats
├── data/
│   ├── schema.sql            Reference schema snapshot
│   └── dbc.sqlite            Runtime database path used by the app backend service
├── docs/
│   ├── architecture.md       System architecture and rollout guidance
│   ├── deployment.md         Historical deployment notes and references
│   ├── features.md           Member-facing feature documentation
│   └── ios-ci-setup.md       iOS CI/build setup notes
├── certs/                    iOS code signing certificates and App Store Connect key
├── scripts/
│   ├── generate_icons.py     Icon generation script for iOS asset catalog
│   └── sync-app.mjs          Mirrors apps/member/public/ -> website/app/ with path rewriting + SW cache bump
├── .github/
│   └── workflows/
│       └── ios-build.yml     GitHub Actions CI/CD pipeline for iOS builds
├── package.json              npm workspaces root
└── Procfile                  Render process command
```

## Tech Stack

| Layer | Technology |
|---|---|
| App backend service | Node.js (ES modules), Express, better-sqlite3 |
| Product database | SQLite with WAL mode, foreign keys, runtime migrations |
| Member app | Vanilla HTML/JS PWA with Capacitor for iOS packaging |
| Admin console | Vanilla HTML/JS SPA |
| Marketing site | Static HTML |
| Website form backend | Vercel Functions, Supabase, Resend |
| Hosting | GitHub + Vercel + Render |

## Hosting Architecture

### GitHub

Single monorepo at `github.com/jessekasser-atr/Dollar-Bar-Club`. Vercel auto-deploys on push. Render requires manual deploy.

### Vercel

Vercel deploys from the `website/` directory. It serves:

- `/` -> marketing site (`website/index.html`)
- `/app/*` -> member app SPA (`website/app/`)
- `/admin/*` -> admin console SPA (`website/admin/`)
- `/api/signup`, `/api/stats`, `/api/bar-signup` -> Vercel Functions backed by Supabase
- `/api/*` for all other app backend paths -> proxied to Render via rewrite

### Render

Render deploys from the repo root via public repo URL. Runs the Express backend service (`npm start`) with SQLite at `data/dbc.sqlite` on a persistent disk (paid tier, $7/mo, no spin-down). The database is auto-created with seed data on first boot. Runtime migrations run automatically on startup. Because the repo is connected as a public URL (not GitHub integration), **Render does not auto-deploy on push** — use Manual Deploy in the Render dashboard after pushing API changes.

### Member App

- Email claim/login flow
- Shared app shell with left-aligned `DBC` wordmark and overflow menu
- Member logout action in the app menu
- Austin ZIP eligibility check
- Venue browsing and venue detail views
- Geolocation-based redemption
- Weekly offer resets every Sunday at `12:00 AM` Austin time
- Offer availability states for `Available today`, `Scheduled`, and `Redeemed this week`
- PWA installability
- Shared codebase with the live iOS App Store release (via Capacitor)

### Admin Console

- Protected via shared admin access key
- Used internally to update the content and state shown in the app
- Venue curation and manual venue creation
- Offer management, including per-offer weekday scheduling
- Member listing
- Redemption reporting
- Curated venue profile overrides

### App Backend Service

- Membership issuance and login
- Venue and offer retrieval
- Entitlement management
- Weekly redemption enforcement per member, per offer, with Sunday-midnight Austin resets
- Per-offer weekday availability enforcement using Austin local time
- BarGlance API sync support for venue/bar population

## Pilot Redemption Flow

1. Member opens the member app and claims a pass with email plus Austin ZIP, or signs in with email.
2. Member browses enabled venues and sees whether an offer is available today, scheduled for other days, or already redeemed this week.
3. Member selects an eligible live offer and taps "Redeem now"; the app verifies on-site presence via geolocation.
4. The API validates active membership, active offer, whether the offer is scheduled for the current Austin weekday, and whether that offer has already been redeemed during the current Austin week.
5. The API records the redemption with venue and audit metadata, then keeps that offer locked until the next Sunday `12:00 AM` Austin reset.
6. Member shows the confirmation screen to the bartender or server.

## API Endpoints

### Public / Member

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/health` | None | Service health, DB path, counts, integration flags |
| `POST` | `/memberships/claim` | Rate limited | Sign up with `email` + Austin `zipCode` (`73301` or `787xx`) |
| `POST` | `/memberships/login` | Rate limited | Sign in with `email` |
| `GET` | `/offers/active` | None | Query: `venueId`, optional `membershipToken` |
| `GET` | `/venues` | None | Returns enabled pilot venues only |
| `GET` | `/venues/:id` | None | Venue with offers, optional `membershipToken` enrichment |
| `POST` | `/redeem` | Rate limited | Redeem an offer once per Austin week (`Sunday 12:00 AM` reset) |

### Admin

All admin routes require the `X-Admin-Key` header.

| Method | Path | Description |
|---|---|---|
| `GET` | `/admin/session` | Validate admin access key |
| `GET` | `/admin/venues` | List all venues |
| `POST` | `/admin/venues` | Create a manual venue |
| `DELETE` | `/admin/venues/:id` | Delete venue and related records |
| `POST` | `/admin/venues/:id/enabled` | Toggle venue enabled state |
| `POST` | `/admin/venues/:id/featured` | Toggle venue featured state |
| `POST` | `/admin/venues/:id/profile` | Update curated display overrides |
| `POST` | `/admin/venues/:id/profile/reset` | Clear curated display overrides |
| `GET` | `/admin/offers` | List all offers |
| `POST` | `/offers` | Create offer, optional weekday schedule, and backfill entitlements |
| `POST` | `/admin/offers/:id/content` | Update offer title, description, and weekday schedule |
| `POST` | `/admin/offers/:id/active` | Toggle offer active state |
| `DELETE` | `/admin/offers/:id` | Delete offer and related entitlements |
| `POST` | `/admin/sync/barglance` | Sync venues from BarGlance |
| `GET` | `/admin/redemptions` | Redemption event log |
| `GET` | `/admin/members` | List all members |

### Rate Limits

In-memory limiters reset on API restart.

| Endpoint | Window | Max Requests |
|---|---|---|
| `POST /memberships/claim` | 15 minutes | 5 per IP |
| `POST /memberships/login` | 15 minutes | 5 per IP |
| `POST /redeem` | 5 minutes | 12 per IP |

## Quick Start (Local Development)

1. Install dependencies:

   ```bash
   npm install
   ```

2. Set environment variables:

   - Copy `.env.example` to `.env`
   - Required: `ADMIN_ACCESS_KEY`
   - Optional: `BARGLANCE_API_KEY`
   - Optional: `ALLOWED_ORIGINS` (defaults to `http://localhost:5173,http://localhost:5174`)

3. Run the app backend service:

   ```bash
   npm run dev:api
   ```

   Starts on port `8787`. Auto-creates `data/dbc.sqlite` and applies runtime migrations.

4. Run the member app:

   ```bash
   npm run dev:member
   ```

   Starts on port `5174`.

5. Run the admin console:

   ```bash
   npm run dev:web
   ```

   Starts on port `5173`.

### Local URLs

- Member app: `http://localhost:5174`
- Admin console: `http://localhost:5173`
- API health: `http://localhost:8787/health`

## Environment Variables

### Render (App Backend Service)

| Variable | Required | Description |
|---|---|---|
| `PORT` | Yes | API listen port (default `8787`) |
| `ADMIN_ACCESS_KEY` | Yes | Shared secret for admin console and protected API routes |
| `ALLOWED_ORIGINS` | Yes | Comma-separated list of allowed CORS origins (Capacitor WebView origins are always appended automatically) |
| `BARGLANCE_API_KEY` | Optional | BarGlance partner API key for venue sync |
| `BAR_DATA_SOURCE` | Optional | `"seed"` (default) or `"barglance"` |

### Vercel (Website Functions)

Managed in Vercel project settings. The serverless functions in `website/api/` use:

| Variable | Required | Description |
|---|---|---|
| `SUPABASE_URL` | Yes | Supabase project URL for waitlist signups |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service role key |
| `RESEND_API_KEY` | Optional | Resend key for confirmation or notification emails |
| `FROM_EMAIL` | Optional | Sender email for transactional emails |
| `APP_DOWNLOAD_URL` | Optional | Link included in signup confirmation emails |
| `BAR_ALERT_EMAIL` | Optional | Notification recipient for bar signup interest forms |

### Dev-Only

| Variable | Default | Description |
|---|---|---|
| `MEMBER_PORT` | `5174` | Member app dev server port |
| `WEB_PORT` | `5173` | Admin console dev server port |

## Deploying Changes

| What changed | Action |
|---|---|
| Marketing site or website form flows | Push to `main` -> Vercel auto-deploys |
| API code in `apps/api/` | Push to `main` -> Manual Deploy in Render dashboard (no auto-deploy) |
| Member app source in `apps/member/public/` | Run `npm run sync:app`, commit both source and `website/app/` changes, push to `main` |
| Admin console source in `apps/web/public/` | Hand-mirror to `website/admin/` (preserve `/admin/`-prefixed paths and existing favicon), commit both, push to `main` |
| iOS app update | Update `apps/member/`, push to `main`, then run the iOS Build workflow in GitHub Actions to build and upload to App Store Connect |

## iOS CI/CD

The iOS build and upload pipeline runs via GitHub Actions (`.github/workflows/ios-build.yml`). It builds the Capacitor-wrapped member app into an IPA and optionally uploads to App Store Connect.

- **Runner**: macOS 15 with Xcode 26.3
- **Signing**: Manual code signing using a distribution certificate (`certs/`) and App Store provisioning profile, imported from GitHub Secrets at build time
- **Assets**: App icons generated via `scripts/generate_icons.py` and copied into the Xcode asset catalog during the build
- **Build output**: IPA artifact uploaded to GitHub Actions storage
- **App Store upload**: Optional step using App Store Connect API key (P8) via `altool`
- **Trigger**: Manual workflow dispatch

### Required GitHub Secrets

| Secret | Description |
|---|---|
| `IOS_P12_BASE64` | Distribution certificate (base64-encoded P12) |
| `IOS_P12_PASSWORD` | P12 password |
| `IOS_PROVISION_PROFILE_BASE64` | App Store provisioning profile (base64) |
| `ASC_KEY_ID` | App Store Connect API key ID |
| `ASC_ISSUER_ID` | App Store Connect issuer ID |
| `ASC_PRIVATE_KEY` | App Store Connect private key (P8) |

## Production Config

- Database: SQLite at `data/dbc.sqlite` on Render persistent disk (paid tier, persists across deploys and restarts)
- CORS: allowlisted via `ALLOWED_ORIGINS` (Capacitor WebView origins are always included automatically)
- Admin auth: shared `ADMIN_ACCESS_KEY` gate — the admin console prompts for it before loading, API routes validate via `X-Admin-Key` header
- Member app API base: `/api` in production through Vercel rewrite; `https://dbc-api.onrender.com` for the native iOS app
- Weekly offer reset: each member can redeem each offer once per Austin week; the reset boundary is Sunday at `12:00 AM` in `America/Chicago`
- Venue profile source of truth:
  - BarGlance sync provides the base venue data layer
  - Curated profile override fields replace the base layer for member-facing display
  - Manual venues are stored locally and behave as fully curated records
- Synced BarGlance venues are imported as disabled by default until explicitly enabled via the admin console. Re-syncing updates venue metadata without resetting the enabled/disabled state.
- Entitlements: backfilled on signup, login, and offer creation
- Offer schedules:
  - No `availableDays` selected means the offer is available every day
  - One or more selected weekdays means the offer is only available on those Austin weekdays

## Database

- Engine: `better-sqlite3` with `foreign_keys = ON` and `journal_mode = WAL`
- Path: `data/dbc.sqlite` resolved relative to repo root
- Migrations: numbered runtime migrations tracked in `schema_migrations`
- Reference schema: `data/schema.sql`
- Key tables: `members`, `memberships`, `venues`, `offers`, `member_offers`, `redemptions`
