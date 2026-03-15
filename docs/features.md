# Dollar Bar Club — Member-Facing Feature Guide

> Pilot scope: Austin, TX | Powered by BarGlance

This document defines the full member-facing feature set for the DBC pilot web app. Features are modeled after the Locals Only Nashville reference app, reimagined with DBC's own brand and aesthetic.

---

## 1. Member Onboarding (Claim Your Pass)

Members claim a free digital membership through a lightweight signup flow.

| Field | Detail |
|-------|--------|
| Email | Required — serves as member identity |
| ZIP code | Must be Austin-area (`73301` or `787xx`) to verify local status |
| Result | Digital pass is issued; member gains one entitlement per active venue |

- No password — email-only for the pilot (magic-link or session token TBD).
- Messaging: "Claim Your Digital Membership" — not "sign up" or "register."
- Rejection copy for non-Austin ZIPs: "Dollar Bar Club is currently available to Austin locals only."
- On success the member lands directly on the venue list.

---

## 2. Venue List (Home Screen)

The primary view after onboarding. A vertically scrollable list of venue cards.

### Card anatomy

```
┌──────────────────────────────────┐
│  [Hero image — full-width]       │
│                                  │
│  ┌─────────┐                     │
│  │ ACTIVE  │  (or REDEEMED)      │
│  └─────────┘                     │
│  Venue Name                      │
│  Offer: "$1 House Cocktail"      │
│  123 E 6th St, Austin, TX 78701  │
│                                  │
│  View Details →                  │
└──────────────────────────────────┘
```

### Status badges

| Badge | Condition | Style |
|-------|-----------|-------|
| **Active** | Offer available, not yet redeemed | Green pill / outlined badge |
| **Redeemed** | Member has already redeemed at this venue | Muted badge + visual stamp overlay on hero image |

- Cards are sorted: active venues first, redeemed venues pushed to the bottom.
- Each card links to the venue detail page.

---

## 3. Venue Detail Page

Tapping a card opens a full detail view for the venue.

### Sections (top to bottom)

1. **Hero area** — Large venue image or logo, venue name, address.
2. **Offer Details** — The single exclusive offer for this venue (e.g., "$1 House Cocktail").
3. **Get Directions** — Tappable address that opens the device's native maps app.
4. **Venue Information**
   - Type (e.g., Cocktail Bar, Brewery, Dive Bar)
   - Neighborhood (e.g., East 6th, Rainey, South Congress)
   - Website URL
   - Phone number
   - Social links (Instagram, Facebook, TikTok — as available)
5. **Redeem CTA** — Prominent button: "Redeem Your Offer" (only shown for active/unredeemed offers).

If the offer is already redeemed, the CTA is replaced with a confirmation state (see section 5).

---

## 4. Geolocation Verification

Redemption requires the member to be physically at the venue. Tapping the redeem button triggers a GPS check.

### Flow

1. Member taps **"Redeem Your Offer"**.
2. Browser requests location permission (if not already granted).
3. A modal overlay appears:
   - Spinner animation
   - "Verifying your location..."
   - Venue address displayed for reference
4. **Pass** — Location is within acceptable radius of the venue → proceed to redemption.
5. **Fail** — Location is too far → modal shows friendly error: "Looks like you're not at [Venue Name] yet. Head over and try again!"

### Technical notes

- Radius threshold TBD (likely 100–200 meters to account for GPS drift).
- Falls back gracefully if location services are unavailable or denied — show instructions to enable GPS, do not block the entire app.

---

## 5. Redemption & Redeemed State

### Redemption

- Each member gets **one redemption per venue** (single-use entitlement).
- On successful geolocation verification, the API validates and records the redemption.
- Confirmation screen: clear success message with the redeemed offer details.

### Redeemed state — List view

- Hero image gets a visible "REDEEMED" stamp/overlay.
- Badge changes from "Active" to "Redeemed" (muted color).
- Card remains visible (member can still view venue info and directions).

### Redeemed state — Detail view

- Redeem CTA is replaced with a "Redeemed" confirmation block (date/time of redemption).
- Offer details remain visible for reference.
- All venue info (directions, phone, socials) stays accessible.

---

## 6. Mobile-First / PWA

The app is built mobile-first and installable as a Progressive Web App.

| Capability | Detail |
|------------|--------|
| Responsive | Designed for phone-sized viewports first; scales up gracefully |
| Installable | Add-to-home-screen prompt / Web App Manifest |
| Offline shell | App shell loads offline; data requires connectivity |
| No app store | Distributed via URL — no iOS/Android app store listing needed |
| Home screen icon | DBC-branded icon on device home screen |

- A subtle install banner or prompt (e.g., "Add to Home Screen for quick access") should appear on first visit for eligible browsers.

---

## 7. Design Direction

DBC has its own visual identity — the Nashville app is a feature reference, **not** a design reference.

### What we take from Nashville

- Feature parity: venue cards, detail pages, geolocation redemption, redeemed state
- Information hierarchy: offer front-and-center, venue info secondary
- PWA install prompt pattern

### What we change

| Aspect | Nashville (avoid) | DBC (target) |
|--------|-------------------|--------------|
| Palette | Dark/black with gold accents — feels dated | Clean, modern — white-first with DBC green accents |
| Typography | Generic sans-serif | Confident, slightly elevated (per brand collateral) |
| Cards | Dark backgrounds, cluttered | Light/white cards, generous whitespace, rounded corners |
| Badges | Basic text labels | Styled pills with clear color coding |
| Redeemed stamp | Large red diagonal overlay | More refined visual treatment (muted overlay or badge shift) |
| Overall feel | "Coupon app" | "Exclusive membership club" |

### Brand cues from DBC collateral

- **Primary green** from the landing page for accents and CTAs
- "Powered by BarGlance" badge in header or footer
- Invite-only / curated tone in all copy — this is a club, not a coupon book
- Photography-forward: high-quality venue images set the mood

---

## 8. Out of Scope (Pilot)

These features are intentionally excluded from the initial pilot:

- Bar-facing admin tooling
- Public-facing admin access; the internal ops console is for BarGlance only and will require a dedicated login/access point
- In-app messaging or notifications
- Multi-city support (Austin only)
- Social features (sharing, leaderboards)
- Payment processing
- Venue ratings or reviews
- Search or filtering (small venue count doesn't warrant it yet)
