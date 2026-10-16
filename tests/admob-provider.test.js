import { describe, it, expect, vi } from 'vitest';
import { createAdMobProvider, pickAdProvider, ADMOB_EVENTS } from '../src/monetization/ad-provider-admob.js';
import { AD_CONFIG, ADMOB_TEST_INTERSTITIAL_IOS } from '../src/config/ads.js';
import { createMonetization } from '../src/monetization/monetization.js';
import { createMemoryBackend } from '../src/save.js';

// A fake of the @capacitor-community/admob plugin surface we use.
function fakePlugin({ failLoad = false, failShow = false, closeWith = 'dismiss', tracking = 'notDetermined', hangLoad = false } = {}) {
    const listeners = new Map();
    const plugin = {
        calls: [],
        trackingStatus: tracking,
        initialize: vi.fn(async (opts) => {
            plugin.calls.push(['initialize', opts]);
        }),
        trackingAuthorizationStatus: vi.fn(async () => ({ status: plugin.trackingStatus })),
        requestTrackingAuthorization: vi.fn(async () => {
            plugin.trackingStatus = 'authorized';
        }),
        prepareInterstitial: vi.fn((opts) => {
            plugin.calls.push(['prepare', opts]);
            if (hangLoad) return new Promise(() => {});
            return failLoad ? Promise.reject(new Error('no fill')) : Promise.resolve({ adUnitId: opts.adId });
        }),
        showInterstitial: vi.fn(async () => {
            plugin.calls.push(['show']);
            if (failShow) throw new Error('not ready');
            const event = closeWith === 'dismiss' ? ADMOB_EVENTS.Dismissed : closeWith === 'fail' ? ADMOB_EVENTS.FailedToShow : null;
            if (event) setTimeout(() => listeners.get(event)?.forEach((fn) => fn({})), 0);
        }),
        addListener: vi.fn((event, fn) => {
            if (!listeners.has(event)) listeners.set(event, new Set());
            listeners.get(event).add(fn);
            return Promise.resolve({ remove: async () => listeners.get(event).delete(fn) });
        }),
        listenerCount: () => [...listeners.values()].reduce((n, s) => n + s.size, 0),
    };
    return plugin;
}

const fast = { ...AD_CONFIG, showTimeoutMs: 50, loadTimeoutMs: 50 };
const flush = () => new Promise((r) => setTimeout(r, 5));

describe('AdMob ad config', () => {
    it('ships Google test unit and family-safe defaults until Adam adds real ids', () => {
        expect(AD_CONFIG.interstitialIdIos).toBe(ADMOB_TEST_INTERSTITIAL_IOS);
        expect(AD_CONFIG.isTesting).toBe(true);
        expect(AD_CONFIG.maxAdContentRating).toBe('General');
        expect(AD_CONFIG.requestTracking).toBe(false);
    });
});

describe('createAdMobProvider', () => {
    it('init starts the SDK once and preloads a non-personalized ad', async () => {
        const plugin = fakePlugin();
        const ads = createAdMobProvider({ plugin, config: fast });
        await Promise.all([ads.init(), ads.init()]);
        await flush();
        expect(plugin.initialize).toHaveBeenCalledTimes(1);
        expect(plugin.initialize.mock.calls[0][0]).toMatchObject({ maxAdContentRating: 'General', initializeForTesting: true });
        expect(plugin.prepareInterstitial).toHaveBeenCalledTimes(1);
        expect(plugin.prepareInterstitial.mock.calls[0][0]).toMatchObject({ adId: ADMOB_TEST_INTERSTITIAL_IOS, npa: true });
        // requestTracking is off: Apple's tracking prompt is never shown.
        expect(plugin.requestTrackingAuthorization).not.toHaveBeenCalled();
    });

    it('shows the preloaded ad, resolves true on close, then preloads the next', async () => {
        const plugin = fakePlugin();
        const ads = createAdMobProvider({ plugin, config: fast });
        await ads.init();
        await flush();
        await expect(ads.showInterstitial()).resolves.toBe(true);
        await flush();
        expect(plugin.showInterstitial).toHaveBeenCalledTimes(1);
        expect(plugin.prepareInterstitial).toHaveBeenCalledTimes(2);
        expect(plugin.listenerCount()).toBe(0); // listeners cleaned up
    });

    it('resolves false when no ad can load, so the game moves on', async () => {
        const ads = createAdMobProvider({ plugin: fakePlugin({ failLoad: true }), config: fast });
        await expect(ads.showInterstitial()).resolves.toBe(false);
    });

    it('resolves false when the ad fails to show', async () => {
        const ads = createAdMobProvider({ plugin: fakePlugin({ failShow: true }), config: fast });
        await expect(ads.showInterstitial()).resolves.toBe(false);
        const ads2 = createAdMobProvider({ plugin: fakePlugin({ closeWith: 'fail' }), config: fast });
        await expect(ads2.showInterstitial()).resolves.toBe(false);
    });

    it('never hangs: a stalled load or a missing close event times out', async () => {
        const stalled = createAdMobProvider({ plugin: fakePlugin({ hangLoad: true }), config: fast });
        await expect(stalled.showInterstitial()).resolves.toBe(false);
        const silent = createAdMobProvider({ plugin: fakePlugin({ closeWith: 'none' }), config: fast });
        await expect(silent.showInterstitial()).resolves.toBe(true);
    });

    it('resolves false if the SDK fails to start', async () => {
        const plugin = fakePlugin();
        plugin.initialize = vi.fn(async () => {
            throw new Error('boom');
        });
        const ads = createAdMobProvider({ plugin, config: fast });
        await expect(ads.showInterstitial()).resolves.toBe(false);
        expect(plugin.showInterstitial).not.toHaveBeenCalled();
    });

    it('asks for tracking only when enabled, and personalizes only if allowed', async () => {
        const plugin = fakePlugin();
        const ads = createAdMobProvider({ plugin, config: { ...fast, requestTracking: true } });
        await ads.init();
        await flush();
        expect(plugin.requestTrackingAuthorization).toHaveBeenCalledTimes(1);
        expect(ads.personalized).toBe(true);
        expect(plugin.prepareInterstitial.mock.calls[0][0].npa).toBe(false);
    });
});

describe('pickAdProvider', () => {
    const web = { isAvailable: () => true, showInterstitial: async () => true, kind: 'web' };

    it('uses the web sample in a browser', () => {
        expect(pickAdProvider({ capacitor: undefined, web })).toBe(web);
        expect(pickAdProvider({ capacitor: { isNativePlatform: () => false, Plugins: { AdMob: fakePlugin() } }, web })).toBe(web);
    });

    it('uses the web sample in the native app if the plugin is missing', () => {
        expect(pickAdProvider({ capacitor: { isNativePlatform: () => true, Plugins: {} }, web })).toBe(web);
    });

    it('uses AdMob inside the iOS app', () => {
        const p = pickAdProvider({ capacitor: { isNativePlatform: () => true, Plugins: { AdMob: fakePlugin() } }, web });
        expect(p).not.toBe(web);
        expect(typeof p.init).toBe('function');
    });
});

describe('AdMob behind the pacing rules', () => {
    it('only shows after two levels, then every second level, never with Remove Ads', async () => {
        const plugin = fakePlugin();
        const m = createMonetization({ storage: createMemoryBackend(), provider: createAdMobProvider({ plugin, config: fast }) });
        const shownAfter = [];
        for (let level = 1; level <= 6; level++) {
            m.onLevelFinished();
            if (await m.maybeShowInterstitial()) shownAfter.push(level);
        }
        expect(shownAfter).toEqual([2, 4, 6]);
        m.setAdsRemoved(true);
        m.onLevelFinished();
        m.onLevelFinished();
        expect(await m.maybeShowInterstitial()).toBe(false);
        expect(plugin.showInterstitial).toHaveBeenCalledTimes(3);
    });
});
