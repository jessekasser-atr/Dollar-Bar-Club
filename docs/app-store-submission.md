# Dollar Bar Club — iOS App Store Submission Guide

> Status: **Build pipeline verified on March 31, 2026** | Target: Apple App Store via Capacitor wrapper

---

## Architecture

DBC's iOS app is the existing member PWA wrapped in a native iOS shell via
[Capacitor](https://capacitorjs.com). The web assets in `apps/member/public/`
are bundled into the native app. API calls go directly to
`https://dbc-api.onrender.com` when running inside the native shell (detected
via `window.Capacitor.isNativePlatform()`).

```
┌─────────────────────────────┐
│  iOS App (Capacitor shell)  │
│  ┌───────────────────────┐  │
│  │  WKWebView            │  │
│  │  apps/member/public/* │  │
│  └───────────┬───────────┘  │
│              │ HTTPS        │
│              ▼              │
│  dbc-api.onrender.com       │
└─────────────────────────────┘
```

---

## What's Already Done

- [x] Capacitor installed (`@capacitor/core`, `@capacitor/cli`, `@capacitor/ios`)
- [x] `capacitor.config.ts` created in `apps/member/`
- [x] API base URL auto-detects Capacitor and routes to Render directly
- [x] iOS safe-area insets added (notch, home indicator)
- [x] Native-feel CSS (no text selection, no tap highlight, no overscroll bounce)
- [x] PNG app icons generated (1024×1024 + all Xcode sizes) in `apps/member/public/icons/`
- [x] `manifest.json` updated with PNG icon references
- [x] `apple-touch-icon` meta tag points to 180×180 PNG
- [x] Privacy policy page at `website/privacy.html`
- [x] Icon generation script at `scripts/generate_icons.py`
- [x] GitHub Actions workflow builds, signs, exports, and uploads successfully to App Store Connect

---

## Remaining Steps

> **No Mac needed.** A GitHub Actions workflow (`.github/workflows/ios-build.yml`)
> handles the entire Xcode build, signing, and upload on cloud macOS runners.
> See `docs/ios-ci-setup.md` for the one-time secrets setup.
>
> If you prefer to build locally on a Mac, the manual steps are below.

### 1. Add the iOS platform

The CI workflow runs this automatically. For local builds:

```bash
cd apps/member
npx cap add ios
```

This creates `apps/member/ios/` with a full Xcode project. Requires macOS
with Xcode 15+ and CocoaPods installed.

### 2. Sync web assets

Every time you update the web app, sync to the native project:

```bash
cd apps/member
npx cap sync ios
```

### 3. Configure Xcode project

Open the project:

```bash
npx cap open ios
```

In Xcode, configure:

| Setting | Value |
|---------|-------|
| Bundle Identifier | `com.barglance.dollarbarclub` |
| Display Name | Dollar Bar Club |
| Deployment Target | iOS 16.0 (minimum) |
| Device Orientation | Portrait only |
| Status Bar Style | Light Content |
| Background Modes | None needed for pilot |

#### App Icons

Drag the generated PNGs from `apps/member/public/icons/` into the Xcode
asset catalog (`Assets.xcassets` → `AppIcon`). The 1024×1024 is for the
App Store listing; other sizes are for device home screens.

#### Info.plist — Location Permission

Add these keys to `Info.plist` (Capacitor may already include them):

```xml
<key>NSLocationWhenInUseUsageDescription</key>
<string>Dollar Bar Club needs your location to verify you're at the venue when redeeming your drink offer.</string>
```

Do NOT request "Always" location — only "When In Use" is needed and Apple
will reject apps that request excessive permissions.

### 4. Signing & Certificates

In your Apple Developer account (developer.apple.com):

1. Create an **App ID**: `com.barglance.dollarbarclub`
2. Create a **Provisioning Profile** (App Store Distribution)
3. In Xcode → Signing & Capabilities:
   - Team: Your developer account
   - Enable "Automatically manage signing" (recommended)
   - Capability: No special entitlements needed for pilot

### 5. Build & Archive

1. Select **Any iOS Device (arm64)** as build target
2. Product → Archive
3. In the Organizer, click **Distribute App** → App Store Connect

---

## App Store Connect Setup

Create the app listing at [appstoreconnect.apple.com](https://appstoreconnect.apple.com):

### App Information

| Field | Value |
|-------|-------|
| App Name | Dollar Bar Club |
| Subtitle | $1 Drinks at Austin's Best Bars |
| Bundle ID | com.barglance.dollarbarclub |
| SKU | `dbc-ios-001` |
| Primary Language | English (U.S.) |
| Category | Food & Drink |
| Secondary Category | Lifestyle |
| Content Rights | Does not contain third-party content |
| Age Rating | 17+ (alcohol reference) |

### Version Information

| Field | Value |
|-------|-------|
| Version | 1.0.0 |
| Build | 1 |
| What's New | Initial release |

### Description (draft)

```
Claim your free Dollar Bar Club membership and unlock exclusive $1 drink
specials at hand-selected Austin bars.

HOW IT WORKS
• Claim your free digital membership with just your email
• Browse participating Austin venues and their exclusive offers
• Visit a bar, tap Redeem, and verify you're on-site
• Enjoy your $1 drink — one per venue, exclusively for members

FEATURES
• Curated list of Austin's best bars with exclusive DBC offers
• On-site GPS verification for secure, single-use redemption
• Venue details: hours, directions, contact info
• Clean, fast mobile experience

Dollar Bar Club is currently available in Austin, TX.
Offers are for members aged 21+ only.
```

### Keywords (100 char max)

```
austin bars,drink deals,bar specials,dollar drinks,austin nightlife,bar membership,drink club
```

### URLs

| Field | URL |
|-------|-----|
| Marketing URL | `https://dollarbarclub.com` |
| Support URL | `https://dollarbarclub.com` |
| Privacy Policy URL | `https://dollarbarclub.com/privacy` |

### Screenshots

Required sizes (at minimum):

| Device | Resolution | Required |
|--------|-----------|----------|
| iPhone 6.7" (15 Pro Max) | 1290 × 2796 | Yes |
| iPhone 6.5" (11 Pro Max) | 1242 × 2688 | Yes (or use 6.7") |
| iPhone 5.5" (8 Plus) | 1242 × 2208 | Optional but recommended |
| iPad Pro 12.9" | 2048 × 2732 | Only if supporting iPad |

Recommended screenshots (in order):
1. **Hero shot** — Venue list with "Your Austin Bar Pass" headline
2. **Venue detail** — A venue card showing the $1 offer
3. **Redemption** — The redeem button / verification flow
4. **Redeemed state** — Confirmation with checkmark
5. **Onboarding** — The claim-your-pass signup screen

Capture these from the Xcode Simulator or a real device. Use Simulator's
`Cmd+S` to take a screenshot at the correct resolution.

---

## Apple Review — Key Guidelines to Watch

### Guideline 4.2 — Minimum Functionality

Apple rejects apps that are "simply a web site bundled as an app." DBC
should pass because:
- It has account creation and membership management
- It uses device GPS for on-site verification (native capability)
- It has single-use entitlement tracking (not just browsing)
- The UI is app-like (no visible browser chrome, no URL bar)

To strengthen the case:
- The safe-area handling and native CSS tweaks are already in place
- Consider adding haptic feedback on successful redemption (Capacitor plugin)
- The splash screen is configured in `capacitor.config.ts`

### Guideline 5.1 — Privacy

- Privacy policy is at `/privacy` ✓
- Location permission string in Info.plist explains the specific use ✓
- Only "When In Use" location — never "Always" ✓
- No hidden data collection ✓

### Guideline 2.3 — Accurate Metadata

- Screenshots must show the actual app, not marketing mockups
- Description must accurately reflect functionality
- Age rating must be 17+ due to alcohol content

### Guideline 3.1 — Payments

- DBC membership is free — no IAP concerns for pilot
- If you ever add paid tiers, Apple's IAP rules will apply

---

## App Privacy Nutrition Labels

Apple requires you to declare data collection in App Store Connect.
Fill out the "App Privacy" section with:

| Data Type | Collected | Linked to Identity | Used for Tracking |
|-----------|-----------|-------------------|-------------------|
| Email Address | Yes | Yes | No |
| Precise Location | Yes | No | No |
| Product Interaction (redemptions) | Yes | Yes | No |

Purpose for all: **App Functionality**

---

## Post-Submission Checklist

- [ ] Monitor App Store Connect for review status updates
- [ ] Respond to any reviewer questions within 24 hours
- [ ] Have a test account ready for the reviewer (pre-created membership)
- [ ] If rejected, read the specific guideline cited and address it
- [ ] Typical review time: 24–48 hours (can be longer for first submission)
- [ ] Once approved, set the release to "Manually release" so you control timing

---

## Review Credentials

Apple reviewers may need to test the app. Prepare:

1. A pre-registered test membership (email + valid Austin ZIP)
2. Since the app requires on-site GPS for redemption, add a note to the
   reviewer explaining this feature. In the "Notes for Review" field:

```
This app requires physical presence at a participating venue to redeem
offers (GPS-verified). The venue list, offer details, and membership
features are fully testable without being on-site. Redemption is the
only feature that requires physical presence at a venue in Austin, TX.

Test account: [provide email used for test membership]
```

---

## Maintenance

When updating the web app for the App Store version:

1. Make changes in `apps/member/public/`
2. `cd apps/member && npx cap sync ios`
3. Bump version in Xcode (General → Version / Build)
4. Archive and upload new build
5. Submit for review with "What's New" notes

For web-only changes that don't need a new App Store release, the web
version at dollarbarclub.com updates independently since it deploys via
Vercel.
