// Progression rules: pure functions over (save, levels, stats).
// No DOM, no storage here; game.js wires these to src/save.js and the UI.
// All numbers are documented below so balance stays legible.

// Star rules (deaths as a fraction of the level's initial population):
// - 1 star: contained the outbreak (a win), regardless of deaths.
// - 2 stars: contained with deaths at or under 5% of the population.
// - 3 stars: contained with deaths at or under 2% of the population.
// Losses, timeouts, and anything else earn 0 stars.
export const STAR_RULES = {
    twoStarDeathFraction: 0.05,
    threeStarDeathFraction: 0.02,
};

// Funding (grant) awards per completed level:
// base 50 for the win, plus 25 per star. So 1 star = 75, 2 = 100, 3 = 125.
export const FUNDING_RULES = {
    baseAward: 50,
    perStarBonus: 25,
};

export function totalStars(save) {
    return Object.values(save.levels).reduce((sum, l) => sum + (l.stars || 0), 0);
}

export function levelRecord(save, levelId) {
    return save.levels[levelId] || { stars: 0, completed: false, bestDeaths: null };
}

// Unlock rule: level 0 is open; level N opens when level N-1 is completed
// AND the level's region star requirement is met by total stars earned.
export function isLevelUnlocked(save, levels, regions, levelId) {
    const idx = levels.findIndex((l) => l.id === levelId);
    if (idx < 0) return false;
    if (idx === 0) return true;
    const prev = levelRecord(save, levels[idx - 1].id);
    if (!prev.completed) return false;
    const region = regions.find((r) => r.id === levels[idx].regionId);
    const requirement = region ? region.starRequirement : 0;
    return totalStars(save) >= requirement;
}

// Why is this level locked? Returns a short human-readable reason, or null
// when unlocked. Used by the level-select screen.
export function lockReason(save, levels, regions, levelId) {
    const idx = levels.findIndex((l) => l.id === levelId);
    if (idx < 0) return 'Unknown level.';
    if (idx === 0) return null;
    const prev = levelRecord(save, levels[idx - 1].id);
    if (!prev.completed) return `Complete "${levels[idx - 1].name}" to unlock.`;
    const region = regions.find((r) => r.id === levels[idx].regionId);
    const requirement = region ? region.starRequirement : 0;
    const have = totalStars(save);
    if (have < requirement) return `Earn ${requirement} stars to enter ${region.name} (you have ${have}).`;
    return null;
}

export function calculateStars(outcome, stats) {
    if (outcome !== 'contained') return 0;
    const pop = stats.initialPopulation || 0;
    if (pop <= 0) return 1;
    const deathFraction = stats.totalDead / pop;
    if (deathFraction <= STAR_RULES.threeStarDeathFraction) return 3;
    if (deathFraction <= STAR_RULES.twoStarDeathFraction) return 2;
    return 1;
}

export function fundingAward(stars) {
    if (stars <= 0) return 0;
    return FUNDING_RULES.baseAward + FUNDING_RULES.perStarBonus * stars;
}

// Honest count of lives saved in one run: everyone who did not die.
// Only counted on wins; a lost or timed-out run banks nothing.
export function livesSavedForRun(outcome, stats) {
    if (outcome !== 'contained') return 0;
    return Math.max(0, (stats.initialPopulation || 0) - stats.totalDead);
}

// Record a finished level. Pure: returns a NEW save object, keeping the best
// star count per level. Funding and lives saved accumulate.
export function recordCompletion(save, levelId, outcome, stats) {
    const stars = calculateStars(outcome, stats);
    const prev = levelRecord(save, levelId);
    const next = {
        version: save.version,
        funding: save.funding + fundingAward(stars),
        livesSaved: save.livesSaved + livesSavedForRun(outcome, stats),
        levels: { ...save.levels },
    };
    if (outcome === 'contained') {
        const deaths = stats.totalDead;
        next.levels[levelId] = {
            stars: Math.max(prev.stars, stars),
            completed: true,
            bestDeaths: prev.bestDeaths === null ? deaths : Math.min(prev.bestDeaths, deaths),
        };
    }
    return next;
}

export function regionProgress(save, levels, regionId) {
    const inRegion = levels.filter((l) => l.regionId === regionId);
    const completed = inRegion.filter((l) => levelRecord(save, l.id).completed).length;
    const stars = inRegion.reduce((sum, l) => sum + levelRecord(save, l.id).stars, 0);
    return { total: inRegion.length, completed, stars, maxStars: inRegion.length * 3 };
}
