import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import sharp from 'sharp';
import { castForLand, citizenSvg, seededRandom, LAND_PEOPLE, SKIN_TONES, FRAMES, OUTFITS } from '../art/source/citizens.mjs';
import { castLevel, lookFor, lookFaceUrl, CAST_SIZE } from '../src/ui/people.js';

const LANDS = Object.keys(LAND_PEOPLE);

describe('every level is a crowd of different people (round 53)', () => {
    it('each land has people, a tone range and an outfit', () => {
        expect(LANDS.sort()).toEqual(Object.keys(OUTFITS).sort());
        for (const c of LANDS) for (const t of LAND_PEOPLE[c].tones) expect(SKIN_TONES[t]).toMatch(/^#[0-9a-f]{6}$/);
    });

    it('a cast of ten mixes looks, tones, ages, hair and visitors in every land', () => {
        for (const civ of LANDS) {
            for (let seed = 1; seed <= 20; seed++) {
                const cast = castForLand(civ, 10, seededRandom(seed));
                expect(cast).toHaveLength(10);
                expect(new Set(cast.map((l) => l.key)).size, `${civ} ${seed}`).toBe(10);
                expect(new Set(cast.map((l) => l.skin)).size).toBeGreaterThanOrEqual(3);
                expect(new Set(cast.map((l) => l.style)).size).toBeGreaterThanOrEqual(3);
                expect(cast.some((l) => l.elder && l.glasses)).toBe(true);
                expect(cast.some((l) => l.beard)).toBe(true);
                expect(cast.filter((l) => l.visitor && l.civ !== civ).length).toBeGreaterThanOrEqual(2);
                // Most people belong to the land, and its own look (headwear or bun) is there.
                expect(cast.filter((l) => l.civ === civ).length).toBeGreaterThanOrEqual(7);
                expect(cast.some((l) => l.civ === civ && (l.style === 'headwear' || (civ === 'japan' && l.style === 'bun')))).toBe(true);
            }
        }
    });

    it('the same seed gives the same crowd', () => {
        expect(castForLand('maya', 10, seededRandom(5))).toEqual(castForLand('maya', 10, seededRandom(5)));
    });

    it('every look draws every state and frame as clean SVG', () => {
        const looks = LANDS.flatMap((c, i) => castForLand(c, 10, seededRandom(40 + i)));
        for (const look of looks) {
            for (const [state, frames] of Object.entries(FRAMES)) {
                for (const frame of frames) {
                    const svg = citizenSvg(state, frame, { look, background: null, size: 192 });
                    expect(svg).not.toMatch(/undefined|NaN|null/);
                    expect(svg.startsWith('<svg')).toBe(true);
                }
            }
        }
    });

    it('a sample of looks renders to real pixels', async () => {
        const cast = castForLand('sahel', 10, seededRandom(9));
        for (const look of cast.slice(0, 4)) {
            const { info } = await sharp(Buffer.from(citizenSvg('infected', 'cough', { look, background: null, size: 96 }))).png().toBuffer({ resolveWithObject: true });
            expect(info.width).toBe(96);
        }
    });

    it('people keep one look per id and the whole cast shows before repeats', () => {
        const cast = castLevel('nordic', 123);
        expect(cast).toHaveLength(CAST_SIZE);
        const first = Array.from({ length: CAST_SIZE }, (_, id) => lookFor(id).key);
        expect(new Set(first).size).toBe(CAST_SIZE);
        expect(lookFor(3)).toBe(lookFor(3));
        expect(lookFor(3 + CAST_SIZE)).toBe(lookFor(3));
        const url = lookFaceUrl(lookFor(0), 'healthy', 'idle');
        expect(url.startsWith('data:image/svg+xml')).toBe(true);
        expect(lookFaceUrl(lookFor(0), 'healthy', 'idle')).toBe(url);
    });

    it('the game casts a new crowd every level and the web and tokens use it', () => {
        const game = readFileSync(new URL('../src/game.js', import.meta.url), 'utf8');
        expect(game).toMatch(/castLevel\(civ\);\s*this\.view\.setCivilization/);
        const view = readFileSync(new URL('../src/ui/network-view-3d.js', import.meta.url), 'utf8');
        expect(view).toContain('const look = lookFor(node.id);');
        expect(view).toContain('const tex = faceFor(obj, obj.node.state, frame);');
        expect(view).toContain('clearLookTextures();');
        const token = readFileSync(new URL('../src/ui/face-token.js', import.meta.url), 'utf8');
        expect(token).toContain('const person = civ ? null : lookFor(i);');
    });

    it('never uses an em dash in the new art code', () => {
        const src = readFileSync(new URL('../art/source/citizens.mjs', import.meta.url), 'utf8') + readFileSync(new URL('../src/ui/people.js', import.meta.url), 'utf8');
        expect(src).not.toContain('—');
    });
});
