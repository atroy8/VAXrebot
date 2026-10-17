import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { rimSpots, personSize, startPageMarkup, START_CROWD } from '../src/ui/start-page.js';
import { THEME, hexNum, CONFETTI } from '../src/config/theme.js';
import { PLANETS } from '../src/config/solar-system.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

describe('start page (round 12)', () => {
    it('spreads people evenly along the top of the planet', () => {
        const spots = rimSpots(5, { cx: 200, cy: 500, r: 100, spreadDeg: 60 });
        expect(spots).toHaveLength(5);
        expect(spots[2]).toEqual({ x: 200, y: 400, angle: 0 }); // the middle one stands on top
        expect(spots[0].angle).toBe(-60);
        expect(spots[4].angle).toBe(60);
        for (const s of spots) {
            expect(Math.hypot(s.x - 200, s.y - 500)).toBeCloseTo(100, 6); // all on the outline
            expect(s.y).toBeLessThan(500); // all on the upper half
        }
        expect(spots[0].x).toBeCloseTo(400 - spots[4].x, 6); // mirror image
    });

    it('handles tiny crowds', () => {
        expect(rimSpots(0, { cx: 0, cy: 0, r: 1 })).toEqual([]);
        expect(rimSpots(1, { cx: 10, cy: 10, r: 5 })).toEqual([{ x: 10, y: 5, angle: 0 }]);
    });

    it('people are always big enough to tap (44 px) and never huge', () => {
        for (const r of [60, 120, 160, 260, 600]) {
            const size = personSize(r);
            expect(size).toBeGreaterThanOrEqual(44);
            expect(size).toBeLessThanOrEqual(64);
        }
    });

    it('markup has a person button per crowd member, the title and a Play button', () => {
        const html = startPageMarkup();
        expect(html.match(/class="start-person"/g)).toHaveLength(START_CROWD.length);
        expect(html).toContain('id="start-play"');
        expect(html).toContain('VAXrebot');
        expect(START_CROWD).toContain('infected');
    });

    it('the How to play pop-up no longer opens on launch; the globe opens on the start page', () => {
        expect(read('src/main.js')).not.toContain('maybeShowOnboarding');
        const globe = read('src/ui/globe-view.js');
        expect(globe).toContain("mode: 'title'");
        expect(globe).toContain('startPageMarkup()');
        expect(globe).toMatch(/if \(!refresh\.ran\) \{[\s\S]*?enterTitle\(\);/);
    });
});

describe('indigo and gold theme (round 12)', () => {
    it('main.js loads the theme right after the base styles', () => {
        const main = read('src/main.js');
        expect(main.indexOf("import './ui/theme-ai-gold.css';")).toBeGreaterThan(main.indexOf("import './styles.css';"));
    });

    it('theme rules outrank the lazily loaded candy styles', () => {
        const css = read('src/ui/theme-ai-gold.css');
        // Every rule other than :root and html/body is scoped under html, so
        // load order of the lazy globe and game stylesheets cannot undo it.
        const selectors = css.replace(/\/\*[\s\S]*?\*\//g, '').match(/[^{}]+(?=\{)/g).map((s) => s.trim());
        for (const sel of selectors) {
            for (const part of sel.split(',').map((x) => x.trim())) {
                expect(part.startsWith('html') || part.startsWith(':root')).toBe(true);
            }
        }
        expect(css).toContain(`--ai-900: ${THEME.ai900}`);
        expect(css).toContain(`--kin-400: ${THEME.kin400}`);
    });

    it('planets use indigo seas and gold or paper land, no candy pastels', () => {
        for (const p of PLANETS) {
            for (const c of p.ocean) {
                const n = hexNum(c);
                const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
                expect(b).toBeGreaterThan(r); // blue dominant
                expect(b).toBeGreaterThan(g);
            }
            for (const c of p.land) {
                const n = hexNum(c);
                const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
                expect(r).toBeGreaterThanOrEqual(b); // warm gold or paper, never blue or pink-purple
                expect(g).toBeGreaterThanOrEqual(b);
            }
        }
        expect(CONFETTI).toContain(hexNum(THEME.kin400));
    });

    it('the globe draws seigaiha waves and takes its colours from the theme', () => {
        const globe = read('src/ui/globe-view.js');
        expect(globe).toContain('Seigaiha');
        expect(globe).toContain("from '../config/theme.js'");
        expect(globe).not.toContain("'#ff6b9a'");
    });
});
