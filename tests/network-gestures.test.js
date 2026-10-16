import { describe, it, expect } from 'vitest';
import {
    worldToScreen,
    screenToWorld,
    cameraUp,
    panView,
    twoFingerView,
    zoomAt,
    rotateAt,
    pickGrab,
    isDrag,
    isOffFit,
    wrapAngle,
    clampDistance,
} from '../src/ui/network-gestures.js';
import { settleLayout, layoutStep, LAYOUT } from '../src/ui/force-layout.js';

const box = { widthPx: 300, heightPx: 520, fovDeg: 48 };
const view = { cx: 1, cy: -2, distance: 20, roll: 0.4 };
const close = (a, b, d = 6) => {
    expect(a.x).toBeCloseTo(b.x, d);
    expect(a.y).toBeCloseTo(b.y, d);
};

describe('view transform', () => {
    it('screenToWorld undoes worldToScreen', () => {
        for (const p of [{ x: 0, y: 0 }, { x: 3.5, y: -7 }, { x: -12, y: 4 }]) {
            close(screenToWorld(worldToScreen(p, view, box), view, box), p);
        }
    });

    it('the view centre sits in the middle of the screen', () => {
        close(worldToScreen({ x: view.cx, y: view.cy }, view, box), { x: 150, y: 260 });
    });

    it('positive roll turns the network clockwise on screen', () => {
        const up = worldToScreen({ x: 0, y: 5 }, { cx: 0, cy: 0, distance: 20, roll: 0.3 }, box);
        expect(up.x).toBeGreaterThan(150); // the top point swung to the right
        expect(up.y).toBeLessThan(260);
    });

    it('matches a three.js style camera: up vector is screen up', () => {
        const u = cameraUp(0.3);
        const p = worldToScreen({ x: u.x * 5, y: u.y * 5 }, { cx: 0, cy: 0, distance: 20, roll: 0.3 }, box);
        expect(p.x).toBeCloseTo(150, 6);
        expect(p.y).toBeLessThan(260);
    });

    it('wraps angles into -pi..pi', () => {
        expect(wrapAngle(3 * Math.PI)).toBeCloseTo(Math.PI, 6);
        expect(wrapAngle(-2.5 * Math.PI)).toBeCloseTo(-0.5 * Math.PI, 6);
    });
});

describe('gestures keep content under the fingers', () => {
    it('pan: the world point under the finger follows it', () => {
        const before = { x: 100, y: 200 };
        const after = { x: 160, y: 120 };
        const w = screenToWorld(before, view, box);
        const next = panView(view, before, after, box);
        close(worldToScreen(w, next, box), after);
        expect(next.distance).toBe(view.distance);
        expect(next.roll).toBe(view.roll);
    });

    it('pinch apart zooms in around the midpoint', () => {
        const a0 = { x: 120, y: 260 }, b0 = { x: 180, y: 260 };
        const a1 = { x: 90, y: 260 }, b1 = { x: 210, y: 260 };
        const mid = { x: 150, y: 260 };
        const w = screenToWorld(mid, view, box);
        const next = twoFingerView(view, a0, b0, a1, b1, box);
        expect(next.distance).toBeCloseTo(view.distance / 2, 6);
        close(worldToScreen(w, next, box), mid);
    });

    it('twist clockwise turns the network clockwise; the fingers keep their spots', () => {
        const a0 = { x: 100, y: 260 }, b0 = { x: 200, y: 260 };
        // Rotate both fingers 30 degrees clockwise (screen y down) about the midpoint.
        const ang = Math.PI / 6;
        const rot = (p) => ({ x: 150 + (p.x - 150) * Math.cos(ang) - (p.y - 260) * Math.sin(ang), y: 260 + (p.x - 150) * Math.sin(ang) + (p.y - 260) * Math.cos(ang) });
        const a1 = rot(a0), b1 = rot(b0);
        const wa = screenToWorld(a0, view, box);
        const next = twoFingerView(view, a0, b0, a1, b1, box);
        expect(wrapAngle(next.roll - view.roll)).toBeCloseTo(ang, 6);
        expect(next.distance).toBeCloseTo(view.distance, 6);
        close(worldToScreen(wa, next, box), a1, 4);
    });

    it('zoom and rotate respect limits and anchor points', () => {
        const pt = { x: 40, y: 400 };
        const w = screenToWorld(pt, view, box);
        const z = zoomAt(view, pt, 1.5, box);
        close(worldToScreen(w, z, box), pt);
        const r = rotateAt(view, pt, 0.7, box);
        close(worldToScreen(w, r, box), pt);
        expect(clampDistance(1, { fitDistance: 20 })).toBeCloseTo(6, 6);
        expect(clampDistance(100, { fitDistance: 20 })).toBeCloseTo(36, 6);
        const far = twoFingerView(view, { x: 100, y: 260 }, { x: 200, y: 260 }, { x: 149, y: 260 }, { x: 151, y: 260 }, box, { fitDistance: 20 });
        expect(far.distance).toBeCloseTo(36, 6);
    });
});

describe('grab, drag and fit helpers', () => {
    const nodes = [{ x: 100, y: 100, r: 15, id: 'a' }, { x: 140, y: 100, r: 15, id: 'b' }];

    it('grabs the nearest person within reach, or nobody', () => {
        expect(pickGrab({ x: 118, y: 104 }, nodes).id).toBe('a');
        expect(pickGrab({ x: 125, y: 100 }, nodes).id).toBe('b');
        expect(pickGrab({ x: 100, y: 160 }, nodes)).toBeNull();
    });

    it('small wobbles stay taps, real moves become drags', () => {
        expect(isDrag({ x: 0, y: 0 }, { x: 6, y: 6 })).toBe(false);
        expect(isDrag({ x: 0, y: 0 }, { x: 12, y: 0 })).toBe(true);
    });

    it('Fit shows only once the view moved away', () => {
        const fit = { cx: 0, cy: 0, distance: 20, roll: 0 };
        expect(isOffFit(fit, fit)).toBe(false);
        expect(isOffFit({ ...fit, roll: 0.3 }, fit)).toBe(true);
        expect(isOffFit({ ...fit, distance: 12 }, fit)).toBe(true);
        expect(isOffFit({ ...fit, cx: 2 }, fit)).toBe(true);
        expect(isOffFit(fit, null)).toBe(false);
    });
});

describe('dragging a person stretches the network', () => {
    const mk = (x, y) => ({ pos: { x, y, z: 0 }, vel: { x: 0, y: 0, z: 0 } });

    it('a held person stays put while their contacts are pulled toward them', () => {
        const objs = [mk(0, 0), mk(3, 0), mk(6, 0), mk(0, 3)];
        const pairs = [[objs[0], objs[1]], [objs[1], objs[2]], [objs[0], objs[3]]];
        settleLayout(objs, pairs);
        const held = objs[2];
        held.pinned = true;
        held.pos.x += 8; // finger drags it far right
        const target = { ...held.pos };
        const before = objs[1].pos.x;
        for (let i = 0; i < 120; i++) layoutStep(objs, pairs, LAYOUT.reheatAlpha);
        expect(held.pos.x).toBe(target.x);
        expect(held.pos.y).toBe(target.y);
        expect(objs[1].pos.x).toBeGreaterThan(before + 1); // contact followed
    });

    it('nobody gets pushed into a held person', () => {
        const a = mk(0, 0);
        const b = mk(0.2, 0);
        a.pinned = true;
        settleLayout([a, b], []);
        expect(a.pos.x).toBe(0);
        expect(Math.hypot(b.pos.x - a.pos.x, b.pos.y - a.pos.y)).toBeGreaterThan(1.3);
    });
});
