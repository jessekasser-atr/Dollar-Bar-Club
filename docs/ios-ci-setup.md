# iOS CI Setup — Building Without a Mac

DBC uses a GitHub Actions workflow (`.github/workflows/ios-build.yml`) to
build, sign, and optionally upload the iOS app to App Store Connect. The
entire process runs on GitHub's macOS runners — no local Mac required.

---

## One-Time Setup

You need to create four secrets in your GitHub repository and generate
signing credentials from your Apple Developer account. All of this can be
done from a browser on any OS.

### Step 1: Create an App Store Connect API Key

This lets the CI upload builds to App Store Connect.

1. Go to [appstoreconnect.apple.com/access/integrations/api](https://appstoreconnect.apple.com/access/integrations/api)
2. Click **Generate API Key**
3. Name: `DBC CI`, Access: **App Manager**
4. Download the `.p8` file (you can only download it once)
5. Note the **Key ID** and **Issuer ID** shown on the page

Add these as GitHub repo secrets (Settings → Secrets and variables → Actions):

| Secret name | Value |
|-------------|-------|
| `ASC_KEY_ID` | The Key ID from step 5 |
| `ASC_ISSUER_ID` | The Issuer ID from step 5 |
| `ASC_PRIVATE_KEY` | The full contents of the `.p8` file |

### Step 2: Create a Distribution Certificate

This is the identity that signs the app.

**Option A — Using a Mac (easiest if you can borrow one)**

1. Open Keychain Access → Certificate Assistant → Request a Certificate from a CA
2. Enter your email, select "Saved to disk"
3. Go to [developer.apple.com/account/resources/certificates](https://developer.apple.com/account/resources/certificates)
4. Create a new **Apple Distribution** certificate using the CSR
5. Download the `.cer` file, double-click to install in Keychain
6. In Keychain Access, find the certificate, right-click → Export as `.p12`
7. Set a password

**Option B — Using the Apple Developer portal only (no Mac needed)**

You can use [Fastlane's cert](https://docs.fastlane.tools/actions/cert/)
from within a GitHub Actions run, or use a service like
[Codemagic's CLI tools](https://docs.codemagic.io/yaml-code-signing/signing-ios/)
to generate certificates entirely in CI.

Either way, you need a `.p12` file and its password. Then:

```bash
# Convert the .p12 to base64 (run this anywhere — Windows PowerShell, WSL, etc.)
# PowerShell:
[Convert]::ToBase64String([IO.File]::ReadAllBytes("certificate.p12"))

# Bash / WSL:
base64 -i certificate.p12
```

Add as GitHub secrets:

| Secret name | Value |
|-------------|-------|
| `IOS_P12_BASE64` | The base64 string from above |
| `IOS_P12_PASSWORD` | The password you set when exporting |

### Step 3: Create a Provisioning Profile

1. Go to [developer.apple.com/account/resources/profiles](https://developer.apple.com/account/resources/profiles)
2. Register an **App ID** first if you haven't:
   - Identifiers → App IDs → New
   - Bundle ID: `com.barglance.dollarbarclub` (explicit)
   - Description: Dollar Bar Club
   - No special capabilities needed for pilot
3. Create a new **App Store Distribution** provisioning profile
   - Select the App ID from step 2
   - Select the Distribution Certificate from Step 2
4. Download the `.mobileprovision` file

Convert to base64:

```bash
# PowerShell:
[Convert]::ToBase64String([IO.File]::ReadAllBytes("profile.mobileprovision"))

# Bash / WSL:
base64 -i profile.mobileprovision
```

| Secret name | Value |
|-------------|-------|
| `IOS_PROVISION_PROFILE_BASE64` | The base64 string |

### Step 4: Register the App in App Store Connect

1. Go to [appstoreconnect.apple.com](https://appstoreconnect.apple.com)
2. My Apps → New App
3. Fill in using the metadata from `docs/app-store-submission.md`

---

## Summary of Required GitHub Secrets

| Secret | What it is |
|--------|-----------|
| `IOS_P12_BASE64` | Distribution certificate (.p12), base64-encoded |
| `IOS_P12_PASSWORD` | Password for the .p12 |
| `IOS_PROVISION_PROFILE_BASE64` | Provisioning profile, base64-encoded |
| `ASC_KEY_ID` | App Store Connect API key ID |
| `ASC_ISSUER_ID` | App Store Connect issuer ID |
| `ASC_PRIVATE_KEY` | App Store Connect API private key (.p8 contents) |

---

## Running the Build

The workflow is triggered manually (workflow_dispatch), so you decide when
to build.

1. Go to your repo → Actions → "iOS Build & Upload"
2. Click **Run workflow**
3. Choose whether to upload to App Store Connect (checkbox)
4. The build takes ~10-15 minutes

The IPA is saved as a build artifact regardless. You can download it from
the Actions run page.

### When to check "Upload to App Store Connect"

- **Unchecked** — Just build and verify it compiles. Good for testing.
- **Checked** — Build AND push to App Store Connect. The build will appear
  in TestFlight and be available for App Store submission.

---

## Updating the App

1. Make web changes in `apps/member/public/`
2. Bump version in `apps/member/package.json` (the workflow reads it)
3. Commit and push
4. Go to Actions → Run the workflow
5. In App Store Connect, submit the new build for review

---

## Troubleshooting

**Build fails at "Install CocoaPods"**
- Check that `npx cap add ios` ran successfully in the prior step
- Look at the full log — CocoaPods errors usually have clear messages

**Signing fails**
- Verify the certificate hasn't expired (they last 1 year)
- Make sure the provisioning profile matches the bundle ID and certificate
- Re-export and update the secrets if needed

**Upload fails**
- Confirm the App Store Connect API key has App Manager access
- Check that the app is registered in App Store Connect
- Bundle ID in the workflow must match what's in App Store Connect

**"No matching provisioning profile" error**
- The bundle ID in the profile must be exactly `com.barglance.dollarbarclub`
- The profile must be an "App Store" type (not Development or Ad Hoc)
