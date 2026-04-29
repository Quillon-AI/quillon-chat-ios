# Test Plan: PR #9660 — iOS Intune Conditional Access Support

## Overview

**PR:** https://github.com/mattermost/mattermost-mobile/pull/9660  
**Ticket:** MM-68172  
**Branch:** `intune-ca` → `main`  
**Test Server:** https://test-release.test.mattermost.cloud/  
**Docs:** https://docs.mattermost.com/deployment-guide/mobile/configure-microsoft-intune-mam.html

### Credentials

| Username | Password | Role |
|---|---|---|
| `admin` | `admin@zey1twjz7jnmdj6h18xno4h5xh` | Admin |
| `user` | `user@sfze718epigydbpnbdo9su7zih` | Regular user |

---

## What This PR Does

Adds post-enrollment compliance failure handling for iOS. When Intune detects a CA (Conditional Access) policy violation **after** the user is already enrolled, the app must:

1. Blur the screen immediately (hide sensitive content)
2. Trigger selective wipe (log out affected server(s))
3. Show a non-dismissible alert with localized or SDK-provided error text
4. Unblur after the user acknowledges the alert

**Key files changed:**
- `app/managers/security_manager/index.ts` — `onComplianceFailed()` handler
- `app/managers/intune_manager/index.ts` — `subscribeToComplianceFailed()` / `subscribeToComplianceCompleted()`
- `app/utils/alerts/index.ts` — `showMAMComplianceFailedAlert()`
- `app/utils/intune_errors.ts` — error code parsing (`-50005` user cancel, `1004` compliance failure)

---

## Prerequisites

| Requirement | Detail |
|---|---|
| Device | Physical iPhone (not simulator — Intune MAM requires real device) |
| iOS version | 16+ |
| App build | Build from the `intune-ca` branch (not App Store) |
| Intune enrollment | Device enrolled in Intune MAM via Company Portal |
| Azure AD tenant | Conditional Access policy configured to require compliant devices |
| Mattermost server | Connected to Azure AD / Entra ID with Intune CA enabled |
| Intune SDK | Verify `IntuneMAMSwift` is linked in Podfile |
| License | Enterprise Advanced license on server |

### Server Setup Checklist (admin)
- [ ] Microsoft Entra app registered with `login.mattermost` API scope
- [ ] Official Mattermost mobile client authorized in Entra
- [ ] Microsoft Graph permissions granted (tenant-wide admin consent)
- [ ] Intune App Protection Policy created for `com.mattermost.rn` (or `com.mattermost.rnbeta` for beta)
- [ ] Policy assigned to test user group
- [ ] Mattermost System Console: Intune MAM enabled, Tenant ID + Client ID entered
- [ ] IdAttribute = `objectId` for the enforced auth provider

---

## Test Cases

### TC-01: Baseline — Normal App Function When Compliant

**Goal:** Confirm no regression when device is fully compliant.

**Steps:**
1. Enroll device in Intune, verify device shows **Compliant** in Intune admin portal.
2. Launch app, log in via SSO (Azure AD).
3. Navigate channels, send a message, open a file.

**Expected:** Normal app behavior. No blur, no alert, no wipe.

---

### TC-02: Compliance Failure Triggered Post-Enrollment ⭐ Core Case

**Goal:** Verify the full compliance-failed flow fires correctly.

**Setup:** Device enrolled → user logged in → mark device as non-compliant in Intune portal (or apply a stricter CA policy).

**Steps:**
1. Log in to the app normally (confirm baseline from TC-01).
2. In Intune admin portal: mark the test device as **non-compliant** OR apply a new App Protection Policy that the device cannot meet.
3. Force a policy sync: open **Company Portal** → tap **Sync** (or wait up to 15 minutes).
4. Return to the Mattermost app while it is in the foreground.

**Expected:**
- [ ] Screen blurs immediately (content hidden)
- [ ] Non-dismissible alert appears with title + message
- [ ] Alert cannot be dismissed by tapping outside it
- [ ] After tapping the alert button, blur is removed
- [ ] User is logged out / app data is wiped
- [ ] App returns to login/server screen

---

### TC-03: Alert Uses SDK-Provided Error Strings (Priority Path)

**Goal:** When the Intune SDK supplies `errorTitle` and `errorMessage`, those take precedence over app fallback strings.

**Steps:**
1. Configure the CA policy to return custom error text via the SDK.
2. Trigger compliance failure (as in TC-02).
3. Observe the alert title and body text.

**Expected:** Alert displays exact title/message from the Intune SDK — not the app's `en.json` fallback strings.

---

### TC-04: Alert Fallback — Non-Compliant Device (No SDK Strings)

**Goal:** When SDK provides no error strings, app shows its own localized non-compliant message.

**Steps:**
1. Trigger compliance failure where SDK provides empty `errorTitle`/`errorMessage`.
2. Observe alert content.

**Expected:** Alert shows the app's translated non-compliance string (verify against new `en.json` key added in this PR).

---

### TC-05: Alert Fallback — Network Failure

**Goal:** Compliance check fails due to network error.

**Steps:**
1. Enable airplane mode on the device.
2. Trigger a compliance re-check (force sync via Company Portal).
3. Observe alert.

**Expected:** Alert shows the network-failure fallback message. App does not crash.

---

### TC-06: Alert Fallback — Service Error

**Goal:** Compliance check fails due to an Intune service-side error (error code 1004).

**Steps:**
1. Revoke the app token from Azure portal or temporarily disconnect the tenant from Intune service.
2. Trigger compliance re-check.
3. Observe alert.

**Expected:** Alert shows the service-error fallback message.

---

### TC-07: User Cancels MSAL Re-Authentication (Error Code -50005)

**Goal:** When CA triggers a re-auth prompt and user taps Cancel, the correct message appears and wipe still occurs.

**Steps:**
1. Configure a CA policy that requires MFA re-authentication.
2. Trigger the compliance re-auth prompt.
3. Tap **Cancel** on the MSAL login sheet.
4. Observe app behavior.

**Expected:**
- [ ] Alert shows the "user cancelled" fallback message (not a crash)
- [ ] Blur effect still applies
- [ ] Selective wipe still occurs

---

### TC-08: App in Background When Compliance Fails

**Goal:** Compliance failure fires while app is backgrounded.

**Steps:**
1. Log in to app, then press Home button (background the app).
2. Trigger compliance failure from Intune portal.
3. Bring app back to foreground.

**Expected:**
- [ ] Blur is applied when returning to foreground
- [ ] Alert is shown
- [ ] App does not crash

---

### TC-09: Blur Prevents Content Visibility (Security Check)

**Goal:** Blur effect actually obscures sensitive data.

**Steps:**
1. Trigger compliance failure (TC-02).
2. Immediately take a screenshot while blur is active (before tapping alert).
3. Inspect screenshot.

**Expected:** Channel names, messages, and user data are not readable in the screenshot. Content is visually obscured.

---

### TC-10: Selective Wipe Clears Correct Scope

**Goal:** Wipe clears only the affected server; device data is untouched.

**Steps:**
1. Complete TC-02 through to alert dismissal.
2. Check app state after wipe.

**Expected:**
- [ ] User is logged out from the server(s) listed in the compliance event's `serverUrls`
- [ ] App returns to server/login screen
- [ ] Device-level data (photos, contacts, other apps) is **not** affected (MAM = app-only wipe)

---

### TC-11: Multiple Servers — Targeted Wipe

**Goal:** Only the server with CA enforcement is wiped; other servers remain.

**Setup:** Add two Mattermost servers to the app. Configure CA only on Server A.

**Steps:**
1. Connect to both Server A (Intune-enabled) and Server B (no Intune).
2. Trigger compliance failure on Server A.
3. Observe which server sessions survive.

**Expected:**
- [ ] Server A data is wiped
- [ ] Server B session remains intact and functional

---

### TC-12: Recovery — Login After Remediation

**Goal:** User can log back in after resolving the compliance issue.

**Steps:**
1. Complete TC-02 (wipe occurs).
2. Remediate in Intune portal (mark device compliant again).
3. Relaunch app and attempt login.

**Expected:** Login succeeds. No compliance failure alert. Normal app function resumes.

---

### TC-13: Android Regression Check

**Goal:** This PR is iOS-only. Android behavior must not change.

**Steps:**
1. Run the app on Android with same Intune configuration.
2. Trigger a compliance policy violation.

**Expected:** Android behavior is identical to pre-PR baseline. No regressions.

---

### TC-14: Compliance Completed Event (No-Op Verification)

**Goal:** When compliance check succeeds, no alert or wipe occurs.

**Steps:**
1. Device is fully compliant.
2. Trigger a Intune policy sync (Company Portal → Sync).
3. Observe app behavior.

**Expected:** App continues normally. No blur, no alert, no wipe. `subscribeToComplianceCompleted()` fires without side effects.

---

## Error Code Reference

| Code | Meaning | Expected Fallback |
|---|---|---|
| -50005 | MSAL user cancelled | "User cancelled" string |
| 1004 | Intune compliance failure | SDK string → non-compliant fallback |
| Network error | No connectivity during check | Network failure fallback |
| Service error | Intune service down/unreachable | Service error fallback |

---

## Device / OS Matrix

| Priority | Device | iOS |
|---|---|---|
| P0 | iPhone (arm64) | iOS 17 |
| P1 | iPhone (arm64) | iOS 16 |
| P1 | iPhone (arm64) | iOS 18 |
| P2 | iPad | iOS 17 |

---

## Out of Scope

- Android Intune CA (not in this PR)
- MDM-enrolled (supervised) device flows — this PR targets MAM only
- Intune policy configuration in the admin portal (pre-condition, not under test)
- Simulator testing (Intune MAM requires physical device)
