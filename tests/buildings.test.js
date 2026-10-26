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
                expect(['box', 'roof', 'post', 'beam']).toContain(p.shape);
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

describe('stop labels clear their buildings (item 19, round 23)', () => {
    it('lift puts the label on the ridge: it grows with the building on screen and never goes negative', async () => {
        const { labelLift, LABEL_TUCK } = await import('../src/ui/buildings.js');
        expect(labelLift(500, 500)).toBe(0);
        expect(labelLift(500, 520)).toBe(0);
        expect(labelLift(500, 460)).toBe(40 - LABEL_TUCK);
        expect(labelLift(500, 440)).toBeGreaterThan(labelLift(500, 460));
        expect(labelLift(NaN, 400)).toBe(0);
        expect(globe).toContain('placeLabel(m.label, tmpC, lift)');
        // The ridge is projected through the leaning body, not estimated.
        expect(globe).toContain('m.body.localToWorld(tmpTop)');
    });

    it('locked labels carry the padlock inside the number pill, not in a second bubble', async () => {
        const { levelLabelHtml } = await import('../src/ui/globe-labels.js');
        const html = levelLabelHtml(4, { unlocked: false, completed: false, stars: 0 });
        expect(html).toMatch(/^<span class="globe-label-num">5<span class="globe-label-lock"[^>]*><svg[\s\S]*<\/span><\/span>$/);
    });
});

describe('curved roofs and small details (item 19, round 23)', () => {
    it('roof corners sweep up at the eaves while the middle of each side stays low', async () => {
        const { roofHeight } = await import('../src/ui/buildings.js');
        const h = 0.05;
        expect(roofHeight(0, 0, h)).toBeCloseTo(-h / 2, 9);
        expect(roofHeight(0, 1, h)).toBeGreaterThan(roofHeight(0, 0, h) + 0.3 * h);
        expect(roofHeight(1, 0, h)).toBeCloseTo(h / 2, 9);
        // Concave like a real Japanese roof: below the straight line halfway up.
        expect(roofHeight(0.5, 0, h)).toBeLessThan(0);
        // Never pokes above the ridge.
        for (let t = 0; t <= 1; t += 0.1) for (let c = 0; c <= 1; c += 0.25) expect(roofHeight(t, c, h)).toBeLessThanOrEqual(h / 2 + 1e-12);
    });

    it('the roof mesh is a closed-top square shell inside its part bounds with valid triangles', async () => {
        const { roofSurface } = await import('../src/ui/buildings.js');
        const part = { bottom: 0.1, top: 0.03, h: 0.04 };
        const { positions, indices } = roofSurface(part);
        const n = positions.length / 3;
        expect(indices.length % 3).toBe(0);
        for (const i of indices) expect(i).toBeGreaterThanOrEqual(0), expect(i).toBeLessThan(n);
        for (let i = 0; i < n; i++) {
            const [x, y, z] = positions.slice(i * 3, i * 3 + 3);
            expect(Math.abs(x)).toBeLessThanOrEqual(part.bottom + 1e-9);
            expect(Math.abs(z)).toBeLessThanOrEqual(part.bottom + 1e-9);
            expect(Math.abs(y)).toBeLessThanOrEqual(part.h / 2 + 1e-9);
        }
        // An eave corner is higher than the middle of an eave side.
        const eave = positions.slice(0, 3);
        const mid = positions.slice(3 * 3, 3 * 3 + 3);
        expect(eave[1]).toBeGreaterThan(mid[1]);
    });

    it('torii top beams sweep up at both ends and stay level in the middle', async () => {
        const { beamLift } = await import('../src/ui/buildings.js');
        expect(beamLift(0, 0.2, 0.01)).toBe(0);
        expect(beamLift(0.1, 0.2, 0.01)).toBeCloseTo(0.01, 9);
        expect(beamLift(-0.1, 0.2, 0.01)).toBeCloseTo(0.01, 9);
        expect(beamLift(0.05, 0.2, 0.01)).toBeLessThan(0.002);
    });

    it('every building has dark doors or windows; pagodas and castles have gold finials', () => {
        for (const type of BUILDING_TYPES) expect(buildingParts(type).some((p) => p.role === 'dark')).toBe(true);
        for (const type of ['pagoda', 'castle']) expect(buildingParts(type).some((p) => p.role === 'gold')).toBe(true);
        expect(buildingParts('torii').some((p) => p.shape === 'beam')).toBe(true);
        // The castle's stone base keeps straight sloped walls.
        expect(buildingParts('castle').find((p) => p.role === 'stone').straight).toBe(true);
    });

    it('locked stops are fully grey, finials included; open stops keep gold finials', () => {
        const base = { button: 1, gold: 2, locked: 3, wall: 4, trim: 5, stone: 6, dark: 7, finial: 8 };
        const locked = buildingColors({ ...base, unlocked: false, done: false, current: false });
        expect(locked.dark).toBe(3);
        expect(locked.gold).toBe(3);
        const open = buildingColors({ ...base, unlocked: true, done: false, current: false });
        expect(open.dark).toBe(7);
        expect(open.gold).toBe(8);
        expect(globe).toContain('roofSurface(part)');
    });
});
