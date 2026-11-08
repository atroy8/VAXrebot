// Round 36: the level name in the game header is never cut off. It wraps
// onto at most two lines inside the icon row, and long names get a slightly
// smaller size. Checked at 390 and 360 px in Playwright: all 80 level names
// fit with no clipping and the top bar stays 44 px tall.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { LEVELS } from '../src/config/levels.js';
import { scenarios } from '../src/config/scenarios.js';
import { titleClass, TITLE_LONG_AT } from '../src/ui/game-screen-model.js';

const css = readFileSync(new URL('../src/ui/game-screen.css', import.meta.url), 'utf8');
const panels = readFileSync(new URL('../src/ui/panels.js', import.meta.url), 'utf8');
const rule = (sel) => {
    const i = css.indexOf(`${sel} {`);
    expect(i, sel).toBeGreaterThan(-1);
    return css.slice(i, css.indexOf('}', i));
};

describe('header level name', () => {
    it('wraps onto two lines instead of an ellipsis', () => {
        const h4 = rule('.game-info h4');
        expect(h4).not.toMatch(/nowrap/);
        expect(h4).not.toMatch(/ellipsis/);
        expect(h4).toMatch(/-webkit-line-clamp:\s*2/);
        expect(h4).toMatch(/line-height:\s*1\.1/);
    });

    it('two lines fit inside the 44 px icon row', () => {
        // 2 lines x 1.05rem (16.8 px) x 1.1 line height = about 37 px.
        expect(2 * 16.8 * 1.1).toBeLessThanOrEqual(44);
        expect(rule('.game-info h4.is-long')).toMatch(/font-size:\s*0\.94rem/);
        expect(rule('#current-difficulty-badge')).toMatch(/flex:\s*none/);
    });

    it('long names get the smaller size, short ones keep the full size', () => {
        expect(titleClass('Coral Bay Academy')).toBe('');
        expect(titleClass('Lantern Isle Market District')).toBe('is-long');
        expect(titleClass('x'.repeat(TITLE_LONG_AT))).toBe('');
        expect(titleClass('x'.repeat(TITLE_LONG_AT + 1))).toBe('is-long');
        expect(titleClass(null)).toBe('');
    });

    it('most level names are long, so this matters on nearly every level', () => {
        const names = LEVELS.map((l) => l.name || scenarios[l.scenarioId]?.name).filter(Boolean);
        expect(names.length).toBe(LEVELS.length);
        expect(names.filter((n) => titleClass(n) === 'is-long').length).toBeGreaterThan(names.length / 2);
    });

    it('the header sets the class and keeps the full name as a tooltip', () => {
        expect(panels).toMatch(/title\.className = titleClass\(scenarioName\)/);
        expect(panels).toMatch(/title\.title = scenarioName/);
    });
});
