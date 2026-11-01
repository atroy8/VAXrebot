// Round 29: on a 390 px phone the toast row sits right on top of the tool
// hint at the bottom of the web, so a toast (Daily limit reached, R fell
// below 1) covered the hint and left half a sentence peeking out behind it.
// A toast now clears the hint, and a new hint fades the toasts.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';

// panels.js pulls in sprites.js, which preloads images at import time.
vi.hoisted(() => {
    if (!globalThis.Image) globalThis.Image = class { set src(v) { this._src = v; } };
});
const { showToolHint, hideToolHint, showNotification, dismissToasts } = await import('../src/ui/panels.js');

function fakeEl(id) {
    return {
        id, hidden: false, textContent: '', className: '', style: {}, dataset: {},
        children: [],
        appendChild(child) { this.children.push(child); child.parent = this; return child; },
        get firstChild() { return this.children[0]; },
    };
}

let els;
beforeEach(() => {
    vi.useFakeTimers();
    els = { 'tool-hint': fakeEl('tool-hint'), 'notification-container': fakeEl('notification-container') };
    globalThis.document = {
        getElementById: (id) => els[id] || null,
        createElement: () => {
            const el = fakeEl('');
            el.remove = () => { const list = el.parent.children; list.splice(list.indexOf(el), 1); };
            return el;
        },
    };
});
afterEach(() => {
    vi.useRealTimers();
    delete globalThis.document;
});

describe('toasts and the tool hint (round 29)', () => {
    it('a toast hides the tool hint so the two never overlap', () => {
        showToolHint('Tap a link to cut it.');
        expect(els['tool-hint'].hidden).toBe(false);
        showNotification('Daily limit for Sever Link reached.', 'error');
        expect(els['tool-hint'].hidden).toBe(true);
        expect(els['notification-container'].children).toHaveLength(1);
    });

    it('the hint timer cannot bring a stale hint back after a toast', () => {
        showToolHint('Tap a link to cut it.');
        showNotification('R fell below 1!', 'success');
        vi.advanceTimersByTime(5000);
        expect(els['tool-hint'].hidden).toBe(true);
    });

    it('picking a tool shows its hint and fades the toasts already up', () => {
        showNotification('Sever cuts lines, not people. Tap a red line.', 'info');
        showToolHint('Tap a healthy person to protect them.');
        expect(els['tool-hint'].hidden).toBe(false);
        expect(els['tool-hint'].textContent).toContain('healthy person');
        const toast = els['notification-container'].children[0];
        expect(toast.dataset.leaving).toBe('1');
        vi.advanceTimersByTime(300);
        expect(els['notification-container'].children).toHaveLength(0);
    });

    it('a toast that fades for a hint does not come back on its old timer', () => {
        showNotification('R fell below 1!', 'success');
        showToolHint('Tap a link to cut it.');
        vi.advanceTimersByTime(4000);
        expect(els['notification-container'].children).toHaveLength(0);
    });

    it('a toast after the hint gets the bottom of the web to itself', () => {
        showToolHint('Tap a link to cut it.');
        showNotification('Daily limit for Sever Link reached.', 'error');
        const live = els['notification-container'].children.filter((n) => !n.dataset.leaving);
        expect(live).toHaveLength(1);
        expect(els['tool-hint'].hidden).toBe(true);
    });

    it('hideToolHint is safe when the game screen is not mounted', () => {
        els = {};
        expect(() => hideToolHint()).not.toThrow();
        expect(() => dismissToasts()).not.toThrow();
    });

    it('the toast row and the hint still share the bottom of the web on phones', () => {
        // If either moves, this fix can be revisited.
        const css = readFileSync(new URL('../src/ui/game-screen.css', import.meta.url), 'utf8');
        expect(css).toMatch(/#notification-container \{ top: auto; bottom: calc\(176px/);
        expect(css).toMatch(/\.tool-hint \{ bottom: 10px;/);
    });
});
