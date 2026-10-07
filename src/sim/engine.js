// Pure-ish simulation logic: functions of (state, network, config).
// No DOM, no D3, no audio here. These mutate the passed state/network objects
// (node states, stats counters, node/link removal) and return event lists so
// the caller (game.js) can perform side effects: sounds, animations, log lines,
// and visualization updates. `rng` is injectable for deterministic tests.

const nodeId = (ref) => (ref && typeof ref === 'object' ? ref.id : ref);

// One day of spread. Returns { events: [{ source, target }], count }.
// `transmissionRate` is the fully computed per-contact probability
// (scenario.baseTransmissionRate * difficulty.transmissionMultiplier).
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
        if (n.state === 'infected') n.daysInfected++;
    }

    return { events, count: events.length };
}

// Resolve recoveries/deaths for nodes past their recovery time.
// Returns an ordered list of { node, outcome: 'died' | 'recovered' }.
// Dead nodes are removed from the network (nodes and their links).
export function updateOutcomes(state, network, recoveryTime, fatalityRate, rng = Math.random) {
    const outcomes = [];

    for (const node of network.nodes) {
        if (node.state !== 'infected' || node.daysInfected < recoveryTime) continue;
        if (rng() < fatalityRate) {
            node.state = 'dead';
            node.removed = true;
            state.stats.totalDead++;
            outcomes.push({ node, outcome: 'died' });
        } else {
            node.state = 'recovered';
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

// End-of-day check. Returns 'contained' (win), 'timeout', or null.
export function checkGameOver(state, network, durationDays) {
    const activeInfected = network.nodes.filter((n) => n.state === 'infected').length;
    if (activeInfected === 0) return 'contained';
    if (state.day >= durationDays) return 'timeout';
    return null;
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
