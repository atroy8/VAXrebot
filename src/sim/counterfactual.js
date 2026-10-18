// Cases averted: what would have happened with no response at all.
//
// Real public health teams judge a response the same way: compare what
// happened with a "no intervention" baseline and count the cases averted.
// Here the baseline is simulated from the level's opening snapshot (same
// people, same contacts, same first cases) with nobody acting, run to the
// natural end of the outbreak. Pure: no DOM, rng injectable for tests.
import { simulateSpread, updateOutcomes } from './engine.js';

const nodeId = (ref) => (ref && typeof ref === 'object' ? ref.id : ref);

// Plain copy of the opening network: node ids and states, links as id pairs.
// Taken before the 3D view swaps link ends for node objects.
export function snapshotNetwork(network) {
    return {
        nodes: network.nodes.map((n) => ({ id: n.id, state: n.state })),
        links: network.links.map((l) => ({ source: nodeId(l.source), target: nodeId(l.target) })),
    };
}

// One no-response outbreak from the snapshot. Returns total people infected
// (the first cases included) when nobody is infectious any more.
export function noResponseRun(snapshot, { transmissionRate, recoveryTime, fatalityRate, rng = Math.random, maxDays = 365 }) {
    const network = {
        nodes: snapshot.nodes.map((n) => ({ id: n.id, state: n.state, daysInfected: 0, removed: false })),
        links: snapshot.links.map((l) => ({ source: l.source, target: l.target })),
    };
    const stats = {
        totalInfected: network.nodes.filter((n) => n.state === 'infected').length,
        totalDead: 0,
        totalRecovered: 0,
    };
    const state = { stats };
    for (let day = 0; day < maxDays; day++) {
        if (!network.nodes.some((n) => n.state === 'infected')) break;
        simulateSpread(state, network, transmissionRate, rng);
        updateOutcomes(state, network, recoveryTime, fatalityRate, rng);
    }
    return stats.totalInfected;
}

// Median no-response outbreak size over `runs` simulations.
export function noResponseCases(snapshot, opts = {}) {
    const runs = Math.max(1, opts.runs ?? 41);
    const sizes = [];
    for (let i = 0; i < runs; i++) sizes.push(noResponseRun(snapshot, opts));
    sizes.sort((a, b) => a - b);
    return sizes[Math.floor(sizes.length / 2)];
}

// The results line. `actual` is the player's total cases, `baseline` the
// no-response median, `population` the starting headcount. Returns
// { text, averted } or null when there is nothing worth saying.
export function avertedSummary({ actual, baseline, population, outcome }) {
    if (!(population > 0) || baseline == null) return null;
    const averted = Math.max(0, baseline - actual);
    const base = baseline >= population
        ? `With no response, all ${population} people would have caught it.`
        : `With no response, about ${baseline} of ${population} people would have caught it.`;
    if (outcome === 'contained') {
        // A lucky baseline can come in under a hard-won result: say only the baseline.
        if (averted <= 0) return { averted: 0, text: base };
        return {
            averted,
            text: `${base} You kept it to ${actual}.`,
        };
    }
    // A loss ends early at the cap, so the comparison is not like for like.
    return { averted: null, text: base };
}
