// Interstitial ad policy: pure functions, no DOM, no SDK.
//
// Rules (roadmap item 11):
// - Never during a level. Ads can only show while the player is leaving the
//   results screen, between levels.
// - At most one ad per two finished levels.
// - A short grace period: no ad until the player has finished two levels, so
//   a brand new player never meets an ad before they know the game.
// - Never once Remove Ads is owned.
//
// The ad state is a small plain object so it can be saved, tested, and
// shared with a native AdMob adapter later without changes.

export const AD_POLICY = Object.freeze({
    minLevelsBeforeFirstAd: 2,
    levelsBetweenAds: 2,
});

export function createAdState() {
    return { levelsFinished: 0, levelsSinceAd: 0, adsShown: 0 };
}

export function normalizeAdState(raw) {
    const base = createAdState();
    if (!raw || typeof raw !== 'object') return base;
    const num = (v) => (Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
    return {
        levelsFinished: num(raw.levelsFinished),
        levelsSinceAd: num(raw.levelsSinceAd),
        adsShown: num(raw.adsShown),
    };
}

// Call once per finished level (win or loss).
export function recordLevelFinished(state) {
    return {
        ...state,
        levelsFinished: state.levelsFinished + 1,
        levelsSinceAd: state.levelsSinceAd + 1,
    };
}

export function shouldShowInterstitial(state, { adsRemoved = false, inLevel = false } = {}, policy = AD_POLICY) {
    if (adsRemoved) return false;
    if (inLevel) return false;
    if (state.levelsFinished < policy.minLevelsBeforeFirstAd) return false;
    return state.levelsSinceAd >= policy.levelsBetweenAds;
}

export function recordAdShown(state) {
    return { ...state, levelsSinceAd: 0, adsShown: state.adsShown + 1 };
}
