// Item 29 (b), round 45: each planet's journey passes through three lands,
// each built in the style of a real-world civilization with its own full
// building set, colours and a line of public health history.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { LEVELS } from '../src/config/levels.js';
import { PLANETS } from '../src/config/solar-system.js';
import { CIVILIZATIONS, CIV_ORDER, PLACE_KINDS, LANDS_PER_PLANET, landOfStop, civilizationFor, buildingForPlace, allCivBuildingTypes } from '../src/config/civilizations.js';
import { ROLES, MAX_HALF_WIDTH, MAX_HEIGHT, BUILDING_TYPES, ALL_BUILDING_TYPES, buildingParts, buildingExtent, buildingFor } from '../src/ui/buildings.js';
import { CIV_BUILDERS, domeProfile } from '../src/ui/civ-buildings.js';
import { sceneryExtent } from '../src/ui/scenery.js';
import { SCENERY_SIZE, SCENERY_KINDS } from '../src/config/planet-journey.js';

const globe = fs.readFileSync(new URL('../src/ui/globe-view.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const HIT_R = 0.15;

function planetLevels(pi) {
    return LEVELS.filter((l) => l.regionId === PLANETS[pi].regionId);
}

describe('lands and civilizations along each journey (item 29 b)', () => {
    it('seven civilizations, each with a full building set for every kind of place', () => {
        expect(CIV_ORDER.length).toBe(7);
        expect(Object.keys(CIVILIZATIONS).sort()).toEqual([...CIV_ORDER].sort());
        const seen = new Set();
        for (const id of CIV_ORDER) {
            const civ = CIVILIZATIONS[id];
            for (const kind of PLACE_KINDS) {
                const type = civ.set[kind];
                expect(type, `${id} ${kind}`).toBeTruthy();
                expect(() => buildingParts(type)).not.toThrow();
                // No two civilizations share a building.
                expect(seen.has(type), type).toBe(false);
                seen.add(type);
            }
            // Five different buildings per set.
            expect(new Set(Object.values(civ.set)).size).toBe(PLACE_KINDS.length);
        }
        expect(ALL_BUILDING_TYPES.length).toBe(35);
        expect(allCivBuildingTypes().length).toBe(35);
        // Japan keeps the round 19 buildings.
        expect(Object.values(CIVILIZATIONS.japan.set).sort()).toEqual([...BUILDING_TYPES].sort());
    });

    it('every planet splits into three lands of 4, 3 and 3 stops, and the boss stands in the third', () => {
        const lands = Array.from({ length: 10 }, (_, k) => landOfStop(k, 10));
        expect(lands).toEqual([0, 0, 0, 0, 1, 1, 1, 2, 2, 2]);
        expect(landOfStop(-3, 10)).toBe(0);
        expect(landOfStop(42, 10)).toBe(2);
        for (let pi = 0; pi < PLANETS.length; pi++) {
            const levels = planetLevels(pi);
            const civs = levels.map((_, k) => civilizationFor(pi, k, levels.length));
            expect(new Set(civs).size).toBe(LANDS_PER_PLANET);
            for (const c of civs) expect(CIV_ORDER).toContain(c);
        }
    });

    it('the journey starts in Japan, neighbouring lands always differ, and every civilization appears and hosts a boss', () => {
        expect(civilizationFor(0, 0)).toBe('japan');
        const order = [];
        const bossCivs = new Set();
        for (let pi = 0; pi < PLANETS.length; pi++) {
            const levels = planetLevels(pi);
            levels.forEach((l, k) => {
                const civ = civilizationFor(pi, k, levels.length);
                if (order[order.length - 1] !== civ) order.push(civ);
                if (l.variant && l.variant.boss) bossCivs.add(civ);
            });
        }
        for (let i = 1; i < order.length; i++) expect(order[i]).not.toBe(order[i - 1]);
        expect(new Set(order).size).toBe(7);
        expect(bossCivs.size).toBe(7);
    });

    it('every level gets the building for its kind of place in its land, and bosses get the land\'s boss building', () => {
        for (let pi = 0; pi < PLANETS.length; pi++) {
            const levels = planetLevels(pi);
            levels.forEach((l, k) => {
                const civ = civilizationFor(pi, k, levels.length);
                const type = buildingFor(l, civ);
                expect(Object.values(CIVILIZATIONS[civ].set)).toContain(type);
                expect(type === CIVILIZATIONS[civ].set.boss).toBe(!!(l.variant && l.variant.boss));
            });
        }
        // Spaceports borrow the busiest building; unknown places get the school's.
        expect(buildingForPlace({ scenarioId: 'global' }, 'persia')).toBe('dome-hall');
        expect(buildingForPlace({ scenarioId: 'nowhere' }, 'maya')).toBe('maya-palace');
        expect(buildingForPlace({ scenarioId: 'care' }, 'atlantis')).toBe('temple');
        expect(buildingFor({ scenarioId: 'urban' })).toBe('pagoda');
    });
});

describe('the new buildings (item 29 b)', () => {
    const NEW_TYPES = Object.keys(CIV_BUILDERS);

    it('are made of known parts and roles, stand on the ground, and have a roof, doors or windows', () => {
        expect(NEW_TYPES.length).toBe(30);
        for (const type of NEW_TYPES) {
            const parts = buildingParts(type);
            expect(parts.length, type).toBeGreaterThanOrEqual(4);
            for (const p of parts) {
                expect(ROLES).toContain(p.role);
                expect(['box', 'roof', 'post', 'beam', 'dome']).toContain(p.shape);
                for (const v of p.pos) expect(Number.isFinite(v)).toBe(true);
            }
            // The roof carries the stop's colour (open, beaten or locked).
            expect(parts.some((p) => p.role === 'roof'), type).toBe(true);
            expect(parts.some((p) => p.role === 'dark'), type).toBe(true);
            expect(buildingExtent(type).bottom, type).toBeCloseTo(0, 6);
        }
    });

    it('fit inside the stop\'s tap ball, stay under the height limit, and stand taller than any scenery', () => {
        const tallestScenery = Math.max(...SCENERY_KINDS.map((k) => sceneryExtent(k).height * SCENERY_SIZE[1]));
        for (const type of NEW_TYPES) {
            const e = buildingExtent(type);
            expect(e.halfWidth, type).toBeLessThanOrEqual(MAX_HALF_WIDTH);
            expect(e.halfWidth, type).toBeLessThan(HIT_R);
            expect(e.height, type).toBeLessThanOrEqual(MAX_HEIGHT);
            expect(tallestScenery, type).toBeLessThan(e.height * 0.9);
        }
    });

    it('in every land the boss building is the tallest, so the boss stands out on the road', () => {
        for (const id of CIV_ORDER) {
            const set = CIVILIZATIONS[id].set;
            const boss = buildingExtent(set.boss).height;
            for (const kind of PLACE_KINDS) if (kind !== 'boss') expect(buildingExtent(set[kind]).height, `${id} ${kind}`).toBeLessThan(boss);
        }
    });

    it('domes turn from a profile that runs from the rim to a point on top; onion domes swell past their base', () => {
        for (const onion of [false, true]) {
            const prof = domeProfile(onion);
            expect(prof[0][1]).toBe(0);
            expect(prof[prof.length - 1]).toEqual([0, 1]);
            for (let i = 1; i < prof.length; i++) expect(prof[i][1]).toBeGreaterThan(prof[i - 1][1]);
            for (const [x] of prof) expect(x).toBeLessThanOrEqual(1);
        }
        const onion = domeProfile(true);
        expect(Math.max(...onion.map(([x]) => x))).toBeGreaterThan(onion[0][0]);
        // The Mughal tomb has an onion dome; Persia's domes are round.
        expect(buildingParts('mughal-tomb').some((p) => p.shape === 'dome' && p.onion)).toBe(true);
        expect(buildingParts('dome-hall').some((p) => p.shape === 'dome' && !p.onion)).toBe(true);
        expect(globe).toContain('new THREE.LatheGeometry(pts, 12)');
    });

    it('cones, oblong roofs and turned parts reach the globe', () => {
        expect(buildingParts('granary').some((p) => p.shape === 'post' && p.rTop < p.r)).toBe(true);
        expect(buildingParts('kallanka').some((p) => p.shape === 'roof' && p.zScale < 1)).toBe(true);
        expect(buildingParts('mead-hall').some((p) => p.rot)).toBe(true);
        expect(globe).toContain('g.scale(1, 1, part.zScale)');
        expect(globe).toContain('part.rTop ?? part.r');
        expect(globe).toContain('g.rotateZ(part.rot[2])');
        // Scaling keeps a cone a cone.
        const raw = CIV_BUILDERS.granary().find((p) => p.shape === 'post' && p.rTop < p.r);
        const scaled = buildingParts('granary').find((p) => p.shape === 'post' && p.rTop < p.r);
        expect(scaled.rTop / scaled.r).toBeCloseTo(raw.rTop / raw.r, 9);
    });
});

describe('colours and history per land (item 29 b)', () => {
    it('each land has its own wall, trim and stone colours (Japan keeps the theme)', () => {
        const walls = new Set();
        for (const id of CIV_ORDER) {
            const c = CIVILIZATIONS[id].colors;
            if (id === 'japan') {
                expect(c).toEqual({ wall: null, trim: null, stone: null });
                continue;
            }
            for (const k of ['wall', 'trim', 'stone']) expect(Number.isInteger(c[k]) && c[k] >= 0 && c[k] <= 0xffffff, `${id} ${k}`).toBe(true);
            walls.add(c.wall);
        }
        expect(walls.size).toBe(6);
        expect(globe).toContain('civColors.wall ?? BUILDING_WALL');
        // Scenery walls and stone take the colour of their land.
        expect(globe).toContain('site.civ = civilizationFor(p.index, site.leg, p.stops.length)');
    });

    it('each land carries one short line of real public health history, shown on the level sheet', () => {
        for (const id of CIV_ORDER) {
            const { history, name, land } = CIVILIZATIONS[id];
            expect(name.length).toBeGreaterThan(3);
            expect(land.length).toBeGreaterThan(3);
            expect(history.length).toBeGreaterThan(40);
            expect(history.length).toBeLessThanOrEqual(180);
            expect(history).not.toMatch(/\u2014|\u2013/);
            expect(history).toMatch(/\.$/);
        }
        expect(globe).toContain('id="globe-sheet-note"');
        expect(globe).toContain('note: { land: landName(marker.civ), text: (CIVILIZATIONS[marker.civ] || CIVILIZATIONS.japan).history }');
        expect(globe).toContain("tag.className = 'globe-sheet-land'");
        expect(globe).toMatch(/noteEl\.hidden = !note/);
        expect(css).toContain('.globe-sheet-note {');
        expect(css).toContain('.globe-sheet-land {');
    });
});
