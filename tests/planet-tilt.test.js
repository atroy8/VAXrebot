// Item 23 (round 25): the planet view looks at the planet from a lower,
// tilted angle so buildings show their walls, doors and roofs.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { tiltedOffset, PLANET_VIEW_TILT_DEG, PLANET_VIEW_AIM_UP } from '../src/ui/globe-math.js';
import { standingUp, viewAngle, MIN_VIEW_DEG } from '../src/ui/buildings.js';
import { PLANET_LEVEL_POSITIONS } from '../src/config/solar-system.js';

const globe = fs.readFileSync(new URL('../src/ui/globe-view.js', import.meta.url), 'utf8');
const deg = (r) => (r * 180) / Math.PI;
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const len = (a) => Math.hypot(a.x, a.y, a.z);
const unit = (a) => ({ x: a.x / len(a), y: a.y / len(a), z: a.z / len(a) });

describe('tilted planet camera (item 23)', () => {
    it('swings the camera off straight-down by the tilt, toward the bottom of the screen, at the same distance', () => {
        expect(PLANET_VIEW_TILT_DEG).toBeGreaterThanOrEqual(15);
        expect(PLANET_VIEW_TILT_DEG).toBeLessThanOrEqual(35);
        const o = tiltedOffset(10);
        expect(len(o)).toBeCloseTo(10, 6);
        expect(deg(Math.atan2(o.z, o.y))).toBeCloseTo(PLANET_VIEW_TILT_DEG, 6);
        expect(o.z).toBeGreaterThan(0); // +z is the bottom of the screen
        expect(tiltedOffset(10, 0)).toEqual({ x: 0, y: 10, z: 0 });
    });

    it('the planet view and every flight to a planet use the tilted spot', () => {
        expect(globe).toMatch(/function planetCameraSpot[\s\S]{0,300}tiltedOffset\(planetFitDistance\(pi\)\)/);
        expect(globe).toMatch(/PLANET_VIEW_AIM_UP \* planets\[pi\]\.radius/);
        expect(PLANET_VIEW_AIM_UP).toBeGreaterThanOrEqual(0);
        expect(PLANET_VIEW_AIM_UP).toBeLessThan(0.3);
    });

    it('the far row of stops stays well clear of the horizon', () => {
        // The far row sits at the highest latitude; the tilt adds to its
        // angle from the line of sight. Keep it under 75 degrees so the
        // building and its label stay on the visible face.
        const farLat = Math.max(...PLANET_LEVEL_POSITIONS.map((p) => p.lat));
        expect(farLat + PLANET_VIEW_TILT_DEG).toBeLessThan(75);
    });
});

describe('buildings stand up on the planet (item 23)', () => {
    const toCam = { x: 0, y: 0, z: 1 };
    const up = { x: 0, y: 1, z: 0 };

    it('a building seen head on tips back to the minimum view angle, top toward the top of the screen', () => {
        const u = standingUp({ x: 0, y: 0, z: 1 }, toCam, up);
        expect(deg(Math.acos(dot(u, toCam)))).toBeCloseTo(MIN_VIEW_DEG, 4);
        expect(u.y).toBeGreaterThan(0);
        expect(viewAngle(0)).toBeCloseTo(MIN_VIEW_DEG, 4);
    });

    it('far buildings already seen from the side keep their true up', () => {
        const n = unit({ x: 0.2, y: Math.sin((70 * Math.PI) / 180), z: Math.cos((70 * Math.PI) / 180) });
        const u = standingUp(n, toCam, up);
        expect(dot(u, n)).toBeCloseTo(1, 6);
    });

    it('never tips a building toward the bottom of the screen (that shows its roof and back)', () => {
        for (let a = 0; a <= 80; a += 5) {
            for (const dir of [-1, 1]) {
                const r = (a * Math.PI) / 180;
                const u = standingUp({ x: 0, y: dir * Math.sin(r), z: Math.cos(r) }, toCam, up);
                expect(u.y).toBeGreaterThanOrEqual(-1e-9);
                expect(deg(Math.acos(dot(u, toCam)))).toBeGreaterThanOrEqual(MIN_VIEW_DEG - 1e-6);
            }
        }
    });

    it('turns smoothly as a stop moves across the view (no sudden flips)', () => {
        let prev = null;
        for (let a = -60; a <= 60; a += 1) {
            const r = (a * Math.PI) / 180;
            const u = standingUp(unit({ x: Math.sin(r) * 0.6, y: Math.sin(r) * 0.8, z: Math.cos(r) }), toCam, up);
            if (prev) expect(deg(Math.acos(Math.min(1, dot(u, prev))))).toBeLessThan(6);
            prev = u;
        }
    });

    it('side stops lean out a little but never look like they are falling over', () => {
        const u = standingUp(unit({ x: 0.3, y: 0, z: 1 }), toCam, up);
        const sideways = deg(Math.atan2(Math.abs(u.x), u.y));
        expect(sideways).toBeLessThan(35);
    });

    it('the globe uses standingUp for every building', () => {
        expect(globe).toContain('standingUp(L.n, L.toCam, L.up)');
        expect(globe).not.toContain('leanWeights');
    });
});
