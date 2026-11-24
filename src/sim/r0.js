// Round 52: the briefing's "R₀ here" is worked out from the level's own
// rules instead of a fixed label per difficulty. R₀ is the number of
// people one case infects when nobody is protected. On a contact web that
// is the number of contacts a case has times the chance each one catches it
// before the case recovers: 1 - (1 - rate)^recoveryTime, the same per-link
// chance liveR (src/sim/actions.js) uses, so on day 1 the R in the HUD
// starts near the R₀ the briefing promised. Pure and seedable.
import { generateNetwork } from './network.js';

const idOf = (ref) => (ref && typeof ref === 'object' ? ref.id : ref);

// Chance that one healthy contact catches it from a case over its whole
// sick spell.
export function linkChance(transmissionRate, recoveryTime) {
    const rate = Math.min(1, Math.max(0, transmissionRate || 0));
    const days = Math.max(1, recoveryTime || 1);
    return 1 - Math.pow(1 - rate, days);
}

// R₀ of one web: average contacts per person times the per-link chance.
// Averaging over everyone is the expected R₀ for a patient zero picked at
// random. Removed people do not count.
export function webR0(network, transmissionRate, recoveryTime) {
    const live = new Set(network.nodes.filter((n) => !n.removed).map((n) => n.id));
    if (!live.size) return 0;
    let ends = 0;
    for (const l of network.links) {
        if (live.has(idOf(l.source)) && live.has(idOf(l.target))) ends += 2;
    }
    return (ends / live.size) * linkChance(transmissionRate, recoveryTime);
}

// R₀ over many webs the level can build, low to high. The briefing runs
// before this play's web exists, so it samples webs of the level's shape and
// sizes. Returns { lo, hi } at the 10th and 90th percentile.
export function levelR0Range({ networkType, populationRange, transmissionRate, recoveryTime, samples = 40, rng = Math.random }) {
    const [minPop, maxPop] = populationRange && populationRange.length ? populationRange : [12, 12];
    const values = [];
    for (let i = 0; i < samples; i++) {
        const n = Math.round(minPop + (maxPop - minPop) * (samples > 1 ? i / (samples - 1) : 0));
        const { links } = generateNetwork(networkType, n, rng);
        const nodes = Array.from({ length: n }, (_, id) => ({ id }));
        values.push(webR0({ nodes, links }, transmissionRate, recoveryTime));
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
