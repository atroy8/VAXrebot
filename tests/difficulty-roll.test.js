import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { progressToPrize, threatBand, rollLevelRules, threatLine } from '../src/config/difficulty-roll.js';
import { levelRules } from '../src/config/level-rules.js';
import { LEVELS } from '../src/config/levels.js';
import { mulberry32 } from '../src/sim/balance.js';

describe('difficulty rolls per play and rises toward each prize box', () => {
    it('progress to the next prize box climbs inside each stretch and resets after a box', () => {
        // Boxes open after levels 0, 3 and 6.
        const p = LEVELS.map((_, i) => progressToPrize(i));
        expect(p[0]).toBe(0);
        expect(p[1]).toBe(0);
        expect(p[2]).toBeGreaterThan(p[1]);
        expect(p[3]).toBe(1);
        expect(p[4]).toBe(0);
        expect(p[6]).toBe(1);
        expect(p[7]).toBe(0);
        expect(p[8]).toBe(1);
    });

    it('the band sits higher on the level that unlocks a box', () => {
        expect(threatBand(3).lo).toBeGreaterThan(threatBand(4).lo);
        for (let i = 0; i < LEVELS.length; i++) {
            const { lo, hi } = threatBand(i);
            expect(lo).toBeGreaterThanOrEqual(0);
            expect(hi).toBeLessThanOrEqual(1);
            expect(hi).toBeGreaterThan(lo);
        }
    });

    it('two plays of the same level can differ, and stay near the tuned baseline', () => {
        const rng = mulberry32(7);
        for (const level of LEVELS) {
            const base = levelRules(level);
            const seen = new Set();
            for (let k = 0; k < 20; k++) {
                const r = rollLevelRules(level, rng);
                seen.add(r.difficulty.transmissionMultiplier);
                const ratio = r.difficulty.transmissionMultiplier / base.difficulty.transmissionMultiplier;
                expect(ratio).toBeGreaterThanOrEqual(0.84);
                expect(ratio).toBeLessThanOrEqual(1.16);
                expect(Math.abs(r.scenario.caseCapFraction - base.scenario.caseCapFraction)).toBeLessThanOrEqual(0.0201);
                expect(r.pips).toBeGreaterThanOrEqual(1);
                expect(r.pips).toBeLessThanOrEqual(5);
            }
            expect(seen.size).toBeGreaterThan(1);
        }
    });

    it('rolling never changes the shared level config', () => {
        const before = JSON.stringify(levelRules(LEVELS[0]));
        rollLevelRules(LEVELS[0], () => 0.99);
        expect(JSON.stringify(levelRules(LEVELS[0]))).toBe(before);
    });

    it('the first level reads as low threat, the last as high', () => {
        expect(rollLevelRules(LEVELS[0], () => 0).pips).toBeLessThanOrEqual(2);
        expect(rollLevelRules(LEVELS[LEVELS.length - 1], () => 1).pips).toBe(5);
    });

    it('threat lines are plain and have no em dash', () => {
        for (const t of [0, 0.5, 1]) {
            expect(threatLine(t)).toMatch(/^This outbreak/);
            expect(threatLine(t)).not.toContain('—');
        }
    });

    it('the briefing has no difficulty picker', () => {
        const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
        expect(html).not.toContain('difficulty-grid');
        expect(html).not.toContain('Select Difficulty');
        expect(html).toContain('id="threat-meter"');
    });
});
