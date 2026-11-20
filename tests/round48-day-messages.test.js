// Round 48: messages that change with the day stay true when the day moves.
// 1) The day banner shows at the start of a new day, so it names the night
//    that passed instead of the previous day's number.
// 2) The care nudge that says "Quarantine opens on day 3" is cleared when the
//    day moves on, and a second line says Quarantine is open on that day.
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { dayBanner, careNudgeStep, careNudgeLine, careOpenLine } from '../src/ui/game-screen-model.js';
import { careStillHelps } from '../src/sim/engine.js';

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

describe('day banner names the night', () => {
    it('never shows a day number that disagrees with the header', () => {
        for (let day = 1; day < 12; day++) {
            const { text } = dayBanner({ day, newCases: 2 });
            expect(text).not.toMatch(/Day \d/);
            expect(text.startsWith('Overnight: ')).toBe(true);
        }
    });

    it('keeps the tone rules', () => {
        expect(dayBanner({ day: 1, newCases: 2 }).tone).toBe('bad');
        expect(dayBanner({ day: 1, newCases: 1, recovered: 1 }).tone).toBe('calm');
        expect(dayBanner({ day: 1, died: 1 })).toEqual({ text: 'Overnight: 1 lost', tone: 'calm' });
        expect(dayBanner({ day: 1 })).toEqual({ text: 'Overnight: no new cases', tone: 'good' });
    });
});

describe('careNudgeStep', () => {
    let seen;
    beforeEach(() => { seen = {}; });
    const mark = (step) => { seen[step.kind] = true; };

    it('waits, then says Quarantine is open on its day', () => {
        const w = careNudgeStep({ day: 3, sick: 2 }, 2, seen);
        expect(w).toEqual({ kind: 'waiting', text: careNudgeLine({ day: 3, sick: 2 }, 2) });
        mark(w);
        expect(careNudgeStep({ day: 3, sick: 2 }, 2, seen)).toBeNull();
        const o = careNudgeStep({ day: 3, sick: 2 }, 3, seen);
        expect(o).toEqual({ kind: 'open', text: 'Quarantine is open! 2 sick people still need care: tap them to isolate them.' });
        mark(o);
        expect(careNudgeStep({ day: 3, sick: 1 }, 3, seen)).toBeNull();
        expect(careNudgeStep({ day: 4, sick: 1 }, 4, seen)).toBeNull();
    });

    it('when Quarantine is already open, shows the round 39 line once', () => {
        const o = careNudgeStep({ day: 3, sick: 1 }, 3, seen);
        expect(o.kind).toBe('open');
        expect(o.text).toBe(careNudgeLine({ day: 3, sick: 1 }, 3));
        mark(o);
        expect(careNudgeStep({ day: 4, sick: 1 }, 4, seen)).toBeNull();
    });

    it('a used-up Quarantine pushing care to tomorrow after the open line stays quiet', () => {
        mark(careNudgeStep({ day: 3, sick: 2 }, 3, seen));
        expect(careNudgeStep({ day: 4, sick: 1 }, 3, seen)).toBeNull();
    });

    it('says nothing when care cannot help', () => {
        expect(careNudgeStep(null, 2, seen)).toBeNull();
    });

    it('lines are short, singular aware and free of dashes', () => {
        expect(careOpenLine({ day: 3, sick: 1 })).toBe('Quarantine is open! 1 sick person still needs care: tap them to isolate them.');
        expect(careOpenLine(null)).toBe('');
        for (const line of [careOpenLine({ sick: 1 }), careOpenLine({ sick: 3 })]) {
            expect(line.length).toBeLessThanOrEqual(100);
            expect(line).not.toMatch(/[—–]/);
        }
    });

    it('matches the engine: day 2 waits for a day 3 Quarantine, day 3 opens', () => {
        const tools = { quarantine: { baseDailyLimit: 2, availableDay: 3 } };
        const difficulty = { toolLimitMultiplier: 1, toolDays: { quarantine: 3 } };
        const network = { nodes: [{ id: 1, state: 'infected', daysInfected: 1 }, { id: 2, state: 'healthy' }], links: [] };
        const day2 = careStillHelps({ day: 2, dailyUsage: {} }, network, tools, difficulty, 6);
        expect(day2).toEqual({ day: 3, sick: 1 });
        const w = careNudgeStep(day2, 2, seen);
        expect(w.kind).toBe('waiting');
        mark(w);
        network.nodes[0].daysInfected = 2;
        const day3 = careStillHelps({ day: 3, dailyUsage: {} }, network, tools, difficulty, 6);
        expect(careNudgeStep(day3, 3, seen).kind).toBe('open');
    });
});

describe('wiring', () => {
    const game = read('src/game.js');
    const nextDay = game.slice(game.indexOf('    nextDay() {'), game.indexOf('    maybeWrapUp() {'));
    const wrap = game.slice(game.indexOf('    maybeWrapUp() {'), game.indexOf('    endWrapUp() {'));

    it('clears the waiting line before the new day runs', () => {
        const at = nextDay.indexOf('dismissToast(nudges.waitingText)');
        expect(at).toBeGreaterThan(-1);
        expect(at).toBeLessThan(nextDay.indexOf('advanceDay('));
    });

    it('maybeWrapUp shows the step and swaps out the waiting line', () => {
        expect(wrap).toContain('careNudgeStep(care, this.gameState.day, seen)');
        expect(wrap).toContain('dismissToast(seen.waitingText)');
        expect(wrap).not.toContain('careNudgeShown');
    });

    it('dismissToast exists in panels and matches toasts by their shown text', () => {
        const panels = read('src/ui/panels.js');
        expect(panels).toMatch(/export function dismissToast\(message\)/);
    });

    it('the banner sits between the Key and 2D/3D buttons', () => {
        const css = read('src/ui/game-screen.css');
        const rule = css.slice(css.indexOf('.day-banner {\n    top: 10px;'));
        expect(rule.slice(0, rule.indexOf('}'))).toContain('max-width: calc(100% - 128px)');
    });
});
