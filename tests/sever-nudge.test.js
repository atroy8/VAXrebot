// Round 32: cutting a line must not slide the web out from under the thumb.
// At the old reheat (0.3) a cut moved people up to 40 px on a 390 px phone,
// and in one web of ten more than 90 px, so the second Sever tap of the day
// often hit a different line than the one the player aimed at.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { generateNetwork } from '../src/sim/network.js';
import { mulberry32 } from '../src/sim/balance.js';
import { settleLayout, layoutForAspect, LAYOUT } from '../src/ui/force-layout.js';
import { settleLayout3d, layout3dForAspect, layoutForPersonScale, liftTo3d, LAYOUT_3D } from '../src/ui/web3d.js';

const PHONE_ASPECT = 0.58; // the in-level view on a 390 x 844 phone
const WEB_PX = 260; // about how wide the settled web is drawn there

function makeWeb(type, n, seed) {
    const rng = mulberry32(seed);
    const { links } = generateNetwork(type, n, rng);
    const g = Math.PI * (3 - Math.sqrt(5));
    const R = 3 + Math.sqrt(n) * 1.2;
    const objs = Array.from({ length: n }, (_, i) => {
        const r = R * Math.sqrt((i + 0.5) / n);
        return { pos: { x: Math.cos(g * i) * r, y: Math.sin(g * i) * r, z: 0 }, vel: { x: 0, y: 0, z: 0 } };
    });
    const pairs = links.filter((l) => l.source !== l.target).map((l) => [objs[l.source], objs[l.target]]);
    return { objs, pairs, rng };
}

// Settles a web, cuts one line, relaxes at `alpha`; returns the farthest any
// person moved, in phone pixels, and whether the layout came to rest.
function cutMove({ type, n, seed, alpha, is3d, recoil = LAYOUT.severRecoil }) {
    const { objs, pairs, rng } = makeWeb(type, n, seed);
    const settle = is3d ? settleLayout3d : settleLayout;
    const P = is3d
        ? layoutForPersonScale(layout3dForAspect(PHONE_ASPECT), 1.6)
        : layoutForPersonScale(layoutForAspect(PHONE_ASPECT), 1.6);
    if (is3d) liftTo3d(objs);
    settle(objs, pairs, { P, maxSteps: 2000 });
    for (const o of objs) o.vel.x = o.vel.y = o.vel.z = 0;
    const before = objs.map((o) => ({ ...o.pos }));
    const xs = objs.map((o) => o.pos.x);
    const ys = objs.map((o) => o.pos.y);
    const span = Math.max(Math.max(...xs) - Math.min(...xs), (Math.max(...ys) - Math.min(...ys)) * PHONE_ASPECT);
    const [[a, b]] = pairs.splice(Math.floor(rng() * pairs.length), 1);
    // The cut ends spring apart, as the in-level view does.
    const dx = b.pos.x - a.pos.x;
    const dy = b.pos.y - a.pos.y;
    const dz = is3d ? b.pos.z - a.pos.z : 0;
    const len = Math.hypot(dx, dy, dz) || 1;
    for (const [o, s] of [[b, 1], [a, -1]]) {
        o.vel.x += (s * dx * recoil) / len;
        o.vel.y += (s * dy * recoil) / len;
        o.vel.z += (s * dz * recoil) / len;
    }
    const res = settle(objs, pairs, { alpha, P, maxSteps: 2000 });
    const moved = objs.map((o, i) => Math.hypot(o.pos.x - before[i].x, o.pos.y - before[i].y) * (WEB_PX / span));
    return { maxPx: Math.max(...moved), rested: res.alpha === 0 };
}

function survey(opts) {
    const runs = [];
    for (let seed = 1; seed <= 30; seed++) runs.push(cutMove({ ...opts, seed }));
    const maxes = runs.map((r) => r.maxPx).sort((a, b) => a - b);
    return {
        avgMax: maxes.reduce((a, b) => a + b, 0) / maxes.length,
        p90: maxes[Math.floor(maxes.length * 0.9)],
        allRested: runs.every((r) => r.rested),
    };
}

const WEBS = [
    ['small-world', 12],
    ['scale-free', 12],
    ['small-world', 20],
];

describe('a cut barely moves the web (round 32)', () => {
    it('cuts reheat far less than other layout changes', () => {
        expect(LAYOUT.severAlpha).toBeLessThanOrEqual(LAYOUT.reheatAlpha / 4);
        expect(LAYOUT_3D.severAlpha).toBeLessThanOrEqual(LAYOUT_3D.reheatAlpha / 4);
    });

    it.each(WEBS)('2D %s web of %i: people move under 15 px on average, 30 px at worst in 9 of 10', (type, n) => {
        const s = survey({ type, n, alpha: LAYOUT.severAlpha, is3d: false });
        expect(s.allRested).toBe(true);
        expect(s.avgMax).toBeLessThan(15);
        expect(s.p90).toBeLessThan(30);
    });

    it.each(WEBS)('3D %s web of %i: people move under 15 px on average, 30 px at worst in 9 of 10', (type, n) => {
        const s = survey({ type, n, alpha: LAYOUT_3D.severAlpha, is3d: true });
        expect(s.allRested).toBe(true);
        expect(s.avgMax).toBeLessThan(15);
        expect(s.p90).toBeLessThan(30);
    });

    it('the old reheat moved people far more (why this changed)', () => {
        const old = survey({ type: 'small-world', n: 12, alpha: LAYOUT.reheatAlpha, recoil: 0.55, is3d: false });
        const now = survey({ type: 'small-world', n: 12, alpha: LAYOUT.severAlpha, is3d: false });
        expect(old.avgMax).toBeGreaterThan(now.avgMax * 2.5);
    });

    it('the cut ends still spring apart a little, well under a person', () => {
        expect(LAYOUT.severRecoil).toBeGreaterThan(0);
        // Total drift of a kicked end with damping d is about kick * d / (1 - d).
        const drift = (LAYOUT.severRecoil * LAYOUT.damping) / (1 - LAYOUT.damping);
        expect(drift).toBeLessThan(0.5); // a person is 1.1 units wide
    });

    it('the sever animation uses the small recoil and the gentle heat', () => {
        const src = readFileSync(new URL('../src/ui/network-view-3d.js', import.meta.url), 'utf8');
        const anim = src.slice(src.indexOf('// 4. The two nodes recoil apart'), src.indexOf('this.shakeUntil = start + 140'));
        expect(anim).toMatch(/LAYOUT\.severRecoil/);
        expect(anim).toMatch(/severAlpha/);
        expect(anim).not.toMatch(/reheatAlpha|0\.55/);
    });

    it('the in-level view uses the gentle heat when a link is cut', () => {
        const src = readFileSync(new URL('../src/ui/network-view-3d.js', import.meta.url), 'utf8');
        const branch = src.slice(src.indexOf('} else if (linkKey !== this.lastLinkKey) {'), src.indexOf('} else if (boxChanged) {'));
        expect(branch).toMatch(/severAlpha/);
        expect(branch).not.toMatch(/reheatAlpha/);
    });
});
