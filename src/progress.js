// Progression rules: pure functions over (save, levels, stats).
// No DOM, no storage here; game.js wires these to src/save.js and the UI.
// All numbers are documented below so balance stays legible.
//
// STARS (round 57): RESULT AGAINST PAR
// ------------------------------------
// When a level is dealt, the solver (src/sim/solver.js) finds the best
// achievable play on that exact web: par = { cases, deaths, days }. Par is a
// concrete list of moves played through the real game, so it can always be
// reached. Stars compare the player's result with it and nothing else:
//   3 stars  a win with fewer cases than par, or the same cases and no more
//            deaths than par (beating par counts, and it can happen on big
//            webs where the solver's search is not exhaustive)
//   2 stars  a win at most 1 case over par (2 on webs of 20 people or more)
//   1 star   any other win
//   0 stars  anything that is not a win
// Days do NOT count for stars: recovery takes a fixed number of days, so
// "faster" would only reward the same moves again. Stars do not depend on
// how many people the web has or on any score. A win with a power-up can
// still be 3 stars if it matches par (the score below pays for it).
//
// SCORE (pays gold, 10 points = 1 gold)
// -------------------------------------
// Every contained win earns points from one formula. Losses score 0.
//   points = 10 * survivors
//          +  1 * people who never fell sick
//          + 20 * max(0, parDays - daysUsed)
//          - 20 * powerUpsUsed
// survivors = initialPopulation - totalDead. parDays is the solver's days for
// this deal (so only a run that ends sooner than the best line found earns
// the speed bonus, which is rare: recovery takes a fixed number of days), or
// the level's fallback when the web was not dealt. Scores are per capita so
// a big web does not pay more: score = points / initialPopulation * 100.
// Better play never scores less: fewer cases, fewer deaths, fewer power-ups.
// A typical win scores 1,050 to 1,090 (about 105 to 109 gold), close to what
// it paid before round 57 (the old formula paid 2 per person who recovered,
// which rewarded letting people fall sick; that became 1 per person kept
// well).

import { levelById } from './config/levels.js';
import { scenarios } from './config/scenarios.js';
import { twoStarSlack } from './config/puzzle-specs.js';

export const SCORING = {
    perSurvivor: 10,
    perKeptWell: 1,
    perDayUnderPar: 20,
    perPowerUp: 20,
    perCapitaBase: 100,
    speedGrace: 0,
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

// Par days for the score's speed bonus when a web was not dealt: a level's
// parDays when set (src/config/levels.js), otherwise its scenario duration.
export function parDaysFor(level) {
    if (level && level.tuning && level.tuning.parDays != null) return level.tuning.parDays;
    const scenario = level && scenarios[level.scenarioId];
    return scenario ? scenario.duration : 0;
}

// The day count the speed bonus is measured from on this run: the solver's
// days for the deal plus the grace, or the level's fallback.
export function speedParDays(stats, level) {
    if (stats && stats.par && stats.par.days != null) return stats.par.days + SCORING.speedGrace;
    return parDaysFor(level);
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
    const keptWell = Math.max(0, pop - (stats.totalInfected || 0));
    const parDays = speedParDays(stats, resolved);
    const daysUsed = stats.daysUsed == null ? parDays : stats.daysUsed;
    const speedBonus = SCORING.perDayUnderPar * Math.max(0, parDays - daysUsed);
    const powerUpPenalty = SCORING.perPowerUp * (stats.powerUpsUsed || 0);
    return SCORING.perSurvivor * survivors + SCORING.perKeptWell * keptWell + speedBonus - powerUpPenalty;
}

// Per-capita score (0-~1500 scale) for one run.
export function calculateScore(outcome, stats, level) {
    const pop = stats.initialPopulation || 0;
    if (pop <= 0) return 0;
    return (calculatePoints(outcome, stats, level) / pop) * SCORING.perCapitaBase;
}

// Stars for a result against par. result = { outcome, cases, deaths,
// population }, par = { cases, deaths } or null. Without a par (a web that
// was not dealt) any win is 1 star.
export function starsAgainstPar(result, par) {
    if (!result || result.outcome !== 'contained') return 0;
    if (!par) return 1;
    const cases = result.cases || 0;
    const deaths = result.deaths || 0;
    if (cases < par.cases || (cases === par.cases && deaths <= (par.deaths || 0))) return 3;
    if (cases <= par.cases + twoStarSlack(result.population || 0)) return 2;
    return 1;
}

// Stars for a finished run. stats.par is put there when the level is dealt
// (instantiate in src/sim/solver.js). `level` is not needed any more and is
// kept so callers need not change.
export function calculateStars(outcome, stats, _level) {
    return starsAgainstPar({ outcome, cases: stats.totalInfected, deaths: stats.totalDead, population: stats.initialPopulation }, stats.par || null);
}

// Round 55 (Adam): points turn into gold at a fixed rate, and gold buys the
// power-ups. Every POINTS_PER_GOLD points of a win's score is 1 gold, so a
// better run always pays more (a typical win scores 900 to 1100: about 90 to
// 110 gold). A loss scores nothing and pays nothing.
export const POINTS_PER_GOLD = 10;

export function goldForScore(score) {
    return Math.max(0, Math.floor((Number(score) || 0) / POINTS_PER_GOLD));
}

export function goldAward(outcome, stats, level) {
    return goldForScore(calculateScore(outcome, stats, level));
}

// The old star based award (75, 100, 125). No longer paid; kept so old
// reports and tests that quote it still read.
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
        ...save, // newer save fields (settings, upgrades, goals, daily) pass through
        version: save.version,
        funding: save.funding + goldAward(outcome, stats, levelId),
        livesSaved: save.livesSaved + livesSavedForRun(outcome, stats),
        levels: { ...save.levels },
        powerups: { ...(save.powerups || {}) },
        openedChests: Array.isArray(save.openedChests) ? [...save.openedChests] : [],
    };
    if (outcome === 'contained') {
        const deaths = stats.totalDead;
        next.levels[levelId] = {
            ...(save.levels[levelId] || {}), // keeps clear badges set elsewhere
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
