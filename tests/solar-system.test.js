import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { PLANETS, SYSTEM_LAYOUTS, PLANET_LEVEL_POSITIONS, SUN_RADIUS, SYSTEM_SPACING, planetRadius } from '../src/config/solar-system.js';
import { LEVELS, REGIONS, SYSTEMS, PLANET_DEFS } from '../src/config/levels.js';
import { CHESTS } from '../src/config/chests.js';
import {
    orbitAngle,
    orbitPosition,
    topDownXY,
    systemCamera,
    galaxyCamera,
    minPlanetGap,
    planetIndexForLevel,
    planetLevels,
    planetStatus,
    systemStatus,
} from '../src/ui/solar-math.js';
import { freshSave as createSave } from '../src/save.js';
import { latLngToXYZ, windingPath, chestStop } from '../src/ui/globe-math.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const win = (save, ids, stars = 3) => ({
    ...save,
    levels: { ...save.levels, ...Object.fromEntries(ids.map((id) => [id, { stars, completed: true, bestDeaths: 0 }])) },
});
const idsOf = (regionId) => LEVELS.filter((l) => l.regionId === regionId).map((l) => l.id);
const FOV = 40;
const PHONE = 390 / 844;
const pxPerUnit = (cam, h = 844) => h / (2 * cam.distance * Math.tan((FOV * Math.PI) / 360));

describe('galaxy layout (round 14)', () => {
    it('has 3 systems with 2, 3 and 3 planets, one planet per region, in campaign order', () => {
        expect(SYSTEM_LAYOUTS.map((s) => s.system.name)).toEqual(['Kasumi Reach', 'Akatsuki Belt', 'Hoshizora Crown']);
        expect(SYSTEM_LAYOUTS.map((s) => s.planets.length)).toEqual([2, 3, 3]);
        expect(PLANETS.map((p) => p.regionId)).toEqual(REGIONS.map((r) => r.id));
        expect(SYSTEMS).toHaveLength(3);
    });

    it('every planet holds 10 levels and every level and prize box lands on a planet', () => {
        for (const p of PLANETS) expect(planetLevels(LEVELS, p)).toHaveLength(10);
        for (const l of LEVELS) expect(planetIndexForLevel(LEVELS, l.id)).toBeGreaterThanOrEqual(0);
        for (const c of CHESTS) expect(planetIndexForLevel(LEVELS, LEVELS[c.afterLevelIndex].id)).toBeGreaterThanOrEqual(0);
        expect(planetIndexForLevel(LEVELS, 'nope')).toBe(-1);
    });

    it('planet sizes vary and follow the campaign sizes', () => {
        const radii = PLANETS.map((p) => p.radius);
        expect(new Set(radii).size).toBeGreaterThan(4);
        expect(Math.max(...radii) / Math.min(...radii)).toBeGreaterThan(1.5);
        PLANETS.forEach((p, i) => expect(p.radius).toBeCloseTo(planetRadius(PLANET_DEFS[i]), 9));
    });

    it('orbits are circles: every point of a lap is the same distance from the sun', () => {
        for (const s of SYSTEM_LAYOUTS) {
            for (const p of s.planets) {
                for (let k = 0; k < 36; k++) {
                    const q = orbitPosition(p, (k / 36) * 2 * Math.PI, s.centre);
                    expect(Math.hypot(q.x - s.centre.x, q.z - s.centre.z)).toBeCloseTo(p.orbitR, 9);
                    expect(q.y).toBe(0);
                }
            }
        }
    });

    it('seen from above, an orbit is just as wide as it is tall on screen (not an ellipse)', () => {
        for (const s of SYSTEM_LAYOUTS) {
            for (const p of s.planets) {
                const pts = Array.from({ length: 360 }, (_, k) => topDownXY(orbitPosition(p, (k / 180) * Math.PI, s.centre)));
                const w = Math.max(...pts.map((q) => q.x)) - Math.min(...pts.map((q) => q.x));
                const h = Math.max(...pts.map((q) => q.y)) - Math.min(...pts.map((q) => q.y));
                expect(w / h).toBeCloseTo(1, 3);
            }
        }
        const src = read('src/ui/globe-view.js');
        expect(src).toContain('camera.up.set(0, 0, -1)');
        // Every camera spot is straight above what it looks at.
        for (const s of SYSTEM_LAYOUTS) {
            const cam = systemCamera({ fovDeg: FOV, aspect: PHONE, layout: s });
            expect(cam.position.x).toBe(cam.target.x);
            expect(cam.position.z).toBe(cam.target.z);
            expect(cam.position.y).toBeGreaterThan(0);
        }
    });

    it('planets never touch each other or the sun', () => {
        for (const s of SYSTEM_LAYOUTS) {
            expect(minPlanetGap(s)).toBeGreaterThan(0.25);
            expect(s.planets[0].orbitR - s.planets[0].radius).toBeGreaterThan(SUN_RADIUS);
        }
    });

    it('orbits keep turning and wrap around', () => {
        expect(orbitAngle(0)).toBe(0);
        expect(orbitAngle(60, 120)).toBeCloseTo(Math.PI, 6);
        expect(orbitAngle(150, 120)).toBeCloseTo(Math.PI / 2, 6);
    });

    it('a whole system fits a 390 x 844 phone and its planets are big enough to tap', () => {
        for (const s of SYSTEM_LAYOUTS) {
            const cam = systemCamera({ fovDeg: FOV, aspect: PHONE, layout: s });
            const ppu = pxPerUnit(cam);
            expect(2 * s.extent * ppu).toBeLessThanOrEqual(390);
            // Tap areas are at least 0.5 world units in radius (see globe-view.js).
            for (const p of s.planets) expect(2 * Math.max(1.5 * p.radius, 0.5) * ppu).toBeGreaterThanOrEqual(44);
            expect(2 * Math.min(...s.planets.map((p) => p.radius)) * ppu).toBeGreaterThan(28);
        }
    });

    it('the galaxy view shows all three systems, and neighbours stay out of a system view', () => {
        const g = galaxyCamera({ fovDeg: FOV, aspect: PHONE });
        const ppu = pxPerUnit(g);
        const halfWPx = 195;
        const halfHPx = 422;
        for (const s of SYSTEM_LAYOUTS) {
            const dx = (s.centre.x - g.target.x) * ppu;
            const dy = (s.centre.z - g.target.z) * ppu;
            expect(Math.abs(dx) + s.extent * ppu).toBeLessThanOrEqual(halfWPx + 1);
            expect(Math.abs(dy) + s.extent * ppu).toBeLessThanOrEqual(halfHPx + 1);
        }
        for (const s of SYSTEM_LAYOUTS) {
            const cam = systemCamera({ fovDeg: FOV, aspect: PHONE, layout: s });
            const visibleHalfH = cam.distance * Math.tan((FOV * Math.PI) / 360);
            for (const o of SYSTEM_LAYOUTS) {
                if (o === s) continue;
                const gap = Math.abs(o.centre.z - cam.target.z) - o.extent;
                expect(gap).toBeGreaterThan(visibleHalfH);
            }
        }
        expect(SYSTEM_SPACING).toBeGreaterThan(10);
    });

    it("a planet's 10 levels all sit on the side facing you, far enough apart to tap", () => {
        expect(PLANET_LEVEL_POSITIONS).toHaveLength(10);
        const front = latLngToXYZ(0, -90);
        const stops = PLANET_LEVEL_POSITIONS.map((p) => latLngToXYZ(p.lat, p.lng));
        for (const v of stops) expect(v.x * front.x + v.y * front.y + v.z * front.z).toBeGreaterThan(Math.cos((62 * Math.PI) / 180));
        // On screen (planet fills about 370 px), buttons are at least 50 px apart.
        const R = 185;
        for (let i = 0; i < stops.length; i++) {
            for (let j = i + 1; j < stops.length; j++) {
                const d = Math.hypot(stops[i].x - stops[j].x, stops[i].y - stops[j].y) * R;
                expect(d).toBeGreaterThan(50);
            }
        }
        // The road climbs: level 10 sits above level 1.
        expect(stops[9].y).toBeGreaterThan(stops[0].y);
        expect(windingPath(stops, { perLeg: 4 })).toHaveLength(37);
        // Prize boxes after levels 4 and 9 sit between their level and the next.
        const box = chestStop(stops, 3);
        expect(box.z).toBeGreaterThan(0);
    });
});

describe('planet and system unlocking', () => {
    const [mizuho, hanabi, tsukimi] = PLANETS;
    const [kasumi, akatsuki] = SYSTEM_LAYOUTS;

    it('only the first planet and system are open on a new save', () => {
        const save = createSave();
        expect(planetStatus(save, LEVELS, REGIONS, mizuho).unlocked).toBe(true);
        const n = planetStatus(save, LEVELS, REGIONS, hanabi);
        expect(n.unlocked).toBe(false);
        expect(n.reason).toMatch(/Complete/);
        expect(systemStatus(save, LEVELS, REGIONS, kasumi).unlocked).toBe(true);
        const a = systemStatus(save, LEVELS, REGIONS, akatsuki);
        expect(a.unlocked).toBe(false);
        expect(a.need).toBe(30);
        expect(a.reason).toMatch(/Earn 30 stars to reach Akatsuki Belt/);
    });

    it("beating a planet's last level opens the next planet", () => {
        const ids = idsOf(mizuho.regionId);
        let save = win(createSave(), ids.slice(0, 9));
        expect(planetStatus(save, LEVELS, REGIONS, hanabi).unlocked).toBe(false);
        save = win(save, ids.slice(9));
        expect(planetStatus(save, LEVELS, REGIONS, mizuho)).toMatchObject({ done: true, stars: 30, maxStars: 30, completed: 10 });
        expect(planetStatus(save, LEVELS, REGIONS, hanabi).unlocked).toBe(true);
        expect(planetStatus(save, LEVELS, REGIONS, tsukimi).unlocked).toBe(false);
    });

    it('a new system opens with the star requirement and the previous planet done', () => {
        let save = win(createSave(), [...idsOf(mizuho.regionId), ...idsOf(hanabi.regionId)], 1);
        const low = systemStatus(save, LEVELS, REGIONS, akatsuki);
        expect(low.unlocked).toBe(false);
        expect(low.reason).toMatch(/stars/);
        save = win(save, [...idsOf(mizuho.regionId), ...idsOf(hanabi.regionId)], 2);
        const st = systemStatus(save, LEVELS, REGIONS, akatsuki);
        expect(st.unlocked).toBe(true);
        expect(st.maxStars).toBe(90);
        expect(systemStatus(save, LEVELS, REGIONS, kasumi)).toMatchObject({ done: true, stars: 40, maxStars: 60 });
    });
});
