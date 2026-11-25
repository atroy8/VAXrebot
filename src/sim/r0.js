// The briefing's "R₀ here". R₀ is the number of people one case infects
// when nobody is protected. Round 57: spread is predictable (every healthy
// contact of a sick person catches it overnight), so on a contact web R₀ is
// simply the number of contacts a person has, averaged over everyone. It is
// the same count liveR (src/sim/actions.js) makes for the HUD, so on day 1
// the R in the HUD starts near the R₀ the briefing promised. Pure and
// seedable. The extra arguments of the old signatures (rate, recovery time,
// rules) are accepted and ignored.
import { generateNetwork } from './network.js';

const idOf = (ref) => (ref && typeof ref === 'object' ? ref.id : ref);

// Chance that one healthy contact catches it from a case: certain.
export function linkChance() {
    return 1;
}

// R₀ of one web: average contacts per person. Averaging over everyone is
// the R₀ for a patient zero picked at random. Removed people do not count.
export function webR0(network) {
    const ids = new Set(network.nodes.filter((n) => !n.removed).map((n) => n.id));
    if (!ids.size) return 0;
    let ends = 0;
    for (const l of network.links) {
        if (ids.has(idOf(l.source)) && ids.has(idOf(l.target))) ends += 2;
    }
    return ends / ids.size;
}

// R₀ over many webs the level can build, low to high. The briefing runs
// before this play's web exists, so it samples webs of the level's shape and
// sizes. Returns { lo, hi } at the 10th and 90th percentile.
export function levelR0Range({ networkType, populationRange, samples = 40, rng = Math.random, degree = undefined }) {
    const [minPop, maxPop] = populationRange && populationRange.length ? populationRange : [12, 12];
    const values = [];
    for (let i = 0; i < samples; i++) {
        const n = Math.round(minPop + (maxPop - minPop) * (samples > 1 ? i / (samples - 1) : 0));
        const { links } = generateNetwork(networkType, n, rng, degree);
        const nodes = Array.from({ length: n }, (_, id) => ({ id }));
        values.push(webR0({ nodes, links }));
    }
    values.sort((a, b) => a - b);
    const at = (q) => values[Math.min(values.length - 1, Math.max(0, Math.round(q * (values.length - 1))))];
    return { lo: at(0.1), hi: at(0.9) };
}

// Round to the nearest half: 3.76 → 4, 3.3 → 3.5.
function half(x) {
    return Math.round(x * 2) / 2;
}

function show(x) {
    return Number.isInteger(x) ? String(x) : x.toFixed(1);
}

// Plain words for the briefing and the R card: "about 4" or "3 to 4".
export function formatR0(lo, hi = lo) {
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) return '';
    const a = half(Math.min(lo, hi));
    const b = half(Math.max(lo, hi));
    return a === b ? `about ${show(a)}` : `${show(a)} to ${show(b)}`;
}
