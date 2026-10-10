# iOS app: why the paywall is not showing on the iPhone (Oct 10, 2026)

Written from a cloud session that cannot read the app code. `AfterVue/aftervue-ai`
is still not reachable (the Claude GitHub App is not installed on it; checked again
Oct 10) and `getaftervue.com` is denied by this environment's network policy. Every
statement below is sourced from the connected mailbox `mikel@getaftervue.com`, the
Drive library, and the GitHub issues in this repo. Read it as a diagnosis to confirm
against the code, not as a fact about the code.

## 1. What the evidence says happened

| When (UTC) | Event | Source |
| --- | --- | --- |
| Sept 27 | App designed with **no in-app purchase**: a 6-digit practice code activates it, subscriptions are sold on getaftervue.com through Stripe, App Review code `198419` never expires. Store copy says "Subscriptions are purchased on getaftervue.com, not in the app." | Drive: `40_App_Store_Metadata_and_Screenshots.md` §2, §3, §5 |
| Sept 28 | Asunshine activation PIN `385702` redeemed from a second IP. The alert bounced. | Gmail: "activation PIN 385702 redeemed from a new IP" |
| Sept 29 | The app now has an **In-App Purchase key**, and it returned **401 in sandbox**. | Issue #21 (quoting the Sept 29 session log) |
| Oct 6 | App "inadvertently set to Free" in App Store Connect pricing. | Issue #21 |
| Oct 9 03:11 | The backend processed an **App Store sandbox purchase**: plan `consult_room`, monthly, **free trial**, practice `apl-7847948bae08` "Asunshine Medspa", contact asunshinemedspa@gmail.com, amount $0.00, flagged "SANDBOX (TestFlight / App Review — not revenue)". The welcome was "delivered in the iPad app". | Gmail: "New AfterVue signup — Asunshine Medspa" (bounced to iCloud) |
| Oct 9 03:11 | That signup minted a consult link whose token has `pl: "paid"`, `ti: "consult_room"`, `ba: 1`, issued 2026-10-09 and **expiring 2027-11-13: a 400-day paid license from a $0 sandbox trial**. | Decoded from the manual-delivery link in the same email |
| Oct 9 03:45–03:56 | Three "previews degraded, provider_busy" alerts: the device was rendering real previews, so it was fully unlocked. | Gmail; issue #16 |

So between Sept 27 and Sept 29 the app gained a StoreKit subscription with a free
trial, and on the evening of Oct 8 (Eastern) a device completed that trial purchase in
the sandbox. The backend treated it as a paid practice for 400 days.

## 2. Why the iPhone shows no paywall: the device, the Apple ID, or the practice is already entitled

Most likely, in this order. More than one can be true at once.

1. **Sandbox subscription still counted as active.** The Oct 8 purchase was made with
   a sandbox Apple ID. StoreKit 2's `Transaction.currentEntitlements` returns that
   subscription on every device signed into the same sandbox account, so the iPhone
   inherits the iPad's trial. In the sandbox a monthly plan renews every 5 minutes and
   auto-renews at most 6 times (about 35 minutes), after which StoreKit reports no
   entitlement; by then the next cause has usually taken over.
2. **The app cached the server license.** The backend minted a `paid` token good
   until Nov 2027. If the app stores that token (or the practice's "paid" state) in the
   Keychain or UserDefaults and checks it before StoreKit, the paywall never comes
   back, even after the sandbox subscription expires. Keychain items survive deleting
   and reinstalling the app.
3. **The practice is now "paid" server-side.** Practice `apl-7847948bae08` is marked
   paid in the backend. Any device that enters its practice code, restores purchases,
   or opens the consult link is unlocked without seeing a paywall.
4. **Activation code entered.** Entering `385702` (Asunshine) or the never-expiring
   review code `198419` activates the app without a purchase, by design. The PIN was
   redeemed from two IPs on Sept 28; one may be this iPhone.
5. **Older build on the iPhone.** A build archived before Sept 29 has no paywall at
   all. Compare the build number on the iPhone (TestFlight > AfterVue AI) with the one
   in the current Xcode project.
6. **Products not loading on this device.** If `Product.products(for:)` returns an
   empty list, many paywall implementations skip the screen and fall back to the
   activation-code entry. Empty lists come from: the Paid Applications agreement not
   accepted in App Store Connect (Agreements, Tax, and Banking), the subscription not
   at least "Ready to Submit", a product-ID or bundle-ID mismatch, or the iPhone not
   signed into a sandbox account. The Oct 8 purchase proves products loaded on *that*
   device, so this only applies if the iPhone differs from it.

## 3. How to make the paywall appear on the iPhone (test steps, in order)

1. On the iPhone: Settings > App Store > Sandbox Account. Note which account is
   signed in. Sign out, or sign in with a **fresh sandbox tester** (App Store Connect >
   Users and Access > Sandbox > Testers > +). For the existing tester, use **Clear
   Purchase History** on that same page, and on the device Settings > App Store >
   Sandbox Account > Manage > cancel the AfterVue subscription.
2. Delete the app from the iPhone and reinstall the **current** TestFlight build.
   Confirm the build number matches the Xcode project that contains the StoreKit code.
3. If the app has a staff-settings "deactivate", "sign out of practice" or "reset"
   control, use it before step 2. If it does not, it needs one (see §4), because the
   Keychain-cached license outlives a reinstall.
4. Launch the app. Do **not** enter a practice code or the review code. The paywall
   should appear before any code entry. If it still does not, the app is reading a
   cached license or the practice's paid state (§2 items 2 and 3) and §4 applies.
5. If instead you see the activation-code screen with no purchase option, check
   §2 item 6 in App Store Connect: Agreements, Tax, and Banking (Paid Applications must
   be Active), then the subscription group and product status.

## 4. Fixes to make in `AfterVue/aftervue-ai` once it is reachable

Filed as a GitHub issue in this repo; the fix session runs against the real code.

- **Server, sandbox licences.** When the App Store transaction `environment` is
  `Sandbox`, never mint a production-length paid license. Issue a token that expires at
  the transaction's `expiresDate` plus a short grace, mark it `env: sandbox`, and keep
  the practice out of revenue reporting (the email already labels it). A 400-day paid
  token from a $0 trial is the bug that hides the paywall for good.
- **Server, production licences.** Token `exp` should equal the subscription's
  `expiresDate` plus the billing grace period (16 days for monthly), not a fixed
  400 days; re-verify on each launch with the App Store Server API, and on
  `DID_CHANGE_RENEWAL_STATUS` / `EXPIRED` server notifications revoke the practice.
- **Client, entitlement order.** Treat `Transaction.currentEntitlements` as the source
  of truth for App Store plans. A cached server token only bridges offline launches;
  if StoreKit reports nothing and the token is sandbox-issued or expired, show the
  paywall. Add **Restore Purchases** and **Manage Subscription** to the paywall
  (Guideline 3.1.1 expects both), and a staff-settings **Deactivate this device** that
  clears the Keychain license.
- **In-App Purchase key 401 (Sept 29).** Use a key generated under App Store Connect
  > Users and Access > Integrations > **In-App Purchase** (not an App Store Connect API
  key), its own Issuer ID and Key ID, JWT `aud` = `appstoreconnect-v1`, `bid` =
  `com.aftervue.kiosk`. Call `api.storekit-sandbox.itunes.apple.com` for sandbox
  transactions, and fall back from production to sandbox on error `4040010`
  (transaction not found).
- **Store listing and review notes.** The Sept 27 copy ("Subscriptions are purchased
  on getaftervue.com, not in the app", "the app never mentions in-app purchase
  alternatives") now contradicts the app. Rewrite §2 and §3 of `ops/40` before
  submission, or App Review will reject under 2.3 (accurate metadata) and 3.1.1.
  Linking to Stripe checkout for the same subscription from inside the app is
  allowed in the US storefront since the 2025 ruling, but the notes must say so.
- **App Store Connect (Mikel).** Confirm the Paid Applications agreement is Active,
  the subscription group, product IDs and the free-trial introductory offer exist and
  are "Ready to Submit", and that the app price "Free" is intentional (it is correct
  when the subscription is the in-app purchase).
- **Alerts.** The signup and PIN alerts that would have shown all of this bounced at
  iCloud (issue #17). Fix the recipient first; every other iOS finding was invisible
  because of it.

## 5. What a cloud session cannot do until two settings change

- Add `AfterVue/aftervue-ai` to the Claude GitHub App (GitHub > AfterVue org >
  Settings > GitHub Apps > Claude > Repository access). Then start a session with that
  repository selected; the fixes in §4 are one session.
- Add `getaftervue.com` (and `*.vercel.app`) to this environment's Allowed domains
  (session title bar > cloud environment menu > Edit > Network access), so a session
  can read the live support, pricing and app pages and the deployed widget code.
- Connect `scaleforcenow@gmail.com` as a Gmail connector, or forward `apple.com` mail
  to `mikel@getaftervue.com`, so App Store Connect, TestFlight and App Review mail can
  be reviewed (issue #21). The second Gmail connector still fails authentication.
