// Round 26: the How to play cards were near-unreadable (dark titles on deep
// indigo cards) and still talked about dots. They now sit on washi paper with
// ink headings, match the current game, and show once on a new player's
// first level.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { HOW_TO_PLAY } from '../src/ui/onboarding.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const theme = read('src/ui/theme-ai-gold.css');

const vars = Object.fromEntries([...theme.matchAll(/(--[\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)].map((m) => [m[1], m[2]]));
const resolve = (v) => (v.startsWith('var(') ? vars[v.slice(4, -1)] : v);
const rule = (selector) => {
    const m = theme.match(new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`));
    return m ? m[1] : '';
};
const prop = (body, name) => {
    const m = body.match(new RegExp(`(?:^|;|\\s)${name}:\\s*([^;]+);`));
    return m ? resolve(m[1].trim()) : null;
};
const lum = (hex) => {
    const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const contrast = (a, b) => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
};

describe('How to play cards (round 26)', () => {
    it('has three cards that match the game: faces, red lines, tool days, deaths', () => {
        expect(HOW_TO_PLAY).toHaveLength(3);
        const text = HOW_TO_PLAY.map((c) => `${c.title} ${c.body}`).join(' ');
        expect(text).not.toMatch(/\bdots?\b/);
        for (const word of ['face', 'red lines', 'later day', 'die', 'R']) expect(text).toContain(word);
        expect(text).not.toMatch(/—/);
    });

    it('titles and body text read clearly on the card (WCAG AA or better)', () => {
        const card = prop(rule('html .onboarding-card'), 'background');
        const title = prop(rule('html .onboarding-card h3'), 'color');
        const body = prop(rule('html .onboarding-card p'), 'color');
        expect(card).toMatch(/^#/);
        expect(contrast(title, card)).toBeGreaterThanOrEqual(7);
        expect(contrast(body, card)).toBeGreaterThanOrEqual(4.5);
    });

    it('the card is no longer the theme background (deep indigo)', () => {
        expect(prop(rule('html .onboarding-card'), 'background')).not.toBe(vars['--ai-900']);
    });

    it('shows once on the first level for a new player', () => {
        const game = read('src/game.js');
        expect(game).toContain('m.maybeShowOnboarding()');
        expect(game).toContain('this.currentLevel.id === LEVELS[0].id');
        expect(read('src/ui/onboarding.js')).toContain("localStorage.getItem(FLAG) === 'true'");
    });
});
