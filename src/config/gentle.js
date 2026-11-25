// Gentle mode (wide audience round): a kinder outbreak for players who are
// stuck. A pure modifier on the rolled level rules (rollLevelRules in
// src/config/difficulty-roll.js), so the sim itself is unchanged:
// spread is a little slower and every tool the level offers gets one more
// use per day. Stars earned in Gentle mode count.
export const GENTLE = Object.freeze({ spreadFactor: 0.9, extraUses: 1 });

const round3 = (x) => Math.round(x * 1000) / 1000;

// Returns NEW rules; the input is not changed. Extra fields pass through.
export function applyGentle(rules, gentle = GENTLE) {
    const difficulty = { ...rules.difficulty };
    difficulty.transmissionMultiplier = round3((difficulty.transmissionMultiplier ?? 1) * gentle.spreadFactor);
    if (difficulty.dailyLimits) {
        const limits = { ...difficulty.dailyLimits };
        // Only tools this level really has: a limit of 0 means "not on this world".
        for (const id of Object.keys(limits)) if (limits[id] > 0) limits[id] += gentle.extraUses;
        difficulty.dailyLimits = limits;
    }
    difficulty.gentle = true;
    return { ...rules, scenario: { ...rules.scenario }, difficulty };
}

export const GENTLE_OFFER_AFTER_LOSSES = 2;

// Offer Gentle mode after two losses in a row on the same level.
export function shouldOfferGentle({ gentleOn = false, lossStreak = null, levelId = null } = {}) {
    if (gentleOn || !lossStreak || !levelId) return false;
    return lossStreak.levelId === levelId && lossStreak.count >= GENTLE_OFFER_AFTER_LOSSES;
}

// Pure update of the loss streak after a finished level.
export function nextLossStreak(prev, levelId, won) {
    if (won) return { levelId: null, count: 0 };
    if (prev && prev.levelId === levelId) return { levelId, count: (prev.count || 0) + 1 };
    return { levelId, count: 1 };
}
