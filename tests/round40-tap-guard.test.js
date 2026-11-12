// Round 40: a late Next day tap as a level ends no longer presses the
// results button that appears under the thumb (src/ui/tap-guard.js).
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createTapGuard, guardScreenTaps, TAP_GUARD_MS } from '../src/ui/tap-guard.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

describe('tap guard timing', () => {
    it('blocks nothing until armed', () => {
        const g = createTapGuard({ now: () => 0 });
        expect(g.blocks(0)).toBe(false);
        expect(g.blocks(1e6)).toBe(false);
    });

    it('blocks for the guard window after arming, then lets taps through', () => {
        const g = createTapGuard({ ms: 650, now: () => 1000 });
        g.arm(1000);
        expect(g.blocks(1000)).toBe(true);
        expect(g.blocks(1300)).toBe(true); // a quick double tap lands about 300 ms later
        expect(g.blocks(1649)).toBe(true);
        expect(g.blocks(1650)).toBe(false);
        expect(g.blocks(5000)).toBe(false);
        expect(g.remaining(1400)).toBe(250);
        expect(g.remaining(9000)).toBe(0);
    });

    it('re-arming restarts the window, and disarm ends it', () => {
        const g = createTapGuard({ ms: 500 });
        g.arm(0);
        g.arm(400);
        expect(g.blocks(800)).toBe(true);
        g.disarm();
        expect(g.blocks(800)).toBe(false);
    });

    it('the window catches a late tap but is short enough not to feel dead', () => {
        expect(TAP_GUARD_MS).toBeGreaterThanOrEqual(400);
        expect(TAP_GUARD_MS).toBeLessThanOrEqual(800);
    });
});

// A tiny stand-in for a DOM element: enough event plumbing for the capture
// listener without pulling in a DOM library.
function fakeScreen() {
    const listeners = [];
    const classes = new Set();
    return {
        classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c), contains: (c) => classes.has(c) },
        addEventListener: (type, fn, capture) => listeners.push({ type, fn, capture }),
        // Dispatch a click: capture listeners first, then the button's own
        // handler unless propagation was stopped.
        click(buttonHandler) {
            const e = {
                stopped: false,
                prevented: false,
                preventDefault() { this.prevented = true; },
                stopPropagation() { this.stopped = true; },
                stopImmediatePropagation() { this.stopped = true; },
            };
            for (const l of listeners) if (l.type === 'click' && l.capture) l.fn(e);
            if (!e.stopped) buttonHandler();
            return e;
        },
        listeners,
    };
}

describe('guardScreenTaps on a screen', () => {
    it('swallows a click right after the screen opens and lets a later one through', () => {
        let t = 0;
        const timers = [];
        const el = fakeScreen();
        const g = guardScreenTaps(el, { ms: 650, now: () => t, setTimer: (fn, ms) => timers.push({ fn, ms }) && timers.length, clearTimer: () => {} });
        expect(el.listeners.some((l) => l.type === 'click' && l.capture === true)).toBe(true);
        const nextLevel = vi.fn();

        g.arm();
        expect(el.classList.contains('tap-guarded')).toBe(true);
        t = 200;
        const e = el.click(nextLevel);
        expect(nextLevel).not.toHaveBeenCalled();
        expect(e.prevented).toBe(true);

        t = 700;
        timers.at(-1).fn();
        expect(el.classList.contains('tap-guarded')).toBe(false);
        el.click(nextLevel);
        expect(nextLevel).toHaveBeenCalledTimes(1);
    });

    it('never blocks a screen that was not armed', () => {
        const el = fakeScreen();
        guardScreenTaps(el, { now: () => 0 });
        const fn = vi.fn();
        el.click(fn);
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('copes with a missing element', () => {
        expect(() => guardScreenTaps(null).arm()).not.toThrow();
    });
});

describe('wiring', () => {
    const game = read('src/game.js');
    const css = read('src/ui/game-screen.css');

    it('game.js guards the results and briefing screens and arms on showScreen', () => {
        expect(game).toMatch(/import \{ guardScreenTaps \} from '\.\/ui\/tap-guard\.js'/);
        expect(game).toMatch(/'game-over': guardScreenTaps\(document\.getElementById\('game-over-screen'\)\)/);
        expect(game).toMatch(/briefing: guardScreenTaps\(document\.getElementById\('briefing-screen'\)\)/);
        expect(game).toMatch(/this\.screenGuards\?\.\[screenName\]\?\.arm\(\)/);
    });

    it('the guards are set up before any button listener, so the capture listener runs first', () => {
        const guards = game.indexOf('this.screenGuards = {');
        const firstButton = game.indexOf("getElementById('start-simulation').addEventListener");
        expect(guards).toBeGreaterThan(0);
        expect(guards).toBeLessThan(firstButton);
    });

    it('the buttons show as settling in while guarded, with a reduced motion fallback', () => {
        expect(css).toMatch(/#game-over-screen\.tap-guarded \.game-over-actions \.btn/);
        expect(css).toMatch(/#briefing-screen\.tap-guarded \.briefing-actions \.btn/);
        expect(css).toMatch(/@keyframes tap-guard-settle/);
        expect(css).toMatch(/prefers-reduced-motion: reduce\)[\s\S]*tap-guarded/);
    });
});
