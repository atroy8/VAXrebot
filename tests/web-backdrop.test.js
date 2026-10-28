// Item 22 (round 25): every planet paints its own scene behind the web, and
// people and lines keep strong contrast on it.
import { describe, it, expect } from 'vitest';
import { PLANET_DEFS, LEVELS } from '../src/config/levels.js';
import { comboFor, lightness } from '../src/config/planet-palettes.js';
import { WADA_COMBINATIONS } from '../src/config/wada-palettes.js';
import {
    backdropPlan,
    backdropVars,
    visibleColours,
    contrastRatio,
    seigaihaTile,
    planetDefFor,
    WEB_INK,
    LIGHT_MIN_L,
    DARK_MAX_L,
} from '../src/ui/web-backdrop.js';
import fs from 'node:fs';

const OLD_PAPER = '#f7f2e4'; // the plain cream every planet used before
const OLD_NIGHT_CENTRE = '#1d3270'; // the brightest part of the old 3D field
const plans = PLANET_DEFS.map((d) => ({ id: d.id, combo: comboFor(d), plan: backdropPlan(comboFor(d)) }));
const minContrast = (colours, ink) => Math.min(...colours.map((c) => contrastRatio(c, ink)));

describe('web backdrop (item 22)', () => {
    it('every planet gets a scene built from its own Wada colours', () => {
        for (const { combo, plan } of plans) {
            expect(plan.comboId).toBe(combo.id);
            const hexes = combo.colors.map((c) => c[1].toLowerCase());
            expect(hexes).toContain(plan.light.wave.toLowerCase());
        }
    });

    it('planets look different from each other', () => {
        const bottoms = new Set(plans.map((p) => p.plan.light.bottom));
        const nights = new Set(plans.map((p) => p.plan.dark.top));
        expect(bottoms.size).toBeGreaterThanOrEqual(7);
        expect(nights.size).toBeGreaterThanOrEqual(6);
    });

    it('2D paper stays light and 3D sky stays dark on every visible layer', () => {
        for (const { plan } of plans) {
            const v = visibleColours(plan);
            for (const c of v.light) expect(lightness(c)).toBeGreaterThanOrEqual(LIGHT_MIN_L - 6);
            for (const c of [plan.light.top, plan.light.bottom]) expect(lightness(c)).toBeGreaterThanOrEqual(LIGHT_MIN_L);
            for (const c of v.dark) expect(lightness(c)).toBeLessThanOrEqual(DARK_MAX_L + 2);
        }
    });

    it('2D red at-risk lines read better than they did on the old cream', () => {
        const before = contrastRatio(OLD_PAPER, WEB_INK.risk);
        for (const { plan } of plans) {
            const worst = minContrast(visibleColours(plan).light, WEB_INK.risk2d);
            expect(worst).toBeGreaterThanOrEqual(3);
            expect(worst).toBeGreaterThan(before);
        }
    });

    it('2D plain lines and face outlines keep their contrast', () => {
        const before = contrastRatio(OLD_PAPER, WEB_INK.normal);
        for (const { plan } of plans) {
            const v = visibleColours(plan).light;
            expect(minContrast(v, WEB_INK.normal2d)).toBeGreaterThanOrEqual(before);
            expect(minContrast(v, WEB_INK.faceOutline)).toBeGreaterThanOrEqual(7);
            // Red at-risk lines stand apart from plain ones too.
            expect(contrastRatio(WEB_INK.risk2d, WEB_INK.normal2d)).toBeGreaterThan(1.1);
        }
    });

    it('3D lines keep strong contrast on every night sky', () => {
        const oldRisk = contrastRatio(OLD_NIGHT_CENTRE, WEB_INK.risk);
        for (const { plan } of plans) {
            const v = visibleColours(plan).dark;
            expect(minContrast(v, WEB_INK.risk)).toBeGreaterThanOrEqual(Math.min(oldRisk, 3.9));
            expect(minContrast(v, WEB_INK.normal)).toBeGreaterThanOrEqual(4.5);
            expect(minContrast(v, WEB_INK.sick)).toBeGreaterThanOrEqual(2.5);
        }
    });

    it('works for any planet-friendly combination, not just the eight in the campaign', () => {
        for (const combo of WADA_COMBINATIONS.filter((c) => c.colors.length >= 3).slice(0, 120)) {
            const v = visibleColours(backdropPlan(combo));
            expect(minContrast(v.light, WEB_INK.risk2d)).toBeGreaterThanOrEqual(2.8);
            expect(minContrast(v.dark, WEB_INK.normal)).toBeGreaterThanOrEqual(4);
        }
    });

    it('every level finds its planet', () => {
        for (const level of LEVELS) expect(planetDefFor(level.regionId, PLANET_DEFS)).toBeTruthy();
        expect(planetDefFor('nowhere', PLANET_DEFS)).toBeNull();
    });

    it('CSS variables carry the plan, with a seigaiha tile as an inline SVG', () => {
        const vars = backdropVars(plans[0].plan);
        for (const k of ['--bd-top', '--bd-bottom', '--bd-edge', '--bd-sun', '--bd-mist', '--bd-wave-tile', '--bd-night-top', '--bd-night-bottom', '--bd-nebula', '--bd-star']) {
            expect(vars[k], k).toBeTruthy();
        }
        const tile = seigaihaTile('#1c4286');
        expect(tile.startsWith('url("data:image/svg+xml,')).toBe(true);
        expect(decodeURIComponent(tile)).toContain('stroke-opacity');
    });

    it('the scene sits under the web, never takes taps, and holds still for reduced motion', () => {
        const css = fs.readFileSync(new URL('../src/ui/game-screen.css', import.meta.url), 'utf8');
        const block = css.slice(css.indexOf('.web-backdrop {'));
        expect(block).toMatch(/pointer-events:\s*none/);
        expect(css).toMatch(/prefers-reduced-motion: reduce\)\s*\{\s*\.web-backdrop/);
        expect(css).toMatch(/is-paused \.web-backdrop/);
        const src = fs.readFileSync(new URL('../src/ui/web-backdrop.js', import.meta.url), 'utf8');
        expect(src).toMatch(/el\.prepend\(layer\)/); // first child, under the canvas
    });

    it('each level paints its planet before the web is set up, from the lazy view chunk', () => {
        const game = fs.readFileSync(new URL('../src/game.js', import.meta.url), 'utf8');
        expect(game).toMatch(/paintBackdrop\?\.\(this\.currentLevel\?\.regionId\);\s*this\.view\.setup\(/);
        expect(game).not.toMatch(/planet-palettes|web-backdrop/); // keeps the entry bundle small
        const view = fs.readFileSync(new URL('../src/ui/network-view-3d.js', import.meta.url), 'utf8');
        expect(view).toMatch(/paintBackdrop\(regionId\)/);
        expect(view).toMatch(/LINK_COLORS_2D/);
    });
});
