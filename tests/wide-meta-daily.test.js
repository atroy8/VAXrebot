// Wide audience round, meta stream: the Daily puzzle.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { LEVELS } from '../src/config/levels.js';
import { tools } from '../src/config/tools.js';
import { rollLevelRules } from '../src/config/difficulty-roll.js';
import { rollPopulation } from '../src/config/campaign.js';
import { buildOutbreak, openingLimits } from '../src/sim/setup.js';
import { buildRun, mulberry32 } from '../src/sim/balance.js';
import { playMetaRun } from '../src/sim/meta-run.js';
import { calculateStars, parDaysFor } from '../src/progress.js';
import {
    DAILY_TEMPLATES,
    utcDateString,
    addDays,
    dailySeed,
    dailyLevel,
    isDailyLevel,
    dailyDice,
    freshDaily,
    dailyStatus,
    recordDaily,
    caseSquares,
    dailyShareText,
    SQUARES,
} from '../src/sim/daily.js';
import { shortDate, dailyButtonText, dailyResultMarkup, shareText } from '../src/ui/daily.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const START = '2026-11-25';
const DATES = Array.from({ length: 60 }, (_, i) => addDays(START, i));
const shape = (run) => JSON.stringify({ nodes: run.network.nodes, links: run.network.links, s: run.scenario, d: run.difficulty });

describe('one seeded level per UTC day', () => {
    it('the date is the UTC calendar day', () => {
        expect(utcDateString(new Date(Date.UTC(2026, 10, 25, 23, 59)))).toBe('2026-11-25');
        expect(utcDateString(new Date(Date.UTC(2026, 10, 26, 0, 0)))).toBe('2026-11-26');
        expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
        expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    });

    it('the same date always gives the same level, another date another seed', () => {
        expect(dailySeed(START)).toBe(dailySeed(START));
        expect(new Set(DATES.map(dailySeed)).size).toBe(60);
        expect(dailyLevel(START)).toEqual(dailyLevel(START));
        expect(dailyLevel(START).id).toBe('daily-2026-11-25');
        expect(isDailyLevel(dailyLevel(START))).toBe(true);
        expect(isDailyLevel(LEVELS[0])).toBe(false);
    });

    it('comes from the middle of the campaign: medium planets, no boss', () => {
        expect(DAILY_TEMPLATES.length).toBeGreaterThanOrEqual(20);
        for (const date of DATES) {
            const level = dailyLevel(date);
            const template = LEVELS.find((l) => l.id === level.templateId);
            expect(template.difficultyId).toBe('medium');
            expect(template.variant?.boss).toBeFalsy();
            expect([2, 3, 4]).toContain(template.planetIndex);
            expect(level.population).toEqual(template.population);
            expect(level.toolkit.tools).toEqual(template.toolkit.tools);
            expect(parDaysFor(level)).toBe(parDaysFor(template));
        }
        expect(new Set(DATES.map((d) => dailyLevel(d).templateId)).size).toBeGreaterThan(10); // variety
        // The templates are copied, never edited.
        const level = dailyLevel(START);
        level.tuning.parDays = 99;
        level.toolkit.tools.push('x');
        expect(dailyLevel(START).tuning.parDays).not.toBe(99);
        expect(dailyLevel(START).toolkit.tools).not.toContain('x');
    });

    it('same web, same first cases and same rules for everyone', () => {
        for (const date of DATES.slice(0, 12)) {
            const a = buildRun(dailyLevel(date), mulberry32(dailySeed(date)));
            const b = buildRun(dailyLevel(date), mulberry32(dailySeed(date)));
            expect(shape(a)).toBe(shape(b));
        }
        const one = buildRun(dailyLevel(DATES[0]), mulberry32(dailySeed(DATES[0])));
        const two = buildRun(dailyLevel(DATES[1]), mulberry32(dailySeed(DATES[1])));
        expect(shape(one)).not.toBe(shape(two));
    });

    it('the same moves give the same nights: a whole run repeats exactly', () => {
        for (const date of DATES.slice(0, 8)) {
            const a = playMetaRun(dailyLevel(date), { bot: 'smart', seed: dailySeed(date) });
            const b = playMetaRun(dailyLevel(date), { bot: 'smart', seed: dailySeed(date) });
            expect(JSON.stringify(a.stats)).toBe(JSON.stringify(b.stats));
            expect(a.outcome).toBe(b.outcome);
        }
    });

    it('the game builds the day from the same dice in the same order as the bots', () => {
        // What src/game-meta.js and src/game.js do: rules from dice.rules()
        // at the briefing, then population, web and cases from dice.run().
        for (const date of DATES.slice(0, 12)) {
            const level = dailyLevel(date);
            const dice = dailyDice(date);
            const { scenario, difficulty } = rollLevelRules(level, dice.rules());
            const rng = dice.run();
            const population = rollPopulation(scenario.populationRange, rng, null);
            const out = buildOutbreak({ scenario, population, variant: level.variant || null, rng, opening: openingLimits({ level, scenario, difficulty, tools, population }) });
            const bot = buildRun(level, mulberry32(dailySeed(date)));
            expect(JSON.stringify({ nodes: out.nodes, links: out.links, s: scenario, d: difficulty })).toBe(shape(bot));
            // Starting again (a practice replay) gives the same level again.
            const again = dice.run();
            expect(rollPopulation(scenario.populationRange, again, null)).toBe(population);
        }
    });

    it('no dice on the play path come from Math.random in a Daily', () => {
        const game = read('src/game.js');
        const meta = read('src/game-meta.js');
        expect(meta).toContain('const rng = this.daily ? dailyDice(this.daily.date).rules() : undefined;');
        expect(meta).toContain('this.runRng = this.daily ? dailyDice(this.daily.date).run() : null;');
        expect(meta).toContain('return rollPopulation(this.currentScenario.populationRange, this.runRng, null);');
        expect(game).toContain('const population = this.daily ? this.dailyPopulation() : rollPopulation(');
        // Web and first cases, every night, and the aftermath of a loss.
        expect(game.match(/rng: this\.runRng \|\| Math\.random,/g).length).toBe(2);
        expect(game).toContain('this.difficulty.fatalityRate, this.runRng || Math.random);');
        // Gentle mode, upgrades and power-ups are off, so everyone plays the same game.
        expect(meta).toContain("if (this.daily) return { gentle: false, upgrades: [] };");
        expect(meta).toMatch(/beforePowerUp\(\) \{\s*if \(this\.daily\) \{/);
        // Every sim function on the path takes the injected rng.
        const actions = read('src/sim/actions.js');
        expect(actions).toMatch(/simulateSpread\(state, network, rate, rng(, difficulty)?\)/);
        expect(actions).toContain('updateOutcomes(state, network, difficulty.recoveryTime, difficulty.fatalityRate, rng)');
    });
});

describe('the Daily is winnable but not a walkover (bots, 60 dates, the real seeds)', () => {
    const rate = (bot) => DATES.filter((date) => playMetaRun(dailyLevel(date), { bot, seed: dailySeed(date) }).outcome === 'contained').length / DATES.length;
    it('the smart bot wins between 50% and 90% of days', () => {
        const smart = rate('smart');
        expect(smart).toBeGreaterThanOrEqual(0.5);
        expect(smart).toBeLessThanOrEqual(0.9);
    });
    it('doing nothing never wins and random tapping rarely does', () => {
        expect(rate('passive')).toBe(0);
        expect(rate('random')).toBeLessThanOrEqual(0.25);
    });
    it('a win earns stars from the borrowed level target', () => {
        const wins = DATES.map((date) => playMetaRun(dailyLevel(date), { bot: 'smart', seed: dailySeed(date) })).filter((r) => r.outcome === 'contained');
        expect(wins.some((r) => r.stars >= 2)).toBe(true);
        const level = dailyLevel(START);
        expect(calculateStars('contained', { initialPopulation: 20, totalDead: 0, totalRecovered: 2, daysUsed: 3 }, level)).toBe(3);
    });
});

describe('streak: the first finished attempt of a day counts', () => {
    const win = (date) => ({ date, outcome: 'contained', days: 5, lost: 0, stars: 3 });
    it('wins on following days build a streak, replays are practice', () => {
        let { daily, counted } = recordDaily(freshDaily(), win('2026-11-25'));
        expect(counted).toBe(true);
        expect(daily.streak).toBe(1);
        const replay = recordDaily(daily, { ...win('2026-11-25'), stars: 1 });
        expect(replay.counted).toBe(false);
        expect(replay.daily).toBe(daily);
        ({ daily } = recordDaily(daily, win('2026-11-26')));
        ({ daily } = recordDaily(daily, win('2026-11-27')));
        expect(daily).toMatchObject({ lastDate: '2026-11-27', streak: 3, best: 3 });
        expect(daily.last).toEqual(win('2026-11-27'));
    });
    it('a missed day or a loss ends the streak, the best is kept', () => {
        let { daily } = recordDaily({ lastDate: '2026-11-25', streak: 4, best: 4, last: null }, win('2026-11-27'));
        expect(daily.streak).toBe(1);
        expect(daily.best).toBe(4);
        ({ daily } = recordDaily({ lastDate: '2026-11-25', streak: 4, best: 4, last: null }, { date: '2026-11-26', outcome: 'overwhelmed', days: 3, lost: 2, stars: 0 }));
        expect(daily.streak).toBe(0);
        expect(daily.best).toBe(4);
        expect(recordDaily(daily, win('2026-11-26')).counted).toBe(false); // the loss was the attempt
    });
    it('status for the button: done today, and a streak that is still alive', () => {
        const daily = { lastDate: '2026-11-25', streak: 3, best: 5, last: win('2026-11-25') };
        expect(dailyStatus(daily, '2026-11-25')).toMatchObject({ done: true, streak: 3, best: 5 });
        expect(dailyStatus(daily, '2026-11-26')).toMatchObject({ done: false, streak: 3, last: null });
        expect(dailyStatus(daily, '2026-11-27')).toMatchObject({ done: false, streak: 0 });
        expect(dailyStatus(undefined, '2026-11-25')).toMatchObject({ done: false, streak: 0, best: 0 });
        expect(dailyButtonText('2026-11-25', { done: false, streak: 0 })).toEqual({ title: 'Daily Nov 25', sub: 'New puzzle', done: false });
        expect(dailyButtonText('2026-11-25', { done: true, streak: 3 })).toEqual({ title: 'Daily Nov 25', sub: 'Done, streak 3', done: true });
        expect(shortDate('2027-01-05')).toBe('Jan 5');
    });
});

describe('spoiler-free share text', () => {
    it('one line of result and one square per night', () => {
        const text = dailyShareText({ date: '2026-11-25', outcome: 'contained', days: 5, lost: 0, stars: 3, activeByDay: [2, 4, 4, 3, 1, 0] });
        expect(text).toBe('Galactic Outbreak Daily 2026-11-25: contained in 5 days, 0 lost, 3 stars\n🟥🟨🟩🟩🟩');
    });
    it('squares show cases growing, holding and shrinking', () => {
        expect(caseSquares([1, 2, 2, 1])).toBe(SQUARES.up + SQUARES.same + SQUARES.down);
        expect(caseSquares([])).toBe('');
        expect(caseSquares([3])).toBe('');
        expect([...caseSquares(Array.from({ length: 40 }, (_, i) => i))].length).toBe(20);
    });
    it('a loss, singular words and a streak line', () => {
        expect(dailyShareText({ date: '2026-11-25', outcome: 'overwhelmed', days: 4, lost: 2, activeByDay: [2, 5] })).toBe('Galactic Outbreak Daily 2026-11-25: overwhelmed on day 4, 2 lost\n🟥');
        expect(dailyShareText({ date: '2026-11-25', outcome: 'contained', days: 1, lost: 1, stars: 1, streak: 4 })).toBe('Galactic Outbreak Daily 2026-11-25: contained in 1 day, 1 lost, 1 star\nStreak: 4 days');
    });
    it('gives nothing away: no web, names, tools or moves', () => {
        const run = playMetaRun(dailyLevel(START), { bot: 'smart', seed: dailySeed(START) });
        const text = dailyShareText({ date: START, outcome: run.outcome, days: run.day, lost: run.stats.totalDead, stars: run.stars, activeByDay: run.stats.activeByDay });
        expect(text).not.toMatch(/sever|vaccin|quarantin|link|kumoji|tsukimi|sango/i);
        expect(text.split('\n').length).toBeLessThanOrEqual(3);
        expect([...text.split('\n')[1]].length).toBe(run.stats.activeByDay.length - 1);
    });
    it('Share uses the system sheet when there is one, the clipboard otherwise', async () => {
        const calls = [];
        expect(await shareText('hi', { share: async (d) => calls.push(['share', d.text]) })).toBe('shared');
        expect(await shareText('hi', { clipboard: { writeText: async (t) => calls.push(['copy', t]) } })).toBe('copied');
        expect(calls).toEqual([['share', 'hi'], ['copy', 'hi']]);
        const blocked = { share: async () => { throw new Error('NotAllowed'); }, clipboard: { writeText: async (t) => calls.push(['copy2', t]) } };
        expect(await shareText('yo', blocked)).toBe('copied');
        const cancelled = { share: async () => { const e = new Error('x'); e.name = 'AbortError'; throw e; }, clipboard: { writeText: async () => calls.push(['never']) } };
        expect(await shareText('yo', cancelled)).toBe('failed');
        expect(calls.some((c) => c[0] === 'never')).toBe(false);
        expect(await shareText('yo', {})).toBe('failed');
        expect(await shareText('yo', null)).toBe('failed');
    });
    it('the results box says whether the attempt counted', () => {
        expect(dailyResultMarkup({ text: 'T', counted: true, streak: 2 })).toContain('Streak: 2 days');
        expect(dailyResultMarkup({ text: 'T', counted: false })).toContain('Practice run');
        expect(dailyResultMarkup({ text: 'a<b', counted: true })).toContain('a&lt;b');
        expect(dailyResultMarkup({ text: 'T', counted: true })).toContain('data-meta="share"');
    });
});

describe('the Daily is reachable and saved', () => {
    it('a Daily button on the home screen, 48 px tall, showing the date and whether it is done', () => {
        expect(read('src/main.js')).toContain('window.game.mountDailyEntry()');
        const meta = read('src/game-meta.js');
        expect(meta).toContain("mountDailyButton(host, { onPlay: () => this.selectDaily() });");
        expect(meta).toContain('refreshDailyButton(today, dailyStatus(this.syncSave().daily, today));');
        expect(read('src/ui/meta.css')).toMatch(/\.daily-btn \{[^}]*min-height: 48px;/s);
    });
    it('only the first attempt is recorded and paid; the campaign save is left alone', () => {
        const game = read('src/game.js');
        expect(game).toContain('if (this.currentLevel && !this.daily) {');
        expect(game).toContain('const fundingEarned = this.daily?.practice ? 0 : fundingAward(stars);');
        const meta = read('src/game-meta.js');
        expect(meta).toContain('this.daily.practice = true;');
        expect(meta).toMatch(/if \(counted\) \{\s*this\.save = \{ \.\.\.this\.save, daily, funding:/);
        expect(game).toContain('this.daily = null; // a campaign level, not the Daily puzzle');
    });
});
