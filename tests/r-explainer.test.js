import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { r0High, formatR, rTone, rExplainer, rFellBelowOne, R_BELOW_ONE_TEXT, rScalePos } from '../src/ui/game-screen-model.js';

import { difficulties } from '../src/config/difficulties.js';

const all = (e) => [e.headline, ...e.lines].join(' ');

describe('R card text (round 16)', () => {
    it('before day 2 it explains what R is instead of showing a number', () => {
        const e = rExplainer({ r: null, r0: '1.5 - 2.0' });
        expect(e.value).toBe('–');
        expect(e.headline).toMatch(/after the first day/);
        expect(all(e)).toMatch(/how many people each sick person infects/);
    });

    it('above 1 says it is growing, how many each case infects, and what to do', () => {
        const e = rExplainer({ r: 2.4, r0: '1.5 - 2.0' });
        expect(e.value).toBe('2.4');
        expect(e.headline).toMatch(/Growing/);
        expect(all(e)).toMatch(/about 2 others/);
        expect(all(e)).toMatch(/push R under 1/);
        expect(rExplainer({ r: 1.2 }).lines[0]).toMatch(/more than 1 others/);
        expect(rExplainer({ r: 7 }).value).toBe('5+');
        expect(rExplainer({ r: 7 }).lines[0]).toMatch(/5 or more/);
    });

    it('at or below 1 says it is shrinking; 0 says nobody caught it', () => {
        expect(rExplainer({ r: 0.6 }).headline).toMatch(/Shrinking/);
        expect(rExplainer({ r: 1 }).headline).toMatch(/Shrinking/);
        expect(rExplainer({ r: 0 }).headline).toMatch(/R is 0/);
    });

    it('answers the round 13 question: says why the game R can be higher than the briefing R0', () => {
        const high = rExplainer({ r: 5.5, r0: '1.5 - 2.0' });
        expect(all(high)).toMatch(/R₀ 1\.5 - 2\.0/);
        expect(all(high)).toMatch(/more crowded than a real town/);
        // Near the estimate there is no need to explain a gap.
        expect(all(rExplainer({ r: 2.2, r0: '1.5 - 2.0' }))).not.toMatch(/crowded/);
        // No estimate: no comparison line.
        expect(rExplainer({ r: 2 }).lines).toHaveLength(2);
    });

    it('reads every R0 range the levels use', () => {
        for (const d of Object.values(difficulties)) {
            if (!d.R0) continue;
            expect(r0High(d.R0)).toBeGreaterThan(0);
        }
        expect(r0High('1.5 - 2.0')).toBe(2);
        expect(r0High('')).toBeNull();
    });

    it('never uses an em dash', () => {
        for (const r of [null, 0, 0.5, 1, 1.3, 2.4, 9]) {
            expect(all(rExplainer({ r, r0: '2.0 - 3.0' }))).not.toContain('—');
        }
        expect(R_BELOW_ONE_TEXT).not.toContain('—');
    });
});

describe('R tone, format and the below 1 moment', () => {
    it('formats and tones R', () => {
        expect(formatR(null)).toBe('–');
        expect(formatR(0.84)).toBe('0.8');
        expect(rTone(null)).toBeNull();
        expect(rTone(1.01)).toBe('up');
        expect(rTone(1)).toBe('down');
    });

    it('fires only when R crosses from above 1 to 1 or below', () => {
        expect(rFellBelowOne(1.4, 0.9)).toBe(true);
        expect(rFellBelowOne(1.4, 1)).toBe(true);
        expect(rFellBelowOne(0.9, 0.7)).toBe(false);
        expect(rFellBelowOne(null, 0.5)).toBe(false);
        expect(rFellBelowOne(2, 1.1)).toBe(false);
    });

    it('places R on a 0 to 3 scale', () => {
        expect(Number(rScalePos(0))).toBe(0);
        expect(Number(rScalePos(1))).toBeCloseTo(1 / 3, 2);
        expect(Number(rScalePos(10))).toBe(1);
    });
});

describe('R stat markup', () => {
    it('is a real button (tappable on phones) that opens the R card', () => {
        const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
        expect(html).toMatch(/<button type="button" class="stat stat--r" id="r-stat"[^>]*aria-controls="r-card"/);
        expect(html).toContain('id="r-card"');
        const css = readFileSync(new URL('../src/ui/theme-ai-gold.css', import.meta.url), 'utf8');
        expect(css).toMatch(/button\.stat--r \{[^}]*min-height: 44px/);
        expect(css).toMatch(/\.r-card-close \{[^}]*min-height: 48px/);
    });

    it('game.js holds the countdown while the card is open and celebrates R under 1 once per level', () => {
        const src = readFileSync(new URL('../src/game.js', import.meta.url), 'utf8');
        expect(src).toContain('if (this.autoAdvance.isRunning()) this.autoAdvance.hold();');
        expect(src).toContain('!this.gameState.stats.rBelowOneDay && rFellBelowOne(prevR, this.lastR)');
    });
});
