import { describe, it, expect, vi } from 'vitest';
import {
    AD_POLICY,
    createAdState,
    normalizeAdState,
    recordLevelFinished,
    recordAdShown,
    shouldShowInterstitial,
} from '../src/monetization/ad-policy.js';
import { createMonetization, MONETIZATION_KEY } from '../src/monetization/monetization.js';
import { createMemoryBackend } from '../src/save.js';

const finish = (s, n) => {
    for (let i = 0; i < n; i++) s = recordLevelFinished(s);
    return s;
};

describe('ad policy (item 11)', () => {
    it('never shows an ad mid-level', () => {
        const s = finish(createAdState(), 10);
        expect(shouldShowInterstitial(s, { inLevel: true })).toBe(false);
    });

    it('never shows an ad once Remove Ads is owned', () => {
        const s = finish(createAdState(), 10);
        expect(shouldShowInterstitial(s, { adsRemoved: true })).toBe(false);
    });

    it('gives new players a grace period before the first ad', () => {
        expect(shouldShowInterstitial(finish(createAdState(), 0))).toBe(false);
        expect(shouldShowInterstitial(finish(createAdState(), 1))).toBe(false);
        expect(shouldShowInterstitial(finish(createAdState(), AD_POLICY.minLevelsBeforeFirstAd))).toBe(true);
    });

    it('shows at most one ad per two finished levels over a long session', () => {
        let s = createAdState();
        let ads = 0;
        for (let level = 1; level <= 30; level++) {
            s = recordLevelFinished(s);
            if (shouldShowInterstitial(s)) {
                s = recordAdShown(s);
                ads++;
            }
            // Leaving the results screen twice for one level never doubles up.
            expect(shouldShowInterstitial(s)).toBe(false);
        }
        expect(ads).toBeLessThanOrEqual(15);
        expect(ads).toBeGreaterThan(0);
        expect(s.adsShown).toBe(ads);
    });

    it('normalizes junk saved state', () => {
        expect(normalizeAdState(null)).toEqual(createAdState());
        expect(normalizeAdState({ levelsFinished: -3, levelsSinceAd: 'x', adsShown: 2.7 })).toEqual({
            levelsFinished: 0,
            levelsSinceAd: 0,
            adsShown: 2,
        });
    });
});

describe('monetization facade', () => {
    const fakeProvider = (result = true) => ({ showInterstitial: vi.fn(async () => result) });

    it('shows an ad between levels only when the policy allows, and persists pacing', async () => {
        const storage = createMemoryBackend();
        const provider = fakeProvider();
        const m = createMonetization({ storage, provider });
        m.onLevelFinished();
        expect(await m.maybeShowInterstitial()).toBe(false);
        m.onLevelFinished();
        expect(await m.maybeShowInterstitial()).toBe(true);
        expect(await m.maybeShowInterstitial()).toBe(false);
        expect(provider.showInterstitial).toHaveBeenCalledTimes(1);

        const reloaded = createMonetization({ storage, provider });
        expect(reloaded.adState).toEqual({ levelsFinished: 2, levelsSinceAd: 0, adsShown: 1 });
    });

    it('Remove Ads blocks every ad and survives a reload', async () => {
        const storage = createMemoryBackend();
        const provider = fakeProvider();
        const m = createMonetization({ storage, provider });
        m.setAdsRemoved(true);
        for (let i = 0; i < 6; i++) m.onLevelFinished();
        expect(await m.maybeShowInterstitial()).toBe(false);
        expect(provider.showInterstitial).not.toHaveBeenCalled();
        expect(createMonetization({ storage, provider }).adsRemoved).toBe(true);
    });

    it('never gets stuck when the ad provider fails', async () => {
        const storage = createMemoryBackend();
        const provider = { showInterstitial: vi.fn(async () => { throw new Error('no fill'); }) };
        const m = createMonetization({ storage, provider });
        m.onLevelFinished();
        m.onLevelFinished();
        expect(await m.maybeShowInterstitial()).toBe(false);
        // A failed ad does not reset pacing, so the next exit can try again.
        expect(m.adState.levelsSinceAd).toBe(2);
    });

    it('starts fresh from corrupt storage', () => {
        const storage = createMemoryBackend();
        storage.setItem(MONETIZATION_KEY, '{not json');
        const m = createMonetization({ storage, provider: fakeProvider() });
        expect(m.adsRemoved).toBe(false);
        expect(m.adState).toEqual(createAdState());
    });
});
