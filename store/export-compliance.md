# Export compliance (the encryption question)

**Answer: the app uses no non-exempt encryption.**

This is already declared in the app itself: `ios/App/App/Info.plist` sets `ITSAppUsesNonExemptEncryption` to `false`, so App Store Connect and TestFlight do not ask on every upload.

If App Store Connect asks anyway ("Does your app use encryption?"):

1. "Does your app use encryption? Select Yes even if your app only uses the standard encryption within Apple's operating system." Choose **None of the algorithms mentioned above** (or, on the older form, Yes and then "only uses exempt encryption").
2. No documentation and no French declaration are needed.

Why this is true:

- The game has no encryption code of its own, no login and no server.
- Today the app makes no network requests at all (`tests/appstore-offline.test.js` checks the source).
- Once ads and the purchase are added, the only encryption is HTTPS provided by iOS, used by Apple's StoreKit and Google's ad SDK. Standard HTTPS through the operating system is exempt.

Revisit this only if the game ever adds its own cryptography (for example encrypted cloud saves that do not go through iCloud).
