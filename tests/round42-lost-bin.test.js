// Round 42: when someone died, the results tally shows a quiet grey Lost bin
// after Cured, so "Treated 4, Cured 3" no longer leaves the fourth person
// unexplained. It earns no points and fills without the tick sound. The
// in-game care box now says "Kept safe", the same words as the results.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { shownBins, tallyBinsHtml, binTicks } from '../src/ui/results-tally.js';
import { FACE_LOOKS } from '../src/ui/face-token.js';
import { BINS } from '../src/ui/care-box-model.js';
import { careBonus } from '../src/rewards.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

describe('Lost bin', () => {
    it('shows after Cured when someone died', () => {
        expect(shownBins({ treatment: 4, isolated: 0, cured: 3, lost: 1 })).toEqual(['treatment', 'cured', 'lost']);
    });

    it('stays hidden when nobody died', () => {
        expect(shownBins({ treatment: 2, cured: 2, lost: 0 })).toEqual(['treatment', 'cured']);
    });

    it('never leaves a win showing only the Lost bin', () => {
        expect(shownBins({ lost: 2 })).toEqual(['cured', 'lost']);
    });

    it('keeps the round 41 fallbacks', () => {
        expect(shownBins({})).toEqual(['cured']);
        expect(shownBins(undefined)).toEqual(['cured']);
        expect(shownBins(null)).toEqual(['cured']);
    });

    it('renders grey with no points, using the real bonus lines', () => {
        const stats = { treated: 4, isolated: 0, totalRecovered: 3, totalDead: 1, daysUsed: 7 };
        const bonus = careBonus('contained', stats, null);
        expect(bonus.lines.some((l) => l.id === 'lost')).toBe(false);
        const html = tallyBinsHtml({ treatment: 4, isolated: 0, cured: 3, lost: 1 }, bonus);
        expect(html).toContain('--bins:3');
        expect(html).toContain('data-bin="lost"');
        expect(html).toContain('>Lost<');
        expect(html).toContain('remembered');
        expect(html).not.toMatch(/data-bin="lost"[\s\S]*each/);
    });

    it('fills quietly: no tick sound for the Lost bin', () => {
        expect(binTicks('lost')).toBe(false);
        expect(binTicks('treatment')).toBe(true);
        expect(binTicks('cured')).toBe(true);
    });

    it('has a face look for the dead token', () => {
        expect(FACE_LOOKS.dead).toBeTruthy();
        expect(FACE_LOOKS.dead.color).toMatch(/^#[0-9a-f]{6}$/i);
    });
});

describe('wiring', () => {
    it('game.js passes deaths to the tally', () => {
        expect(read('src/game.js')).toMatch(/lost: stats\.totalDead \|\| 0/);
    });

    it('the tick sound is skipped for the Lost bin', () => {
        expect(read('src/ui/results-tally.js')).toMatch(/if \(binTicks\(id\)\) sound\('tick', i\)/);
    });

    it('both themes style the Lost bin', () => {
        expect(read('src/ui/game-screen.css')).toMatch(/\.tally-bin--lost \{/);
        expect(read('src/ui/theme-ai-gold.css')).toMatch(/\.tally-bin--lost \{/);
    });
});

describe('care box label', () => {
    it('says Kept safe in game, matching the results', () => {
        const iso = BINS.find((b) => b.id === 'isolated');
        expect(iso.label).toBe('Kept safe');
        expect(BINS.map((b) => b.label)).not.toContain('Isolated');
    });
});
