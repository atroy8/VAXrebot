import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { localDateString, utcDateString, addDays, dailyLevel, dailyStatus, recordDaily, settleDailyClock, freshDaily } from '../src/sim/daily.js';
import { dailyButtonText } from '../src/ui/daily.js';

// Round 60 playtest fix: the Daily follows the player's own calendar day.
// At 9 pm in New York the button said "Daily Nov 28" on Nov 27, because the
// day was taken in UTC.

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const savedTZ = process.env.TZ;
afterEach(() => {
    if (savedTZ === undefined) delete process.env.TZ;
    else process.env.TZ = savedTZ;
});

describe('the Daily date is the local calendar day (round 60)', () => {
    it('reads the device calendar, not UTC', () => {
        expect(localDateString(new Date(2026, 10, 27, 0, 0))).toBe('2026-11-27');
        expect(localDateString(new Date(2026, 10, 27, 23, 59))).toBe('2026-11-27');
        expect(localDateString(new Date(2026, 11, 31, 23, 59))).toBe('2026-12-31');
        expect(localDateString(new Date(2027, 0, 1, 0, 0))).toBe('2027-01-01');
    });

    it('9 pm in New York on Nov 27 is the Nov 27 puzzle, though UTC is already Nov 28', () => {
        process.env.TZ = 'America/New_York';
        const evening = new Date(Date.UTC(2026, 10, 28, 2, 0)); // 21:00 EST, Nov 27
        expect(utcDateString(evening)).toBe('2026-11-28');
        expect(localDateString(evening)).toBe('2026-11-27');
        expect(dailyButtonText(localDateString(evening), {}).title).toBe('Daily Nov 27');
    });

    it('morning in Tokyo is that day too, though UTC is still the day before', () => {
        process.env.TZ = 'Asia/Tokyo';
        const morning = new Date(Date.UTC(2026, 10, 27, 23, 30)); // 08:30 JST, Nov 28
        expect(utcDateString(morning)).toBe('2026-11-27');
        expect(localDateString(morning)).toBe('2026-11-28');
    });

    it('the same date still gives everyone the same puzzle', () => {
        expect(dailyLevel('2026-11-27')).toEqual(dailyLevel('2026-11-27'));
        expect(dailyLevel('2026-11-27').id).toBe('daily-2026-11-27');
    });

    it('the game asks for the local date in both places it reads the clock', () => {
        const src = read('src/game-meta.js');
        expect(src).not.toMatch(/utcDateString\(/);
        expect((src.match(/localDateString\(\)/g) || []).length).toBe(2);
    });
});

describe('saves dated in UTC before round 60 settle onto the local day', () => {
    const today = '2026-11-27';
    const utcAhead = { lastDate: '2026-11-28', streak: 4, best: 6, last: { date: '2026-11-28', outcome: 'contained', days: 4, lost: 0, stars: 3 } };

    it('a last play dated tomorrow counts as today: Done, streak kept', () => {
        const status = dailyStatus(utcAhead, today);
        expect(status.done).toBe(true);
        expect(status.streak).toBe(4);
        expect(status.best).toBe(6);
        expect(status.last.date).toBe(today);
    });

    it('so playing again today is practice and changes nothing', () => {
        const { daily, counted } = recordDaily(utcAhead, { date: today, outcome: 'overwhelmed', days: 3 });
        expect(counted).toBe(false);
        expect(daily.streak).toBe(4);
    });

    it('tomorrow the streak carries on as usual', () => {
        const settled = settleDailyClock(utcAhead, today);
        const { daily, counted } = recordDaily(settled, { date: addDays(today, 1), outcome: 'contained', days: 4, stars: 3 });
        expect(counted).toBe(true);
        expect(daily.streak).toBe(5);
        expect(daily.best).toBe(6);
    });

    it('leaves ordinary saves alone', () => {
        const yesterday = { lastDate: '2026-11-26', streak: 2, best: 2, last: { date: '2026-11-26', outcome: 'contained' } };
        expect(settleDailyClock(yesterday, today)).toBe(yesterday);
        expect(settleDailyClock(null, today)).toEqual(freshDaily());
        expect(dailyStatus(yesterday, today)).toEqual({ done: false, streak: 2, best: 2, last: null });
    });
});
