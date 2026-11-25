// One shared outbreak setup for the game (src/game.js) and the balance bots
// (src/sim/balance.js), so both play exactly the same level. Pure apart
// from the network generators reading Math.random, which is swapped for
// the injected rng while they run.
import { generateNetwork } from './network.js';
import { placeSuperSpreader, placeEnvoy, placeHub } from './variants.js';
import { toolDailyLimit, toolAvailableDay } from './engine.js';
import { caseCapFor } from './actions.js';
import { markTravellers } from './mechanics.js';

// Round 47, a fair opening: on the learning planets a level must never be
// lost at the end of day 1 when the player makes the best day 1 moves. With patient zero a hub (5 contacts on a web of
// 8) and only 2 cuts on day 1, the 3 contacts left could all catch it and
// hit the case cap before Vaccinate or Quarantine ever opened. Randomly
// placed first cases are now re-rolled until the worst day 1 still leaves
// room under the cap. Puzzle placements (super-spreader, Envoy) are left as
// designed.
const OPENING_REROLLS = 60;

// Day 1 actions the player has with the level's toolkit, per tool.
export function dayOneBudget(difficulty, tools) {
    const budget = { severLink: 0, vaccinate: 0, quarantine: 0 };
    if (!difficulty || !tools) return budget;
    const kit = difficulty.toolkit || ['vaccinate', 'quarantine', 'severLink'];
    for (const id of kit) {
        const tool = tools[id];
        if (!tool || tool.consumable || !(id in budget)) continue;
        if (toolAvailableDay(tool, difficulty, id) > 1) continue;
        budget[id] = Math.max(0, toolDailyLimit(tool, difficulty, id));
    }
    return budget;
}

// Total day 1 actions (all classic tools).
export function dayOneActions(difficulty, tools) {
    const b = dayOneBudget(difficulty, tools);
    return b.severLink + b.vaccinate + b.quarantine;
}

// The fair opening covers the learning planets (easy levels: Mizuho and
// Hanabi). Later planets keep their harder openings by design for now.
export function hasFairOpening(level) {
    return !!level && level.difficultyId === 'easy';
}

// Opening limits for buildOutbreak: the case cap and the day 1 budget,
// or null when the level does not get a fair opening.
export function openingLimits({ level, scenario, difficulty, tools, population }) {
    if (!hasFairOpening(level)) return null;
    return {
        cap: caseCapFor({ stats: { initialPopulation: population } }, scenario),
        budget: dayOneBudget(difficulty, tools),
    };
}

const endId = (end) => (typeof end === 'object' && end !== null ? end.id : end);

// Cases at the end of day 1 if every contact the player leaves open
// catches it, after the best day 1 response:
// - isolating a sick person closes all of their lines (biggest spreaders first),
// - a vaccine shields one person whatever their number of sick contacts,
// - a cut shields a person only once all their lines to the sick are cut.
export function worstDayOneCases(nodes, links, budget = {}) {
    const sick = new Set(nodes.filter((n) => n.state === 'infected').map((n) => n.id));
    const healthy = new Set(nodes.filter((n) => n.state === 'healthy').map((n) => n.id));
    const pairs = [];
    for (const l of links) {
        const s = endId(l.source);
        const t = endId(l.target);
        if (sick.has(s) && healthy.has(t)) pairs.push([s, t]);
        else if (sick.has(t) && healthy.has(s)) pairs.push([t, s]);
    }
    // Isolate the sick people with the most open lines first.
    const isolated = new Set();
    let q = budget.quarantine || 0;
    const perSick = new Map();
    for (const [s] of pairs) perSick.set(s, (perSick.get(s) || 0) + 1);
    for (const [s] of [...perSick].sort((a, b) => b[1] - a[1])) {
        if (q <= 0) break;
        isolated.add(s);
        q--;
    }
    const cost = new Map();
    for (const [s, h] of pairs) if (!isolated.has(s)) cost.set(h, (cost.get(h) || 0) + 1);
    // Vaccines on the people with the most sick contacts, cuts on the rest, cheapest first.
    const order = [...cost.values()].sort((a, b) => b - a);
    const rest = order.slice(Math.min(order.length, budget.vaccinate || 0)).sort((a, b) => a - b);
    let cuts = budget.severLink || 0;
    let open = 0;
    for (const c of rest) {
        if (c <= cuts) cuts -= c;
        else open++;
    }
    return sick.size + open;
}

export function isFairOpening(nodes, links, opening) {
    if (!opening || !Number.isFinite(opening.cap)) return true;
    return worstDayOneCases(nodes, links, opening.budget) < opening.cap;
}

export function buildOutbreak({ scenario, population, variant = null, rng = Math.random, opening = null }) {
    const nodes = Array.from({ length: population }, (_, i) => ({ id: i, state: 'healthy', daysInfected: 0, removed: false }));
    const saved = Math.random;
    Math.random = rng;
    let links;
    try {
        ({ links } = generateNetwork(scenario.networkType, population, rng, scenario.webDegree));
    } finally {
        Math.random = saved;
    }
    let initialCases = 0;
    let superSpreaderId = null;
    if (variant && variant.type === 'superSpreader') {
        superSpreaderId = placeSuperSpreader(nodes, links, variant, rng).id;
        initialCases = 1;
    }
    const want = Math.min(population, Math.max(initialCases, scenario.initialInfected));
    const fixed = new Set(nodes.filter((n) => n.state === 'infected').map((n) => n.id));
    const placeRandomCases = () => {
        let placed = fixed.size;
        while (placed < want) {
            const node = nodes[Math.floor(rng() * population)];
            if (node.state === 'infected') continue;
            node.state = 'infected';
            placed++;
        }
        return placed;
    };
    initialCases = placeRandomCases();
    // Fair opening (round 47): re-roll who starts sick until day 1 cannot
    // end the level. Only the random picks move; a puzzle's carrier stays.
    // When no fair start exists on this web, keep the least harsh one found.
    if (opening && want > fixed.size && Number.isFinite(opening.cap)) {
        const sickIds = () => nodes.filter((n) => n.state === 'infected').map((n) => n.id);
        let best = { worst: worstDayOneCases(nodes, links, opening.budget), ids: sickIds() };
        for (let tries = 0; tries < OPENING_REROLLS && best.worst >= opening.cap; tries++) {
            for (const n of nodes) if (n.state === 'infected' && !fixed.has(n.id)) n.state = 'healthy';
            initialCases = placeRandomCases();
            const worst = worstDayOneCases(nodes, links, opening.budget);
            if (worst < best.worst) best = { worst, ids: sickIds() };
        }
        const keep = new Set(best.ids);
        for (const n of nodes) n.state = keep.has(n.id) ? 'infected' : 'healthy';
        initialCases = keep.size;
    }
    let envoyId = null;
    if (variant && variant.type === 'envoy') {
        const envoy = placeEnvoy(nodes, links, variant, rng);
        envoyId = envoy ? envoy.id : null;
    }
    // Keep it open (later planets): the scenario's goal marks one hub.
    let hubId = null;
    if (scenario.goal && scenario.goal.type === 'keepOpen') {
        const hub = placeHub(nodes, links, scenario.goal, rng);
        hubId = hub ? hub.id : null;
    }
    // Travellers (later planets): a few people who swap a contact each night.
    const travellerIds = scenario.travellers ? markTravellers(nodes, scenario.travellers, rng).map((n) => n.id) : [];
    return { nodes, links, initialCases, superSpreaderId, envoyId, hubId, travellerIds };
}
