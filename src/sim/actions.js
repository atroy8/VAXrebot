// Pure player actions and the day step, shared by the game (src/game.js),
// the balance bot (scripts/balance.mjs) and the tests. No DOM, no audio.
// Keeping one code path means the bot measures the same rules people play.
import { simulateSpread, updateOutcomes, checkGameOver, toolDailyLimit } from './engine.js';

const nodeId = (ref) => (ref && typeof ref === 'object' ? ref.id : ref);

// Vaccinate or quarantine one node. Caller validates with canUseTool first.
// Quarantining a sick node is isolation, not a cure: it keeps the
// sickWhileQuarantined flag so the sim keeps ticking it and counts it active.
export function applyNodeTool(state, tools, toolId, node) {
    state.dailyUsage[toolId]++;
    if (tools[toolId].oncePerPerson) state.usedOnPeople.add(`${toolId}-${node.id}`);
    if (toolId === 'vaccinate') {
        node.state = 'vaccinated';
    } else if (toolId === 'quarantine') {
        node.sickWhileQuarantined = node.state === 'infected';
        node.state = 'quarantined';
    }
    state.stats.totalProtected++;
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
    state.day++;
    for (const tool of Object.keys(state.dailyUsage)) state.dailyUsage[tool] = 0;
    const rate = scenario.baseTransmissionRate * difficulty.transmissionMultiplier;
    const spread = simulateSpread(state, network, rate, rng);
    const outcomes = updateOutcomes(state, network, difficulty.recoveryTime, difficulty.fatalityRate, rng);
    const result = checkGameOver(state, network, scenario.duration, caseCapFor(state, scenario));
    return { spread, outcomes, result, activeBefore };
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
        if (state.day < tool.availableDay) continue;
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
