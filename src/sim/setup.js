// One shared outbreak setup for the game (src/game.js) and the balance bots
// (src/sim/balance.js), so both play exactly the same level. Pure apart
// from the network generators reading Math.random, which is swapped for
// the injected rng while they run.
import { generateNetwork } from './network.js';
import { placeSuperSpreader, placeEnvoy } from './variants.js';

// Returns { nodes, links, initialCases, superSpreaderId, envoyId }.
export function buildOutbreak({ scenario, population, variant = null, rng = Math.random }) {
    const nodes = Array.from({ length: population }, (_, i) => ({ id: i, state: 'healthy', daysInfected: 0, removed: false }));
    const saved = Math.random;
    Math.random = rng;
    let links;
    try {
        ({ links } = generateNetwork(scenario.networkType, population));
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
    while (initialCases < want) {
        const node = nodes[Math.floor(rng() * population)];
        if (node.state === 'infected') continue;
        node.state = 'infected';
        initialCases++;
    }
    let envoyId = null;
    if (variant && variant.type === 'envoy') {
        const envoy = placeEnvoy(nodes, links, variant, rng);
        envoyId = envoy ? envoy.id : null;
    }
    return { nodes, links, initialCases, superSpreaderId, envoyId };
}
