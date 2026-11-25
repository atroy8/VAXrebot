// Round 57: stars come from the result against par and nothing else.
import { describe, it, expect } from 'vitest';
import { starsAgainstPar, calculateStars, calculateScore, calculatePoints, goldAward, recordCompletion, speedParDays, SCORING } from '../src/progress.js';
import { twoStarSlack } from '../src/config/puzzle-specs.js';
import { LEVELS } from '../src/config/levels.js';
import { starProgress, starHint, starMeterHtml } from '../src/ui/star-meter.js';
import { freshSave } from '../src/save.js';

const par = { cases: 4, deaths: 0, days: 7 };
const win = (cases, deaths = 0, population = 14) => ({ outcome: 'contained', cases, deaths, population });

describe('stars against par', () => {
    it('3 stars for matching par, and for beating it', () => {
        expect(starsAgainstPar(win(4), par)).toBe(3);
        expect(starsAgainstPar(win(3), par)).toBe(3);
        // Fewer cases beats par even with a death par did not have.
        expect(starsAgainstPar(win(3, 1), par)).toBe(3);
    });

    it('2 stars one case over par, 1 star for any other win, 0 for anything else', () => {
        expect(starsAgainstPar(win(5), par)).toBe(2);
        expect(starsAgainstPar(win(6), par)).toBe(1);
        expect(starsAgainstPar(win(13), par)).toBe(1);
        for (const outcome of ['overwhelmed', 'envoy-lost', 'timeout', 'burnout']) expect(starsAgainstPar({ ...win(4), outcome }, par)).toBe(0);
    });

    it('the same cases with more deaths than par is 2 stars', () => {
        expect(starsAgainstPar(win(4, 1), par)).toBe(2);
        expect(starsAgainstPar(win(4, 1), { cases: 4, deaths: 1 })).toBe(3);
    });

    it('big webs get one more case of slack for 2 stars', () => {
        expect(twoStarSlack(12)).toBe(1);
        expect(twoStarSlack(19)).toBe(1);
        expect(twoStarSlack(20)).toBe(2);
        expect(starsAgainstPar(win(6, 0, 24), par)).toBe(2);
        expect(starsAgainstPar(win(7, 0, 24), par)).toBe(1);
    });

    it('stars do not depend on how many people the web has, only on the result against par', () => {
        for (const population of [8, 12, 16, 19]) {
            expect(starsAgainstPar(win(4, 0, population), par)).toBe(3);
            expect(starsAgainstPar(win(5, 0, population), par)).toBe(2);
            expect(starsAgainstPar(win(6, 0, population), par)).toBe(1);
        }
        // The score moves with the size of the web; the stars do not.
        const stats = (pop) => ({ initialPopulation: pop, totalInfected: 4, totalDead: 0, totalRecovered: 4, daysUsed: 7, par });
        expect(calculateScore('contained', stats(8), LEVELS[0])).not.toBe(calculateScore('contained', stats(16), LEVELS[0]));
        expect(calculateStars('contained', stats(8), LEVELS[0])).toBe(calculateStars('contained', stats(16), LEVELS[0]));
    });

    it('days do not count for stars', () => {
        const stats = (daysUsed) => ({ initialPopulation: 14, totalInfected: 4, totalDead: 0, totalRecovered: 4, daysUsed, par });
        expect(calculateStars('contained', stats(7), LEVELS[3])).toBe(3);
        expect(calculateStars('contained', stats(15), LEVELS[3])).toBe(3);
    });

    it('a win with a power-up can still be 3 stars; the score pays for it', () => {
        const stats = (powerUpsUsed) => ({ initialPopulation: 14, totalInfected: 4, totalDead: 0, totalRecovered: 4, daysUsed: 7, powerUpsUsed, par });
        expect(calculateStars('contained', stats(1), LEVELS[3])).toBe(3);
        expect(calculateScore('contained', stats(1), LEVELS[3])).toBeLessThan(calculateScore('contained', stats(0), LEVELS[3]));
    });

    it('without a par (a web that was not dealt) a win is 1 star', () => {
        expect(calculateStars('contained', { initialPopulation: 10, totalInfected: 2, totalDead: 0 }, LEVELS[0])).toBe(1);
        expect(calculateStars('overwhelmed', { initialPopulation: 10, totalInfected: 9, totalDead: 0 }, LEVELS[0])).toBe(0);
    });

    it('no level carries a star target any more, and the old tuning files are gone', async () => {
        for (const level of LEVELS) expect(level.target).toBeUndefined();
        await expect(import('../src/config/star-targets.js')).rejects.toThrow();
        await expect(import('../src/config/campaign-tuning.js')).rejects.toThrow();
    });
});

describe('the score still pays gold and rises with better play', () => {
    const base = { initialPopulation: 14, totalInfected: 5, totalDead: 0, totalRecovered: 5, daysUsed: 8, powerUpsUsed: 0, par };
    const score = (over = {}) => calculateScore('contained', { ...base, ...over }, LEVELS[3]);

    it('fewer cases, fewer deaths and fewer power-ups each score more, and slower never scores more', () => {
        expect(score({ totalInfected: 4 })).toBeGreaterThan(score());
        expect(score({ totalDead: 1 })).toBeLessThan(score());
        expect(score({ powerUpsUsed: 1 })).toBeLessThan(score());
        expect(score({ daysUsed: 6 })).toBeGreaterThan(score({ daysUsed: 7 }));
        expect(score({ daysUsed: 9 })).toBeLessThanOrEqual(score({ daysUsed: 8 }));
    });

    it('the speed bonus is measured from the days of the best line found', () => {
        expect(SCORING.speedGrace).toBe(0);
        expect(speedParDays({ par }, LEVELS[3])).toBe(par.days);
        expect(calculatePoints('contained', { ...base, daysUsed: par.days - 1 }, LEVELS[3]) - calculatePoints('contained', { ...base, daysUsed: par.days }, LEVELS[3])).toBe(SCORING.perDayUnderPar);
        // Without a par the level's fallback is used.
        expect(speedParDays({}, LEVELS[3])).toBe(LEVELS[3].tuning.parDays);
    });

    it('10 points are 1 gold, and a loss pays nothing', () => {
        expect(goldAward('contained', base, LEVELS[3])).toBe(Math.floor(score() / 10));
        expect(goldAward('overwhelmed', base, LEVELS[3])).toBe(0);
        // A typical win pays about what it did before round 57.
        expect(score()).toBeGreaterThan(1000);
        expect(score()).toBeLessThan(1100);
    });

    it('recordCompletion banks the stars the par gives', () => {
        const save = recordCompletion(freshSave(), LEVELS[3].id, 'contained', { ...base, totalInfected: 4 });
        expect(save.levels[LEVELS[3].id]).toMatchObject({ stars: 3, completed: true });
        const worse = recordCompletion(save, LEVELS[3].id, 'contained', { ...base, totalInfected: 9 });
        expect(worse.levels[LEVELS[3].id].stars).toBe(3); // the best is kept
    });
});

describe('the star meter shows cases against par', () => {
    const stats = (over = {}) => ({ initialPopulation: 14, totalInfected: 5, totalDead: 0, totalRecovered: 5, daysUsed: 8, powerUpsUsed: 0, par, ...over });

    it('names the exact way to the next star', () => {
        const two = starProgress('contained', stats(), LEVELS[3]);
        expect(two.stars).toBe(2);
        expect(two.lines).toEqual({ three: 4, two: 5 });
        expect(starHint(two)).toBe('For 3 stars: keep it to 4 cases.');
        const one = starProgress('contained', stats({ totalInfected: 8 }), LEVELS[3]);
        expect(starHint(one)).toBe('For 2 stars: keep it to 5 cases.');
        const lostOne = starProgress('contained', stats({ totalInfected: 4, totalDead: 1 }), LEVELS[3]);
        expect(starHint(lostOne)).toBe('For 3 stars: lose nobody.');
    });

    it('praises a par run and a run that beat par', () => {
        expect(starHint(starProgress('contained', stats({ totalInfected: 4 }), LEVELS[3]))).toMatch(/best possible play, and everyone made it/);
        expect(starHint(starProgress('contained', stats({ totalInfected: 3 }), LEVELS[3]))).toMatch(/beat the best play we found \(4 cases\)/);
    });

    it('is left out on a loss and without a par', () => {
        expect(starProgress('overwhelmed', stats(), LEVELS[3])).toBe(null);
        expect(starProgress('contained', { ...stats(), par: undefined }, LEVELS[3])).toBe(null);
        expect(starMeterHtml(null)).toBe('');
    });

    it('draws three steps with the cases each star needs', () => {
        const html = starMeterHtml(starProgress('contained', stats(), LEVELS[3]));
        expect(html).toContain('star-meter-steps');
        expect(html).toContain('4 or fewer');
        expect(html).toContain('5 or fewer');
        expect(html).toContain('5 cases, best possible 4');
        expect((html.match(/star-meter-step on/g) || []).length).toBe(2);
        expect(html).not.toContain(String.fromCharCode(0x2014));
    });
});
