import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { progressToPrize, threatBand, rollLevelRules, threatLine } from '../src/config/difficulty-roll.js';
import { levelRules } from '../src/config/level-rules.js';
import { LEVELS } from '../src/config/levels.js';
import { mulberry32 } from '../src/sim/balance.js';

describe('difficulty rolls per play and rises toward each prize box', () => {
    it('progress to the next prize box climbs inside each stretch and resets after a box', () => {
        // Boxes open after each planet's 5th level and its boss (indexes 4, 9, 14, 19, ...).
        const p = LEVELS.map((_, i) => progressToPrize(i));
        expect(p[0]).toBe(0);
        expect(p[1]).toBeGreaterThan(p[0]);
        expect(p[4]).toBe(1);
        expect(p[5]).toBe(0);
        expect(p[8]).toBeGreaterThan(p[6]);
        expect(p[9]).toBe(1);
        expect(p[10]).toBe(0);
        // Every boss level sits at the top of the climb.
        for (let i = 9; i < LEVELS.length; i += 10) expect(p[i], LEVELS[i].id).toBe(1);
    });

    it('the band sits higher on the level that unlocks a box', () => {
        expect(threatBand(4).lo).toBeGreaterThan(threatBand(5).lo);
        for (let i = 0; i < LEVELS.length; i++) {
            const { lo, hi } = threatBand(i);
            expect(lo).toBeGreaterThanOrEqual(0);
            expect(hi).toBeLessThanOrEqual(1);
            expect(hi).toBeGreaterThan(lo);
        }
    });

    // Round 57: the threat no longer wobbles the spread (there is no spread
    // rate) or anything else per play. It is fixed by the level's place on
    // the road to the next prize box, whatever dice are handed in.
    it('two plays of the same level have the same rules, and the threat stays in its band', () => {
        const rng = mulberry32(7);
        for (const level of LEVELS) {
            const base = levelRules(level);
            const seen = new Set();
            for (let k = 0; k < 5; k++) {
                const r = rollLevelRules(level, rng);
                seen.add(JSON.stringify(r));
                expect(r.difficulty.transmissionMultiplier).toBe(base.difficulty.transmissionMultiplier);
                expect(r.scenario.caseCapFraction).toBe(base.scenario.caseCapFraction);
                const band = threatBand(LEVELS.indexOf(level));
                expect(r.threat).toBeGreaterThanOrEqual(band.lo);
                expect(r.threat).toBeLessThanOrEqual(band.hi);
                expect(r.scenario.capSlack).toBeGreaterThanOrEqual(1);
                expect(r.pips).toBeGreaterThanOrEqual(1);
                expect(r.pips).toBeLessThanOrEqual(5);
            }
            expect(seen.size).toBe(1);
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
            // Round 57: the line is about the case cap, not about speed.
            expect(threatLine(t)).toMatch(/case cap/);
            expect(threatLine(t)).not.toMatch(/spreading/);
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
