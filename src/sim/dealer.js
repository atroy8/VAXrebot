// The dealer (round 57): deals a level, and only deals good puzzles.
// Pure and seeded: the same level and seed always give the same deal, with
// the same par, on every device (so the Daily is truly the same for
// everyone). No DOM, no clock unless the caller hands one in.
//
// A deal is one web with its first cases and marked people, the rules in
// force, the solver's best play on it (par) and the case cap that follows
// from par. To deal, candidate webs are built exactly as before
// (buildOutbreak in src/sim/setup.js), each is solved (src/sim/solver.js),
// and the first one that passes the level's puzzle spec
// (src/config/puzzle-specs.js) is kept. A replay asks for a new seed and so
// gets a new web; "Retry this web" asks for the same deal again.
//
// A candidate is rejected when:
//   unwinnable  the solver finds no winning play
//   uncertain   (hidden carriers) the day 1 tests cannot settle who carries
//               it, so the best play would need luck (or no test is needed
//               at all, because every contact of the first case carries it)
//   shallow     the best play faces red lines on fewer mornings than the
//               level's minDepth. minDepth 2 is the "3 red lines, 3 cuts"
//               case: everything at risk can be dealt with on day 1.
//   grim        even the best play lets too many people fall sick
//   obvious     simple play is already best: more than the allowed share of
//               simplePlay() runs (tools on red lines in any order, played
//               through the real game functions) reach par
//   (tutorial)  the reverse: day 1 must be able to deal with everything, so
//               that cutting the red lines in any order is the best play
// When no candidate passes within the budget the best one seen is used: a
// winnable one that failed the fewest checks, shallow last. info.accepted
// says which happened.
//
// The case cap of a deal is par + the level's cap slack (never more than
// everyone): the cap now says "this many more cases than the best play and
// the outbreak has got away", whatever the size of the web.
import { tools as TOOLS } from '../config/tools.js';
import { rollLevelRules } from '../config/difficulty-roll.js';
import { applyMetaRules, applyMetaState } from '../config/meta-rules.js';
import { SIMPLE_PLAYS, simpleHitsAllowed, twoStarSlack } from '../config/puzzle-specs.js';
import { buildOutbreak } from './setup.js';
import { canUseTool, toolDailyLimit } from './engine.js';
import { applyNodeTool, severLink, advanceDay } from './actions.js';
import { linkLocked, carrierCandidates, isInfectious, isSusceptible } from './mechanics.js';
import { mulberry32 } from './rng.js';
import { solveDeal, solveRun, applyMove, instantiate, testPrefix, DEFAULT_NODE_BUDGET } from './solver.js';

export const DEAL_RULES = Object.freeze({
    maxCandidates: 40, // webs tried before settling for the best one seen
    nodeBudget: DEFAULT_NODE_BUDGET, // solver budget per candidate
});

const endId = (ref) => (ref && typeof ref === 'object' ? ref.id : ref);

// The seed of the k-th candidate of a deal.
export function candidateSeed(seed, k) {
    return (Math.imul((seed >>> 0) ^ 0x9e3779b9, 0x85ebca6b) + Math.imul(k + 1, 0xc2b2ae35)) >>> 0;
}

// The rules a deal plays by: the level's rules with Gentle mode and the
// player's upgrades on top. meta = { gentle, upgrades } or null.
export function dealRules(level, meta = null) {
    const rolled = rollLevelRules(level);
    const rules = meta ? applyMetaRules(rolled, meta) : rolled;
    return { ...rules, spec: rules.spec || rolled.spec };
}

// Build one candidate web (not yet solved). Pure and seeded.
export function buildCandidate(level, seed, rules, tools = TOOLS) {
    const rng = mulberry32(seed);
    const { scenario, difficulty } = rules;
    const [lo, hi] = scenario.populationRange;
    const population = lo + Math.floor(rng() * (hi - lo + 1));
    let variant = level.variant || null;
    if (variant && variant.type === 'superSpreader' && variant.carrierExtra != null) {
        // A few more contacts than there are cuts on day 1, and always more
        // than anyone else (placeSuperSpreader trims anyone busier). The web
        // is the even small-world shape, so little has to be trimmed: on a
        // scale-free web a natural hub can have a dozen contacts, far more
        // than any day 1 could deal with.
        const cuts = Math.max(0, toolDailyLimit(tools.severLink, difficulty, 'severLink'));
        variant = { ...variant, degree: Math.max(4, Math.min(population - 1, cuts + variant.carrierExtra)), above: true, networkType: 'small-world' };
    }
    const out = buildOutbreak({ scenario: { ...scenario }, population, variant, rng });
    return {
        levelId: level.id,
        seed,
        population,
        scenario: { ...scenario },
        difficulty,
        nodes: out.nodes,
        links: out.links,
        initialCases: out.initialCases,
        superSpreaderId: out.superSpreaderId,
        envoyId: out.envoyId,
        hubId: out.hubId,
        travellerIds: out.travellerIds,
        frailIds: out.frailIds,
        carrierCount: out.carrierIds.length,
        upgrades: [],
    };
}

// A playable copy of a deal, with the upgrades that act on a fresh state.
export function startDeal(deal, tools = TOOLS) {
    const run = instantiate(deal, tools);
    if (deal.upgrades && deal.upgrades.length) applyMetaState(run.state, run, { upgrades: deal.upgrades });
    run.deal = deal;
    return run;
}

// ---- Simple play ----------------------------------------------------------------

// What a player does who reads the screen and nothing more: each day, tools
// on red lines in whatever order they come. For each red line (a sick or
// known carrier next to someone healthy) one of the things that deals with
// it, picked at random among those still open: cut it, vaccinate the healthy
// end, isolate the sick end, or mask an end. On hidden carrier levels the
// day starts by testing the sick person's contacts in a random order.
// `only` limits the tools (the tutorial check uses ['severLink']).
export function simpleDay(run, rng, tools = TOOLS, only = null) {
    const { state, network, difficulty } = run;
    const allowed = (id) => (!only || only.includes(id)) && (!difficulty.toolkit || difficulty.toolkit.includes(id));
    const can = (id, node = null) => allowed(id) && canUseTool(state, tools, id, difficulty, node).allowed;
    if (allowed('test')) {
        const pool = carrierCandidates(network.nodes, network.links).filter((n) => !n.testedClear);
        while (pool.length) {
            const n = pool.splice(Math.floor(rng() * pool.length), 1)[0];
            if (!can('test', n)) break;
            applyNodeTool(state, tools, 'test', n);
        }
    }
    const hot = (n) => n.state === 'infected' || n.state === 'exposed';
    for (let guard = 0; guard < 80; guard++) {
        const byId = new Map(network.nodes.map((n) => [n.id, n]));
        const red = [];
        for (const l of network.links) {
            const a = byId.get(endId(l.source));
            const b = byId.get(endId(l.target));
            if (!a || !b) continue;
            if (hot(a) && b.state === 'healthy') red.push({ link: l, sick: a, well: b });
            else if (hot(b) && a.state === 'healthy') red.push({ link: l, sick: b, well: a });
        }
        if (!red.length) break;
        const options = [];
        for (const r of red) {
            if (!linkLocked(r.link, network) && can('severLink')) options.push(() => severLink(state, network, r.link));
            if (can('vaccinate', r.well)) options.push(() => applyNodeTool(state, tools, 'vaccinate', r.well));
            if (can('quarantine', r.sick)) options.push(() => applyNodeTool(state, tools, 'quarantine', r.sick));
            if (can('mask', r.sick)) options.push(() => applyNodeTool(state, tools, 'mask', r.sick));
            if (can('mask', r.well)) options.push(() => applyNodeTool(state, tools, 'mask', r.well));
        }
        if (!options.length) break;
        options[Math.floor(rng() * options.length)]();
    }
}

// One whole simple play of a deal. Returns { outcome, cases, deaths, days }.
export function simplePlay(deal, seed, { tools = TOOLS, only = null } = {}) {
    const run = startDeal(deal, tools);
    const rng = mulberry32(seed);
    let result = null;
    for (let guard = 0; guard < 60 && !result; guard++) {
        simpleDay(run, rng, tools, only);
        result = advanceDay(run.state, run.network, { scenario: run.scenario, difficulty: run.difficulty }).result;
    }
    return { outcome: result, cases: run.state.stats.totalInfected, deaths: run.state.stats.totalDead, days: run.state.day };
}

// Does a finished play match or beat par? (3 stars, see src/progress.js.)
export function reachesPar(result, par) {
    if (!par || result.outcome !== 'contained') return false;
    return result.cases < par.cases || (result.cases === par.cases && result.deaths <= par.deaths);
}

// ---- Judging a candidate --------------------------------------------------------

// Mornings on which the best play still faces a live threat: a spreader
// joined to someone who can catch it. Played through the real game.
export function decisionDays(deal, moves, tools = TOOLS) {
    const run = startDeal({ ...deal, scenario: { ...deal.scenario, caseCap: Infinity } }, tools);
    const byDay = new Map();
    for (const m of moves) {
        if (!byDay.has(m.day)) byDay.set(m.day, []);
        byDay.get(m.day).push(m);
    }
    let days = 0;
    let result = null;
    for (let guard = 0; guard < 60 && !result; guard++) {
        const byId = new Map(run.network.nodes.map((n) => [n.id, n]));
        const threat = run.network.links.some((l) => {
            const a = byId.get(endId(l.source));
            const b = byId.get(endId(l.target));
            return (isInfectious(a) && isSusceptible(b)) || (isInfectious(b) && isSusceptible(a));
        });
        if (threat) days++;
        for (const m of byDay.get(run.state.day) || []) applySolverMove(run, m, tools);
        result = advanceDay(run.state, run.network, { scenario: run.scenario, difficulty: run.difficulty }).result;
    }
    return days;
}

function applySolverMove(run, m, tools) {
    const { state, network } = run;
    if (m.toolId === 'severLink') {
        const link = network.links.find((l) => (endId(l.source) === m.a && endId(l.target) === m.b) || (endId(l.source) === m.b && endId(l.target) === m.a));
        if (link) severLink(state, network, link);
        return;
    }
    const node = network.nodes.find((n) => n.id === m.node);
    if (node) applyNodeTool(state, tools, m.toolId, node);
}

// Solve a candidate and check it against the spec. Fills in par and the
// case cap. Returns { deal, verdict } where verdict is 'ok' or the reason
// it was rejected, plus a badness rank for picking a fallback.
export function judgeCandidate(candidate, spec, { tools = TOOLS, nodeBudget = DEAL_RULES.nodeBudget } = {}) {
    const deal = candidate;
    const sol = solveDeal(deal, { nodeBudget, tools });
    const info = { exact: !!sol.exact, nodes: sol.nodes || 0, mismatch: !!sol.mismatch };
    if (!sol.found) return { deal: { ...deal, par: null, info }, verdict: 'unwinnable', rank: 100 };
    const par = { cases: sol.cases, deaths: sol.deaths, days: sol.days, moves: sol.moves };
    const slack = Math.max(1, deal.scenario.capSlack ?? spec.capSlack ?? 3);
    const cap = Math.min(deal.population, par.cases + slack);
    const out = { ...deal, par, caseCap: cap, scenario: { ...deal.scenario, caseCap: cap }, info };
    out.twoStarSlack = twoStarSlack(deal.population);
    if (deal.carrierCount) {
        // Day 1 tests must settle who carries it, and there must be something
        // to test: a first case with only carriers for contacts gives it away.
        const prefix = testPrefix(instantiate(deal, tools), tools);
        if (!prefix.certain || prefix.tests.length === 0) return { deal: out, verdict: 'uncertain', rank: 50 };
        // In any order: with N contacts, N - 1 tests always settle it.
        const contacts = carrierCandidates(deal.nodes, deal.links).length;
        const uses = Math.max(0, toolDailyLimit(tools.test, deal.difficulty, 'test'));
        if (contacts - 1 > uses) return { deal: out, verdict: 'uncertain', rank: 50 };
    }
    info.depth = decisionDays(deal, par.moves, tools);
    if (spec.tutorial) {
        // The one level where day 1 may (and must) deal with everything at
        // risk: the best play keeps it at the first cases, so cutting the red
        // lines in any order is the best play. Checked by playing it too.
        if (par.cases > deal.initialCases) return { deal: out, verdict: 'not-simple', rank: 10 + par.cases };
        let hits = 0;
        for (let k = 0; k < SIMPLE_PLAYS; k++) if (reachesPar(simplePlay(out, candidateSeed(deal.seed, 100 + k), { tools, only: ['severLink'] }), par)) hits++;
        info.simpleHits = hits;
        if (hits < SIMPLE_PLAYS) return { deal: out, verdict: 'not-simple', rank: 10 + (SIMPLE_PLAYS - hits) };
        return { deal: out, verdict: 'ok', rank: 0 };
    }
    if (info.depth < (spec.minDepth || 1)) return { deal: out, verdict: 'shallow', rank: 30 + ((spec.minDepth || 1) - info.depth) };
    if (par.cases > (spec.maxParShare ?? 1) * deal.population) return { deal: out, verdict: 'grim', rank: 20 };
    let hits = 0;
    const allowed = simpleHitsAllowed(spec.missRate ?? 0);
    for (let k = 0; k < SIMPLE_PLAYS && hits <= allowed; k++) if (reachesPar(simplePlay(out, candidateSeed(deal.seed, 100 + k), { tools }), par)) hits++;
    info.simpleHits = hits;
    if (hits > allowed) return { deal: out, verdict: 'obvious', rank: 5 + hits };
    return { deal: out, verdict: 'ok', rank: 0 };
}

// ---- Dealing ----------------------------------------------------------------------

// A dealer that can be run in small steps (one candidate web per step), so
// the game can deal while the briefing is on screen without freezing it.
//   const d = createDealer(level, seed, { meta });
//   while (!d.step()) {}     // or a few steps per frame
//   d.deal                   // the result; d.finish() settles early
//
// meta = { gentle, upgrades }: Gentle mode and the player's shop upgrades.
// They never change which web is dealt: the web and the puzzle checks are
// always those of the plain level, the same for everyone at a seed. The meta
// rules are laid on top of the finished deal (withMeta): more uses a day, an
// earlier tool, a spare case under the cap.
export function createDealer(level, seed, { meta = null, tools = TOOLS, maxCandidates = DEAL_RULES.maxCandidates, nodeBudget = DEAL_RULES.nodeBudget } = {}) {
    const rules = dealRules(level, null);
    const spec = rules.spec;
    const tally = {};
    let k = 0;
    let best = null;
    const dealer = {
        deal: null,
        tries: 0,
        step() {
            if (dealer.deal) return true;
            const candidate = buildCandidate(level, candidateSeed(seed, k), rules, tools);
            candidate.dealSeed = seed >>> 0;
            const judged = judgeCandidate(candidate, spec, { tools, nodeBudget });
            k++;
            dealer.tries = k;
            tally[judged.verdict] = (tally[judged.verdict] || 0) + 1;
            if (!best || judged.rank < best.rank) best = judged;
            if (judged.verdict === 'ok' || k >= maxCandidates) dealer.finish();
            return !!dealer.deal;
        },
        // Settle now with the best candidate seen (at least one is tried).
        finish() {
            if (dealer.deal) return dealer.deal;
            if (!best) dealer.step();
            if (dealer.deal) return dealer.deal;
            const deal = best.deal;
            deal.info = { ...deal.info, tries: k, accepted: best.verdict === 'ok', verdict: best.verdict, tally: { ...tally } };
            deal.spec = spec;
            deal.threat = rules.threat;
            deal.pips = rules.pips;
            dealer.deal = meta ? withMeta(deal, level, meta) : deal;
            return dealer.deal;
        },
    };
    return dealer;
}

// The same deal with Gentle mode and upgrades in force.
//   cap   the plain deal's cap (plain par plus the slack) plus the cases the
//         meta rules add to the slack. It does NOT follow the new par down:
//         that is what makes an upgrade an honest edge when it comes to
//         winning.
//   par   solved again on the same web with the tools really in hand, so 3
//         stars still means the best possible play with your kit. (The plain
//         line stays legal with more tools, so par is never worse than it.)
// Returns a new deal.
export function withMeta(deal, level, meta, { tools = TOOLS, nodeBudget = DEAL_RULES.nodeBudget } = {}) {
    const plain = dealRules(level, null);
    const eased = dealRules(level, meta);
    const extra = Math.max(0, (eased.scenario.capSlack || 0) - (plain.scenario.capSlack || 0));
    const caseCap = deal.par ? Math.min(deal.population, deal.caseCap + extra) : deal.caseCap;
    const out = {
        ...deal,
        difficulty: eased.difficulty,
        scenario: { ...deal.scenario, capSlack: eased.scenario.capSlack, caseCap },
        caseCap,
        upgrades: [...((meta && meta.upgrades) || [])],
        meta: { gentle: !!(meta && meta.gentle), upgrades: [...((meta && meta.upgrades) || [])] },
        plainPar: deal.par ? { cases: deal.par.cases, deaths: deal.par.deaths, days: deal.par.days } : null,
    };
    if (!deal.par) return out;
    // Solve with the upgrades that act on the fresh state too (Field training).
    const run = startDeal({ ...out, scenario: { ...out.scenario, caseCap: Infinity } }, tools);
    const sol = solveRun(run, { nodeBudget, tools, cap: Infinity });
    if (sol.found) {
        const played = replayOn(out, sol.moves, tools);
        const better = played.outcome === 'contained' && (played.cases < deal.par.cases || (played.cases === deal.par.cases && played.deaths < deal.par.deaths) || (played.cases === deal.par.cases && played.deaths === deal.par.deaths && played.days < deal.par.days));
        if (better) out.par = { cases: played.cases, deaths: played.deaths, days: played.days, moves: sol.moves };
    }
    return out;
}

// Play a move list on a deal as the game would open it (upgrades included),
// with no cap. Returns { outcome, cases, deaths, days }.
function replayOn(deal, moves, tools) {
    const run = startDeal({ ...deal, scenario: { ...deal.scenario, caseCap: Infinity } }, tools);
    const byDay = new Map();
    for (const m of moves) {
        if (!byDay.has(m.day)) byDay.set(m.day, []);
        byDay.get(m.day).push(m);
    }
    let result = null;
    let valid = true;
    for (let guard = 0; guard < 60 && !result; guard++) {
        for (const m of byDay.get(run.state.day) || []) if (!applyMove(run, m, tools)) valid = false;
        result = advanceDay(run.state, run.network, { scenario: run.scenario, difficulty: run.difficulty }).result;
    }
    return { outcome: valid ? result : 'invalid', cases: run.state.stats.totalInfected, deaths: run.state.stats.totalDead, days: run.state.day };
}

// Deal a level in one go.
export function dealLevel(level, seed, options = {}) {
    const dealer = createDealer(level, seed, options);
    while (!dealer.step()) {
        /* one candidate per step */
    }
    return dealer.deal;
}

// The same, remembered: bots, reports and tests ask for the same deals over
// and over (four bots play every seed). Keyed by level, seed and meta.
const CACHE = new Map();
const CACHE_MAX = 4000;
export function dealLevelCached(level, seed, options = {}) {
    const meta = options.meta || null;
    const key = `${level.id}|${seed >>> 0}|${meta ? `${meta.gentle ? 'g' : ''}${(meta.upgrades || []).join('+')}` : ''}|${options.maxCandidates || ''}|${options.nodeBudget || ''}`;
    let deal = CACHE.get(key);
    if (!deal) {
        deal = dealLevel(level, seed, options);
        if (CACHE.size >= CACHE_MAX) CACHE.delete(CACHE.keys().next().value);
        CACHE.set(key, deal);
    }
    return deal;
}
