// Wide audience: each planet tints the play screen with its own colours,
// and the HUD text stays readable (WCAG AA) on every one of them.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { PLANET_DEFS } from '../src/config/levels.js';
import { comboFor } from '../src/config/planet-palettes.js';
import { contrastRatio } from '../src/ui/web-backdrop.js';
import { PLANET_ACCENTS, CHROME, TINT, AA_TEXT, AA_GRAPHIC, tintPlan, tintVars, applyPlanetTint, contrast, luminance, blend, darkenUntilReadable, lightenUntilVisible } from '../src/ui/planet-tint.js';

const IDS = PLANET_DEFS.map((d) => d.id);

describe('contrast helper', () => {
    it('matches the WCAG numbers', () => {
        expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5);
        expect(contrast('#ffffff', '#ffffff')).toBe(1);
        expect(contrast('#777777', '#ffffff')).toBeCloseTo(4.48, 2);
        expect(contrast('#13265a', '#ecd27e')).toBe(contrast('#ecd27e', '#13265a'));
        expect(luminance('#000000')).toBe(0);
        expect(luminance('#ffffff')).toBeCloseTo(1, 5);
        // The same answer as the helper the backdrop tests already use.
        for (const [a, b] of [['#1c4286', '#ecd27e'], ['#501345', '#ffffff'], ['#064f6e', '#ff8a76']]) {
            expect(contrast(a, b)).toBeCloseTo(contrastRatio(a, b), 6);
        }
    });

    it('blends, darkens until text reads, and lightens until a line shows', () => {
        expect(blend('#000000', '#ffffff', 0.5)).toBe('#808080');
        expect(blend('#123456', '#abcdef', 0)).toBe('#123456');
        const bg = darkenUntilReadable('#8899ff', ['#ffffff']);
        expect(contrast(bg, '#ffffff')).toBeGreaterThanOrEqual(AA_TEXT);
        expect(darkenUntilReadable('#000000', ['#ffffff'])).toBe('#000000');
        const ink = lightenUntilVisible('#101010', ['#000000']);
        expect(contrast(ink, '#000000')).toBeGreaterThanOrEqual(AA_GRAPHIC);
    });
});

describe('a tint for every planet', () => {
    it('all 8 planets have accents, and each colour comes from that planet\'s own combination', () => {
        expect(Object.keys(PLANET_ACCENTS).sort()).toEqual([...IDS].sort());
        expect(IDS).toHaveLength(8);
        for (const def of PLANET_DEFS) {
            const hexes = comboFor(def).colors.map((c) => c[1]);
            expect(hexes, def.id).toContain(PLANET_ACCENTS[def.id].deep);
            expect(hexes, def.id).toContain(PLANET_ACCENTS[def.id].accent);
            expect(PLANET_ACCENTS[def.id].deep).not.toBe(PLANET_ACCENTS[def.id].accent);
        }
    });

    it('HUD text keeps AA contrast on the tinted lacquer of every planet', () => {
        for (const id of IDS) {
            const plan = tintPlan(id);
            for (const stop of plan.lacquer) {
                // The level name and the stat labels (gold) and the numbers (white).
                expect(contrast(stop, CHROME.label), `${id} label on ${stop}`).toBeGreaterThanOrEqual(AA_TEXT);
                expect(contrast(stop, CHROME.value), `${id} value on ${stop}`).toBeGreaterThanOrEqual(AA_TEXT);
                // Numbers sit on a stat chip: the lacquer under a dark glaze.
                const chip = blend(stop, CHROME.chip[0], CHROME.chip[1]);
                for (const ink of [CHROME.value, CHROME.label, CHROME.rUp, CHROME.rDown]) {
                    expect(contrast(chip, ink), `${id} ${ink} on chip`).toBeGreaterThanOrEqual(AA_TEXT);
                }
            }
        }
    });

    it('the sky behind the screen stays night dark, and the tray stays dark under its cream tools', () => {
        for (const id of IDS) {
            const plan = tintPlan(id);
            for (const stop of plan.sky) {
                expect(contrast(stop, CHROME.label), id).toBeGreaterThanOrEqual(7);
                expect(luminance(stop), id).toBeLessThan(0.08);
            }
            expect(luminance(plan.trayColor), id).toBeLessThan(0.12);
            expect(plan.tray).toMatch(/^rgba\(\d+, \d+, \d+, 0\.6\)$/);
        }
    });

    it('borders and glows stand out from what they sit on (3 to 1)', () => {
        for (const id of IDS) {
            const plan = tintPlan(id);
            for (const stop of plan.lacquer) expect(contrast(plan.edge, stop), id).toBeGreaterThanOrEqual(AA_GRAPHIC);
            for (const stop of [...plan.lacquer, ...plan.sky]) expect(contrast(plan.accent, stop), id).toBeGreaterThanOrEqual(AA_GRAPHIC);
        }
    });

    it('is a tint, not a repaint: borders stay gold and the lacquer stays dark', () => {
        expect(TINT.edge).toBeLessThanOrEqual(0.35);
        expect(TINT.lacquer).toBeLessThanOrEqual(0.6);
        const hue = (hex) => {
            const n = parseInt(hex.slice(1), 16);
            const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
            return { r, g, b };
        };
        for (const id of IDS) {
            const plan = tintPlan(id);
            // Still closer to the gold it started as than to the planet's accent.
            const d = (a, b) => Math.hypot(hue(a).r - hue(b).r, hue(a).g - hue(b).g, hue(a).b - hue(b).b);
            expect(d(plan.edge, CHROME.gold), id).toBeLessThan(d(plan.edge, PLANET_ACCENTS[id].accent) + 60);
            for (const stop of plan.lacquer) expect(luminance(stop), id).toBeLessThan(0.16);
        }
    });

    it('planets really look different from each other', () => {
        const mids = IDS.map((id) => tintPlan(id).lacquer[1]);
        expect(new Set(mids).size).toBe(8);
        const skies = IDS.map((id) => tintPlan(id).sky[1]);
        expect(new Set(skies).size).toBeGreaterThanOrEqual(7);
        expect(new Set(IDS.map((id) => tintPlan(id).glow)).size).toBe(8);
    });

    it('an unknown planet has no plan', () => {
        expect(tintPlan('nowhere')).toBeNull();
        expect(tintPlan(undefined)).toBeNull();
    });
});

describe('applying the tint', () => {
    const fakeEl = () => {
        const props = new Map();
        const classes = new Set();
        return {
            props,
            classes,
            dataset: {},
            style: { setProperty: (k, v) => props.set(k, v), removeProperty: (k) => props.delete(k) },
            classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c) },
        };
    };

    it('sets the colours as CSS variables on the game screen and clears them again', () => {
        const el = fakeEl();
        const plan = applyPlanetTint(el, 'kaminari');
        expect(plan.planetId).toBe('kaminari');
        expect(el.classes.has('planet-tinted')).toBe(true);
        expect(el.dataset.planet).toBe('kaminari');
        expect(Object.fromEntries(el.props)).toEqual(tintVars(tintPlan('kaminari')));
        expect(el.props.get('--pt-lacquer-2')).toBe(tintPlan('kaminari').lacquer[1]);
        applyPlanetTint(el, 'hanabi');
        expect(el.props.get('--pt-lacquer-2')).toBe(tintPlan('hanabi').lacquer[1]);
        expect(applyPlanetTint(el, null)).toBeNull();
        expect(el.props.size).toBe(0);
        expect(el.classes.has('planet-tinted')).toBe(false);
        expect(el.dataset.planet).toBeUndefined();
        expect(applyPlanetTint(null, 'mizuho')).toBeNull();
    });

    it('every variable the stylesheet uses is one the plan sets', () => {
        const css = readFileSync(new URL('../src/ui/planet-tint.css', import.meta.url), 'utf8');
        const used = new Set(css.match(/--pt-[a-z0-9-]+/g));
        const set = new Set(Object.keys(tintVars(tintPlan('mizuho'))));
        for (const v of used) expect(set.has(v), v).toBe(true);
        // Every rule is scoped to the tinted game screen, so nothing else changes.
        const rules = css.replace(/\/\*[\s\S]*?\*\//g, '').match(/[^{}]+\{/g) || [];
        expect(rules.length).toBeGreaterThan(3);
        for (const sel of rules) for (const part of sel.replace('{', '').split(',')) expect(part.trim()).toMatch(/^html #game-screen\.planet-tinted/);
    });

    it('the game tints the screen when a level starts, without pulling the palette file into the entry bundle', () => {
        const game = readFileSync(new URL('../src/game.js', import.meta.url), 'utf8');
        expect(game).toContain("import { applyPlanetTint } from './ui/planet-tint.js';");
        expect(game).toContain("import './ui/planet-tint.css';");
        expect(game).toContain("applyPlanetTint(document.getElementById('game-screen'), this.currentLevel?.regionId);");
        const tint = readFileSync(new URL('../src/ui/planet-tint.js', import.meta.url), 'utf8');
        expect(tint).not.toMatch(/^import /m);
    });
});
