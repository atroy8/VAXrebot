// Pure player actions and the day step, shared by the game (src/game.js),
// the balance bot (scripts/balance.mjs) and the tests. No DOM, no audio.
// Keeping one code path means the bot measures the same rules people play.
import { simulateSpread, updateOutcomes, checkGameOver, toolDailyLimit, toolAvailableDay, resolveAftermath, LOSS_RESULTS } from './engine.js';
import { noteToolUse, noteDayStart, noteDayEnd } from './run-stats.js';

import { isCarrier, incubationOf, maskFactorOf, linkFactor, meanIncubation, travelNight } from './mechanics.js';

const nodeId = (ref) => (ref && typeof ref === 'object' ? ref.id : ref);

// Vaccinate or quarantine one node. Caller validates with canUseTool first.
// Quarantining a sick node is isolation, not a cure: it keeps the
// sickWhileQuarantined flag so the sim keeps ticking it and counts it active.
// Test and Mask (later planets, src/sim/mechanics.js) return what happened:
// { positive } for a test, { masked: true } for a mask. Neither counts as
// protecting someone: a test only finds out, and a mask only lowers the odds.
export function applyNodeTool(state, tools, toolId, node) {
    state.dailyUsage[toolId]++;
    noteToolUse(state, toolId); // bookkeeping only (src/sim/run-stats.js)
    if (tools[toolId].oncePerPerson) state.usedOnPeople.add(`${toolId}-${node.id}`);
    if (toolId === 'test') {
        state.stats.tests = (state.stats.tests || 0) + 1;
        if (isCarrier(node)) {
            // Found a carrier: now a known case, shown as 'exposed'.
            node.state = 'exposed';
            node.knownCase = true;
            state.stats.totalInfected++;
            state.stats.testsPositive = (state.stats.testsPositive || 0) + 1;
            return { positive: true };
        }
        node.testedClear = true; // a small mark for the rest of today
        return { positive: false };
    }
    if (toolId === 'mask') {
        node.masked = true;
        state.stats.masksGiven = (state.stats.masksGiven || 0) + 1;
        return { masked: true };
    }
    if (toolId === 'vaccinate') {
        node.state = 'vaccinated';
    } else if (toolId === 'quarantine') {
        node.sickWhileQuarantined = node.state === 'infected';
        node.state = 'quarantined';
        if (node.sickWhileQuarantined) state.stats.treated = (state.stats.treated || 0) + 1;
        else state.stats.isolated = (state.stats.isolated || 0) + 1;
    }
    state.stats.totalProtected++;
    return {};
}

// Remove one link from the network. Caller validates with canUseTool first.
export function severLink(state, network, link) {
    state.dailyUsage.severLink++;
    state.stats.linksSevered++;
    network.links = network.links.filter((l) => l !== link);
}

// One full day: advance the counter, reset daily tool usage, spread,
// resolve recoveries and deaths, then check for an outcome.
// Returns { spread: {events, count}, outcomes, result, activeBefore }.
export function advanceDay(state, network, { scenario, difficulty, rng = Math.random }) {
    const activeBefore = activeInfectiousCount(network);
    noteDayStart(state, network, liveR(network, scenario.baseTransmissionRate * difficulty.transmissionMultiplier, difficulty.recoveryTime));
    state.day++;
    for (const tool of Object.keys(state.dailyUsage)) state.dailyUsage[tool] = 0;
    endStayHome(state, network);
    // Yesterday's "tested clear" marks are out of date at dawn.
    for (const n of network.nodes) if (n.testedClear) delete n.testedClear;
    const rate = scenario.baseTransmissionRate * difficulty.transmissionMultiplier;
    const spread = simulateSpread(state, network, rate, rng, difficulty);
    const outcomes = updateOutcomes(state, network, difficulty.recoveryTime, difficulty.fatalityRate, rng);
    // Travellers (later planets) move on after the night's spread, so their
    // new line is there to see in the morning. spread.travel lists the moves.
    spread.travel = scenario.travellers ? travelNight(state, network, rng) : [];
    const result = checkGameOver(state, network, scenario.duration, caseCapFor(state, scenario), scenario.goal || null);
    noteDayEnd(state, network);
    // Item 20: a lost level still costs the lives of those left sick.
    const aftermath = LOSS_RESULTS.includes(result)
        ? resolveAftermath(state, network, difficulty.recoveryTime, difficulty.fatalityRate, rng)
        : [];
    return { spread, outcomes, result, activeBefore, aftermath };
}

// Stay Home Pay (src/economy.js) sends sick people home for a few days.
// When the break ends, anyone still sick goes back out and can spread again,
// so the power-up buys time but never ends an outbreak by itself.
export function endStayHome(state, network) {
    const back = [];
    for (const n of network.nodes) {
        if (n.homeUntilDay == null) continue;
        if (n.state === 'quarantined' && n.sickWhileQuarantined) {
            if (state.day < n.homeUntilDay) continue;
            n.state = 'infected';
            n.sickWhileQuarantined = false;
            back.push(n);
        }
        delete n.homeUntilDay;
    }
    return back;
}

// Total cases allowed before the outbreak counts as overwhelmed:
// ceil(caseCapFraction * initial population). No fraction = no cap.
export function caseCapFor(state, scenario) {
    if (scenario.caseCapFraction == null) return Infinity;
    return Math.ceil(scenario.caseCapFraction * state.stats.initialPopulation);
}

// Nodes able to infect others right now (quarantined nodes cannot).
export function activeInfectiousCount(network) {
    return network.nodes.filter((n) => n.state === 'infected').length;
}

// Daily tool uses left across the classic tools available today.
// Power-ups are charges, not daily actions, so they never count here.
export function actionsRemaining(state, tools, difficulty) {
    let left = 0;
    for (const [id, tool] of Object.entries(tools)) {
        if (tool.consumable) continue;
        if (state.day < toolAvailableDay(tool, difficulty, id)) continue;
        left += Math.max(0, toolDailyLimit(tool, difficulty, id) - (state.dailyUsage[id] || 0));
    }
    return left;
}

// True when the player has used every daily action. The game uses this to
// start the auto-advance countdown (power-ups and Next day stay available).
export function allActionsSpent(state, tools, difficulty) {
    return actionsRemaining(state, tools, difficulty) === 0;
}

// Effective reproduction number for the day just simulated: new infections
// per person who was infectious at the start of the day, times the days a
// case stays infectious. Returns null when nobody was infectious.
export function effectiveR(newInfections, infectiousBefore, infectiousDays) {
    if (!infectiousBefore) return null;
    return (newInfections / infectiousBefore) * infectiousDays;
}

// Round 35: R right now, read off the web as it stands. For each person who
// can spread (sick and not isolated), add up the chance they infect each
// healthy contact before they recover: 1 - (1 - rate)^daysLeft per link.
// R is the average of that over everyone who can spread, so it is the
// expected number of new cases per case if nothing changes, which is what
// health teams mean by R. It moves the moment the player acts: cutting a
// red link or isolating a sick person drops it at once. 0 when nobody can
// spread. Pure: the game, the balance bots and the tests share it.
// Later planets (optional 4th argument, the level's rules):
// - Masks scale the chance on each masked person's lines (linkFactor).
// - Hidden carriers: R is read from KNOWN cases only. A known carrier
//   (tested positive, state 'exposed') spreads at the reduced presymptomatic
//   rate until symptoms, then at the full rate. People who carry it unseen
//   are not counted as spreaders and still look like healthy contacts, so
//   this R is what a health team could work out, not the hidden truth.
export function liveR(network, transmissionRate, recoveryTime, rules = null) {
    const rate = Math.min(1, Math.max(0, transmissionRate || 0));
    const inc = incubationOf(rules);
    const maskFactor = maskFactorOf(rules);
    const byId = new Map(network.nodes.map((n) => [n.id, n]));
    const spreaders = network.nodes.filter((n) => n.state === 'infected' || n.state === 'exposed');
    if (!spreaders.length) return 0;
    const reach = new Map(spreaders.map((n) => [n.id, 0]));
    const days = (n) => (n.state === 'exposed' ? Math.max(1, recoveryTime || 1) : Math.max(1, (recoveryTime || 1) - Math.max(0, n.daysInfected || 0)));
    const chance = (n, other) => {
        const f = linkFactor(n, other, maskFactor);
        let miss = Math.pow(1 - rate * f, days(n));
        if (n.state === 'exposed') miss *= Math.pow(1 - rate * f * (inc ? inc.factor : 1), meanIncubation(inc) || 1);
        return 1 - miss;
    };
    for (const l of network.links) {
        const a = byId.get(nodeId(l.source));
        const b = byId.get(nodeId(l.target));
        if (!a || !b) continue;
        if (reach.has(a.id) && b.state === 'healthy') reach.set(a.id, reach.get(a.id) + chance(a, b));
        if (reach.has(b.id) && a.state === 'healthy') reach.set(b.id, reach.get(b.id) + chance(b, a));
    }
    let sum = 0;
    for (const v of reach.values()) sum += v;
    return sum / spreaders.length;
}

// Live links between a node and its neighbors (helpers for bots and UI).
export function neighbors(network, id) {
    const out = [];
    for (const l of network.links) {
        const s = nodeId(l.source);
        const t = nodeId(l.target);
        if (s === id) out.push({ id: t, link: l });
        else if (t === id) out.push({ id: s, link: l });
    }
    return out;
}
