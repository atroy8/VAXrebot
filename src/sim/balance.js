// Balance harness: plays every level many times with simple bots and
// reports win rates and stars. Pure and seeded, so results are repeatable
// and usable in tests (tests/balance.test.js) and from the CLI
// (`npm run balance`, see scripts/balance.mjs).
// Round 57: a run is a deal (src/sim/dealer.js). The seed picks the web the
// dealer deals, and nothing after the deal is random except the choices of
// the bots that tap at random (beginner, random), which are seeded too.
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
import { tools } from '../config/tools.js';
import { LEVELS } from '../config/levels.js';
import { dealLevelCached, startDeal } from './dealer.js';
import { canUseTool, toolDailyLimit } from './engine.js';
import { applyNodeTool, severLink, advanceDay, neighbors, allActionsSpent } from './actions.js';
import { calculateStars, calculateScore } from '../progress.js';
import { maskedLink, linkLocked, hubContacts } from './mechanics.js';
import { mulberry32 } from './rng.js';

export { mulberry32 };

const nodeId = (ref) => (ref && typeof ref === 'object' ? ref.id : ref);

// Build a level exactly the way game.js does: deal it (src/sim/dealer.js)
// and open a playable copy. `seed` is the deal's seed; `meta` is
// { gentle, upgrades } as the game applies them (src/config/meta-rules.js).
// Deals are cached, so the four bots play the same web for the same seed.
export function buildRun(level, seed, meta = null) {
    // A dice function (the old signature) is read once for the deal's seed.
    const dealSeed = typeof seed === 'function' ? Math.floor(seed() * 4294967296) : seed;
    const deal = dealLevelCached(level, dealSeed >>> 0, meta ? { meta } : {});
    return startDeal(deal, tools);
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
        // Isolating the carrier only helps while they still threaten someone.
        if (neighbors(net, carrier.id).some((nb) => map.get(nb.id)?.state === 'healthy')) tryNode(run, 'quarantine', carrier);
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
    // Round 57: under predictable spread a red line is a certainty, so the
    // sensible player thinks in people, not lines: a person is only safe
    // tonight when EVERY red line to them is dealt with. Isolate the sick who
    // threaten the most people, vaccinate the people with the most red lines
    // (one dose does the work of several cuts), then spend cuts on whoever
    // can be saved completely, cheapest first. Still one day at a time and
    // never looking ahead: sensible, not optimal.
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
        const atRisk = (n) => n && n.state === 'healthy';
        const exposure = (id) => neighbors(net, id).filter((x) => atRisk(map.get(x.id))).length;
        // 1. Isolate the sick people with the most healthy contacts.
        for (const n of net.nodes.filter(hot).sort((a, b) => exposure(b.id) - exposure(a.id) || a.id - b.id)) {
            if (exposure(n.id) > 0) tryNode(run, 'quarantine', n);
        }
        // Who is in danger tonight, and through which lines. A masked line
        // that has not charged yet is tomorrow's problem.
        const front = () => {
            const out = new Map();
            for (const n of net.nodes.filter(hot)) {
                for (const nb of neighbors(net, n.id)) {
                    const other = map.get(nb.id);
                    if (!atRisk(other)) continue;
                    if (maskedLink(n, other) && !nb.link.charged) continue;
                    if (!out.has(other.id)) out.set(other.id, []);
                    out.get(other.id).push(nb.link);
                }
            }
            return out;
        };
        const onward = (id) => neighbors(net, id).filter((x) => atRisk(map.get(x.id))).length;
        // Keep it open: the hub's own contacts matter most, since the hub's
        // lines cannot be cut once the infection is next to it.
        const gates = hubContacts(net);
        const gate = (id) => (gates.has(id) || map.get(id)?.hub ? 1 : 0);
        // 2. Vaccinate the people with the most red lines.
        for (const [id] of [...front()].sort((a, b) => gate(b[0]) - gate(a[0]) || b[1].length - a[1].length || onward(b[0]) - onward(a[0]) || a[0] - b[0])) {
            if (!tryNode(run, 'vaccinate', map.get(id))) break;
        }
        // 3. Cuts on whoever can be saved completely, cheapest first, the
        // best connected first among equals.
        const cutsLeft = () => (offers(run, 'severLink') && canUseTool(run.state, tools, 'severLink', run.difficulty).allowed ? toolDailyLimit(tools.severLink, run.difficulty, 'severLink') - run.state.dailyUsage.severLink : 0);
        for (const [id, links] of [...front()].sort((a, b) => gate(b[0]) - gate(a[0]) || a[1].length - b[1].length || onward(b[0]) - onward(a[0]) || a[0] - b[0])) {
            if (links.some((l) => linkLocked(l, net))) continue;
            if (links.length > cutsLeft()) continue;
            for (const l of links) tryLink(run, l);
        }
        // 4. Masks buy a night: first the sick who still threaten someone,
        // then the people still in danger.
        if (offers(run, 'mask')) {
            const still = front();
            const threat = new Map();
            for (const links of still.values()) {
                for (const l of links) {
                    const a = map.get(nodeId(l.source));
                    const b = map.get(nodeId(l.target));
                    const sick = hot(a) ? a : b;
                    threat.set(sick, (threat.get(sick) || 0) + 1);
                }
            }
            for (const [n] of [...threat].sort((a, b) => b[1] - a[1] || a[0].id - b[0].id)) tryNode(run, 'mask', n);
            for (const id of front().keys()) tryNode(run, 'mask', map.get(id));
        }
        // 5. Spare cuts still slow nothing by themselves, but a spare dose
        // helps: healthy travellers (tomorrow's bridge), then the best
        // connected healthy people next to the outbreak.
        for (const n of roamers) if (atRisk(n)) tryNode(run, 'vaccinate', n);
        const near = net.nodes.filter((n) => atRisk(n) && onward(n.id) > 0).sort((a, b) => degree(net, b.id) - degree(net, a.id) || a.id - b.id);
        for (const n of near) if (!tryNode(run, 'vaccinate', n)) break;
    },
};

// Play one run to the end. Returns { outcome, stars, score, day, deaths }.
// The seed picks the deal; the bots' own random choices use a stream from
// the same seed, so a run is repeatable.
export function playRun(level, bot, seed) {
    return playDeal(dealLevelCached(level, seed >>> 0), bot, seed, level);
}

// The same on a deal already in hand (scripts/tune-puzzles.mjs).
export function playDeal(deal, bot, seed = 1, level = null) {
    const rng = mulberry32(seed ^ 0x5bd1e995);
    const run = startDeal(deal, tools);
    let result = null;
    for (let guard = 0; guard < 60 && !result; guard++) {
        BOTS[bot](run, rng);
        result = advanceDay(run.state, run.network, { scenario: run.scenario, difficulty: run.difficulty }).result;
    }
    const stats = { ...run.state.stats, daysUsed: run.state.day };
    return { outcome: result, stars: calculateStars(result, stats, level), score: calculateScore(result, stats, level), day: run.state.day, deaths: stats.totalDead, cases: stats.totalInfected, par: stats.par || null, recovered: stats.totalRecovered, pop: stats.initialPopulation };
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
