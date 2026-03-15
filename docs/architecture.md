# Dollar Bar Club Architecture (Pilot)

## Scope (Austin Pilot)
- Limited set of participating venues in Austin, TX
- Offer lifecycle: draft -> active -> expired
- Real-time redemption checks on-site
- Ops visibility for redemption volume and abuse signals

## Components
- Web Client (`apps/web`)
  - Internal BarGlance operations console
  - Offer, venue, and redemption reporting workflows
- API (`apps/api`)
  - REST endpoints for offers, members, and redemption events
  - Validation rules for single-use redemptions
- SQLite (`data/dbc.sqlite`)
  - Fast local pilot store, portable for demos and popups

## Core Data Model
- `members`
- `venues`
- `offers`
- `member_offers` (entitlements)
- `redemptions` (immutable event log)

## Redemption Rules
- Offer must be active in current time window
- Member entitlement must exist and be unused
- One entitlement can only create one successful redemption
- Duplicate submissions should be idempotent-safe

## API Surface (initial)
- `GET /health`
- `POST /redeem`
- `GET /offers/active?venueId=...`
- `POST /offers` (admin)

## Security (pilot baseline)
- Add internal BarGlance login or access gate for the ops console
- Limit admin access to BarGlance operators rather than venue/bar staff
- Log operator/device context where internal actions are taken
- Use short-lived signed redemption tokens
- Add server-side rate limits for `/redeem`

## Deployment Recommendation
- API on a small managed Node host
- Web on static host + reverse proxy to API
- Nightly DB backup export for pilot safety
