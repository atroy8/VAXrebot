// Bonus goals (wide audience round): up to three optional goals per level
// that reward clever play, not only speed. Pure functions over the
// end-of-level stats (src/sim/state.js plus the counters in
// src/sim/run-stats.js).
//
// Which goals a level offers, and their numbers, come from
// src/config/goal-targets.js, written by scripts/tune-goals.mjs: a goal is
// only offered when bots have met it on that level (it is possible) and a
// winning sensible player does not get it by default (it is not free).
// tests/wide-meta-goals.test.js checks that again with other seeds.
import { GOAL_TARGETS } from '../config/goal-targets.js';
import { toolUseTotals } from './run-stats.js';

const kitOf = (level) => (level && level.toolkit ? level.toolkit.tools : ['vaccinate', 'quarantine', 'severLink']);
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// Round 57: the old "Keep cases at half the cap or less" goal is gone. The
// cap is now par plus a few spare cases, so half of it is below the best
// possible play: it could never be met.
// id -> { label(n), short(n), param, applies(level), met(stats, ctx, n), budget(n) }
// ctx = { caseCap }. budget(n) is the restrained bot that proves the goal
// can be met (src/sim/meta-run.js), or null when plain bots are the proof.
export const GOALS = Object.freeze({
    noDeaths: {
        label: () => 'Nobody dies',
        short: () => 'No deaths',
        applies: () => true,
        met: (stats) => (stats.totalDead || 0) === 0,
        budget: () => null,
    },
    fastR: {
        param: true,
        label: (n) => `Get R under 1 by day ${n}`,
        short: (n) => `R<1 by day ${n}`,
        applies: () => true,
        met: (stats, ctx, n) => stats.rTamedDay != null && stats.rTamedDay <= n,
        budget: () => null,
    },
    noQuarantine: {
        label: () => 'Never use Quarantine',
        short: () => 'No Quarantine',
        applies: (level) => kitOf(level).includes('quarantine') && kitOf(level).length > 1,
        met: (stats) => toolUseTotals(stats).quarantine === 0,
        budget: () => ({ quarantine: 0 }),
    },
    fewVaccines: {
        param: true,
        label: (n) => `Use at most ${plural(n, 'vaccine')}`,
        short: (n) => `Max ${plural(n, 'vaccine')}`,
        applies: (level) => kitOf(level).includes('vaccinate') && kitOf(level).length > 1,
        met: (stats, ctx, n) => toolUseTotals(stats).vaccinate <= n,
        budget: (n) => ({ vaccinate: n }),
    },
    fewCuts: {
        param: true,
        label: (n) => `Cut no more than ${plural(n, 'link')}`,
        short: (n) => `Max ${plural(n, 'cut')}`,
        applies: (level) => kitOf(level).includes('severLink') && kitOf(level).length > 1,
        met: (stats, ctx, n) => toolUseTotals(stats).severLink <= n,
        budget: (n) => ({ severLink: n }),
    },
    fewMoves: {
        param: true,
        label: (n) => `Win in ${plural(n, 'move')} or fewer`,
        short: (n) => `Max ${plural(n, 'move')}`,
        applies: () => true,
        met: (stats, ctx, n) => toolUseTotals(stats).all <= n,
        budget: (n) => ({ all: n }),
    },
});

export const GOAL_IDS = Object.keys(GOALS);
export const GOALS_PER_LEVEL = 3;
export const GOAL_FUNDING = 10; // per goal, the first time it is completed

function hash(text) {
    let h = 0x811c9dc5;
    for (const ch of text) {
        h ^= ch.charCodeAt(0);
        h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
}

// The goals a level offers: up to three from its pool, chosen by level id
// and variant, always the same for the same level.
// Returns [{ id, n, label, short }].
export const TUTORIAL_LEVEL_ID = 'mizuho-1';

export function goalsFor(level, targets = GOAL_TARGETS) {
    if (!level || level.daily) return [];
    // The first level is the tutorial: the coach says cut the red lines, so
    // it offers no bonus goals (one used to ask for at most 1 cut there).
    if (level.id === TUTORIAL_LEVEL_ID) return [];
    const pool = ((targets[level.id] || {}).offered || []).filter((g) => GOALS[g.id] && GOALS[g.id].applies(level));
    const key = `${level.id}:${level.variant ? level.variant.type : 'plain'}`;
    const ranked = pool.map((g) => ({ g, k: hash(`${key}:${g.id}`) })).sort((a, b) => a.k - b.k || (a.g.id < b.g.id ? -1 : 1));
    return ranked.slice(0, GOALS_PER_LEVEL).map(({ g }) => describeGoal(g));
}

export function describeGoal({ id, n = null }) {
    const def = GOALS[id];
    return { id, n, label: def.label(n), short: def.short(n) };
}

// Is one goal met by these end-of-level stats? Goals only count on a win.
export function goalMet(goal, outcome, stats, ctx = {}) {
    if (outcome !== 'contained' || !GOALS[goal.id]) return false;
    return !!GOALS[goal.id].met(stats, ctx, goal.n);
}

// Check a level's goals. Returns [{ ...goal, met }].
export function checkGoals(goals, outcome, stats, ctx = {}) {
    return goals.map((g) => ({ ...g, met: goalMet(g, outcome, stats, ctx) }));
}

// Merge this run's completed goals into the best set saved for the level.
// Returns { done: [ids ever completed], fresh: [ids new this run], funding }.
export function mergeGoals(savedIds = [], checked = []) {
    const done = new Set(savedIds);
    const fresh = [];
    for (const g of checked) {
        if (g.met && !done.has(g.id)) {
            done.add(g.id);
            fresh.push(g.id);
        }
    }
    return { done: [...done], fresh, funding: fresh.length * GOAL_FUNDING };
}

// Pips for the level select: one per offered goal, filled when completed.
export function goalPips(level, savedIds = [], targets = GOAL_TARGETS) {
    const done = new Set(savedIds);
    return goalsFor(level, targets).map((g) => (done.has(g.id) ? '●' : '○')).join('');
}
