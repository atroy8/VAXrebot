import { describe, it, expect } from 'vitest';
import { generateNetwork } from '../src/sim/network.js';
import { mulberry32 } from '../src/sim/balance.js';
import { layoutStep, settleLayout, nextAlpha, minSpacing, LAYOUT } from '../src/ui/force-layout.js';

function disc(n) {
    const g = Math.PI * (3 - Math.sqrt(5));
    const R = 3 + Math.sqrt(n) * 1.2;
    return Array.from({ length: n }, (_, i) => {
        const r = R * Math.sqrt((i + 0.5) / n);
        return { pos: { x: Math.cos(g * i) * r, y: Math.sin(g * i) * r, z: 0 }, vel: { x: 0, y: 0, z: 0 } };
    });
}

// Seeded so the network shapes (and these checks) are the same every run;
// unseeded, the sever test failed about one run in eight.
function build(type, n, seed = 42) {
    const objs = disc(n);
    const saved = Math.random;
    Math.random = mulberry32(seed + n);
    let links;
    try {
        ({ links } = generateNetwork(type, n));
    } finally {
        Math.random = saved;
    }
    const pairs = links.filter((l) => l.source !== l.target).map((l) => [objs[l.source], objs[l.target]]);
    return { objs, pairs };
}

const CASES = [
    ['scale-free', 60],
    ['scale-free', 45],
    ['small-world', 50],
    ['small-world', 30],
    ['random', 55],
];

describe('force layout', () => {
    it.each(CASES)('%s network of %i comes fully to rest', (type, n) => {
        const { objs, pairs } = build(type, n);
        const res = settleLayout(objs, pairs, { maxSteps: 2000 });
        expect(res.alpha).toBe(0);
        expect(res.steps).toBeLessThan(400);
        // Once cool, further frames do not move anyone.
        let speed = 1;
        for (let i = 0; i < 30; i++) speed = layoutStep(objs, pairs, 0);
        expect(speed).toBeLessThan(0.002);
    });

    it.each(CASES)('%s network of %i keeps people apart and compact', (type, n) => {
        const { objs, pairs } = build(type, n);
        settleLayout(objs, pairs);
        // Nodes are 1.1 units wide: no overlaps.
        expect(minSpacing(objs)).toBeGreaterThan(1.3);
        const extent = Math.max(...objs.map((o) => Math.hypot(o.pos.x, o.pos.y)));
        expect(extent).toBeLessThan(LAYOUT.maxRadius);
    });

    it('stays far below the speed cap the old tuning vibrated at', () => {
        // Same network, same steps: the new tuning must be far calmer than
        // the per-frame speed cap the old one sat at forever (1.275).
        const { objs, pairs } = build('scale-free', 60);
        let alpha = 1;
        let speed = 0;
        for (let i = 0; i < 400; i++) {
            speed = layoutStep(objs, pairs, alpha);
            alpha = nextAlpha(alpha);
        }
        expect(speed).toBeLessThan(0.05);
    });

    it('a severed link only nudges the layout and it settles again', () => {
        const { objs, pairs } = build('small-world', 40);
        settleLayout(objs, pairs);
        const before = objs.map((o) => ({ ...o.pos }));
        pairs.splice(0, 1);
        const res = settleLayout(objs, pairs, { alpha: LAYOUT.reheatAlpha });
        expect(res.alpha).toBe(0);
        const moved = objs.map((o, i) => Math.hypot(o.pos.x - before[i].x, o.pos.y - before[i].y));
        const avg = moved.reduce((a, b) => a + b, 0) / moved.length;
        expect(avg).toBeLessThan(1.0);
    });

    it('separates two people placed on the same spot', () => {
        const objs = [
            { pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 } },
            { pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 } },
        ];
        settleLayout(objs, []);
        expect(minSpacing(objs)).toBeGreaterThan(1.3);
    });
});
