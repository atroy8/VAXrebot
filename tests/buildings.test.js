import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { BUILDING_TYPES, ROLES, MAX_HALF_WIDTH, MAX_HEIGHT, buildingParts, buildingFor, buildingExtent, buildingColors } from '../src/ui/buildings.js';
import { LEVELS } from '../src/config/levels.js';

const globe = readFileSync(new URL('../src/ui/globe-view.js', import.meta.url), 'utf8');
// The stop's tap ball in globe-view.js (radius in planet units).
const HIT_R = Number(globe.match(/new THREE\.SphereGeometry\((0\.\d+), 8, 8\)[^\n]*\n\s*hit\.userData = \{ kind: 'level'/)[1]);

describe('Japanese buildings at the level stops (item 19)', () => {
    it('every stop on every planet gets a building, and bosses get the castle', () => {
        for (const level of LEVELS) {
            const type = buildingFor(level);
            expect(BUILDING_TYPES).toContain(type);
            expect(type === 'castle').toBe(!!(level.variant && level.variant.boss));
        }
        // Each planet shows all five kinds of building.
        const planets = new Map();
        for (const l of LEVELS) {
            if (!planets.has(l.regionId)) planets.set(l.regionId, new Set());
            planets.get(l.regionId).add(buildingFor(l));
        }
        for (const set of planets.values()) expect([...set].sort()).toEqual([...BUILDING_TYPES].sort());
    });

    it('buildings are made of known parts with known roles, standing on the surface', () => {
        for (const type of BUILDING_TYPES) {
            const parts = buildingParts(type);
            expect(parts.length).toBeGreaterThanOrEqual(4);
            for (const p of parts) {
                expect(ROLES).toContain(p.role);
                expect(['box', 'roof', 'post']).toContain(p.shape);
            }
            expect(parts.some((p) => p.role === 'roof')).toBe(true);
            expect(buildingExtent(type).bottom).toBeCloseTo(0, 6);
        }
        expect(() => buildingParts('dome')).toThrow();
    });

    it('every building fits inside its tap ball and stays low enough for the road', () => {
        expect(HIT_R).toBeGreaterThanOrEqual(0.15);
        for (const type of BUILDING_TYPES) {
            const e = buildingExtent(type);
            expect(e.halfWidth).toBeLessThanOrEqual(MAX_HALF_WIDTH);
            expect(e.halfWidth).toBeLessThan(HIT_R);
            expect(e.height).toBeLessThanOrEqual(MAX_HEIGHT);
            expect(e.height).toBeGreaterThan(0.08);
        }
        // The castle is the tallest, so the boss stands out on the road.
        const castle = buildingExtent('castle').height;
        for (const type of BUILDING_TYPES) expect(buildingExtent(type).height).toBeLessThanOrEqual(castle);
    });

    it('the current stop glows, beaten stops get gold roofs, locked stops are grey and dimmed', () => {
        const base = { button: 1, gold: 2, locked: 3, wall: 4, trim: 5, stone: 6 };
        const cur = buildingColors({ ...base, unlocked: true, done: false, current: true });
        const open = buildingColors({ ...base, unlocked: true, done: false, current: false });
        const done = buildingColors({ ...base, unlocked: true, done: true, current: false });
        const locked = buildingColors({ ...base, unlocked: false, done: false, current: false });
        expect(cur.glow).toBeGreaterThan(open.glow);
        expect(open.roof).toBe(1);
        expect(done.roof).toBe(2);
        expect(locked.dim).toBe(true);
        for (const r of ROLES) expect(locked[r]).toBe(3);
        expect(cur.dim).toBe(false);
    });

    it('the globe builds stops from buildings.js, no dome buttons left', () => {
        expect(globe).toContain('buildingParts(type)');
        expect(globe).toContain('buildingFor(level)');
        expect(globe).not.toMatch(/capGeo|buttonGeo/);
    });
});

describe('buildings lean toward the viewer (item 19)', () => {
    it('lean about 30 degrees, enough to show the front but never lying flat', async () => {
        const { leanAngleAtCentre } = await import('../src/ui/buildings.js');
        const a = leanAngleAtCentre();
        expect(a).toBeGreaterThan(20);
        expect(a).toBeLessThan(45);
        expect(globe).toContain('leanTowardViewer(m)');
    });
});

describe('stop labels clear their buildings (item 19)', () => {
    it('lift grows with the building and stays a fraction of its height', async () => {
        const { labelLift } = await import('../src/ui/buildings.js');
        expect(labelLift(0)).toBe(0);
        expect(labelLift(60)).toBeGreaterThan(labelLift(30));
        expect(labelLift(60)).toBeLessThan(60);
        expect(globe).toContain('placeLabel(m.label, tmpC, lift)');
    });
});
