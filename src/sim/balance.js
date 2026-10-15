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
import { levelRules } from '../config/level-rules.js';
import { tools } from '../config/tools.js';
import { LEVELS } from '../config/levels.js';
import { generateNetwork } from './network.js';
import { initGameState } from './state.js';
import { canUseTool } from './engine.js';
import { applyNodeTool, severLink, advanceDay, neighbors, allActionsSpent } from './actions.js';
import { calculateStars } from '../progress.js';

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
export function buildRun(level, rng) {
    const { scenario, difficulty } = levelRules(level);
    const [lo, hi] = scenario.populationRange;
    const population = lo + Math.floor(rng() * (hi - lo + 1));
    const state = initGameState(tools, population);
    const nodes = Array.from({ length: population }, (_, i) => ({ id: i, state: 'healthy', daysInfected: 0, removed: false }));
    const saved = Math.random;
    Math.random = rng; // network generators use Math.random
    let links;
    try {
        ({ links } = generateNetwork(scenario.networkType, population));
    } finally {
        Math.random = saved;
    }
    for (let i = 0; i < scenario.initialInfected; i++) {
        let node;
        do node = nodes[Math.floor(rng() * population)];
        while (node.state === 'infected');
        node.state = 'infected';
        state.stats.totalInfected++;
    }
    return { scenario, difficulty, state, network: { nodes, links } };
}

const degree = (network, id) => neighbors(network, id).length;
const byId = (network) => new Map(network.nodes.map((n) => [n.id, n]));

function tryNode(run, toolId, node) {
    const { allowed } = canUseTool(run.state, tools, toolId, run.difficulty, node);
    if (!allowed) return false;
    applyNodeTool(run.state, tools, toolId, node);
    return true;
}
function tryLink(run, link) {
    const { allowed } = canUseTool(run.state, tools, 'severLink', run.difficulty);
    if (!allowed) return false;
    severLink(run.state, run.network, link);
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

export const BOTS = {
    passive() {},
    beginner(run, rng) {
        const net = run.network;
        const map = byId(net);
        const sick = () => net.nodes.filter((n) => n.state === 'infected');
        const healthyContacts = () => {
            const out = [];
            for (const n of sick()) for (const nb of neighbors(net, n.id)) if (map.get(nb.id)?.state === 'healthy') out.push(nb);
            return out;
        };
        for (const c of shuffled(healthyContacts(), rng)) {
            if (net.links.includes(c.link) && !tryLink(run, c.link)) break;
        }
        for (const n of shuffled(sick(), rng)) tryNode(run, 'quarantine', n);
        const front = [...new Set(healthyContacts().map((c) => c.id))];
        for (const id of shuffled(front, rng)) tryNode(run, 'vaccinate', map.get(id));
    },
    random(run, rng) {
        for (let guard = 0; guard < 40 && !allActionsSpent(run.state, tools, run.difficulty); guard++) {
            const live = run.network.nodes.filter((n) => !n.removed);
            const pick = rng();
            if (pick < 0.34 && run.network.links.length) tryLink(run, run.network.links[Math.floor(rng() * run.network.links.length)]);
            else tryNode(run, pick < 0.67 ? 'vaccinate' : 'quarantine', live[Math.floor(rng() * live.length)]);
        }
    },
    smart(run) {
        const net = run.network;
        const map = byId(net);
        const sick = net.nodes.filter((n) => n.state === 'infected');
        const atRisk = (n) => n && n.state === 'healthy';
        const exposure = (id) => neighbors(net, id).filter((x) => atRisk(map.get(x.id))).length;
        // 1. Isolate the sick people with the most healthy contacts.
        for (const n of [...sick].sort((a, b) => exposure(b.id) - exposure(a.id))) {
            if (exposure(n.id) > 0) tryNode(run, 'quarantine', n);
        }
        // 2. Cut remaining links from the sick to healthy people, busiest first.
        const cuts = [];
        for (const n of net.nodes.filter((x) => x.state === 'infected')) {
            for (const nb of neighbors(net, n.id)) if (atRisk(map.get(nb.id))) cuts.push(nb);
        }
        cuts.sort((a, b) => degree(net, b.id) - degree(net, a.id));
        for (const c of cuts) tryLink(run, c.link);
        // 3. Vaccinate healthy people next to the sick, best connected first.
        const front = new Set();
        for (const n of net.nodes.filter((x) => x.state === 'infected')) {
            for (const nb of neighbors(net, n.id)) if (atRisk(map.get(nb.id))) front.add(nb.id);
        }
        for (const id of [...front].sort((a, b) => degree(net, b) - degree(net, a))) tryNode(run, 'vaccinate', map.get(id));
        // 4. Spare doses go to the best-connected healthy people (hubs).
        const hubs = net.nodes.filter(atRisk).sort((a, b) => degree(net, b.id) - degree(net, a.id));
        for (const n of hubs) if (!tryNode(run, 'vaccinate', n)) break;
    },
};

// Play one run to the end. Returns { outcome, stars, day, deaths }.
export function playRun(level, bot, seed) {
    const rng = mulberry32(seed);
    const run = buildRun(level, rng);
    let result = null;
    for (let guard = 0; guard < 60 && !result; guard++) {
        BOTS[bot](run, rng);
        result = advanceDay(run.state, run.network, { scenario: run.scenario, difficulty: run.difficulty, rng }).result;
    }
    const stats = { ...run.state.stats, daysUsed: run.state.day };
    return { outcome: result, stars: calculateStars(result, stats, level), day: run.state.day, deaths: stats.totalDead, recovered: stats.totalRecovered, pop: stats.initialPopulation };
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
