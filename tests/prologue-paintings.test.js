// Painted prologue art (art/ARTCRAFT.md): a card shows its ArtCraft painting
// when src/assets/prologue/<id>.webp exists, and keeps its SVG otherwise.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { PROLOGUE_CARDS, prologueMarkup, cardArtMarkup } from '../src/ui/prologue.js';
import { PROLOGUE_CARD_IDS } from '../scripts/art-import-lib.mjs';

describe('prologue paintings', () => {
    it('the import script knows every story card id', () => {
        expect(PROLOGUE_CARDS.map((c) => c.id)).toEqual(PROLOGUE_CARD_IDS);
    });
    it('a card with a painting shows it; the others keep their SVG', () => {
        const html = prologueMarkup(PROLOGUE_CARDS, { peace: '/assets/peace-abc.webp' });
        expect(html).toContain('<img class="pro-paint" src="/assets/peace-abc.webp"');
        expect(html.match(/class="pro-paint"/g)).toHaveLength(1);
        expect(html.match(/<svg /g).length).toBe(PROLOGUE_CARDS.length - 1);
    });
    it('without paintings every card keeps its SVG', () => {
        for (const c of PROLOGUE_CARDS) expect(cardArtMarkup(c, {})).toMatch(/^<svg /);
    });
    it('escapes the URL and keeps the image decorative', () => {
        const img = cardArtMarkup(PROLOGUE_CARDS[0], { peace: 'a"b.webp' });
        expect(img).toContain('src="a&quot;b.webp"');
        expect(img).toContain('alt=""');
    });
    it('paintings sit in a gold-rimmed square plaque that fits a 390 px phone', () => {
        const css = readFileSync(new URL('../src/ui/prologue.css', import.meta.url), 'utf8');
        expect(css).toMatch(/\.pro-paint \{[^}]*aspect-ratio: 1/);
        expect(css).toMatch(/\.pro-art-wrap:has\(\.pro-paint\) \{ width: min\(78vw, 320px\)/);
    });
});
