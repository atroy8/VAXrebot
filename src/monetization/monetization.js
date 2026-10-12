// Monetization facade: entitlements (Remove Ads) plus interstitial pacing.
//
// Stored under its own key so it never collides with the progress save.
// The storage backend is the same { getItem, setItem } interface as
// src/save.js, so a Capacitor Preferences wrapper drops in later.
//
// The ad provider is injected. On the web it is a labeled placeholder
// (ad-provider-web.js). The App Store build swaps in an AdMob adapter with
// the same showInterstitial() promise, and the Remove Ads purchase (item 12,
// RevenueCat or StoreKit) calls setAdsRemoved(true).

import {
    createAdState,
    normalizeAdState,
    recordLevelFinished,
    recordAdShown,
    shouldShowInterstitial,
} from './ad-policy.js';

export const MONETIZATION_KEY = 'vaxrebot-monetization-v1';

function load(storage) {
    try {
        const raw = storage.getItem(MONETIZATION_KEY);
        if (!raw) return { adsRemoved: false, ads: createAdState() };
        const data = JSON.parse(raw);
        return { adsRemoved: data?.adsRemoved === true, ads: normalizeAdState(data?.ads) };
    } catch {
        return { adsRemoved: false, ads: createAdState() };
    }
}

export function createMonetization({ storage, provider }) {
    let state = load(storage);
    let showing = false;

    const persist = () => {
        try {
            storage.setItem(MONETIZATION_KEY, JSON.stringify({ version: 1, ...state }));
        } catch {
            // Storage full or blocked: pacing resets next launch, never crash.
        }
    };

    return {
        get adsRemoved() {
            return state.adsRemoved;
        },
        get adState() {
            return { ...state.ads };
        },
        setAdsRemoved(value) {
            state = { ...state, adsRemoved: value === true };
            persist();
        },
        onLevelFinished() {
            state = { ...state, ads: recordLevelFinished(state.ads) };
            persist();
        },
        // Resolves true if an ad was shown. Always resolves, even if the
        // provider fails, so leaving the results screen can never get stuck.
        async maybeShowInterstitial({ inLevel = false } = {}) {
            if (showing) return false;
            if (!shouldShowInterstitial(state.ads, { adsRemoved: state.adsRemoved, inLevel })) return false;
            if (!provider || (provider.isAvailable && !provider.isAvailable())) return false;
            showing = true;
            let shown = false;
            try {
                shown = (await provider.showInterstitial()) !== false;
            } catch {
                shown = false;
            } finally {
                showing = false;
            }
            if (shown) {
                state = { ...state, ads: recordAdShown(state.ads) };
                persist();
            }
            return shown;
        },
    };
}
