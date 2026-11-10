// Round 38: two tap toasts could still stack over the web (a tray tap, then a
// web tap a moment later). Tap feedback (info, error) now replaces the last
// tap toast; good news (success) stays up beside it.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.hoisted(() => {
    if (!globalThis.Image) globalThis.Image = class { set src(v) { this._src = v; } };
});
const { showNotification } = await import('../src/ui/panels.js');

function fakeEl(id) {
    return {
        id, hidden: false, textContent: '', className: '', style: {}, dataset: {},
        children: [],
        appendChild(child) { this.children.push(child); child.parent = this; return child; },
        get firstChild() { return this.children[0]; },
    };
}

let els;
const live = () => els['notification-container'].children.filter((n) => !n.dataset.leaving).map((n) => n.textContent);
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

describe('tap toasts replace each other', () => {
    it('a second info toast replaces the first', () => {
        showNotification('Sever Link is used up for today. Tap a healthy person to vaccinate them.', 'info');
        showNotification('Pick a tool from the tray first.', 'info');
        expect(live()).toEqual(['Pick a tool from the tray first.']);
        vi.advanceTimersByTime(300);
        expect(els['notification-container'].children).toHaveLength(1);
    });
    it('an error replaces an info toast and the other way round', () => {
        showNotification('Person is already protected.', 'error');
        showNotification('Tap a person to use your tool.', 'info');
        expect(live()).toEqual(['Tap a person to use your tool.']);
        showNotification('Vaccine only works on healthy individuals.', 'error');
        expect(live()).toEqual(['Vaccine only works on healthy individuals.']);
    });
    it('the same line again refreshes the one toast', () => {
        showNotification('Sever Link is used up for today. It is back tomorrow.', 'info');
        showNotification('Sever Link is used up for today. It is back tomorrow.', 'info');
        expect(live()).toHaveLength(1);
        vi.advanceTimersByTime(2500);
        showNotification('Sever Link is used up for today. It is back tomorrow.', 'info');
        vi.advanceTimersByTime(2500);
        expect(live()).toHaveLength(1);
    });
    it('good news stays up beside a tap toast', () => {
        showNotification('R fell below 1!', 'success');
        showNotification('Pick a tool from the tray first.', 'info');
        expect(live()).toEqual(['R fell below 1!', 'Pick a tool from the tray first.']);
        showNotification('Tap a person to use your tool.', 'info');
        expect(live()).toEqual(['R fell below 1!', 'Tap a person to use your tool.']);
    });
});
