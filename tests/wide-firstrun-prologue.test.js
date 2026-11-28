// Wide audience pass, the story before the title: six cards are kept, but
// the way past them is the easiest thing to find, and a returning player
// never sees them again.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { shouldShowPrologue, markPrologueSeen, prologueMarkup, PROLOGUE_SEEN_KEY, RETURNING_KEY, PROLOGUE_CARDS } from '../src/ui/prologue.js';
import { COACH_FLAG } from '../src/ui/coach-model.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const makeStorage = (init = {}) => {
    const store = new Map(Object.entries(init));
    return { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), store };
};

describe('prologue: returning players never see it again', () => {
    it('shows on a first launch and not after it has been seen', () => {
        const storage = makeStorage();
        expect(shouldShowPrologue(storage)).toBe(true);
        markPrologueSeen(storage);
        expect(storage.store.get(PROLOGUE_SEEN_KEY)).toBe('1');
        expect(shouldShowPrologue(storage)).toBe(false);
    });

    it('does not show to someone who has already played the first level', () => {
        expect(RETURNING_KEY).toBe(COACH_FLAG);
        expect(shouldShowPrologue(makeStorage({ [RETURNING_KEY]: 'true' }))).toBe(false);
        expect(shouldShowPrologue(makeStorage({ [RETURNING_KEY]: 'false' }))).toBe(true);
    });

    it('is marked seen as soon as it shows, not only when it ends', () => {
        const js = read('src/ui/prologue.js');
        const mount = js.slice(js.indexOf('export function mountPrologue'), js.indexOf('export function maybeShowPrologue'));
        const shown = mount.indexOf('doc.body.appendChild(root);');
        const marked = mount.indexOf('markPrologueSeen(storage);');
        expect(shown).toBeGreaterThan(-1);
        expect(marked).toBeGreaterThan(shown);
        expect(marked).toBeLessThan(mount.indexOf('const ctl = createPrologueController'));
    });

    it('still shows when storage is missing or broken, and never throws', () => {
        expect(shouldShowPrologue(null)).toBe(true);
        expect(
            shouldShowPrologue({
                getItem() {
                    throw new Error('blocked');
                },
            })
        ).toBe(true);
    });
});

describe('prologue: Skip is prominent', () => {
    const css = read('src/ui/prologue.css');
    const rule = css.match(/\.pro-skip \{([^}]*)\}/)[1];

    it('says what it skips and is on every card', () => {
        const html = prologueMarkup();
        expect(html).toContain('<button type="button" class="pro-skip" data-act="skip">Skip story</button>');
        // One Skip for the whole story, outside the cards, so it never moves.
        expect(html.indexOf('pro-skip')).toBeLessThan(html.indexOf('pro-cards'));
        expect(PROLOGUE_CARDS).toHaveLength(6);
    });

    it('is a solid gold pill with dark text and a full size target', () => {
        expect(rule).toMatch(/background:\s*var\(--kin-400, #ddb94a\)/);
        expect(rule).toMatch(/color:\s*var\(--ai-900, #0b1838\)/);
        expect(rule).toMatch(/min-height:\s*44px/);
        expect(rule).toMatch(/min-width:\s*72px/);
        expect(rule).toMatch(/font-size:\s*1rem/);
    });

    it('reads clearly: dark ink on gold is well past WCAG AA', () => {
        const lum = (hex) => {
            const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
            return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
        };
        const [hi, lo] = [lum('#ddb94a'), lum('#0b1838')].sort((a, b) => b - a);
        expect((hi + 0.05) / (lo + 0.05)).toBeGreaterThanOrEqual(7);
    });
});
