// Auto-advance countdown: fires once after the delay, can be held or
// cancelled, and restarts cleanly. Driven by fake timers.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createAutoAdvance } from '../src/ui/auto-advance.js';

function make(overrides = {}) {
    const calls = { fire: 0, ticks: [], stops: [] };
    const aa = createAutoAdvance({
        delayMs: 3000,
        onTick: (left) => calls.ticks.push(left),
        onFire: () => calls.fire++,
        onStop: (why) => calls.stops.push(why),
        timers: { setInterval, clearInterval, now: () => Date.now() },
        ...overrides,
    });
    return { aa, calls };
}

describe('auto-advance countdown', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('fires exactly once after the delay', () => {
        const { aa, calls } = make();
        aa.start();
        vi.advanceTimersByTime(2900);
        expect(calls.fire).toBe(0);
        vi.advanceTimersByTime(200);
        expect(calls.fire).toBe(1);
        vi.advanceTimersByTime(5000);
        expect(calls.fire).toBe(1);
        expect(aa.isRunning()).toBe(false);
    });

    it('clears the countdown display when it fires, before the day turns (round 27)', () => {
        const order = [];
        const { aa, calls } = make({ onStop: (why) => order.push(`stop:${why}`), onFire: () => order.push('fire') });
        aa.start();
        vi.advanceTimersByTime(3100);
        expect(order).toEqual(['stop:fired', 'fire']);
        expect(calls.fire).toBe(0);
    });

    it('a cancel from inside onFire (nextDay) is harmless after it fired', () => {
        const stops = [];
        let aa;
        aa = createAutoAdvance({
            delayMs: 1000,
            onFire: () => aa.cancel(),
            onStop: (why) => stops.push(why),
            timers: { setInterval, clearInterval, now: () => Date.now() },
        });
        aa.start();
        vi.advanceTimersByTime(1200);
        expect(stops).toEqual(['fired']);
        expect(aa.isRunning()).toBe(false);
    });

    it('reports time left on each tick, counting down to zero', () => {
        const { aa, calls } = make();
        aa.start();
        vi.advanceTimersByTime(3000);
        expect(calls.ticks[0]).toBe(3000);
        expect(calls.ticks.at(-1)).toBe(0);
        for (let i = 1; i < calls.ticks.length; i++) expect(calls.ticks[i]).toBeLessThanOrEqual(calls.ticks[i - 1]);
    });

    it('hold stops the countdown so the player can think', () => {
        const { aa, calls } = make();
        aa.start();
        vi.advanceTimersByTime(1000);
        aa.hold();
        vi.advanceTimersByTime(10000);
        expect(calls.fire).toBe(0);
        expect(calls.stops).toEqual(['held']);
        expect(aa.isHeld()).toBe(true);
    });

    it('cancel stops silently and a restart begins a fresh countdown', () => {
        const { aa, calls } = make();
        aa.start();
        vi.advanceTimersByTime(2500);
        aa.cancel();
        aa.start();
        vi.advanceTimersByTime(2500);
        expect(calls.fire).toBe(0);
        vi.advanceTimersByTime(600);
        expect(calls.fire).toBe(1);
        expect(calls.stops).toEqual(['cancelled', 'fired']);
    });

    it('hold and cancel are no-ops when nothing is running', () => {
        const { aa, calls } = make();
        aa.hold();
        aa.cancel();
        expect(calls.stops).toEqual([]);
    });
});
