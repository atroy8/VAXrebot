// Item 29 (c), round 46: the people of each land wear its clothes. Faces,
// expressions and state cues stay the same everywhere; hair, headwear,
// clothes and skin tone come from the civilization.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { LEVELS } from '../src/config/levels.js';
import { CIVILIZATIONS, CIV_ORDER, civilizationFor, civilizationForLevel } from '../src/config/civilizations.js';
import { citizenSvg, OUTFITS, CIV_IDS, FRAMES, STATES } from '../art/source/citizens.mjs';
import { citizenFaceUrl, hasCivFaces, DEFAULT_CIV } from '../src/ui/citizen-faces.js';
import { faceTokenHtml, setFaceCivilization, faceCivilization } from '../src/ui/face-token.js';
import { startPageMarkup, startCrowdCiv, START_CROWD } from '../src/ui/start-page.js';

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const game = read('../src/game.js');
const view3d = read('../src/ui/network-view-3d.js');
const globe = read('../src/ui/globe-view.js');
const hex = (n) => '#' + n.toString(16).padStart(6, '0');
const civDir = (civ) => new URL(`../src/assets/faces-civ/${civ}/`, import.meta.url);

function pngSize(buf) {
    // IHDR width and height sit at bytes 16 to 23 of every PNG.
    expect(buf.subarray(1, 4).toString()).toBe('PNG');
    return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
}

describe('citizens dressed for their land (item 29 c)', () => {
    it('every civilization on the journey has an outfit, and no outfit is left over', () => {
        expect([...CIV_IDS].sort()).toEqual([...CIV_ORDER].sort());
        for (const id of CIV_ORDER) {
            const o = OUTFITS[id];
            expect(o.skin).toMatch(/^#[0-9a-f]{6}$/);
            expect(o.robe).toMatch(/^#[0-9a-f]{6}$/);
            if (id !== 'japan') expect(typeof o.headwear).toBe('function');
        }
    });

    it('the original Japanese citizens are unchanged', () => {
        for (const [state, frames] of Object.entries(FRAMES)) {
            for (const frame of frames) {
                const saved = read(`../art/source/svg/faces-${state}-${frame}.svg`);
                const squash = (s) => s.replace(/\s+/g, '');
                expect(squash(citizenSvg(state, frame, { civ: 'japan' }))).toBe(squash(saved));
                expect(citizenSvg(state, frame)).toBe(citizenSvg(state, frame, { civ: 'japan' }));
            }
        }
    });

    it('state cues read the same in every land: ground colour, mask, shield, leaf and flower', () => {
        for (const civ of CIV_IDS) {
            for (const state of Object.keys(STATES)) {
                expect(citizenSvg(state, 'idle', { civ })).toContain(`fill="${STATES[state].ground}"`);
            }
            expect(citizenSvg('quarantined', 'idle', { civ })).toContain('#fbf7ee');
            expect(citizenSvg('vaccinated', 'idle', { civ })).toContain('M640 770 l62 -22');
            expect(citizenSvg('recovered', 'idle', { civ })).toContain('#5fa84a');
            expect(citizenSvg('dead', 'idle', { civ })).toContain('translate(512 800)');
            expect(citizenSvg('infected', 'idle', { civ })).toContain('#9e2a3a');
        }
    });

    it('each land looks different: its own headwear, clothes and skin tone', () => {
        const looks = new Set(CIV_IDS.map((civ) => citizenSvg('healthy', 'idle', { civ })));
        expect(looks.size).toBe(CIV_IDS.length);
        const skins = new Set(CIV_IDS.map((civ) => OUTFITS[civ].skin));
        expect(skins.size).toBe(CIV_IDS.length);
        for (const civ of CIV_IDS) {
            const svg = citizenSvg('healthy', 'idle', { civ });
            expect(svg).toContain(`fill="${OUTFITS[civ].robe}"`);
            expect(svg).toContain(`fill="${OUTFITS[civ].skin}"`);
        }
    });

    it('all 126 new frames are on disk as 192 px PNGs, and the set stays under 2.5 MB', () => {
        let bytes = 0;
        for (const civ of CIV_IDS) {
            if (civ === 'japan') continue;
            for (const [state, frames] of Object.entries(FRAMES)) {
                for (const frame of frames) {
                    const buf = fs.readFileSync(new URL(`${state}-${frame}.png`, civDir(civ)));
                    expect(pngSize(buf)).toEqual([192, 192]);
                    bytes += buf.length;
                }
            }
            expect(fs.readdirSync(civDir(civ)).length).toBe(21);
        }
        expect(bytes).toBeLessThan(2.5 * 1024 * 1024);
    });

    it('the game finds every frame for every land, and falls back to Japan only when asked', () => {
        for (const civ of CIV_ORDER) {
            expect(hasCivFaces(civ)).toBe(true);
            for (const [state, frames] of Object.entries(FRAMES)) {
                for (const frame of frames) {
                    const url = citizenFaceUrl(civ, state, frame);
                    expect(url).toBeTruthy();
                    if (civ === 'japan') expect(url).toContain(`faces/${state}/${frame}`);
                    else expect(url).toContain(`faces-civ/${civ}/${state}-${frame}`);
                }
            }
        }
        expect(citizenFaceUrl('atlantis', 'healthy', 'idle')).toBe(citizenFaceUrl(DEFAULT_CIV, 'healthy', 'idle'));
        expect(citizenFaceUrl('sahel', 'healthy', 'nope')).toBe(citizenFaceUrl('sahel', 'healthy', 'idle'));
    });

    it('each level dresses its people for the land its stop stands in', () => {
        const used = new Set();
        for (const level of LEVELS) {
            const civ = civilizationForLevel(level);
            expect(civ).toBe(civilizationFor(level.planetIndex, level.levelInPlanet, 10));
            used.add(civ);
        }
        expect(used.size).toBe(CIV_ORDER.length);
        expect(civilizationForLevel(LEVELS[0])).toBe('japan');
        expect(civilizationForLevel(null)).toBe('japan');
        expect(civilizationForLevel({ id: 'free' })).toBe('japan');
    });

    it('a level start switches the web, the care box and the results to that land before the web is built', () => {
        const start = game.indexOf('civilizationForLevel(this.currentLevel)');
        expect(start).toBeGreaterThan(0);
        const setup = game.indexOf('this.view.setup({', start);
        expect(game.slice(start, setup)).toContain('this.view.setCivilization?.(civ)');
        expect(game.slice(start, setup)).toContain('setFaceCivilization(civ)');
        expect(view3d).toMatch(/setCivilization\(civ\) \{[\s\S]*faceTexturesFor\(this\.civ\)/);
        expect(view3d).toContain('citizenFaceUrl(civ, state');
    });

    it('care box and results faces use the current land', () => {
        setFaceCivilization('andes');
        expect(faceCivilization()).toBe('andes');
        // Round 53: naming the land shows its face; with no land named the
        // token shows the level's crowd instead (tests/round53-crowd.test.js).
        expect(faceTokenHtml('healthy', { civ: 'andes' })).toContain('faces-civ/andes/healthy-idle');
        expect(faceTokenHtml('infected', { civ: 'andes' })).toContain('faces-civ/andes/infected-cough');
        setFaceCivilization(null);
        expect(faceCivilization()).toBe('japan');
        expect(faceTokenHtml('healthy', { civ: 'japan' })).toContain('faces/healthy/idle');
    });

    it('the title planet crowd comes from all seven lands', () => {
        const civs = new Set(START_CROWD.map((_, i) => startCrowdCiv(i)));
        expect(civs.size).toBe(CIV_ORDER.length);
        const html = startPageMarkup();
        expect(html).toContain('faces-civ/sahel/');
        expect(html).toContain('faces-civ/persia/');
    });

    it('the level card shows a citizen of the land, and the scenery people dress for it too', () => {
        expect(globe).toContain("note: { civ: marker.civ");
        expect(globe).toContain("citizenFaceUrl(note.civ, 'healthy', 'idle')");
        expect(globe).toMatch(/part\.role === 'cloth' \|\| part\.role === 'skin'/);
        for (const id of CIV_ORDER) {
            const o = CIVILIZATIONS[id].outfit;
            expect(o).toBeTruthy();
            if (id === 'japan') continue;
            expect(hex(o.skin)).toBe(OUTFITS[id].skin);
            expect(o.cloth).toBeTypeOf('number');
        }
    });
});
