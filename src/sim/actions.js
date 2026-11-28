// Pure player actions and the day step, shared by the game (src/game.js),
// the balance bot (scripts/balance.mjs) and the tests. No DOM, no audio.
// Keeping one code path means the bot measures the same rules people play.
import { simulateSpread, updateOutcomes, checkGameOver, toolDailyLimit, toolAvailableDay, resolveAftermath, LOSS_RESULTS } from './engine.js';
import { noteToolUse, noteDayStart, noteDayEnd } from './run-stats.js';

import { isCarrier, travelNight, travelPlan } from './mechanics.js';

const nodeId = (ref) => (ref && typeof ref === 'object' ? ref.id : ref);

// Vaccinate or quarantine one node. Caller validates with canUseTool first.
// Quarantining a sick node is isolation, not a cure: it keeps the
// sickWhileQuarantined flag so the sim keeps ticking it and counts it active.
// Test and Mask (later planets, src/sim/mechanics.js) return what happened:
// { positive } for a test, { masked: true } for a mask. Neither counts as
// protecting someone: a test only finds out, and a mask only buys a night.
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
// Round 57: nothing here rolls dice. `rng` is still accepted (and ignored)
// so callers written for the old rules keep working.
export function advanceDay(state, network, { scenario, difficulty }) {
    const activeBefore = activeInfectiousCount(network);
    noteDayStart(state, network, liveR(network));
    // Travellers: tonight's moves are the ones on screen right now.
    const plan = scenario.travellers ? travelPlan(network) : null;
    state.day++;
    for (const tool of Object.keys(state.dailyUsage)) state.dailyUsage[tool] = 0;
    endStayHome(state, network);
    // Yesterday's "tested clear" marks are out of date at dawn.
    for (const n of network.nodes) if (n.testedClear) delete n.testedClear;
    const spread = simulateSpread(state, network);
    const outcomes = updateOutcomes(state, network, difficulty.recoveryTime);
    // Travellers move on after the night's spread, so their new line is
    // there to see in the morning. spread.travel lists the moves.
    spread.travel = plan ? travelNight(state, network, plan) : [];
    const result = checkGameOver(state, network, scenario.duration, caseCapFor(state, scenario), scenario.goal || null);
    noteDayEnd(state, network);
    // A lost level still costs the lives of the frail people left sick.
    const aftermath = LOSS_RESULTS.includes(result) ? resolveAftermath(state, network) : [];
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

// Total cases allowed before the outbreak counts as overwhelmed. Round 57:
// the dealer sets an exact number for each deal (scenario.caseCap, par plus
// the level's slack, see src/sim/dealer.js). Without one the old rule
// applies: ceil(caseCapFraction * initial population). No rule = no cap.
export function caseCapFor(state, scenario) {
    if (scenario.caseCap != null) return scenario.caseCap;
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

// R right now, read off the web as it stands. Round 57: with predictable
// spread every healthy contact of a spreader catches it tonight, so R is
// simply the number of healthy contacts per person who can spread (people
// two spreaders share are counted once, for the first of them). 3 sick
// people with 6 healthy contacts between them: R = 2, and 6 new cases
// tonight if nothing changes. It moves the moment the player acts: cutting
// a red line or isolating a sick person drops it at once. 0 when nobody can
// spread. Pure: the game, the balance bots and the tests share it.
// Hidden carriers: R is read from KNOWN cases only (sick, or tested
// positive), over the contacts that look healthy, so this R is what a
// health team could work out, not the hidden truth. The extra arguments of
// the old signature (rate, recovery time, rules) are ignored.
export function liveR(network) {
    const byId = new Map(network.nodes.map((n) => [n.id, n]));
    const spreaders = network.nodes.filter((n) => !n.removed && (n.state === 'infected' || n.state === 'exposed'));
    if (!spreaders.length) return 0;
    const hot = new Set(spreaders.map((n) => n.id));
    const atRisk = new Set();
    for (const l of network.links) {
        const a = byId.get(nodeId(l.source));
        const b = byId.get(nodeId(l.target));
        if (!a || !b) continue;
        if (hot.has(a.id) && b.state === 'healthy') atRisk.add(b.id);
        if (hot.has(b.id) && a.state === 'healthy') atRisk.add(a.id);
    }
    return atRisk.size / spreaders.length;
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
