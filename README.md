# Dollar Bar Club Pilot (Austin)

Monorepo for Dollar Bar Club (DBC), operated by BarGlance. The pilot is deployed and live in Austin, TX.

The marketing site, member app, admin console, and API are all accessible at `dollarbarclub.com`. The API runs on Render backed by SQLite. The member app supports sign-up/sign-in, venue browsing, geolocation-verified redemption, and a PWA shell. The internal BarGlance admin console supports venue curation, offer management, member listing, redemption reporting, and curated venue profile overrides behind an access-key gate.

## Live URLs

| Surface | URL | Hosting |
|---|---|---|
| Marketing site | `dollarbarclub.com` | Vercel |
| Member app | `dollarbarclub.com/app` | Vercel |
| Admin console | `dollarbarclub.com/admin` | Vercel (access-key protected) |
| API | `dollarbarclub.com/api/*` | Vercel proxy → Render |
| API (direct) | `dbc-api.onrender.com` | Render |

## Goals

- On-site drink redemption with single-use validation
- Fast setup for Austin pilot bars
- Basic internal operator/admin workflows
- Clear audit trail of redemptions

## Project Structure

```
├── apps/
│   ├── api/              Express API (memberships, venues, offers, redemption)
│   │   └── src/
│   │       ├── server.js     Express routes and middleware
│   │       ├── db.js         SQLite queries, transactions, prepared statements
│   │       ├── migrations.js Runtime numbered migrations (001–007)
│   │       ├── catalog.js    Seed catalog for local pilot defaults
│   │       └── barglance.js  BarGlance partner API client
│   ├── member/           Member-facing PWA source
│   │   ├── public/           Static assets (index.html, app.js, manifest, SW, icons)
│   │   └── src/dev-server.js Plain Node HTTP dev server (port 5174)
│   └── web/              Internal BarGlance ops console source
│       ├── public/           Static assets (index.html, app.js)
│       └── src/dev-server.js Plain Node HTTP dev server (port 5173)
├── website/              Vercel deployment root
│   ├── index.html            Marketing site landing page
│   ├── vercel.json           Routing: SPA fallbacks, /api/* proxy to Render
│   ├── app/                  Deployed member app (copied from apps/member/public)
│   ├── admin/                Deployed admin console (copied from apps/web/public)
│   └── api/                  Vercel serverless functions (Supabase-backed)
│       ├── signup.js             Member waitlist signup + confirmation email
│       ├── bar-signup.js         Venue/bar interest form
│       └── stats.js              Waitlist stats
├── data/
│   ├── schema.sql            Reference schema snapshot
│   └── dbc.sqlite            Runtime database (gitignored, created on boot)
├── docs/
│   ├── architecture.md       System architecture and rollout guidance
│   ├── deployment.md         Deployment layout reference
│   └── features.md           Feature documentation
├── package.json              npm workspaces root (apps/* only)
├── Procfile                  Render/Heroku: web: npm start
└── railway.json              Railway deployment config (alternative)
```

## Tech Stack

| Layer | Technology |
|---|---|
| API | Node.js (ES modules), Express, better-sqlite3 |
| Database | SQLite with WAL mode, foreign keys, runtime migrations |
| Member app | Vanilla HTML/JS PWA (no bundler) |
| Admin console | Vanilla HTML/JS SPA (no bundler) |
| Marketing site | Static HTML |
| Serverless functions | Vercel Functions (Supabase + Resend) |
| Hosting | Vercel (frontend) + Render (API) |

## Hosting Architecture

### Vercel

Deploys from the `website/` directory. Serves:
- `/` → marketing site (`website/index.html`)
- `/app/*` → member app SPA (`website/app/`)
- `/admin/*` → admin console SPA (`website/admin/`)
- `/api/signup`, `/api/stats`, `/api/bar-signup` → Vercel serverless functions (Supabase-backed)
- `/api/*` (all other paths) → proxied to Render via rewrite

### Render

Deploys from the repo root via public repo URL. Runs the Express API (`npm start`) with SQLite at `data/dbc.sqlite` on a persistent disk (paid tier, $7/mo). The database is auto-created with seed data on first boot. Runtime migrations run automatically on startup. Because the repo is connected as a public URL (not GitHub integration), **Render does not auto-deploy on push** — use Manual Deploy in the Render dashboard after pushing API changes.

### GitHub

Single monorepo at `github.com/jessekasser-atr/Dollar-Bar-Club`. Vercel auto-deploys on push. Render requires manual deploy.

## Pilot Redemption Flow

1. Member opens the member app and signs up (email + Austin zip) or signs in (email).
2. Member browses enabled venues and selects an eligible live offer.
3. Member taps "Redeem now" — the app verifies on-site presence via geolocation (200m radius).
4. The API validates: active membership, active offer, valid entitlement, not already redeemed.
5. The API records redemption with venue and audit metadata.
6. Member shows the confirmation screen to their bartender/server.

## API Endpoints

### Public / Member

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/health` | None | Service health, DB path, counts, integration flags |
| `POST` | `/memberships/claim` | Rate limited | Sign up — requires `email` + Austin `zipCode` (`73301` or `787xx`). Optional `firstName`, `lastName`. Creates member + membership + entitlements for all existing offers. |
| `POST` | `/memberships/login` | Rate limited | Sign in — requires `email`. Backfills entitlements for any offers created since last login. |
| `GET` | `/offers/active` | None | Query: `venueId`, optional `membershipToken` (enriches with entitlement status) |
| `GET` | `/venues` | None | Returns enabled pilot venues only |
| `GET` | `/venues/:id` | None | Single venue with offers. Query: optional `membershipToken` (enriches with entitlement status) |
| `POST` | `/redeem` | Rate limited | Requires `membershipToken`, `offerId`, `venueId`. Optional `staffId`, `deviceId`. Enforces single-use entitlement. Duplicate submissions return stable approved response with original `redeemedAt`. |

### Admin (all require `X-Admin-Key` header)

| Method | Path | Description |
|---|---|---|
| `GET` | `/admin/session` | Validate admin access key |
| `GET` | `/admin/venues` | List all venues (enabled and disabled) |
| `POST` | `/admin/venues` | Create a manual venue |
| `DELETE` | `/admin/venues/:id` | Delete venue + its offers + associated entitlements |
| `POST` | `/admin/venues/:id/enabled` | Toggle venue enabled/disabled |
| `POST` | `/admin/venues/:id/featured` | Toggle venue featured status (pinned to top of member app) |
| `POST` | `/admin/venues/:id/profile` | Update curated display overrides (name, description, image, address, website, phone, neighborhood, type) |
| `POST` | `/admin/venues/:id/profile/reset` | Clear all curated overrides, revert to source data |
| `GET` | `/admin/offers` | List all offers |
| `POST` | `/offers` | Create offer — requires `id`, `venueId`, `title`. Optional `description`, `imageUrl`, `isActive`. Auto-backfills entitlements for all existing members. |
| `POST` | `/admin/offers/:id/active` | Toggle offer active/inactive |
| `DELETE` | `/admin/offers/:id` | Delete offer + associated entitlements |
| `POST` | `/admin/sync/barglance` | Sync venues from BarGlance partner API |
| `GET` | `/admin/redemptions` | Redemption event log |
| `GET` | `/admin/members` | List all members |

### Rate Limits (in-memory, resets on API restart)

| Endpoint | Window | Max Requests |
|---|---|---|
| `POST /memberships/claim` | 15 minutes | 5 per IP |
| `POST /memberships/login` | 15 minutes | 5 per IP (shared limiter with claim) |
| `POST /redeem` | 5 minutes | 12 per IP |

## Quick Start (Local Development)

1. Install dependencies:
   ```
   npm install
   ```
2. Set environment variables:
   - Copy `.env.example` to `.env` and fill in values
   - Required: `ADMIN_ACCESS_KEY`
   - Optional: `BARGLANCE_API_KEY` (for venue sync)
   - Optional: `ALLOWED_ORIGINS` (defaults to `http://localhost:5173,http://localhost:5174`)
3. Run API:
   ```
   npm run dev:api
   ```
   Starts on port 8787. Auto-creates `data/dbc.sqlite` and applies runtime migrations.
4. Run member app:
   ```
   npm run dev:member
   ```
   Starts on port 5174.
5. Run admin console:
   ```
   npm run dev:web
   ```
   Starts on port 5173.

### Local Dev URLs

- Member app: `http://localhost:5174`
- Admin console: `http://localhost:5173`
- API health: `http://localhost:8787/health`

## Environment Variables

### Render (API)

| Variable | Required | Description |
|---|---|---|
| `PORT` | Yes | API listen port (default `8787`) |
| `ADMIN_ACCESS_KEY` | Yes | Shared secret for admin console and protected API routes |
| `ALLOWED_ORIGINS` | Yes | Comma-separated list of allowed CORS origins |
| `BARGLANCE_API_KEY` | Optional | BarGlance partner API key for venue sync |
| `BAR_DATA_SOURCE` | Optional | `"seed"` (default) or `"barglance"` — controls seed catalog behavior |

### Vercel (Website)

Managed via Vercel project settings. The serverless functions in `website/api/` use:

| Variable | Required | Description |
|---|---|---|
| `SUPABASE_URL` | Yes | Supabase project URL for waitlist signups |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service role key |
| `RESEND_API_KEY` | Optional | Resend key for confirmation/notification emails |
| `FROM_EMAIL` | Optional | Sender email for transactional emails |
| `APP_DOWNLOAD_URL` | Optional | Link included in signup confirmation emails |
| `BAR_ALERT_EMAIL` | Optional | Notification recipient for bar signup interest forms |

### Dev-only

| Variable | Default | Description |
|---|---|---|
| `MEMBER_PORT` | `5174` | Member app dev server port |
| `WEB_PORT` | `5173` | Admin console dev server port |

## Deploying Changes

| What changed | Action |
|---|---|
| Marketing site, member app UI, or admin console UI | Push to `main` → Vercel auto-deploys |
| API code (`apps/api/`) | Push to `main` → Render dashboard → Manual Deploy → Deploy latest commit |
| Member app source (`apps/member/public/`) | Copy to `website/app/` before pushing |
| Admin console source (`apps/web/public/`) | Copy to `website/admin/` before pushing |

## Production Config

- **Database:** SQLite at `data/dbc.sqlite` on Render persistent disk (paid tier, $7/mo). Survives deploys and restarts. Seed data created only on first boot.
- **CORS:** Allowlisted via `ALLOWED_ORIGINS` (production: `https://dollarbarclub.com`)
- **Admin auth:** Shared `ADMIN_ACCESS_KEY` gate — admin console prompts for it before loading, API routes validate via `X-Admin-Key` header
- **Member app API base:** Resolves to `/api` in production (same-origin, proxied to Render by Vercel)
- **Venue data model:** BarGlance sync provides the base venue data layer. Local curated profile overrides win for member-facing display. Manual venues are fully curated records.
- **BarGlance sync:** Imports venues as disabled by default. Re-syncing updates metadata without resetting enabled/disabled state.
- **Entitlements:** Backfilled on sign-up (for all existing offers) and on sign-in (for any offers created since last login). Also backfilled on offer creation (for all existing members).

## Database

- **Engine:** better-sqlite3 with `foreign_keys = ON`, `journal_mode = WAL`
- **Path:** `data/dbc.sqlite` (resolved relative to repo root)
- **Migrations:** Numbered steps (001–007) tracked in a `schema_migrations` table, applied automatically on boot
- **Reference schema:** `data/schema.sql`
- **Key tables:** `members`, `memberships`, `venues`, `offers`, `member_offers` (entitlements), `redemptions`
- **Seed venues:** The Roosevelt Room, Whisler's — auto-created on every fresh database boot

## Notes

- This is intentionally minimal for pilot speed.
- `data/schema.sql` is the reference schema snapshot; runtime migrations are the active bootstrap path.
- The repo includes `.env.example` as the baseline local config template.
- The admin console uses a shared `ADMIN_ACCESS_KEY` gate rather than a full user account system.
- Rate limiters are in-memory and reset when the API process restarts.
- Not yet implemented: durable shared secret management, production-grade rate limiting.
