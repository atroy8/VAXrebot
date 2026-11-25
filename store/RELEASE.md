# Releasing Galactic Outbreak on the iOS App Store

A checklist for Adam, from "no Apple account" to "submitted for review". Do the steps in order. Each says where to click and what to paste.

## Where things stand

Done in the repo, no account needed:

- The iOS project (`ios/`, Capacitor 8, Swift Package Manager, no CocoaPods). Bundle id `com.adamtroy.galacticoutbreak`, name Galactic Outbreak, version 1.0.0, iPhone only, portrait only, light status bar text, navy launch screen with the gold title, app icon.
- The game behaves like an app in the web view: safe areas, no zoom, no bounce, works offline, privacy and support links open in Safari.
- Vibration through the iPhone Taptic Engine (`@capacitor/haptics` is installed).
- Ad pacing (`src/monetization/ad-policy.js`): never during a level, none before two finished levels, at most one per two levels, none once Remove Ads is owned.
- An AdMob adapter (`src/monetization/ad-provider-admob.js`) that the game picks automatically inside the app. Until the AdMob plugin is installed (step 7) it finds no SDK and the app simply shows no ads.
- The store listing, age rating, privacy label, review notes, icon and screenshots (this folder).
- The build and upload workflow (`.github/workflows/ios-testflight.yml`), manual trigger only.

Not done, because each needs an account or a Mac:

- **The AdMob plugin is not installed.** Step 7.
- **The Remove Ads purchase is not wired.** In Settings, Remove Ads and Restore purchases only show the line "Purchases arrive with the App Store version." App Review rejects purchase buttons that do nothing, so step 8 must be finished before step 12.
- Nothing here has been built with Xcode or run on an iPhone. The project was generated on Linux. Expect small fixes on the first build.

## 1. Join the Apple Developer Program

1. Go to developer.apple.com/programs/enroll and sign in with your Apple ID (turn on two-factor authentication first if it is off).
2. Enroll as an **Individual**. Your legal name is then shown as the seller on the App Store.
3. Pay the yearly fee (99 US dollars). Approval usually takes a day or two.
4. Afterwards open developer.apple.com/account, Membership details, and copy the **Team ID** (10 characters). You need it in step 5.

## 2. Accept the agreements, add tax and bank details

1. appstoreconnect.apple.com, Business (it was called Agreements, Tax, and Banking).
2. Accept the **Free Apps Agreement**.
3. Accept the **Paid Apps Agreement** and fill in bank and tax forms. Remove Ads is a paid in-app purchase, and it cannot be tested or sold until this shows Active.

## 3. Register the bundle id

1. developer.apple.com/account, Certificates, IDs and Profiles, Identifiers, the plus button.
2. App IDs, App, Continue.
3. Description: `Galactic Outbreak`. Bundle ID: Explicit, `com.adamtroy.galacticoutbreak`.
4. Capabilities: leave the defaults (In-App Purchase is on by default). Register.

If you want a different bundle id, change `appId` in `capacitor.config.json` and `PRODUCT_BUNDLE_IDENTIFIER` (two places) in `ios/App/App.xcodeproj/project.pbxproj` first. `npm test` checks that they match. A bundle id cannot be changed after the first upload.

## 4. Create the app record

1. appstoreconnect.apple.com, Apps, the plus button, New App.
2. Platforms: iOS. Name: paste `listing/name.txt`. Primary language: English (U.S.).
3. Bundle ID: pick `com.adamtroy.galacticoutbreak`. SKU: `galactic-outbreak-ios`. User Access: Full Access. Create.

If the name is taken, try `Galactic Outbreak: Puzzle` (25 characters) and tell me so the listing can match.

## 5. Create the API key and the GitHub secrets

1. appstoreconnect.apple.com, Users and Access, Integrations, App Store Connect API, Team Keys, the plus button.
2. Name: `GitHub Actions`. Access: **Admin** (automatic signing needs it). Generate.
3. Download the `.p8` file. It can be downloaded only once. Copy the **Key ID** from the row and the **Issuer ID** from the top of the page.
4. On GitHub: the VAXrebot repo, Settings, Secrets and variables, Actions, New repository secret. Add these four, named exactly:

| Secret name | Value |
| --- | --- |
| `ASC_KEY_ID` | the Key ID (10 characters) |
| `ASC_ISSUER_ID` | the Issuer ID (a long id with dashes) |
| `ASC_API_KEY_P8` | open the `.p8` file in a text editor and paste all of it, including the BEGIN and END lines |
| `APPLE_TEAM_ID` | the Team ID from step 1 |

## 6. A way to build (a Mac, or the workflow)

Either works. The workflow needs no Mac at all, but a Mac or a cloud Mac makes fixing the first build much faster.

- **Workflow only:** skip to step 9.
- **On a Mac with Xcode 26 or newer:**

```
git clone https://github.com/atroy8/VAXrebot.git && cd VAXrebot
npm ci
npm run build:ios
npx cap open ios
```

In Xcode: click App in the left bar, Signing and Capabilities, tick Automatically manage signing, pick your team. Plug in an iPhone, pick it at the top, press Run.

## 7. AdMob (ads)

1. apps.admob.com, sign up. Apps, Add app, iOS. "Is the app listed on a supported app store?" No (for now). Name: `Galactic Outbreak`.
2. Copy the **App ID** (looks like `ca-app-pub-1234567890123456~1234567890`).
3. Ad units, Add ad unit, **Interstitial**. Name: `Between levels`. Copy the **ad unit ID** (looks like `ca-app-pub-1234567890123456/1234567890`).
4. App settings: set the maximum ad content rating to **G**. Blocking controls: block categories you do not want next to a game about health (for example gambling, dating, and sensitive health claims).
5. In the repo, ask Claude (or do it yourself) to:
   - run `npm install @capacitor-community/admob` then `npm run build:ios`;
   - in `ios/App/App/Info.plist` add the key `GADApplicationIdentifier` with the App ID, and replace the `SKAdNetworkItems` list with Google's current list (AdMob iOS quick start, "Update your Info.plist");
   - in `src/config/ads.js` set `interstitialIdIos` to the ad unit ID and `isTesting` to `false` (leave both alone for TestFlight builds: the test unit is safe and real ads must not be clicked by testers);
   - check the two event names in `ADMOB_EVENTS` (`src/monetization/ad-provider-admob.js`) against the installed plugin version.
6. After the app is live on the store, come back to AdMob, App settings, and link the app to its store listing. Add an `app-ads.txt` file at the root of the marketing site with the line AdMob shows you.

The tracking prompt. The app is set to never show it (`requestTracking: false`), and every ad is non-personalized. This is the simplest and most private choice and the listing is written for it. If you later want personalized ads, set `requestTracking: true`. The prompt then reads:

> Allow this to see ads that are more relevant to you. Your choice does not change the game, and ads only ever play between levels.

That text lives in `ios/App/App/Info.plist` under `NSUserTrackingUsageDescription`. If you turn it on, redo `app-privacy.md` section 2b and update the privacy page (a test fails until you do).

## 8. Remove Ads (the in-app purchase)

1. App Store Connect, your app, Monetization, In-App Purchases, the plus button.
2. Type: **Non-Consumable**. Reference name: `Remove Ads`. Product ID: `remove_ads`.
3. Price: your choice (2.99 US dollars is a common price for this).
4. Localization (English U.S.): Display name `Remove Ads`. Description `Turns off the ads between levels, for good.`
5. Review screenshot: a screenshot of the Settings sheet with the Remove Ads row. Review notes: `Settings, first section, Remove Ads.`
6. Pick how the app talks to the store:
   - **RevenueCat** (easier, free under their revenue limit): create a project at app.revenuecat.com, add the iOS app with the bundle id, paste an App Store Connect in-app purchase key, create an entitlement `no_ads` and attach `remove_ads`. Copy the public iOS SDK key.
   - **StoreKit directly** (no extra service): nothing to set up.
7. Ask Claude to wire it. What has to happen in code: a purchase plugin is added, the Remove Ads row in `src/ui/settings.js` starts the purchase, Restore purchases calls restore, and on success both call `monetization.setAdsRemoved(true)`. The entitlement is also checked on launch. Everything after that already works: the pacing stops asking for ads.
8. Test with a sandbox account: App Store Connect, Users and Access, Sandbox, Test Accounts, add one. On the iPhone: Settings, Developer, Sandbox Apple Account.

Do not submit (step 12) until tapping Remove Ads opens Apple's purchase sheet.

## 9. First TestFlight build

1. GitHub, the VAXrebot repo, Actions, **iOS TestFlight**, Run workflow, Run.
2. It tests, builds, signs and uploads in about 15 minutes. If it fails, open the failed step: the usual causes are a secret pasted with a missing line, an agreement not accepted (step 2), or the app record missing (step 4).
3. App Store Connect, your app, TestFlight. The build appears after 5 to 30 minutes of processing. The encryption question is already answered in the app (see `export-compliance.md`).
4. Internal Testing, the plus button, create a group, add yourself. Install the TestFlight app on your iPhone and accept the invite.

## 10. Test on a real iPhone

Check these, on the newest iPhone you can find and on a small one if possible:

- Nothing sits under the Dynamic Island or the home bar on: title, star map, briefing, a level, results, Settings, the shop.
- The launch screen is navy with the gold title, then the game appears with no white flash.
- Sound starts after the first tap, stops when the app goes to the background, and the level pauses.
- Vibration works when you cut a line, and the Vibration switch in Settings turns it off.
- Airplane mode: the game still plays from start to finish.
- Privacy policy and Help and support open in Safari.
- Close the app, open it again: progress is still there.
- After two finished levels a test ad appears between levels, and never during one (after step 7).
- Remove Ads opens the purchase sheet, the sandbox purchase works, ads stop, and Restore purchases works after deleting and reinstalling (after step 8).
- The "Preview: pretend Remove Ads is owned" switch is NOT in Settings in the app (it is web only).

## 11. Fill in the store page

App Store Connect, your app, the version under iOS App (1.0).

| Field | Paste from |
| --- | --- |
| Screenshots, iPhone 6.9 inch display | `screenshots/6.9-inch/` (all six, in number order) |
| Screenshots, iPhone 6.5 inch display | `screenshots/6.5-inch/` (optional: Apple scales the 6.9 inch set down if this is empty) |
| Promotional Text | `listing/promotional-text.txt` |
| Description | `listing/description.txt` |
| Keywords | `listing/keywords.txt` |
| Support URL | `listing/support-url.txt` |
| Marketing URL | `listing/marketing-url.txt` |
| Copyright | `2026 Adam Troy` |
| Build | pick the TestFlight build you tested |
| App Review Information, Sign-in required | untick |
| App Review Information, Notes | `listing/review-notes.txt` |
| App Review Information, contact | your name, phone and email |
| In-App Purchases (on the version page) | add `remove_ads` so it is reviewed with the app |

Then, under General and Trust and Safety:

| Page | Use |
| --- | --- |
| App Information, Subtitle | `listing/subtitle.txt` |
| App Information, Category | `categories.md` |
| App Information, Content Rights | "No, it does not contain, show, or access third-party content" |
| App Information, Age Rating | `age-rating.md` |
| App Privacy, Privacy Policy URL | `listing/privacy-policy-url.txt` |
| App Privacy, data collection | `app-privacy.md` |
| Pricing and Availability | Free, all countries |

The app icon comes from the build. The 1024 px master is `icon/app-icon-1024.png` if a form asks for it.

## 12. Submit for review

1. Before you press the button: step 7 and step 8 are finished, `isTesting` is `false` in `src/config/ads.js`, and a new build with those changes has been through step 9 and step 10.
2. On the version page press Add for Review, then Submit to App Review.
3. Choose "Manually release this version" so you decide the day.
4. Review usually takes one to three days. If it is rejected, the message says which rule and what they saw. Paste it to Claude and fix that one thing: a rejection is normal and not a mark against the account.

## Later versions

Change `version` in `package.json` and `MARKETING_VERSION` in `ios/App/App.xcodeproj/project.pbxproj` to the same number (`npm test` checks they match), write `listing/whats-new.txt`, run the workflow, and submit the new build.
