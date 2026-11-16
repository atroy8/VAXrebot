// Item 29 (a), round 44: the levels go all the way round each planet, and the
// gaps fill with scenery you cannot play.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { LEVELS } from '../src/config/levels.js';
import { CHESTS } from '../src/config/chests.js';
import { PLANETS } from '../src/config/solar-system.js';
import { journeyPositions, journeyStops, maxLongitudeGap, scenerySites, arc, SCENERY_CLEARANCE, SCENERY_ROAD_CLEARANCE, SCENERY_KINDS, SCENERY_SIZE } from '../src/config/planet-journey.js';
import { windingPath, chestStop, faceRotation } from '../src/ui/globe-math.js';
import { sceneryParts, sceneryExtent, SCENERY_ROLES, SCENERY_MAX_HALF_WIDTH, SCENERY_MAX_HEIGHT } from '../src/ui/scenery.js';
import { BUILDING_TYPES, buildingExtent } from '../src/ui/buildings.js';

const globe = fs.readFileSync(new URL('../src/ui/globe-view.js', import.meta.url), 'utf8');
const norm = (v) => {
    const l = Math.hypot(v.x, v.y, v.z);
    return { x: v.x / l, y: v.y / l, z: v.z / l };
};

// The same inputs globe-view.js uses for each planet.
function planetSetup(pi) {
    const def = PLANETS[pi];
    const levelIdx = [];
    LEVELS.forEach((l, i) => {
        if (l.regionId === def.regionId) levelIdx.push(i);
    });
    const stops = journeyStops(levelIdx.length);
    const road = windingPath([...stops, chestStop(stops, stops.length - 1)], { perLeg: 22, wiggle: 0.05, radius: 1.008 }).map(norm);
    const keepClear = [...stops];
    for (const chest of CHESTS) {
        const local = levelIdx.indexOf(chest.afterLevelIndex);
        if (local >= 0) keepClear.push(chestStop(stops, local));
    }
    const sites = scenerySites(stops, { keepClear, road, seed: 101 + pi * 7919 });
    return { levelIdx, stops, road, keepClear, sites };
}

describe('a journey around each planet (item 29 a)', () => {
    it('every planet has levels, and no gap between them is wider than 90 degrees of longitude', () => {
        expect(PLANETS.length).toBeGreaterThan(0);
        PLANETS.forEach((_, pi) => {
            const { levelIdx } = planetSetup(pi);
            expect(levelIdx.length).toBeGreaterThanOrEqual(4);
            expect(maxLongitudeGap(journeyPositions(levelIdx.length))).toBeLessThanOrEqual(90);
        });
        expect(maxLongitudeGap(journeyPositions(10))).toBeCloseTo(36, 5);
    });

    it('stops stay clear of the poles and of each other', () => {
        for (const p of journeyPositions(10)) expect(Math.abs(p.lat)).toBeLessThan(30);
        const stops = journeyStops(10);
        for (let i = 0; i < stops.length; i++) for (let j = i + 1; j < stops.length; j++) expect(arc(stops[i], stops[j])).toBeGreaterThan(0.5);
    });

    it('scenery fills every gap on every planet', () => {
        PLANETS.forEach((_, pi) => {
            const { sites, stops } = planetSetup(pi);
            expect(sites.length).toBeGreaterThanOrEqual(stops.length * 2);
            for (let leg = 0; leg < stops.length; leg++) expect(sites.some((s) => s.leg === leg)).toBe(true);
            for (const s of sites) expect(SCENERY_KINDS).toContain(s.kind);
            // People you cannot play, and villages, on every planet.
            expect(sites.some((s) => s.kind === 'folk')).toBe(true);
            expect(sites.some((s) => s.kind === 'village')).toBe(true);
        });
    });

    it('scenery never sits on a level stop, a prize box or the road', () => {
        PLANETS.forEach((_, pi) => {
            const { sites, keepClear, road } = planetSetup(pi);
            for (const s of sites) {
                for (const k of keepClear) expect(arc(s.pos, k)).toBeGreaterThanOrEqual(SCENERY_CLEARANCE);
                for (const r of road) expect(arc(s.pos, r)).toBeGreaterThanOrEqual(SCENERY_ROAD_CLEARANCE);
            }
        });
        // The clearance covers the 0.15 tap ball plus the widest scenery piece.
        const widest = Math.max(...SCENERY_KINDS.map((k) => sceneryExtent(k).halfWidth * SCENERY_SIZE[1] * Math.SQRT2));
        expect(SCENERY_CLEARANCE).toBeGreaterThan(0.15 + widest);
    });

    it('the prize box after the boss sits on the road past it, never on top of the boss', () => {
        const stops = journeyStops(10);
        const box = chestStop(stops, 9);
        // Clear of the boss's 0.15 tap ball with room to spare, and of level 1.
        expect(arc(box, stops[9])).toBeGreaterThan(0.3);
        expect(arc(box, stops[0])).toBeGreaterThan(0.3);
        expect(arc(box, stops[9]) + arc(box, stops[0])).toBeCloseTo(arc(stops[9], stops[0]), 5);
        // The road leads on to it.
        expect(globe).toContain('[...stops, chestStop(stops, stops.length - 1)]');
    });

    it('scenery is the same on every visit (seeded per planet)', () => {
        const a = planetSetup(2).sites;
        const b = planetSetup(2).sites;
        expect(a).toEqual(b);
        expect(planetSetup(3).sites).not.toEqual(a);
    });

    it('every scenery piece is small next to a level building, and uses known colour roles', () => {
        const smallestBuilding = Math.min(...BUILDING_TYPES.map((t) => buildingExtent(t).height));
        for (const kind of SCENERY_KINDS) {
            const e = sceneryExtent(kind);
            expect(e.halfWidth).toBeLessThanOrEqual(SCENERY_MAX_HALF_WIDTH);
            expect(e.height).toBeLessThanOrEqual(SCENERY_MAX_HEIGHT);
            expect(e.height * SCENERY_SIZE[1]).toBeLessThan(smallestBuilding * 0.9);
            for (const p of sceneryParts(kind)) expect(SCENERY_ROLES).toContain(p.role);
        }
        expect(() => sceneryParts('castle')).toThrow();
    });

    it('turning to a level brings it to the front of the planet', () => {
        const stops = journeyStops(10);
        for (const s of stops) {
            const r = faceRotation(s, 0.7);
            // Yaw alone puts the stop on the +z meridian (facing the camera).
            const c = Math.cos(r.y);
            const sn = Math.sin(r.y);
            const z = -sn * s.x + c * s.z;
            expect(z).toBeGreaterThan(0.85);
        }
    });

    it('globe-view builds the journey and merged scenery that never takes taps', () => {
        expect(globe).toContain('journeyStops(levelIdx.length)');
        expect(globe).toContain('planets.forEach(buildScenery)');
        expect(globe).toMatch(/mesh\.raycast = \(\) => \{\}/);
        expect(globe).not.toContain('PLANET_LEVEL_POSITIONS[');
        // The planet view faces the chosen level, not the old fixed centre.
        expect(globe).toMatch(/function facingStop[\s\S]{0,500}p\.stops\[local\]/);
        // Seen from the tilt, the chosen level sits mid-screen, not high up.
        expect(globe).toMatch(/slerp\(target, \{ x: 0, y: 1, z: 0 \}, FACE_NORTH\)/);
    });
});
