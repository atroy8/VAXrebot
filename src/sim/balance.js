// Balance harness: plays every level many times with simple bots and
// reports win rates and stars. Pure and seeded, so results are repeatable
// and usable in tests (tests/balance.test.js) and from the CLI
// (`npm run balance`, see scripts/balance.mjs).
//
// Bots:
//   passive - never acts. Must never earn a 'contained' win.
//   random  - spends every daily action on a random valid target.
//   beginner - a new player who does the obvious things in no particular
//             order: cut links from the sick to the healthy, isolate the
//             sick, vaccinate their healthy contacts. Used to keep the first
//             levels winnable for people still learning the tools.
//   smart   - a reasonable player: isolate the sick, cut their links to
//             healthy people, vaccinate the people next in line, then the
//             best-connected healthy people. Not optimal, just sensible.
import { rollLevelRules } from '../config/difficulty-roll.js';
import { tools } from '../config/tools.js';
import { LEVELS } from '../config/levels.js';
import { buildOutbreak, openingLimits } from './setup.js';
import { initGameState } from './state.js';
import { canUseTool, toolDailyLimit } from './engine.js';
import { applyNodeTool, severLink, advanceDay, neighbors, allActionsSpent } from './actions.js';
import { calculateStars, calculateScore } from '../progress.js';
import { linkFactor, linkLocked, hubContacts } from './mechanics.js';

const nodeId = (ref) => (ref && typeof ref === 'object' ? ref.id : ref);

export function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// Build a level exactly the way game.js does, but with an injected rng.
// `modify` (optional) maps the rolled rules to the rules in force, the way
// the game applies Gentle mode and shop upgrades (src/config/meta-rules.js).
export function buildRun(level, rng, modify = null) {
    // Same per-play roll as the game: no picker, threat rises toward each prize box.
    const rolled = rollLevelRules(level, rng);
    const { scenario, difficulty } = modify ? modify(rolled) : rolled;
    const [lo, hi] = scenario.populationRange;
    const population = lo + Math.floor(rng() * (hi - lo + 1));
    const state = initGameState(tools, population);
    const opening = openingLimits({ level, scenario, difficulty, tools, population });
    const out = buildOutbreak({ scenario, population, variant: level.variant || null, rng, opening });
    state.stats.totalInfected += out.initialCases;
    state.envoyId = out.envoyId;
    state.superSpreaderId = out.superSpreaderId;
    return { scenario, difficulty, state, network: { nodes: out.nodes, links: out.links } };
}

const degree = (network, id) => neighbors(network, id).length;

// Classic tools this run offers: the level's toolkit, minus any tool with a
// daily limit of 0. The bots only ever reach for these.
export function offeredTools(run) {
    const kit = run.difficulty.toolkit || ['vaccinate', 'quarantine', 'severLink'];
    return kit.filter((id) => toolDailyLimit(tools[id], run.difficulty, id) > 0);
}
const byId = (network) => new Map(network.nodes.map((n) => [n.id, n]));

function tryNode(run, toolId, node) {
    if (run.difficulty.toolkit && !run.difficulty.toolkit.includes(toolId)) return false;
    const { allowed } = canUseTool(run.state, tools, toolId, run.difficulty, node);
    if (!allowed) return false;
    applyNodeTool(run.state, tools, toolId, node);
    run.trace?.push({ toolId, node }); // src/sim/hint.js reads the bot's moves
    return true;
}
function tryLink(run, link) {
    if (run.difficulty.toolkit && !run.difficulty.toolkit.includes('severLink')) return false;
    if (linkLocked(link, run.network)) return false; // the place that must stay open
    const { allowed } = canUseTool(run.state, tools, 'severLink', run.difficulty);
    if (!allowed) return false;
    severLink(run.state, run.network, link);
    run.trace?.push({ toolId: 'severLink', link });
    return true;
}

function shuffled(arr, rng) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

// Puzzle levels: what a player who read the briefing does first.
// Carrier: cut its links to healthy people, then isolate it.
// Envoy: vaccinate (or isolate) the Envoy, then guard its neighbours.
function handleVariant(run, { thorough }) {
    const net = run.network;
    const map = byId(net);
    const carrier = run.state.superSpreaderId != null ? map.get(run.state.superSpreaderId) : null;
    if (carrier && carrier.state === 'infected') {
        tryNode(run, 'quarantine', carrier);
        if (carrier.state === 'infected') {
            const cuts = neighbors(net, carrier.id).filter((nb) => map.get(nb.id)?.state === 'healthy');
            cuts.sort((a, b) => degree(net, b.id) - degree(net, a.id));
            for (const c of cuts) if (!tryLink(run, c.link)) break;
        }
    }
    const envoy = run.state.envoyId != null ? map.get(run.state.envoyId) : null;
    if (envoy && envoy.state === 'healthy') {
        // Cut any link from a sick person straight to the Envoy.
        for (const nb of neighbors(net, envoy.id)) {
            if (map.get(nb.id)?.state === 'infected') tryLink(run, nb.link);
        }
        if (!tryNode(run, 'vaccinate', envoy)) {
            const close = neighbors(net, envoy.id).some((nb) => {
                const n = map.get(nb.id);
                return n && n.state === 'healthy' && neighbors(net, n.id).some((x) => map.get(x.id)?.state === 'infected');
            });
            if (close) tryNode(run, 'quarantine', envoy);
        }
    }
    if (thorough && envoy && (envoy.state === 'vaccinated' || envoy.state === 'quarantined')) {
        // Ring the Envoy's contacts who are next to the sick.
        for (const nb of neighbors(net, envoy.id)) {
            const n = map.get(nb.id);
            if (n && n.state === 'healthy' && neighbors(net, n.id).some((x) => map.get(x.id)?.state === 'infected')) tryNode(run, 'vaccinate', n);
        }
    }
}

// Known cases the player can see: the sick, and carriers a test has found
// (state 'exposed', later planets). The bots only ever read node.state, the
// same thing the player sees, so they cannot peek at hidden carriers.
const hot = (n) => !!n && (n.state === 'infected' || n.state === 'exposed');
const offers = (run, toolId) => !run.difficulty.toolkit || run.difficulty.toolkit.includes(toolId);

// Contact tracing (levels with the Test tool): people who look healthy and
// have a known case among their contacts, the ones with the most such
// contacts first, then the best connected.
export function tracingTargets(network) {
    const map = byId(network);
    const out = [];
    for (const n of network.nodes) {
        if (n.removed || n.state !== 'healthy' || n.testedClear) continue;
        const cases = neighbors(network, n.id).filter((x) => hot(map.get(x.id))).length;
        if (cases > 0) out.push({ node: n, cases });
    }
    out.sort((a, b) => b.cases - a.cases || degree(network, b.node.id) - degree(network, a.node.id) || a.node.id - b.node.id);
    return out.map((x) => x.node);
}

export const BOTS = {
    passive() {},
    beginner(run, rng) {
        handleVariant(run, { thorough: false });
        const net = run.network;
        const map = byId(net);
        // A new player tests some contacts of the sick, in no special order.
        if (offers(run, 'test')) for (const n of shuffled(tracingTargets(net), rng)) tryNode(run, 'test', n);
        const sick = () => net.nodes.filter(hot);
        const healthyContacts = () => {
            const out = [];
            for (const n of sick()) for (const nb of neighbors(net, n.id)) if (map.get(nb.id)?.state === 'healthy') out.push(nb);
            return out;
        };
        // Lines a cut can reach: not those of a place that must stay open.
        const cuttable = () => {
            const all = healthyContacts();
            return net.nodes.some((n) => n.hub) ? all.filter((c) => !linkLocked(c.link, net)) : all;
        };
        for (const c of shuffled(cuttable(), rng)) {
            if (net.links.includes(c.link) && !tryLink(run, c.link)) break;
        }
        for (const n of shuffled(sick(), rng)) tryNode(run, 'quarantine', n);
        // A new player hands masks to the sick and the people around them.
        if (offers(run, 'mask')) {
            for (const n of shuffled(sick(), rng)) tryNode(run, 'mask', n);
            for (const c of shuffled(healthyContacts(), rng)) tryNode(run, 'mask', map.get(c.id));
        }
        const front = [...new Set(healthyContacts().map((c) => c.id))];
        for (const id of shuffled(front, rng)) tryNode(run, 'vaccinate', map.get(id));
    },
    // Random taps with the tools this level offers (item 16: its toolkit).
    random(run, rng) {
        const kit = offeredTools(run);
        if (!kit.length) return;
        for (let guard = 0; guard < 40 && !allActionsSpent(run.state, tools, run.difficulty); guard++) {
            const live = run.network.nodes.filter((n) => !n.removed);
            const toolId = kit[Math.floor(rng() * kit.length)];
            if (toolId === 'severLink') {
                if (run.network.links.length) tryLink(run, run.network.links[Math.floor(rng() * run.network.links.length)]);
            } else tryNode(run, toolId, live[Math.floor(rng() * live.length)]);
        }
    },
    smart(run) {
        handleVariant(run, { thorough: true });
        const net = run.network;
        const map = byId(net);
        // Travellers (later planets): a sick one will carry it to a new
        // group tonight, so they are isolated before anyone else.
        const roamers = net.nodes.filter((n) => n.traveller && !n.removed);
        for (const n of roamers) if (hot(n)) tryNode(run, 'quarantine', n);
        // 0. Contact tracing: test the contacts of known cases first, so
        // the carriers found today can be isolated and cut off today.
        if (offers(run, 'test')) for (const n of tracingTargets(net)) tryNode(run, 'test', n);
        const sick = net.nodes.filter(hot);
        const atRisk = (n) => n && n.state === 'healthy';
        const exposure = (id) => neighbors(net, id).filter((x) => atRisk(map.get(x.id))).length;
        // 1. Isolate the sick people with the most healthy contacts.
        for (const n of [...sick].sort((a, b) => exposure(b.id) - exposure(a.id))) {
            if (exposure(n.id) > 0) tryNode(run, 'quarantine', n);
        }
        // 2. Cut remaining links from the sick to healthy people, busiest
        // first. People who just tested clear come before the untested: a
        // cut there is sure to save someone who has not caught it yet.
        const cuts = [];
        for (const n of net.nodes.filter(hot)) {
            for (const nb of neighbors(net, n.id)) if (atRisk(map.get(nb.id))) cuts.push(nb);
        }
        // 1b. Masks (later planets) go first to the sick who could not be
        // isolated: one mask halves every line they have. Masks are plentiful,
        // so they are spent before the scarcer cuts are aimed.
        if (offers(run, 'mask')) {
            for (const n of net.nodes.filter(hot).sort((a, b) => exposure(b.id) - exposure(a.id))) {
                if (exposure(n.id) > 0) tryNode(run, 'mask', n);
            }
        }
        const clear = (id) => (map.get(id)?.testedClear ? 1 : 0);
        // A line with no mask on it carries the most risk, so it is cut first.
        const open = (c) => (linkFactor(map.get(nodeId(c.link.source)), map.get(nodeId(c.link.target))) === 1 ? 1 : 0);
        // Keep it open: lines that lead to the hub's own contacts come first,
        // since the hub's lines cannot be cut once the infection is next to it.
        const gates = hubContacts(net);
        const gate = (id) => (gates.has(id) ? 1 : 0);
        cuts.sort((a, b) => gate(b.id) - gate(a.id) || clear(b.id) - clear(a.id) || open(b) - open(a) || degree(net, b.id) - degree(net, a.id));
        for (const c of cuts) tryLink(run, c.link);
        // 3. Vaccinate healthy people next to the sick, best connected first.
        const front = new Set();
        for (const n of net.nodes.filter(hot)) {
            for (const nb of neighbors(net, n.id)) if (atRisk(map.get(nb.id))) front.add(nb.id);
        }
        for (const id of [...front].sort((a, b) => clear(b) - clear(a) || degree(net, b) - degree(net, a))) tryNode(run, 'vaccinate', map.get(id));
        // 3b. Spare masks: the best connected people next to the sick who
        // are still unprotected (no cut, no dose), then healthy travellers.
        if (offers(run, 'mask')) {
            const next = [...front].filter((id) => atRisk(map.get(id)) && neighbors(net, id).some((x) => hot(map.get(x.id))));
            for (const id of next.sort((a, b) => degree(net, b) - degree(net, a))) tryNode(run, 'mask', map.get(id));
            for (const n of roamers) if (atRisk(n)) tryNode(run, 'mask', n);
        }
        // 3c. Healthy travellers get the next doses: they are tomorrow's bridge.
        for (const n of roamers) if (atRisk(n)) tryNode(run, 'vaccinate', n);
        // 4. Spare doses go to the best-connected healthy people (hubs).
        const hubs = net.nodes.filter(atRisk).sort((a, b) => degree(net, b.id) - degree(net, a.id));
        for (const n of hubs) if (!tryNode(run, 'vaccinate', n)) break;
    },
};

// Play one run to the end. Returns { outcome, stars, score, day, deaths }.
export function playRun(level, bot, seed) {
    const rng = mulberry32(seed);
    const run = buildRun(level, rng);
    let result = null;
    for (let guard = 0; guard < 60 && !result; guard++) {
        BOTS[bot](run, rng);
        result = advanceDay(run.state, run.network, { scenario: run.scenario, difficulty: run.difficulty, rng }).result;
    }
    const stats = { ...run.state.stats, daysUsed: run.state.day };
    return { outcome: result, stars: calculateStars(result, stats, level), score: calculateScore(result, stats, level), day: run.state.day, deaths: stats.totalDead, recovered: stats.totalRecovered, pop: stats.initialPopulation };
}

// Summary per level for one bot: win rate, mean stars, outcome counts.
export function summarize(level, bot, runs = 200, seed = 1) {
    const counts = {};
    let stars = 0;
    const starDist = [0, 0, 0, 0];
    for (let i = 0; i < runs; i++) {
        const r = playRun(level, bot, seed * 100003 + i);
        counts[r.outcome] = (counts[r.outcome] || 0) + 1;
        stars += r.stars;
        starDist[r.stars]++;
    }
    return { level: level.id, bot, runs, winRate: (counts.contained || 0) / runs, meanStars: stars / runs, counts, starDist };
}

export function balanceReport(runs = 200, seed = 1) {
    return LEVELS.map((level) => ({
        level,
        smart: summarize(level, 'smart', runs, seed),
        beginner: summarize(level, 'beginner', runs, seed),
        random: summarize(level, 'random', runs, seed),
        passive: summarize(level, 'passive', runs, seed),
    }));
}
