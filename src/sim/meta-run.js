// Bot runs for the meta-game checks (wide audience round): the same levels
// and bots as src/sim/balance.js, plus the things the meta-game adds:
//   modify   rules modifier (Gentle mode, shop upgrades; src/config/meta-rules.js)
//   upgrades state modifier for upgrades that act on the fresh state
//   budget   a "restrained" player: total uses allowed per tool for the
//            whole level ({ vaccinate, quarantine, severLink, all }), used
//            to prove that bonus goals such as "Use at most 2 vaccines" can
//            be met. The bot plans its day as usual and the plan is cut to
//            the budget, keeping its own priority order.
// Pure and seeded. With no options a run is identical to playRun().
import { tools } from '../config/tools.js';
import { buildRun, mulberry32, BOTS } from './balance.js';
import { canUseTool } from './engine.js';
import { applyNodeTool, severLink, advanceDay, caseCapFor } from './actions.js';
import { calculateStars, goldAward } from '../progress.js';
import { careBonus } from '../rewards.js';
import { applyMetaState } from '../config/meta-rules.js';
import { planDay } from './hint.js';
import { toolUseTotals } from './run-stats.js';

function playBudgetDay(run, bot, rng, budget) {
    for (const move of planDay(run.state, run.network, run.difficulty, bot, rng)) {
        const used = toolUseTotals(run.state.stats);
        if (budget.all != null && used.all >= budget.all) break;
        if (budget[move.toolId] != null && used[move.toolId] >= budget[move.toolId]) continue;
        const { allowed } = canUseTool(run.state, tools, move.toolId, run.difficulty, move.node || null);
        if (!allowed) continue;
        if (move.link) {
            if (run.network.links.includes(move.link)) severLink(run.state, run.network, move.link);
        } else applyNodeTool(run.state, tools, move.toolId, move.node);
    }
}

// Play one run. Returns { outcome, stats, caseCap, stars, day, funding }.
export function playMetaRun(level, { bot = 'smart', seed = 1, modify = null, upgrades = [], budget = null } = {}) {
    const rng = mulberry32(seed);
    const run = buildRun(level, rng, modify);
    applyMetaState(run.state, run, { upgrades });
    let result = null;
    for (let guard = 0; guard < 60 && !result; guard++) {
        if (budget) playBudgetDay(run, bot, rng, budget);
        else BOTS[bot](run, rng);
        result = advanceDay(run.state, run.network, { scenario: run.scenario, difficulty: run.difficulty, rng }).result;
    }
    const stats = { ...run.state.stats, daysUsed: run.state.day };
    const stars = calculateStars(result, stats, level);
    return {
        outcome: result,
        stats,
        caseCap: caseCapFor(run.state, run.scenario),
        stars,
        day: run.state.day,
        funding: goldAward(result, stats, level) + careBonus(result, stats, level).total,
    };
}

// Many runs of one style. Returns { runs: [...], winRate, meanStars, meanFundingPerWin }.
export function metaSummary(level, options = {}, count = 200, seed = 1) {
    const runs = [];
    for (let i = 0; i < count; i++) runs.push(playMetaRun(level, { ...options, seed: seed * 100003 + i }));
    const wins = runs.filter((r) => r.outcome === 'contained');
    return {
        runs,
        winRate: wins.length / count,
        meanStars: runs.reduce((a, r) => a + r.stars, 0) / count,
        meanFundingPerWin: wins.length ? wins.reduce((a, r) => a + r.funding, 0) / wins.length : 0,
    };
}
