import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
    LAYOUT_3D,
    ORBIT,
    layoutStep3d,
    layout3dForAspect,
    settleLayout3d,
    minSpacing3d,
    liftTo3d,
    flattenTo2d,
    orbitPosition,
    viewDirection,
    orbitDrag,
    zoom3d,
    fitOrbit,
    easeOrbit,
    ribbonOffset,
    normalizedDepths,
    loadViewMode,
    saveViewMode,
    VIEW_MODE_KEY,
} from '../src/ui/web3d.js';
import { pickTapTarget } from '../src/ui/tap-target.js';
import { generateNetwork } from '../src/sim/network.js';

const v = (x = 0, y = 0, z = 0) => ({ x, y, z });
const obj = (x, y, z) => ({ pos: v(x, y, z), vel: v() });

function cloud(n = 45) {
    const objs = [];
    for (let i = 0; i < n; i++) {
        const t = i / n;
        objs.push(obj(Math.cos(i) * 2 * t, Math.sin(i * 1.3) * 2 * t, Math.cos(i * 0.7) * 2 * t));
    }
    const { links } = generateNetwork('small-world', n);
    const pairs = links.map((l) => [objs[l.source], objs[l.target]]);
    return { objs, pairs };
}

describe('3D web layout (round 15)', () => {
    it('comes to rest and really uses all three dimensions', () => {
        const { objs, pairs } = cloud();
        const res = settleLayout3d(objs, pairs, { maxSteps: 600 });
        expect(res.alpha).toBe(0);
        const span = (k) => Math.max(...objs.map((o) => o.pos[k])) - Math.min(...objs.map((o) => o.pos[k]));
        for (const k of ['x', 'y', 'z']) expect(span(k)).toBeGreaterThan(4);
    });

    it('keeps people apart so each stays tappable', () => {
        const { objs, pairs } = cloud(55);
        settleLayout3d(objs, pairs, { maxSteps: 600 });
        expect(minSpacing3d(objs)).toBeGreaterThan(LAYOUT_3D.collideDist * 0.8);
    });

    it('stays inside its sphere', () => {
        const { objs, pairs } = cloud(60);
        settleLayout3d(objs, pairs, { maxSteps: 400 });
        for (const o of objs) expect(Math.hypot(o.pos.x, o.pos.y, o.pos.z)).toBeLessThanOrEqual(LAYOUT_3D.maxRadius + 1e-6);
    });

    it('a held person stays exactly under the finger', () => {
        const { objs, pairs } = cloud(20);
        objs[3].pinned = true;
        objs[3].pos = v(5, 1, -2);
        for (let i = 0; i < 50; i++) layoutStep3d(objs, pairs, 0.5);
        expect(objs[3].pos).toEqual(v(5, 1, -2));
    });

    it('switching views lifts into depth and flattens back', () => {
        const objs = [obj(1, 2, 0), obj(3, 4, 0), obj(-1, 0, 0)];
        liftTo3d(objs);
        expect(objs.some((o) => Math.abs(o.pos.z) > 0.1)).toBe(true);
        expect(objs[0].pos.x).toBe(1);
        flattenTo2d(objs);
        expect(objs.every((o) => o.pos.z === 0)).toBe(true);
    });
});

describe('orbit camera', () => {
    const view = { yaw: 0, pitch: 0, distance: 10, tx: 1, ty: 2, tz: 3 };

    it('sits at the distance from the target, in front at yaw 0', () => {
        const p = orbitPosition(view);
        expect(p.x).toBeCloseTo(1);
        expect(p.y).toBeCloseTo(2);
        expect(p.z).toBeCloseTo(13);
        const d = viewDirection({ ...view, yaw: 0.7, pitch: 0.3 });
        expect(Math.hypot(d.x, d.y, d.z)).toBeCloseTo(1);
    });

    it('dragging orbits, and tilt never flips over the top', () => {
        const turned = orbitDrag(view, 100, 0);
        expect(turned.yaw).toBeCloseTo(-100 * ORBIT.radPerPx);
        const tilted = orbitDrag(view, 0, 100000);
        expect(tilted.pitch).toBeCloseTo(ORBIT.maxPitch);
        expect(orbitDrag(view, 0, -100000).pitch).toBeCloseTo(-ORBIT.maxPitch);
    });

    it('pinch zoom is clamped around the fitted distance', () => {
        expect(zoom3d(view, 2, 10).distance).toBeCloseTo(5);
        expect(zoom3d(view, 100, 10).distance).toBeCloseTo(10 * ORBIT.minZoom);
        expect(zoom3d(view, 0.01, 10).distance).toBeCloseTo(10 * ORBIT.maxZoom);
    });

    it('the fitted view shows the whole cloud on a tall phone, using its full height', () => {
        const pts = [v(-4, 0, 0), v(4, 0, 0), v(0, 8, 0), v(0, -8, 0), v(0, 0, 4), v(1, 2, -3)];
        for (const yaw of [0, 0.8, 2.4]) {
            const fit = fitOrbit(pts, { fovDeg: 48, aspect: 0.6, pad: 0, yaw, pitch: 0.25 });
            const cam = orbitPosition(fit);
            const f = viewDirection(fit);
            const right = v(Math.cos(yaw), 0, -Math.sin(yaw));
            const up = v(f.y * right.z - f.z * right.y, f.z * right.x - f.x * right.z, f.x * right.y - f.y * right.x);
            const tanV = Math.tan((48 * Math.PI) / 360);
            const tanH = tanV * 0.6;
            let usedV = 0;
            let usedH = 0;
            for (const p of pts) {
                const d = v(p.x - cam.x, p.y - cam.y, p.z - cam.z);
                const depth = -(d.x * f.x + d.y * f.y + d.z * f.z);
                const sx = Math.abs(d.x * right.x + d.y * right.y + d.z * right.z) / depth;
                const sy = Math.abs(d.x * up.x + d.y * up.y + d.z * up.z) / depth;
                expect(sx).toBeLessThanOrEqual(tanH + 1e-9);
                expect(sy).toBeLessThanOrEqual(tanV + 1e-9);
                usedV = Math.max(usedV, sy / tanV);
                usedH = Math.max(usedH, sx / tanH);
            }
            // Tight: one direction is filled to the edge.
            expect(Math.max(usedV, usedH)).toBeGreaterThan(0.97);
        }
        const fit = fitOrbit(pts, { fovDeg: 48, aspect: 0.6 });
        const eased = easeOrbit({ ...fit, distance: fit.distance * 2 }, fit, 0.5);
        expect(eased.distance).toBeCloseTo(fit.distance * 1.5);
    });

    it('on a tall view the cloud settles taller than it is wide', () => {
        const { objs, pairs } = cloud(50);
        settleLayout3d(objs, pairs, { maxSteps: 600, P: layout3dForAspect(0.55) });
        const span = (k) => Math.max(...objs.map((o) => o.pos[k])) - Math.min(...objs.map((o) => o.pos[k]));
        expect(span('y')).toBeGreaterThan(span('x') * 1.2);
    });

    it('link ribbons face the camera with the right width', () => {
        const a = v(0, 0, 0);
        const b = v(4, 0, 0);
        const o = ribbonOffset(a, b, v(2, 0, 10), 0.1);
        expect(Math.hypot(o.x, o.y, o.z)).toBeCloseTo(0.1);
        // Perpendicular to the link and to the line of sight.
        expect(o.x).toBeCloseTo(0);
        expect(o.z).toBeCloseTo(0);
    });
});

describe('tapping in depth', () => {
    it('two people on top of each other on screen: the one in front wins', () => {
        const back = { x: 100, y: 100, r: 20, depth: 1, node: 'back' };
        const front = { x: 104, y: 100, r: 20, depth: 0, node: 'front' };
        expect(pickTapTarget({ x: 101, y: 100, mode: 'node', nodes: [back, front] }).node.node).toBe('front');
        // Without depth (the flat view) the nearest on screen still wins.
        const flatBack = { ...back, depth: undefined };
        const flatFront = { ...front, depth: undefined };
        expect(pickTapTarget({ x: 101, y: 100, mode: 'node', nodes: [flatBack, flatFront] }).node.node).toBe('back');
        expect(normalizedDepths([5, 10, 7.5])).toEqual([0, 1, 0.5]);
    });
});

describe('view choice', () => {
    const mem = () => {
        const m = new Map();
        return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, val) => m.set(k, val) };
    };
    it('defaults to 3D, remembers 2D, and survives blocked storage', () => {
        const s = mem();
        expect(loadViewMode(s)).toBe('3d');
        saveViewMode(s, '2d');
        expect(s.getItem(VIEW_MODE_KEY)).toBe('2d');
        expect(loadViewMode(s)).toBe('2d');
        const blocked = { getItem: () => { throw new Error('no'); }, setItem: () => { throw new Error('no'); } };
        expect(loadViewMode(blocked)).toBe('3d');
        expect(() => saveViewMode(blocked, '2d')).not.toThrow();
    });

    it('the network view has the switch and the 3D wiring', () => {
        const src = readFileSync(new URL('../src/ui/network-view-3d.js', import.meta.url), 'utf8');
        expect(src).toContain('network-mode-btn');
        expect(src).toContain('layoutStep3d(');
        expect(src).toContain('ribbonOffset(');
        expect(src).not.toContain('—');
        expect(readFileSync(new URL('../src/ui/web3d.js', import.meta.url), 'utf8')).not.toContain('—');
    });
});

describe('tap candidates follow the tool rules', () => {
    it('the view filters people the same way the tools do', async () => {
        const { tools } = await import('../src/config/tools.js');
        const src = readFileSync(new URL('../src/ui/network-view-3d.js', import.meta.url), 'utf8');
        for (const id of ['vaccinate', 'quarantine']) {
            const list = tools[id].validTargets.map((t) => `'${t}'`).join(', ');
            expect(src).toContain(`${id}: [${list}]`);
        }
    });
});
