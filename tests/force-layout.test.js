import { describe, it, expect } from 'vitest';
import { generateNetwork } from '../src/sim/network.js';
import { mulberry32 } from '../src/sim/balance.js';
import { layoutStep, settleLayout, nextAlpha, minSpacing, layoutForAspect, LAYOUT } from '../src/ui/force-layout.js';
import { fitCamera } from '../src/ui/game-screen-model.js';

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

// The in-level view on a 390 px phone is about 300 x 515 px (aspect 0.58).
const PHONE = 0.58;
const box = (objs) => {
    const xs = objs.map((o) => o.pos.x);
    const ys = objs.map((o) => o.pos.y);
    return { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
};
// Camera distance needed to frame the network: smaller = people look bigger.
const frameDistance = (objs, aspect, pad) => fitCamera(objs.map((o) => o.pos), { aspect, pad }).distance;

describe('layout shaped to the screen', () => {
    it('a square view keeps the original layout exactly', () => {
        const a = build('scale-free', 45);
        const b = build('scale-free', 45);
        settleLayout(a.objs, a.pairs);
        settleLayout(b.objs, b.pairs, { P: layoutForAspect(1) });
        a.objs.forEach((o, i) => {
            expect(b.objs[i].pos.x).toBeCloseTo(o.pos.x, 9);
            expect(b.objs[i].pos.y).toBeCloseTo(o.pos.y, 9);
        });
    });

    it('clamps silly aspects', () => {
        expect(layoutForAspect(0).scaleX).toBe(1);
        expect(layoutForAspect(NaN).scaleY).toBe(1);
        expect(layoutForAspect(0.01).scaleX).toBeCloseTo(layoutForAspect(0.45).scaleX, 9);
        expect(layoutForAspect(99).scaleX).toBeCloseTo(layoutForAspect(2.2).scaleX, 9);
    });

    it.each(CASES)('%s network of %i is taller than wide on a phone, rests, and never overlaps', (type, n) => {
        const { objs, pairs } = build(type, n);
        const res = settleLayout(objs, pairs, { maxSteps: 2000, P: layoutForAspect(PHONE) });
        expect(res.alpha).toBe(0);
        expect(res.steps).toBeLessThan(400);
        const { w, h } = box(objs);
        expect(h / w).toBeGreaterThan(1.2);
        expect(minSpacing(objs)).toBeGreaterThan(1.3);
        let speed = 1;
        for (let i = 0; i < 30; i++) speed = layoutStep(objs, pairs, 0, layoutForAspect(PHONE));
        expect(speed).toBeLessThan(0.002);
    });

    it.each(CASES)('%s network of %i: people are at least 20%% bigger on a phone', (type, n) => {
        const round = build(type, n);
        settleLayout(round.objs, round.pairs);
        const before = frameDistance(round.objs, PHONE, 1.9); // round layout, old padding
        const tall = build(type, n);
        settleLayout(tall.objs, tall.pairs, { P: layoutForAspect(PHONE) });
        const after = frameDistance(tall.objs, PHONE, 1.2);
        // On-screen size is inversely proportional to camera distance.
        expect(before / after).toBeGreaterThan(1.2);
    });
});
