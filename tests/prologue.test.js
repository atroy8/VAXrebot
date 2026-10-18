import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
    PROLOGUE_CARDS,
    PROLOGUE_SEEN_KEY,
    ALIEN_RACE,
    shouldShowPrologue,
    markPrologueSeen,
    createPrologueController,
    prologueMarkup,
    REPLAY_EVENT,
} from '../src/ui/prologue.js';
import { settingsMarkup } from '../src/ui/settings.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const memory = () => {
    const m = new Map();
    return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
};

describe('story prologue (round 14)', () => {
    it('has 5 to 6 cards and ends on Stop the spread. Save the galaxy. with a Begin button', () => {
        expect(PROLOGUE_CARDS.length).toBeGreaterThanOrEqual(5);
        expect(PROLOGUE_CARDS.length).toBeLessThanOrEqual(6);
        const last = PROLOGUE_CARDS.at(-1);
        expect(last.title).toBe('Stop the spread. Save the galaxy.');
        expect(last.final).toBe(true);
        const html = prologueMarkup();
        expect(html.match(/class="pro-card[ "]/g)).toHaveLength(PROLOGUE_CARDS.length);
        expect(html).toContain('data-act="begin"');
        expect(html).toContain('data-act="skip"');
    });

    it('tells the story: hostile aliens spread a virus, you are the last hope, the tools are real', () => {
        const all = PROLOGUE_CARDS.map((c) => `${c.title} ${c.text}`).join(' ');
        expect(all).toContain('Blightborne');
        expect(ALIEN_RACE).toBe('the Blightborne');
        expect(all).toMatch(/last hope/);
        expect(all).toMatch(/person to person/);
        for (const tool of ['Vaccines', 'Quarantine', 'Cutting contacts']) expect(all).toContain(tool);
    });

    it('copy and code have no em dashes', () => {
        expect(JSON.stringify(PROLOGUE_CARDS)).not.toContain('—');
        expect(read('src/ui/prologue.js')).not.toContain('—');
        expect(read('src/ui/prologue.css')).not.toContain('—');
    });

    it('shows only on first launch', () => {
        const s = memory();
        expect(shouldShowPrologue(s)).toBe(true);
        markPrologueSeen(s);
        expect(s.getItem(PROLOGUE_SEEN_KEY)).toBe('1');
        expect(shouldShowPrologue(s)).toBe(false);
    });

    it('never crashes when storage is missing or throws', () => {
        const bad = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
        expect(shouldShowPrologue(bad)).toBe(true);
        expect(shouldShowPrologue(null)).toBe(true);
        expect(() => markPrologueSeen(bad)).not.toThrow();
    });

    it('taps advance card by card and the final card waits for Begin', () => {
        const seen = [];
        let done = null;
        const ctl = createPrologueController({ onChange: (i) => seen.push(i), onDone: (r) => (done = r) });
        for (let i = 0; i < 20; i++) ctl.next();
        expect(seen).toEqual(PROLOGUE_CARDS.slice(1).map((_, i) => i + 1));
        expect(ctl.isFinal).toBe(true);
        expect(done).toBeNull();
        ctl.begin();
        expect(done).toBe('begin');
        ctl.skip();
        expect(done).toBe('begin');
    });

    it('Skip leaves from any card', () => {
        let done = null;
        const ctl = createPrologueController({ onDone: (r) => (done = r) });
        ctl.next();
        ctl.skip();
        expect(done).toBe('skip');
        expect(ctl.next()).toBe(false);
    });

    it('is wired in on launch, over the start page, and Settings can replay it', () => {
        const main = read('src/main.js');
        expect(main).toContain('maybeShowPrologue()');
        expect(main).toContain('bindPrologueReplay()');
        const html = settingsMarkup({ adsRemoved: false });
        expect(html).toContain('data-act="replay-story"');
        expect(html).toContain('Replay story');
        expect(read('src/ui/settings.js')).toContain(`new CustomEvent('${REPLAY_EVENT}')`);
    });

    it('Skip is a real thumb target', () => {
        const css = read('src/ui/prologue.css');
        expect(css).toMatch(/\.pro-skip \{[^}]*min-height: 44px/);
        expect(css).toContain('prefers-reduced-motion');
    });
});

describe('Galactic Outbreak name (round 14)', () => {
    it('user-facing pages use the new name', () => {
        expect(read('index.html')).toContain('<title>Galactic Outbreak</title>');
        for (const p of ['public/privacy.html', 'public/support.html']) {
            expect(read(p)).toContain('Galactic Outbreak');
            expect(read(p).replace(/atroy8\/VAXrebot/g, '')).not.toContain('VAXrebot');
        }
        expect(settingsMarkup({ adsRemoved: true })).toContain('Thanks for supporting Galactic Outbreak.');
    });
});
