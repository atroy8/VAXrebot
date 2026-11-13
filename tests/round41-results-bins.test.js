// Round 41: the results tally shows only the care bins somebody landed in,
// names the healthy-isolation bin "Kept safe" (the bonus line's words), and
// keeps the funding row hidden until it starts counting, so it never sits
// at "+0 funding" while the bins fill.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { shownBins, tallyBinsHtml } from '../src/ui/results-tally.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const bonus = {
    lines: [
        { id: 'treatment', label: 'Treated in isolation', count: 3, each: 3, amount: 9 },
        { id: 'isolated', label: 'Kept safe in isolation', count: 0, each: 2, amount: 0 },
        { id: 'cured', label: 'Cured', count: 3, each: 2, amount: 6 },
    ],
    total: 15,
};

describe('which bins the results show', () => {
    it('drops a bin nobody landed in (the level 1 case)', () => {
        expect(shownBins({ treatment: 3, isolated: 0, cured: 3 })).toEqual(['treatment', 'cured']);
    });

    it('keeps all three, in order, when all were used', () => {
        expect(shownBins({ treatment: 1, isolated: 2, cured: 4 })).toEqual(['treatment', 'isolated', 'cured']);
    });

    it('shows a lone bin when only one was used', () => {
        expect(shownBins({ isolated: 5 })).toEqual(['isolated']);
    });

    it('never shows an empty row: falls back to Cured', () => {
        expect(shownBins({ treatment: 0, isolated: 0, cured: 0 })).toEqual(['cured']);
        expect(shownBins(undefined)).toEqual(['cured']);
    });
});

describe('bins row markup', () => {
    it('renders one bin per shown id and sizes the grid to match', () => {
        const html = tallyBinsHtml({ treatment: 3, isolated: 0, cured: 3 }, bonus);
        expect(html).toContain('--bins:2');
        expect(html).toContain('data-bin="treatment"');
        expect(html).toContain('data-bin="cured"');
        expect(html).not.toContain('data-bin="isolated"');
        expect(html).toContain('+3 each');
    });

    it('labels healthy isolation as Kept safe, not Isolated', () => {
        const html = tallyBinsHtml({ isolated: 2 }, bonus);
        expect(html).toContain('Kept safe');
        expect(html).not.toMatch(/>Isolated</);
    });

    it('has no empty bins left in the markup on a three-bin win', () => {
        const html = tallyBinsHtml({ treatment: 1, isolated: 1, cured: 1 }, bonus);
        expect(html.match(/class="tally-bin /g)).toHaveLength(3);
        expect(html).toContain('--bins:3');
    });
});

describe('wiring', () => {
    const js = read('src/ui/results-tally.js');
    const css = read('src/ui/game-screen.css');

    it('fills and animates only the shown bins', () => {
        expect(js).toMatch(/for \(const id of shownBins\(bins\)\) fillBin/);
        expect(js).toMatch(/for \(const id of shownBins\(bins\)\) \{/);
    });

    it('grid columns follow the bin count', () => {
        expect(css).toMatch(/\.tally-bins \{[^}]*repeat\(var\(--bins, 3\), 1fr\)/);
    });

    it('funding row starts hidden and appears when the count starts or on skip', () => {
        expect(js).toMatch(/class="tally-total" data-total-row hidden/);
        const count = js.indexOf('// 4. Funding counts up.');
        expect(js.indexOf("q('[data-total-row]').hidden = false", count)).toBeGreaterThan(count);
        const finish = js.indexOf('function finish()');
        const unhide = js.indexOf("q('[data-total-row]').hidden = false", finish);
        expect(unhide).toBeGreaterThan(finish);
        expect(unhide).toBeLessThan(js.indexOf('async function run()'));
    });

    it('a hidden funding row really is hidden despite display:flex', () => {
        expect(css).toMatch(/\.tally-total\[hidden\] \{ display: none; \}/);
    });
});
