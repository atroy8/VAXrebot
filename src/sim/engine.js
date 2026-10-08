// Pure-ish simulation logic: functions of (state, network, config).
// No DOM, no D3, no audio here. These mutate the passed state/network objects
// (node states, stats counters, node/link removal) and return event lists so
// the caller (game.js) can perform side effects: sounds, animations, log lines,
// and visualization updates. `rng` is injectable for deterministic tests.

const nodeId = (ref) => (ref && typeof ref === 'object' ? ref.id : ref);

// One day of spread. Returns { events: [{ source, target }], count }.
// `transmissionRate` is the fully computed per-contact probability
// (scenario.baseTransmissionRate * difficulty.transmissionMultiplier).
//
// Protected-node rules (nodes stay visible, never removed):
// - Quarantined nodes neither infect others nor become infected. Quarantining
//   an infected node keeps it sick: it ticks daysInfected and resolves via
//   updateOutcomes (recover/die) while isolated, and counts as active infected
//   for the win check until it resolves. Isolation is not a cure.
// - Vaccinated nodes remain immune: targets must be 'healthy'.
export function simulateSpread(state, network, transmissionRate, rng = Math.random) {
    const events = [];
    const byId = new Map(network.nodes.map((n) => [n.id, n]));
    const spreaders = network.nodes.filter((n) => n.state === 'infected');

    for (const infected of spreaders) {
        for (const link of network.links) {
            const s = nodeId(link.source);
            const t = nodeId(link.target);
            if (s !== infected.id && t !== infected.id) continue;
            const targetNode = byId.get(s === infected.id ? t : s);
            if (targetNode && targetNode.state === 'healthy' && rng() < transmissionRate) {
                targetNode.state = 'infected';
                state.stats.totalInfected++;
                events.push({ source: infected, target: targetNode });
            }
        }
    }

    for (const n of network.nodes) {
        if (n.state === 'infected' || (n.state === 'quarantined' && n.sickWhileQuarantined)) n.daysInfected++;
    }

    return { events, count: events.length };
}

// Resolve recoveries/deaths for nodes past their recovery time.
// Returns an ordered list of { node, outcome: 'died' | 'recovered' }.
// Dead nodes are removed from the network (nodes and their links).
export function updateOutcomes(state, network, recoveryTime, fatalityRate, rng = Math.random) {
    const outcomes = [];

    for (const node of network.nodes) {
        // Quarantined nodes that were sick when isolated keep resolving:
        // they tick daysInfected (see simulateSpread) and recover or die here.
        const stillSick =
            node.state === 'infected' || (node.state === 'quarantined' && node.sickWhileQuarantined);
        if (!stillSick || node.daysInfected < recoveryTime) continue;
        if (rng() < fatalityRate) {
            node.state = 'dead';
            node.removed = true;
            state.stats.totalDead++;
            outcomes.push({ node, outcome: 'died' });
        } else {
            node.state = 'recovered';
            node.sickWhileQuarantined = false; // isolation served its purpose
            state.stats.totalRecovered++;
            outcomes.push({ node, outcome: 'recovered' });
        }
    }

    if (outcomes.some((o) => o.outcome === 'died')) {
        const deadIds = new Set(outcomes.filter((o) => o.outcome === 'died').map((o) => o.node.id));
        network.nodes = network.nodes.filter((n) => !n.removed);
        network.links = network.links.filter(
            (l) => !deadIds.has(nodeId(l.source)) && !deadIds.has(nodeId(l.target))
        );
    }

    return outcomes;
}

// Loss threshold: deaths at or above 8% of the initial population, with a
// floor of 5 deaths so small populations do not swing on a single case.
export const OVERWHELMED_DEATH_FRACTION = 0.08;
export const OVERWHELMED_DEATH_FLOOR = 5;

// End-of-day check. Returns 'contained' (win), 'overwhelmed' (loss),
// 'timeout' or 'burnout' (neutral), or null.
// Precedence: contained > overwhelmed > timeout.
// Quarantined nodes that were sick when isolated still count as active
// infected until they resolve (recover/die), so quarantining the sick is
// isolation, not a cure.
// Passivity rule: if the virus dies out with zero player intervention
// (no vaccinations, quarantines, or severed links), the verdict is
// 'burnout', not 'contained'. Doing nothing is not a victory.
export function checkGameOver(state, network, durationDays) {
    const activeInfected = network.nodes.filter(
        (n) => n.state === 'infected' || (n.state === 'quarantined' && n.sickWhileQuarantined)
    ).length;
    if (activeInfected === 0) {
        const intervened = state.stats.totalProtected + state.stats.linksSevered > 0;
        return intervened ? 'contained' : 'burnout';
    }
    const initial = state.stats.initialPopulation;
    const deathLine = Math.max(initial * OVERWHELMED_DEATH_FRACTION, OVERWHELMED_DEATH_FLOOR);
    if (initial > 0 && state.stats.totalDead >= deathLine) return 'overwhelmed';
    if (state.day >= durationDays) return 'timeout';
    return null;
}

// Turn-advance gate for the real pause. nextDay() may run only when the game
// is neither over nor paused. Pure so it is unit-testable without a DOM.
export function canAdvanceDay(state) {
    return !state.gameOver && !state.paused;
}

// Daily usage cap for a tool under a difficulty: floor(base * multiplier).
export function toolDailyLimit(tool, difficulty) {
    return Math.floor(tool.baseDailyLimit * difficulty.toolLimitMultiplier);
}

// Single validation path for tool use (node clicks and link clicks alike).
// Returns { allowed: true } or { allowed: false, reason }.
export function canUseTool(state, tools, toolId, difficulty, target = null) {
    const tool = tools[toolId];
    const limit = toolDailyLimit(tool, difficulty);

    if (state.day < tool.availableDay) {
        return { allowed: false, reason: `${tool.name} available on Day ${tool.availableDay}.` };
    }
    if (state.dailyUsage[toolId] >= limit) {
        return { allowed: false, reason: `Daily limit for ${tool.name} reached.` };
    }

    if (target && target.id !== undefined) {
        // It's a node
        if (tool.oncePerPerson && state.usedOnPeople.has(`${toolId}-${target.id}`)) {
            return { allowed: false, reason: `${tool.name} already used on this person.` };
        }
        if (target.state === 'vaccinated' || target.state === 'quarantined') {
            return { allowed: false, reason: `Person is already protected.` };
        }
        if (toolId === 'vaccinate' && target.state !== 'healthy') {
            return { allowed: false, reason: 'Vaccine only works on healthy individuals.' };
        }
        if (!tool.validTargets.includes(target.state) && !tool.validTargets.includes('any')) {
            return { allowed: false, reason: `Cannot use ${tool.name} on a ${target.state} person.` };
        }
    }

    return { allowed: true };
}
