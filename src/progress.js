// Progression rules: pure functions over (save, levels, stats).
// No DOM, no storage here; game.js wires these to src/save.js and the UI.
// All numbers are documented below so balance stays legible.
//
// UNIFIED POINTS-TO-STARS SCORING
// ------------------------------
// Every contained win earns points from one formula, then stars are read
// off the level's per-level `target` (src/config/levels.js). Losses,
// timeouts, and anything else score 0 points and 0 stars.
//
// Points formula (on a 'contained' win):
//   points = 10 * survivors
//          +  2 * totalRecovered
//          + 20 * max(0, parDays - daysUsed)
//          - 20 * powerUpsUsed
// where survivors = initialPopulation - totalDead, parDays is the level's
// scenario duration, daysUsed is the day the run ended on, and
// powerUpsUsed counts power-up charges spent that run (power-ups are easy
// mode, so each one costs a little glory).
//
// Scores are normalized per capita so a lucky high-population roll does
// not inflate stars: score = points / initialPopulation * 100.
// Star thresholds against the level's target:
//   1 star: score >= target
//   2 stars: score >= 130% of target
//   3 stars: score >= 160% of target
// A messy win below target still counts as completed (unlocking the next
// level) but banks 0 stars; region star gates then require replays for a
// cleaner run, Candy Crush style.
//
// Worked example (target 800, pop 100, par 18, 0 power-ups):
//   clean fast win (0 dead, 40 recovered, day 8): 1000+80+200 = 1280 -> 3 stars
//   decent win (3 dead, 30 recovered, day 12):     970+60+120 = 1150 -> 2 stars
//   rough win (15 dead, 20 recovered, day 17):     850+40+20  =  910 -> 1 star
//   disaster win (30 dead):                        700+...     < 800 -> 0 stars

import { levelById } from './config/levels.js';
import { scenarios } from './config/scenarios.js';

export const SCORING = {
    perSurvivor: 10,
    perRecovered: 2,
    perDayUnderPar: 20,
    perPowerUp: 20,
    perCapitaBase: 100,
    twoStarRatio: 1.3,
    threeStarRatio: 1.6,
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

function parDaysFor(level) {
    const scenario = level && scenarios[level.scenarioId];
    return scenario ? scenario.duration : 0;
}

// Raw points for one run. `stats` is the game-state stats object plus two
// run-scoped fields the game stamps in: daysUsed (day the run ended) and
// powerUpsUsed (charges spent). Missing fields default to no speed bonus
// and no penalty so bare stats shapes still score.
export function calculatePoints(outcome, stats, level) {
    if (outcome !== 'contained') return 0;
    const resolved = typeof level === 'string' ? levelById(level) : level;
    const pop = stats.initialPopulation || 0;
    if (pop <= 0) return 0;
    const survivors = Math.max(0, pop - (stats.totalDead || 0));
    const recovered = stats.totalRecovered || 0;
    const parDays = parDaysFor(resolved);
    const daysUsed = stats.daysUsed == null ? parDays : stats.daysUsed;
    const speedBonus = SCORING.perDayUnderPar * Math.max(0, parDays - daysUsed);
    const powerUpPenalty = SCORING.perPowerUp * (stats.powerUpsUsed || 0);
    return (
        SCORING.perSurvivor * survivors +
        SCORING.perRecovered * recovered +
        speedBonus -
        powerUpPenalty
    );
}

// Per-capita score (0-~1500 scale) for one run.
export function calculateScore(outcome, stats, level) {
    const pop = stats.initialPopulation || 0;
    if (pop <= 0) return 0;
    return (calculatePoints(outcome, stats, level) / pop) * SCORING.perCapitaBase;
}

// Stars from score vs the level's target. `level` may be a level object or
// a level id (resolved via LEVELS). A contained win below target still
// counts as completed but earns 0 stars.
export function calculateStars(outcome, stats, level) {
    if (outcome !== 'contained') return 0;
    const resolved = typeof level === 'string' ? levelById(level) : level;
    const target = (resolved && resolved.target) || 0;
    if (target <= 0) return 1; // no target configured: any win gets 1 star
    const score = calculateScore(outcome, stats, resolved);
    if (score >= target * SCORING.threeStarRatio) return 3;
    if (score >= target * SCORING.twoStarRatio) return 2;
    if (score >= target) return 1;
    return 0;
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
// star count per level. Funding and lives saved accumulate. The new economy
// fields (powerups, openedChests) pass through untouched.
export function recordCompletion(save, levelId, outcome, stats) {
    const level = levelById(levelId);
    const stars = calculateStars(outcome, stats, level);
    const prev = levelRecord(save, levelId);
    const next = {
        version: save.version,
        funding: save.funding + fundingAward(stars),
        livesSaved: save.livesSaved + livesSavedForRun(outcome, stats),
        levels: { ...save.levels },
        powerups: { ...(save.powerups || {}) },
        openedChests: Array.isArray(save.openedChests) ? [...save.openedChests] : [],
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
