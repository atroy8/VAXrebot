import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// Round 30: on a phone the results card scrolls inside #game-over-screen,
// and the sticky Replay / Back to map buttons stopped 16 px (plus the home
// bar inset) above the bottom edge, the screen's own bottom padding. Results
// text scrolled through that strip, cut in half under the buttons. A paper
// skirt under the buttons now covers it.

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const rule = (css, selector) => {
    const i = css.indexOf(selector + ' {');
    if (i < 0) return null;
    return css.slice(i, css.indexOf('}', i));
};

describe('results footer (round 30)', () => {
    const css = read('src/ui/game-screen.css');

    it('keeps the buttons sticky at the bottom of the results', () => {
        const sticky = rule(css, '#game-over-screen.has-tally .game-over-actions');
        expect(sticky).toMatch(/position:\s*sticky/);
        expect(sticky).toMatch(/bottom:\s*0/);
    });

    it('covers the strip under the buttons with a paper skirt', () => {
        const skirt = rule(css, '#game-over-screen.has-tally .game-over-actions::after');
        expect(skirt).not.toBeNull();
        expect(skirt).toMatch(/content:\s*''/);
        expect(skirt).toMatch(/position:\s*absolute/);
        expect(skirt).toMatch(/top:\s*100%/);
        expect(skirt).toMatch(/left:\s*0/);
        expect(skirt).toMatch(/right:\s*0/);
        // Taps pass through, and button shadows still paint on top.
        expect(skirt).toMatch(/pointer-events:\s*none/);
        expect(skirt).toMatch(/z-index:\s*-1/);
        expect(skirt).toMatch(/background:\s*var\(--results-paper/);
    });

    it('is at least as tall as the screen bottom padding it covers', () => {
        const shell = read('src/ui/app-shell.css');
        const phone = shell.slice(shell.indexOf('@media (max-width: 768px)'));
        const pad = phone.match(/padding-bottom:\s*calc\(var\(--space-16\) \+ env\(safe-area-inset-bottom, 0px\)\)/);
        expect(pad).not.toBeNull();
        const skirt = rule(css, '#game-over-screen.has-tally .game-over-actions::after');
        expect(skirt).toMatch(/height:\s*calc\(var\(--space-16\) \+ env\(safe-area-inset-bottom, 0px\) \+ \d+px\)/);
    });

    it('uses the same paper colour as the themed results card', () => {
        const theme = read('src/ui/theme-ai-gold.css');
        const fade = theme.match(/#game-over-screen\.has-tally \.game-over-actions \{[^}]*(#[0-9a-f]{6}) 14px/i);
        expect(fade).not.toBeNull();
        const paper = theme.match(/#game-over-screen \{\s*--results-paper:\s*(#[0-9a-f]{6})/i);
        expect(paper).not.toBeNull();
        expect(paper[1].toLowerCase()).toBe(fade[1].toLowerCase());
    });
});
