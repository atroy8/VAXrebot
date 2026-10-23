// Network generators. Pure data: no DOM, no D3, no audio.
// Node objects carry a `state` string: healthy | infected | recovered | vaccinated | quarantined | dead.
// Links use numeric { source, target } node ids; D3's forceLink later swaps these for node refs.

export function generateScaleFreeNetwork(n, m) {
    const links = [];
    for (let i = m; i < n; i++) {
        for (let j = 0; j < m; j++) {
            links.push({ source: i, target: Math.floor(Math.random() * i) });
        }
    }
    return { links };
}

export function generateSmallWorldNetwork(n, k, p) {
    const links = [];
    for (let i = 0; i < n; i++) {
        for (let j = 1; j <= k / 2; j++) {
            let target = (i + j) % n;
            if (Math.random() < p) target = Math.floor(Math.random() * n);
            links.push({ source: i, target });
        }
    }
    return { links };
}

export function generateRandomNetwork(n, p) {
    const links = [];
    for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
            if (Math.random() < p) links.push({ source: i, target: j });
        }
    }
    return { links };
}

// Item 14: small webs (10 to 25 people) need different shapes than the old
// 30 to 60 person towns. Every web is cleaned the same way: no self links,
// no double lines between the same two people, and nobody left alone (each
// cut off group is joined to the rest by one link), so every face on screen
// is part of the puzzle. About 4 contacts per person on average.
export const SMALL_WEB_MAX = 30;
export const SMALL_WEB_DEGREE = 4;

const idOf = (ref) => (ref && typeof ref === 'object' ? ref.id : ref);

export function cleanLinks(n, links, rng = Math.random) {
    const seen = new Set();
    const out = [];
    const add = (a, b) => {
        if (a === b || a < 0 || b < 0 || a >= n || b >= n) return false;
        const key = a < b ? `${a}-${b}` : `${b}-${a}`;
        if (seen.has(key)) return false;
        seen.add(key);
        out.push({ source: a, target: b });
        return true;
    };
    for (const l of links) add(idOf(l.source), idOf(l.target));
    // Join every separate group (lone people included) to the largest one.
    const parent = Array.from({ length: n }, (_, i) => i);
    const find = (x) => (parent[x] === x ? x : (parent[x] = find(parent[x])));
    for (const l of out) parent[find(l.source)] = find(l.target);
    const groups = new Map();
    for (let i = 0; i < n; i++) {
        const r = find(i);
        if (!groups.has(r)) groups.set(r, []);
        groups.get(r).push(i);
    }
    const sorted = [...groups.values()].sort((a, b) => b.length - a.length);
    const main = [...(sorted[0] || [])];
    for (const g of sorted.slice(1)) {
        const a = g[Math.floor(rng() * g.length)];
        const b = main[Math.floor(rng() * main.length)];
        add(a, b);
        main.push(...g);
    }
    return { links: out };
}

// Small web shapes, one per scenario network type, all near SMALL_WEB_DEGREE
// contacts per person:
//   scale-free  preferential attachment, 2 links per newcomer (a few hubs)
//   small-world a ring of near neighbours with a few long jumps
//   random      festival crowds: friend groups of 3 or 4 who all know each
//               other, joined by single mingling links. (An even random
//               web let random tapping win a quarter of the time.)
export function generateSmallWeb(networkType, n, rng = Math.random) {
    const links = [];
    if (networkType === 'scale-free') {
        const ends = [];
        for (let i = 1; i < Math.min(3, n); i++) {
            links.push({ source: i, target: i - 1 });
            ends.push(i, i - 1);
        }
        for (let i = 3; i < n; i++) {
            const picked = new Set();
            for (let guard = 0; picked.size < 2 && guard < 20; guard++) picked.add(ends[Math.floor(rng() * ends.length)]);
            for (const t of picked) {
                links.push({ source: i, target: t });
                ends.push(i, t);
            }
        }
    } else if (networkType === 'small-world') {
        for (let i = 0; i < n; i++) {
            for (let j = 1; j <= SMALL_WEB_DEGREE / 2; j++) {
                let target = (i + j) % n;
                if (rng() < 0.2) target = Math.floor(rng() * n);
                links.push({ source: i, target });
            }
        }
    } else {
        // Festival crowd: people arrive in friend groups of 3 or 4 who all
        // know each other, and each group mingles with two others through
        // single contacts. Those mingling links are the bridges to cut.
        const groups = [];
        for (let i = 0; i < n; ) {
            const size = Math.min(n - i, n - i === 5 ? 5 : rng() < 0.5 ? 3 : 4);
            groups.push(Array.from({ length: size }, (_, k) => i + k));
            i += size;
        }
        for (const g of groups) for (let a = 0; a < g.length; a++) for (let b = a + 1; b < g.length; b++) links.push({ source: g[a], target: g[b] });
        const pick = (g) => g[Math.floor(rng() * g.length)];
        groups.forEach((g, gi) => {
            if (groups.length < 2) return;
            const next = groups[(gi + 1) % groups.length];
            links.push({ source: pick(g), target: pick(next) });
            const other = groups[Math.floor(rng() * groups.length)];
            if (other !== g) links.push({ source: pick(g), target: pick(other) });
        });
    }
    return cleanLinks(n, links, rng);
}

// Dispatcher matching the scenario networkType values from src/config/scenarios.js.
// Webs of up to SMALL_WEB_MAX people (every campaign level since item 14)
// use the small web shapes; bigger ones keep the original parameters
// (m=4, k=8, p=0.15, p=0.08).
export function generateNetwork(networkType, n, rng = Math.random) {
    if (n <= SMALL_WEB_MAX) return generateSmallWeb(networkType, n, rng);
    switch (networkType) {
        case 'scale-free': return generateScaleFreeNetwork(n, 4);
        case 'small-world': return generateSmallWorldNetwork(n, 8, 0.15);
        default: return generateRandomNetwork(n, 0.08);
    }
}
