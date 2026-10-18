import { describe, it, expect } from 'vitest';
import { WADA_COMBINATIONS } from '../src/config/wada-palettes.js';
import {
    planetPalette,
    starPalette,
    paletteForSeed,
    comboFor,
    isPlanetFriendly,
    lightness,
    mix,
    MIN_SEA_LAND_CONTRAST,
    combinationById,
} from '../src/config/planet-palettes.js';
import { PLANET_DEFS, SYSTEMS } from '../src/config/levels.js';

const HEX = /^#[0-9a-f]{6}$/;

describe('Wada colour palettes for planets (round 14)', () => {
    it('lightness matches the dataset and mixing works', () => {
        for (const combo of WADA_COMBINATIONS.slice(0, 40)) {
            for (const [, hex, L] of combo.colors) expect(Math.abs(lightness(hex) - L)).toBeLessThan(3);
        }
        expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080');
    });

    it('every planet and system uses a real combination from the dictionary', () => {
        for (const d of [...PLANET_DEFS, ...SYSTEMS]) expect(combinationById(d.paletteId)).not.toBeNull();
        expect(new Set(PLANET_DEFS.map((p) => p.paletteId)).size).toBe(PLANET_DEFS.length);
    });

    it('seas are the darkest colour and land is clearly lighter, for every planet-friendly combination', () => {
        const pool = WADA_COMBINATIONS.filter(isPlanetFriendly);
        expect(pool.length).toBeGreaterThan(80);
        for (const combo of pool) {
            const pal = planetPalette(combo);
            expect(pal.ocean).toHaveLength(2);
            expect(pal.land).toHaveLength(6);
            for (const c of [...pal.ocean, ...pal.land, pal.frost, pal.wave]) expect(c).toMatch(HEX);
            const seaL = Math.max(...pal.ocean.map(lightness));
            const landL = Math.min(...pal.land.map(lightness));
            expect(landL - seaL).toBeGreaterThanOrEqual(MIN_SEA_LAND_CONTRAST - 0.01);
            const darkest = Math.min(...combo.colors.map((c) => c[2]));
            expect(lightness(pal.ocean[1])).toBeLessThanOrEqual(darkest + 1);
            const btnL = lightness(`#${pal.button.toString(16).padStart(6, '0')}`);
            expect(btnL).toBeGreaterThan(40);
            expect(btnL).toBeLessThan(72);
        }
    });

    it('suns get light stripes and a deep sky tint', () => {
        for (const s of SYSTEMS) {
            const sp = starPalette(comboFor(s));
            expect(lightness(sp.stripeA)).toBeGreaterThan(60);
            expect(lightness(sp.sky)).toBeLessThan(25);
        }
    });

    it('a seed always generates the same colour scheme, and different seeds vary', () => {
        expect(paletteForSeed(1234).id).toBe(paletteForSeed(1234).id);
        const ids = new Set(Array.from({ length: 40 }, (_, i) => paletteForSeed(i * 7919).id));
        expect(ids.size).toBeGreaterThan(15);
        for (let i = 0; i < 40; i++) expect(isPlanetFriendly(paletteForSeed(i))).toBe(true);
        // A future planet with no paletteId colours itself from its id.
        const a = comboFor({ id: 'future-world' });
        expect(a.id).toBe(comboFor({ id: 'future-world' }).id);
        expect(isPlanetFriendly(a)).toBe(true);
    });
});
