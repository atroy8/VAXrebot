// Wide audience pass, the briefing: it was a long scrolling page (lesson
// card, situation, tools card, disease profile, threat, star goal). By
// default it now fits one 390 x 844 screen: level name, one line of
// situation, any rule-changing twist, the tools as chips, the threat pips and
// a big Begin button. The rest opens in place behind More.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resetBriefingMore, showVariantCallout } from '../src/ui/briefing.js';
import { variantCallout } from '../src/sim/variants.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const html = read('index.html');
const screen = html.slice(html.indexOf('id="briefing-screen"'), html.indexOf('<!-- Game Screen -->'));
const at = (needle) => {
    const i = screen.indexOf(needle);
    expect(i, needle).toBeGreaterThan(-1);
    return i;
};
const moreOpen = at('<details class="briefing-more" id="briefing-more">');
const moreClose = at('</details>');
const inMore = (needle) => at(needle) > moreOpen && at(needle) < moreClose;

describe('one screen briefing: what shows by default', () => {
    it('keeps the name, situation, twist, tools, threat and buttons outside More, in that order', () => {
        const order = ['id="briefing-title"', 'id="briefing-mentor"', 'id="briefing-description-text"', 'id="briefing-variant"', 'id="briefing-toolkit"', 'id="threat-meter"', 'id="threat-line"', 'id="briefing-more"', 'id="start-simulation"'];
        const idx = order.map(at);
        expect([...idx].sort((a, b) => a - b)).toEqual(idx);
        for (const id of order.slice(0, 7)) expect(inMore(id), id).toBe(false);
        expect(inMore('id="start-simulation"')).toBe(false);
        expect(inMore('id="back-to-menu"')).toBe(false);
    });

    it('puts the lesson, the disease profile and the star goal behind More', () => {
        for (const id of ['briefing-lesson', 'briefing-lesson-text', 'briefing-disease', 'briefing-traits', 'briefing-agent', 'briefing-vector', 'briefing-r0', 'star-goal']) {
            expect(inMore(`id="${id}"`), id).toBe(true);
        }
    });

    it('More is a native disclosure, closed by default, with a 44 px target', () => {
        expect(screen).toMatch(/<details class="briefing-more" id="briefing-more">\s*<summary class="briefing-more-summary">More<\/summary>/);
        expect(screen).not.toMatch(/<details[^>]*id="briefing-more"[^>]*\sopen/);
        const css = read('src/ui/briefing-lean.css');
        expect(css).toMatch(/\.briefing-more-summary \{[^}]*min-height:\s*44px/);
    });

    it('leaves a mentor slot directly under the level name, hidden while empty', () => {
        // Merged with the story stream: the mentor slot is its div.mentor-line (story.css).
        expect(screen).toMatch(/<h2 id="briefing-title"><\/h2>\s*<div class="mentor-line" id="briefing-mentor" hidden><\/div>/);
    });

    it('keeps every id the game fills, each exactly once', () => {
        for (const id of ['briefing-title', 'briefing-mentor', 'briefing-description-text', 'briefing-variant', 'briefing-toolkit', 'briefing-lesson', 'briefing-lesson-title', 'briefing-lesson-text', 'briefing-disease', 'briefing-traits', 'briefing-traits-row', 'briefing-agent', 'briefing-vector', 'briefing-r0', 'threat-meter', 'threat-line', 'star-goal', 'back-to-menu', 'start-simulation']) {
            expect(html.split(`id="${id}"`).length - 1, id).toBe(1);
        }
    });
});

describe('one screen briefing: styles', () => {
    const css = read('src/ui/briefing-lean.css');

    it('is loaded with the briefing code', () => {
        expect(read('src/ui/briefing.js')).toContain("import './briefing-lean.css';");
    });

    it('the situation is one plain line with no second heading', () => {
        expect(css).toMatch(/\.briefing-description > strong \{ display: none; \}/);
    });

    it('a twist stays visible as one line; its explanation and the toolkit reason open with More', () => {
        expect(css).toMatch(/\.briefing-content:not\(\.more-open\) \.variant-text,\s*#briefing-screen \.briefing-content:not\(\.more-open\) \.kit-why \{ display: none; \}/);
        // Nothing hides the twist title or the tool chips.
        expect(css).not.toMatch(/\.variant-title[^{]*\{[^}]*display:\s*none/);
        expect(css).not.toMatch(/\.kit-chips?[^{]*\{[^}]*display:\s*none/);
    });

    it('Begin is the big button', () => {
        expect(css).toMatch(/#start-simulation \{[^}]*min-height:\s*60px/);
        expect(css).toMatch(/#back-to-menu \{[^}]*min-height:\s*60px/);
        const grow = (id) => Number(css.match(new RegExp(`#${id} \\{[^}]*flex:\\s*([\\d.]+)`))[1]);
        expect(grow('start-simulation')).toBeGreaterThan(grow('back-to-menu'));
    });
});

// A tiny stand-in for the two nodes the functions touch.
function fakeDoc() {
    const listeners = {};
    const classes = new Set();
    const card = { classList: { toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)) } };
    const more = {
        open: true,
        dataset: {},
        closest: () => card,
        addEventListener: (type, fn) => {
            (listeners[type] ||= []).push(fn);
        },
    };
    return { more, classes, listeners, getElementById: (id) => (id === 'briefing-more' ? more : null) };
}

describe('More opens in place and every briefing starts closed', () => {
    it('closes More and clears the open class when a briefing is filled', () => {
        const doc = fakeDoc();
        doc.classes.add('more-open');
        resetBriefingMore(doc);
        expect(doc.more.open).toBe(false);
        expect(doc.classes.has('more-open')).toBe(false);
    });

    it('the open class follows the disclosure, and the listener is bound once', () => {
        const doc = fakeDoc();
        resetBriefingMore(doc);
        resetBriefingMore(doc);
        expect(doc.listeners.toggle).toHaveLength(1);
        doc.more.open = true;
        doc.listeners.toggle[0]();
        expect(doc.classes.has('more-open')).toBe(true);
        doc.more.open = false;
        doc.listeners.toggle[0]();
        expect(doc.classes.has('more-open')).toBe(false);
    });

    it('fillBriefing resets it', () => {
        const js = read('src/ui/briefing.js');
        const fill = js.slice(js.indexOf('export function fillBriefing'), js.indexOf('export function resetBriefingMore'));
        expect(fill).toContain('resetBriefingMore();');
    });

    it('does nothing on a page without the disclosure', () => {
        expect(() => resetBriefingMore({ getElementById: () => null })).not.toThrow();
    });
});

describe('rule-changing twists stay on the first screen', () => {
    it('every variant callout has a short title that reads on its own', () => {
        for (const type of ['superSpreader', 'envoy', 'noVaccines', 'noQuarantine']) {
            const callout = variantCallout({ type });
            expect(callout.title.length, type).toBeLessThanOrEqual(34);
            expect(callout.title).toMatch(/^(Puzzle|Twist|Boss): /);
        }
    });

    it('the callout fills the card in the markup instead of building one inside More', () => {
        const title = { textContent: '' };
        const text = { textContent: '' };
        const card = { hidden: true, querySelector: (s) => (s === '.variant-title' ? title : text) };
        const saved = globalThis.document;
        let created = 0;
        globalThis.document = {
            getElementById: (id) => (id === 'briefing-variant' ? card : null),
            createElement: () => {
                created++;
                return {};
            },
        };
        try {
            showVariantCallout(variantCallout({ type: 'noVaccines' }));
            expect(created).toBe(0);
            expect(card.hidden).toBe(false);
            expect(title.textContent).toBe('Twist: no vaccines');
            showVariantCallout(null);
            expect(card.hidden).toBe(true);
        } finally {
            globalThis.document = saved;
        }
    });
});
