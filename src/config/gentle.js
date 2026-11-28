// Gentle mode (wide audience round): a kinder outbreak for players who are
// stuck. A pure modifier on the level rules (rollLevelRules in
// src/config/difficulty-roll.js).
//
// Round 57: there is no spread rate to slow any more (spread is certain),
// so Gentle mode is now exactly two things a player can count:
//   - every tool the level offers gets one more use per day, and
//   - the case cap allows one more case.
// The web that is dealt is the plain level's, and so is the cap it is
// measured from (src/sim/dealer.js withMeta), so the extra uses are a real
// edge when it comes to winning. Par is worked out again with the extra
// uses, so 3 stars still means the best play with the tools you really had.
// Stars earned in Gentle mode count.
export const GENTLE = Object.freeze({ extraUses: 1, extraCap: 1 });

// Returns NEW rules; the input is not changed. Extra fields pass through.
export function applyGentle(rules, gentle = GENTLE) {
    const difficulty = { ...rules.difficulty };
    const scenario = { ...rules.scenario };
    if (difficulty.dailyLimits) {
        const limits = { ...difficulty.dailyLimits };
        // Only tools this level really has: a limit of 0 means "not on this world".
        for (const id of Object.keys(limits)) if (limits[id] > 0) limits[id] += gentle.extraUses;
        difficulty.dailyLimits = limits;
    }
    if (scenario.capSlack != null) scenario.capSlack += gentle.extraCap;
    difficulty.gentle = true;
    return { ...rules, scenario, difficulty };
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
