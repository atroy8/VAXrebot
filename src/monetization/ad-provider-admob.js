// Native AdMob interstitial for the App Store build (roadmap item 11).
//
// Talks to the @capacitor-community/admob plugin through the object the
// Capacitor bridge registers as Plugins.AdMob, so the web build needs no new
// dependency. The plugin is injected, which keeps this file testable with a
// fake and lets the iOS project (item 10) add the real plugin later.
//
// Contract shared with ad-provider-web.js:
//   isAvailable()        -> boolean
//   showInterstitial()   -> Promise<boolean>, true once the ad was shown and
//                           closed, false if it could not load or show.
// Extra: init() warms up the SDK and preloads the first ad. It never throws.
//
// The ad is preloaded ahead of time so the break starts instantly, and the
// next one loads after each close. Every wait has a timeout: if the SDK
// stalls, the game moves on instead of freezing on the results screen.

import { AD_CONFIG } from '../config/ads.js';

export const ADMOB_EVENTS = Object.freeze({
    Dismissed: 'interstitialAdDismissed',
    FailedToShow: 'interstitialAdFailedToShow',
});

function withTimeout(promise, ms, fallback) {
    let timer;
    const timeout = new Promise((resolve) => {
        timer = setTimeout(() => resolve(fallback), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export function createAdMobProvider({ plugin, config = AD_CONFIG } = {}) {
    let initPromise = null;
    let ready = false; // an interstitial is loaded and waiting
    let loading = null;
    let personalized = false;

    async function setup() {
        await plugin.initialize({
            initializeForTesting: config.isTesting,
            maxAdContentRating: config.maxAdContentRating,
            tagForChildDirectedTreatment: config.tagForChildDirectedTreatment,
        });
        if (config.requestTracking && plugin.trackingAuthorizationStatus) {
            let { status } = await plugin.trackingAuthorizationStatus();
            if (status === 'notDetermined' && plugin.requestTrackingAuthorization) {
                await plugin.requestTrackingAuthorization();
                ({ status } = await plugin.trackingAuthorizationStatus());
            }
            personalized = status === 'authorized';
        }
    }

    function init() {
        if (!initPromise) {
            initPromise = setup()
                .then(() => true)
                .catch(() => false);
            initPromise.then((ok) => {
                if (ok) preload();
            });
        }
        return initPromise;
    }

    function preload() {
        if (ready) return Promise.resolve(true);
        if (loading) return loading;
        const request = plugin
            .prepareInterstitial({
                adId: config.interstitialIdIos,
                isTesting: config.isTesting,
                npa: !personalized,
            })
            .then(() => {
                ready = true;
                return true;
            })
            .catch(() => false);
        loading = withTimeout(request, config.loadTimeoutMs, false).finally(() => {
            loading = null;
        });
        return loading;
    }

    function waitForClose() {
        const handles = [];
        const closed = new Promise((resolve) => {
            const listen = (event, value) => {
                const h = plugin.addListener?.(event, () => resolve(value));
                if (h) handles.push(h);
            };
            listen(ADMOB_EVENTS.Dismissed, true);
            listen(ADMOB_EVENTS.FailedToShow, false);
        });
        const cleanup = () => {
            for (const h of handles) Promise.resolve(h).then((x) => x?.remove?.()).catch(() => {});
        };
        return { closed, cleanup };
    }

    return {
        get personalized() {
            return personalized;
        },
        isAvailable: () => !!plugin,
        init,
        preload,
        async showInterstitial() {
            if (!plugin) return false;
            if (!(await init())) return false;
            if (!ready && !(await preload())) return false;
            ready = false;
            const { closed, cleanup } = waitForClose();
            let shown = false;
            try {
                await plugin.showInterstitial();
                shown = await withTimeout(closed, config.showTimeoutMs, true);
            } catch {
                shown = false;
            } finally {
                cleanup();
                preload(); // get the next break ready in the background
            }
            return shown;
        },
    };
}

// Pick the native AdMob provider inside the iOS app, the labeled web sample
// everywhere else (browser, GitHub Pages preview, tests).
export function pickAdProvider({ capacitor, web, config = AD_CONFIG } = {}) {
    const native = typeof capacitor?.isNativePlatform === 'function' && capacitor.isNativePlatform();
    const plugin = native ? capacitor?.Plugins?.AdMob : null;
    if (plugin) return createAdMobProvider({ plugin, config });
    return web;
}
