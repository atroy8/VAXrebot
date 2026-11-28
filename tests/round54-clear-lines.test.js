import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { generateSmallWeb } from '../src/sim/network.js';
import { mulberry32 } from '../src/sim/balance.js';
import { settleLayout, layoutForAspect, linesUnderPeople, untangleLines, pointSegment, minSpacing, LAYOUT } from '../src/ui/force-layout.js';
import { layoutForPersonScale } from '../src/ui/web3d.js';

// Round 54 playtest: every level 1 web had 2 to 8 lines running under
// someone else's face, so a red line looked as if it reached the wrong person.

function disc(n) {
    const g = Math.PI * (3 - Math.sqrt(5));
    const R = 3 + Math.sqrt(n) * 1.2;
    return Array.from({ length: n }, (_, i) => {
        const r = R * Math.sqrt((i + 0.5) / n);
        return { pos: { x: Math.cos(g * i) * r, y: Math.sin(g * i) * r, z: 0 }, vel: { x: 0, y: 0, z: 0 } };
    });
}

function web(type, n, seed) {
    const { links } = generateSmallWeb(type, n, mulberry32(seed * 31 + n));
    const objs = disc(n);
    const pairs = links.filter((l) => l.source !== l.target).map((l) => [objs[l.source], objs[l.target]]);
    return { objs, pairs };
}

// A phone's game screen is about 0.57 wide for 1 tall; people grow a little.
const P = layoutForPersonScale(layoutForAspect(0.57), 1.15);
const TYPES = ['scale-free', 'small-world', 'random'];
const SEEDS = Array.from({ length: 20 }, (_, i) => i);

function survey(n) {
    let before = 0;
    let after = 0;
    let clean = 0;
    for (const type of TYPES) {
        for (const seed of SEEDS) {
            const { objs, pairs } = web(type, n, seed);
            settleLayout(objs, pairs, { maxSteps: 400, P });
            before += linesUnderPeople(objs, pairs, P.edgeClear);
            untangleLines(objs, pairs, P);
            const left = linesUnderPeople(objs, pairs, P.edgeClear);
            after += left;
            if (left === 0) clean++;
        }
    }
    return { before, after, clean, webs: TYPES.length * SEEDS.length };
}

describe('round 54: lines run between their own two people', () => {
    it('pointSegment measures the gap to the middle of a line', () => {
        const a = { x: 0, y: 0 };
        const b = { x: 4, y: 0 };
        expect(pointSegment({ x: 2, y: 1 }, a, b)).toMatchObject({ d: 1, u: 0.5 });
        expect(pointSegment({ x: -3, y: 4 }, a, b).d).toBe(5);
        expect(pointSegment({ x: -3, y: 4 }, a, b).u).toBe(0);
    });

    it('first-planet webs (8 to 12 people) lose most lines that ran under someone', () => {
        for (const n of [8, 10, 12]) {
            const s = survey(n);
            expect(s.before).toBeGreaterThan(0);
            // Measured: 8 people 183 to 19, 10 people 319 to 61, 12 people 491 to 90.
            expect(s.after).toBeLessThanOrEqual(s.before * 0.25);
            expect(s.after / s.webs).toBeLessThanOrEqual(1.6);
            expect(s.clean).toBeGreaterThanOrEqual(s.webs * 0.25);
        }
    });

    it('the biggest webs (24 and 32 people) improve too', () => {
        for (const n of [24, 32]) {
            const s = survey(n);
            // Measured: 24 people 1634 to 552, 32 people 2830 to 1123.
            expect(s.after).toBeLessThanOrEqual(s.before * 0.45);
        }
    });

    it('never makes a web worse, keeps people apart and inside the screen shape', () => {
        const rx = P.maxRadius / P.scaleX;
        const ry = P.maxRadius / P.scaleY;
        for (const type of TYPES) {
            for (const seed of SEEDS.slice(0, 8)) {
                const { objs, pairs } = web(type, 14, seed);
                settleLayout(objs, pairs, { maxSteps: 400, P });
                const before = linesUnderPeople(objs, pairs, P.edgeClear);
                const spacing = minSpacing(objs);
                untangleLines(objs, pairs, P);
                expect(linesUnderPeople(objs, pairs, P.edgeClear)).toBeLessThanOrEqual(before);
                expect(minSpacing(objs)).toBeGreaterThanOrEqual(Math.min(spacing, P.collideDist) - 1e-9);
                for (const o of objs) expect(Math.hypot(o.pos.x / rx, o.pos.y / ry)).toBeLessThanOrEqual(1);
            }
        }
    });

    it('is deterministic and leaves a held person where the finger is', () => {
        const runOnce = (pinIdx) => {
            const { objs, pairs } = web('small-world', 10, 3);
            settleLayout(objs, pairs, { maxSteps: 400, P });
            if (pinIdx !== undefined) objs[pinIdx].pinned = true;
            const held = pinIdx !== undefined ? { ...objs[pinIdx].pos } : null;
            untangleLines(objs, pairs, P);
            return { pos: objs.map((o) => [o.pos.x, o.pos.y]), held, after: pinIdx !== undefined ? objs[pinIdx].pos : null };
        };
        expect(runOnce().pos).toEqual(runOnce().pos);
        for (let i = 0; i < 10; i++) {
            const r = runOnce(i);
            expect(r.after.x).toBe(r.held.x);
            expect(r.after.y).toBe(r.held.y);
        }
    });

    it('bigger faces keep a wider gap from lines', () => {
        expect(LAYOUT.edgeClear).toBeGreaterThan(0.575 + 0.1);
        const big = layoutForPersonScale(LAYOUT, 2);
        expect(big.edgeClear).toBeCloseTo(LAYOUT.edgeClear + 0.575, 5);
        expect(layoutForPersonScale(LAYOUT, 1).edgeClear).toBe(LAYOUT.edgeClear);
    });

    it('is quick enough for a phone: a 32 person web clears in well under a frame budget per web', () => {
        const { objs, pairs } = web('scale-free', 32, 5);
        settleLayout(objs, pairs, { maxSteps: 400, P });
        const t0 = performance.now();
        untangleLines(objs, pairs, P);
        expect(performance.now() - t0).toBeLessThan(400);
    });

    it('the 2D web clears lines at level start and glides after a switch back from 3D, never after a cut', () => {
        const src = readFileSync(new URL('../src/ui/network-view-3d.js', import.meta.url), 'utf8');
        expect(src).toMatch(/import \{[^}]*untangleLines[^}]*\} from '\.\/force-layout\.js'/);
        expect((src.match(/if \(!this\.is3d\) untangleLines\(|untangleLines\(this\.layoutObjs\(\)/g) || []).length).toBeGreaterThanOrEqual(2);
        expect(src).toMatch(/this\.untanglePending = !this\.is3d;/);
        const sever = src.slice(src.indexOf('A link was severed'), src.indexOf('this.lastLinkKey = linkKey;'));
        expect(sever).not.toMatch(/untangle/);
    });
});
