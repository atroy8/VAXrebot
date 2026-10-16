// Ad settings for the App Store build (roadmap item 11).
//
// The interstitial unit below is Google's public TEST unit for iOS. It always
// serves a labeled test ad and is safe to ship in TestFlight builds. Before
// the App Store release, replace it with the real unit from the AdMob console
// (Apps > VAXrebot > Ad units) and set isTesting to false.
//
// Choices made for a family-friendly educational game:
// - maxAdContentRating 'G': only ads suitable for general audiences.
// - requestTracking false: the game never shows Apple's tracking prompt, so
//   every ad is non-personalized (npa). This keeps the App Store privacy label
//   simple. Flip it to true later if personalized ads are worth the prompt.

export const ADMOB_TEST_INTERSTITIAL_IOS = 'ca-app-pub-3940256099942544/4411468910';

export const AD_CONFIG = Object.freeze({
    interstitialIdIos: ADMOB_TEST_INTERSTITIAL_IOS,
    isTesting: true,
    maxAdContentRating: 'General',
    tagForChildDirectedTreatment: false,
    requestTracking: false,
    // If the native ad has not closed or failed after this long, the game
    // moves on anyway so leaving the results screen can never get stuck.
    showTimeoutMs: 45000,
    loadTimeoutMs: 8000,
});
