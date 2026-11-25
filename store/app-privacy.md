# App Privacy answers (the "nutrition label")

App Store Connect, your app, Trust and Safety, App Privacy, Get Started.

There is one label per app, and it must cover everything the app can do for any user. So the label describes the free version with ads. Players who buy Remove Ads see less collection than the label says, which is allowed. Section 3 says what to tell a player who asks.

Check Google's own page before you submit, because the list of what the AdMob SDK collects changes: search for "Google Mobile Ads SDK Apple App Store data disclosure". If you use RevenueCat, also read its page "Apple App Privacy" for the purchase part.

## 1. What the game itself collects

Nothing. The game has no accounts, no analytics and no server. Progress and settings are saved on the device only (the full list is in the privacy policy). Without ads the honest answer to "Do you or your third-party partners collect data from this app?" would be No.

## 2. The free version with AdMob, as the code is set today

`src/config/ads.js` has `requestTracking: false`. The app never shows Apple's tracking prompt, never reads the advertising identifier, and asks for non-personalized ads only.

First question, "Do you or your third-party partners collect data from this app?": **Yes** (the AdMob SDK does).

| Data type (Apple's name) | Collected | Purposes to tick | Linked to the user | Used for tracking |
| --- | --- | --- | --- | --- |
| Location, Coarse Location | Yes. The SDK sees the IP address, which gives a rough region. | Third-Party Advertising, Analytics | No | No |
| Identifiers, Device ID | Yes. A per-app device identifier used for frequency capping and fraud prevention. | Third-Party Advertising, Analytics | No | No |
| Usage Data, Product Interaction | Yes. App launches and taps on ads. | Third-Party Advertising, Analytics | No | No |
| Usage Data, Advertising Data | Yes. Which ads were shown and tapped. | Third-Party Advertising, Analytics | No | No |
| Diagnostics, Crash Data | Yes | Analytics | No | No |
| Diagnostics, Performance Data | Yes. Launch time and the like. | Analytics | No | No |
| Diagnostics, Other Diagnostic Data | Yes | Analytics | No | No |
| Everything else (Contact Info, Health and Fitness, Financial Info, Precise Location, Sensitive Info, Contacts, User Content, Browsing History, Search History, Purchases, Other Data) | No | | | |

"Used for tracking" is No for every row because Apple's meaning of tracking is linking this app's data with other companies' data for targeted ads, and with no tracking prompt and non-personalized requests that does not happen. If Google's disclosure page says a row must be "Linked to the user", follow Google's page: it is the safer answer.

Privacy "nutrition label" result: "Data Not Linked to You: Location, Identifiers, Usage Data, Diagnostics".

## 2b. Only if you later turn on personalized ads

If `requestTracking` is set to `true`, the app shows Apple's tracking prompt (the wording is in `ios/App/App/Info.plist`, key `NSUserTrackingUsageDescription`) and, for players who tap Allow, AdMob uses the advertising identifier. Then change the label:

- Identifiers, Device ID: Used for tracking **Yes**, Linked to the user **Yes**.
- Usage Data, Advertising Data: Used for tracking **Yes**.
- Usage Data, Product Interaction: Used for tracking **Yes**.
- Coarse Location: Used for tracking **Yes**.

Tracking then happens only for players who allow it, but the label must still say Yes. The privacy policy must change too: `tests/settings-pages.test.js` fails until `public/privacy.html` contains "ask your permission before any tracking".

## 3. After a player buys Remove Ads

- The game never asks the ad SDK for an ad again (`src/monetization/monetization.js` returns before the provider is called), and from the next launch the SDK is not started at all (`src/game.js` only calls `adProvider.init()` when Remove Ads is not owned). So no ad data is collected in later sessions.
- With Apple's own StoreKit and no server, the purchase is known only to Apple and the device: tick nothing extra.
- With RevenueCat, add **Purchases, Purchase History**: purpose App Functionality, Linked to the user No (the app uses RevenueCat's anonymous ids, no login), Used for tracking No.

## 4. Privacy policy URL

Paste `listing/privacy-policy-url.txt`. The page is `public/privacy.html` in this repo and is live once `main` deploys to GitHub Pages.
