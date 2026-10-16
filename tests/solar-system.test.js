import { describe, it, expect } from 'vitest';
import { PLANETS, PLANET_RADIUS, PLANET_LEVEL_POSITIONS, SUN_RADIUS } from '../src/config/solar-system.js';
import { LEVELS, REGIONS } from '../src/config/levels.js';
import { CHESTS } from '../src/config/chests.js';
import {
    orbitAngle,
    orbitPosition,
    systemCamera,
    minPlanetSeparation,
    planetIndexForLevel,
    planetLevels,
    planetStatus,
} from '../src/ui/solar-math.js';
import { freshSave as createSave } from '../src/save.js';
import { latLngToXYZ } from '../src/ui/globe-math.js';

const win = (save, ids) => ({
    ...save,
    levels: { ...save.levels, ...Object.fromEntries(ids.map((id) => [id, { stars: 3, completed: true, bestDeaths: 0 }])) },
});

describe('solar system layout', () => {
    it('has one planet per region, each with its three levels', () => {
        expect(PLANETS.map((p) => p.regionId)).toEqual(REGIONS.map((r) => r.id));
        for (const p of PLANETS) expect(planetLevels(LEVELS, p)).toHaveLength(3);
        expect(new Set(PLANETS.map((p) => p.name)).size).toBe(3);
    });

    it('every level and every prize box lands on a planet', () => {
        for (const l of LEVELS) expect(planetIndexForLevel(LEVELS, l.id)).toBeGreaterThanOrEqual(0);
        for (const c of CHESTS) expect(planetIndexForLevel(LEVELS, LEVELS[c.afterLevelIndex].id)).toBeGreaterThanOrEqual(0);
        expect(planetIndexForLevel(LEVELS, 'nope')).toBe(-1);
    });

    it('planets never overlap each other on screen during a lap', () => {
        expect(minPlanetSeparation()).toBeGreaterThan(2 * PLANET_RADIUS * 1.5);
    });

    it('planets never touch the sun', () => {
        for (const p of PLANETS) {
            for (let s = 0; s < 360; s++) {
                const q = orbitPosition(p, (s / 180) * Math.PI);
                expect(Math.hypot(q.x, q.z)).toBeGreaterThan(SUN_RADIUS + PLANET_RADIUS);
            }
        }
    });

    it('orbits keep turning and wrap around', () => {
        expect(orbitAngle(0)).toBe(0);
        expect(orbitAngle(60, 120)).toBeCloseTo(Math.PI, 6);
        expect(orbitAngle(150, 120)).toBeCloseTo(Math.PI / 2, 6);
    });

    it('the whole system fits a 390 x 844 phone with planets at least 60 px wide', () => {
        const fov = 40;
        const cam = systemCamera({ fovDeg: fov, aspect: 390 / 844 });
        const pxPerUnit = 844 / (2 * cam.distance * Math.tan((fov * Math.PI) / 360));
        expect(2 * PLANET_RADIUS * pxPerUnit).toBeGreaterThan(60);
        // Widest orbit plus a planet stays inside the screen width.
        const halfW = Math.max(...PLANETS.map((p) => p.orbit.a)) + PLANET_RADIUS;
        expect(2 * halfW * pxPerUnit).toBeLessThan(390);
        expect(cam.position.y).toBeGreaterThan(0);
    });

    it("a planet's three levels all sit on the side facing you", () => {
        const front = latLngToXYZ(PLANET_LEVEL_POSITIONS[1].lat, PLANET_LEVEL_POSITIONS[1].lng);
        for (const pos of PLANET_LEVEL_POSITIONS) {
            const v = latLngToXYZ(pos.lat, pos.lng);
            expect(v.x * front.x + v.y * front.y + v.z * front.z).toBeGreaterThan(Math.cos((50 * Math.PI) / 180));
        }
    });
});

describe('planet unlocking', () => {
    const [home, national, global] = PLANETS;

    it('only the first planet is open on a new save', () => {
        const save = createSave();
        expect(planetStatus(save, LEVELS, REGIONS, home).unlocked).toBe(true);
        const n = planetStatus(save, LEVELS, REGIONS, national);
        expect(n.unlocked).toBe(false);
        expect(n.reason).toMatch(/Complete/);
        expect(planetStatus(save, LEVELS, REGIONS, global).unlocked).toBe(false);
    });

    it("beating a planet's last level opens the next planet", () => {
        let save = win(createSave(), ['r1-care-home', 'r1-elementary']);
        expect(planetStatus(save, LEVELS, REGIONS, national).unlocked).toBe(false);
        save = win(save, ['r1-old-town']);
        const h = planetStatus(save, LEVELS, REGIONS, home);
        expect(h).toMatchObject({ done: true, stars: 9, maxStars: 9, completed: 3 });
        expect(planetStatus(save, LEVELS, REGIONS, national).unlocked).toBe(true);
        expect(planetStatus(save, LEVELS, REGIONS, global).unlocked).toBe(false);
    });

    it('still honours the region star requirement', () => {
        const save = createSave();
        save.levels = Object.fromEntries(['r1-care-home', 'r1-elementary', 'r1-old-town'].map((id) => [id, { stars: 1, completed: true, bestDeaths: 0 }]));
        const n = planetStatus(save, LEVELS, REGIONS, national);
        expect(n.unlocked).toBe(false);
        expect(n.reason).toMatch(/stars/);
    });
});
