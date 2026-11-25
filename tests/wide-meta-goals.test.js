// Wide audience round, meta stream: bonus goals that reward clever play.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { LEVELS } from '../src/config/levels.js';
import { GOAL_TARGETS } from '../src/config/goal-targets.js';
import { GOALS, GOAL_IDS, GOALS_PER_LEVEL, GOAL_FUNDING, goalsFor, goalMet, checkGoals, mergeGoals, goalPips, describeGoal } from '../src/sim/goals.js';
import { goalEvidence, basePool } from '../src/sim/goal-lab.js';
import { toolUseTotals } from '../src/sim/run-stats.js';
import { saveGoals } from '../src/meta.js';
import { freshSave } from '../src/save.js';
import { briefingGoalsMarkup, resultsGoalsMarkup, levelMetaLine } from '../src/ui/meta-panels.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const stats = (over = {}) => ({ initialPopulation: 12, totalInfected: 3, totalDead: 0, totalRecovered: 3, linksSevered: 2, toolUses: { vaccinate: 1, quarantine: 0 }, rTamedDay: 1, ...over });

describe('the goal checks are pure functions of the end-of-level stats', () => {
    const ctx = { caseCap: 6 };
    it('Nobody dies', () => {
        expect(goalMet({ id: 'noDeaths' }, 'contained', stats(), ctx)).toBe(true);
        expect(goalMet({ id: 'noDeaths' }, 'contained', stats({ totalDead: 1 }), ctx)).toBe(false);
    });
    it('Keep cases at half the cap or less', () => {
        expect(goalMet({ id: 'halfCap' }, 'contained', stats({ totalInfected: 3 }), ctx)).toBe(true);
        expect(goalMet({ id: 'halfCap' }, 'contained', stats({ totalInfected: 4 }), ctx)).toBe(false);
        expect(goalMet({ id: 'halfCap' }, 'contained', stats(), { caseCap: Infinity })).toBe(false);
    });
    it('Get R under 1 by day N', () => {
        expect(goalMet({ id: 'fastR', n: 2 }, 'contained', stats({ rTamedDay: 2 }), ctx)).toBe(true);
        expect(goalMet({ id: 'fastR', n: 2 }, 'contained', stats({ rTamedDay: 3 }), ctx)).toBe(false);
        expect(goalMet({ id: 'fastR', n: 2 }, 'contained', stats({ rTamedDay: undefined }), ctx)).toBe(false);
    });
    it('Never use Quarantine, at most N vaccines, no more than N cuts, N moves or fewer', () => {
        expect(goalMet({ id: 'noQuarantine' }, 'contained', stats(), ctx)).toBe(true);
        expect(goalMet({ id: 'noQuarantine' }, 'contained', stats({ toolUses: { quarantine: 1 } }), ctx)).toBe(false);
        expect(goalMet({ id: 'fewVaccines', n: 1 }, 'contained', stats(), ctx)).toBe(true);
        expect(goalMet({ id: 'fewVaccines', n: 0 }, 'contained', stats(), ctx)).toBe(false);
        expect(goalMet({ id: 'fewCuts', n: 2 }, 'contained', stats(), ctx)).toBe(true);
        expect(goalMet({ id: 'fewCuts', n: 1 }, 'contained', stats(), ctx)).toBe(false);
        expect(toolUseTotals(stats()).all).toBe(3);
        expect(goalMet({ id: 'fewMoves', n: 3 }, 'contained', stats(), ctx)).toBe(true);
        expect(goalMet({ id: 'fewMoves', n: 2 }, 'contained', stats(), ctx)).toBe(false);
    });
    it('goals only count on a win', () => {
        for (const id of GOAL_IDS) {
            for (const outcome of ['overwhelmed', 'timeout', 'burnout', 'envoy-lost']) expect(goalMet({ id, n: 99 }, outcome, stats(), ctx)).toBe(false);
        }
    });
    it('goals about a tool are only for levels that have it and another way to win', () => {
        const festival = LEVELS.find((l) => l.toolkit.id === 'festival'); // Sever only
        const school = LEVELS.find((l) => l.toolkit.id === 'school'); // no vaccines
        expect(GOALS.fewCuts.applies(festival)).toBe(false);
        expect(GOALS.noQuarantine.applies(festival)).toBe(false);
        expect(GOALS.fewVaccines.applies(school)).toBe(false);
        expect(GOALS.noQuarantine.applies(school)).toBe(true);
    });
});

describe('each level offers up to three goals, always the same ones', () => {
    it('is deterministic, at most three, all from the level pool, no repeats', () => {
        for (const level of LEVELS) {
            const a = goalsFor(level);
            expect(goalsFor(level)).toEqual(a);
            expect(a.length).toBeLessThanOrEqual(GOALS_PER_LEVEL);
            expect(new Set(a.map((g) => g.id)).size).toBe(a.length);
            const pool = GOAL_TARGETS[level.id].offered.map((g) => g.id);
            for (const g of a) {
                expect(pool).toContain(g.id);
                expect(GOALS[g.id].applies(level), `${level.id} ${g.id}`).toBe(true);
                expect(g.label.length).toBeGreaterThan(5);
                expect(g.short.length).toBeLessThanOrEqual(16);
            }
        }
    });
    it('every level has at least one goal and most have three', () => {
        const counts = LEVELS.map((l) => goalsFor(l).length);
        expect(Math.min(...counts)).toBeGreaterThanOrEqual(1);
        expect(counts.filter((c) => c === 3).length).toBeGreaterThanOrEqual(LEVELS.length * 0.8);
    });
    it('the campaign uses the whole pool, not the same three everywhere', () => {
        const used = new Set(LEVELS.flatMap((l) => goalsFor(l).map((g) => g.id)));
        expect([...used].sort()).toEqual([...GOAL_IDS].sort());
        expect(new Set(LEVELS.map((l) => goalsFor(l).map((g) => g.id).join())).size).toBeGreaterThan(10);
    });
    it('the pick depends on the level and its variant', () => {
        const level = LEVELS[2];
        const targets = { [level.id]: { offered: GOAL_IDS.map((id) => ({ id, n: 2 })) }, other: { offered: GOAL_IDS.map((id) => ({ id, n: 2 })) } };
        const a = goalsFor(level, targets).map((g) => g.id);
        const b = goalsFor({ ...level, variant: { type: 'envoy' } }, targets).map((g) => g.id);
        const c = goalsFor({ ...level, id: 'other' }, targets).map((g) => g.id);
        expect(a.length).toBe(3);
        expect(a.join() !== b.join() || a.join() !== c.join()).toBe(true);
    });
    it('the Daily puzzle and unknown levels have none', () => {
        expect(goalsFor({ ...LEVELS[0], daily: true })).toEqual([]);
        expect(goalsFor({ id: 'nope' })).toEqual([]);
        expect(goalsFor(null)).toEqual([]);
    });
    it('labels read as plain goals', () => {
        expect(describeGoal({ id: 'fewVaccines', n: 1 }).label).toBe('Use at most 1 vaccine');
        expect(describeGoal({ id: 'fewVaccines', n: 2 }).label).toBe('Use at most 2 vaccines');
        expect(describeGoal({ id: 'fewCuts', n: 3 }).label).toBe('Cut no more than 3 links');
        expect(describeGoal({ id: 'fastR', n: 3 }).label).toBe('Get R under 1 by day 3');
        expect(describeGoal({ id: 'noQuarantine' }).label).toBe('Never use Quarantine');
        expect(describeGoal({ id: 'noDeaths' }).label).toBe('Nobody dies');
    });
});

describe('every offered goal is possible and none is free (bots, fresh seeds)', () => {
    // Seeds differ from scripts/tune-goals.mjs (seed 5), so this is a real
    // second look, with looser bars than the tuner used (15% to 30% and 70%).
    const RUNS = 120;
    for (const level of LEVELS) {
        it(`${level.id}: ${goalsFor(level).map((g) => g.short).join(', ')}`, () => {
            const pool = basePool(level, RUNS, 9);
            for (const goal of goalsFor(level)) {
                const ev = goalEvidence(level, goal, { runs: RUNS, seed: 9, pool });
                // Possible: some style of play wins and meets it in a fair share of runs.
                expect(ev.metRate, `${goal.label} is met`).toBeGreaterThanOrEqual(0.05);
                // Not free: the smart bot's wins do not all meet it.
                expect(ev.freeShare, `${goal.label} is not free`).toBeLessThanOrEqual(0.9);
                // And the plain bots never meet it in every run (the bot held
                // to the goal's own budget meets it whenever it wins, by design).
                expect(Math.max(ev.byStyle.smart, ev.byStyle.beginner), `${goal.label} is not automatic`).toBeLessThan(1);
            }
        });
    }
});

describe('completed goals pay a little and are kept per level', () => {
    const goals = [describeGoal({ id: 'noDeaths' }), describeGoal({ id: 'fewCuts', n: 2 }), describeGoal({ id: 'fastR', n: 1 })];
    it('the best set ever completed is saved, and each goal pays once', () => {
        const first = checkGoals(goals, 'contained', stats({ totalDead: 1, rTamedDay: 4 }), { caseCap: 6 });
        expect(first.map((g) => g.met)).toEqual([false, true, false]);
        let banked = saveGoals({ ...freshSave(), funding: 100 }, 'mizuho-1', first);
        expect(banked.fresh).toEqual(['fewCuts']);
        expect(banked.save.funding).toBe(100 + GOAL_FUNDING);
        const second = checkGoals(goals, 'contained', stats({ linksSevered: 9 }), { caseCap: 6 });
        expect(second.map((g) => g.met)).toEqual([true, false, true]);
        banked = saveGoals(banked.save, 'mizuho-1', second);
        expect(banked.fresh).toEqual(['noDeaths', 'fastR']);
        expect(banked.save.goals['mizuho-1'].sort()).toEqual(['fastR', 'fewCuts', 'noDeaths']);
        expect(banked.save.funding).toBe(100 + 3 * GOAL_FUNDING);
        const third = saveGoals(banked.save, 'mizuho-1', second);
        expect(third.funding).toBe(0);
        expect(third.save).toBe(banked.save);
    });
    it('a loss banks nothing', () => {
        const lost = checkGoals(goals, 'overwhelmed', stats(), { caseCap: 6 });
        expect(mergeGoals([], lost)).toEqual({ done: [], fresh: [], funding: 0 });
    });
    it('the reward is small next to a win (75 to 125 funding)', () => {
        expect(GOAL_FUNDING * GOALS_PER_LEVEL).toBeLessThanOrEqual(40);
        expect(GOAL_FUNDING).toBeGreaterThan(0);
    });
    it('pips: one per offered goal, filled when done', () => {
        const level = LEVELS.find((l) => goalsFor(l).length === 3);
        const ids = goalsFor(level).map((g) => g.id);
        expect(goalPips(level, [])).toBe('○○○');
        expect(goalPips(level, [ids[1]])).toBe('○●○');
        expect(goalPips(level, ids)).toBe('●●●');
        const save = { ...freshSave(), goals: { [level.id]: [ids[0]] } };
        expect(levelMetaLine(level, save)).toContain('Goals: ●○○');
    });
});

describe('goals on the briefing and the results', () => {
    const goals = [describeGoal({ id: 'noDeaths' }), describeGoal({ id: 'fewVaccines', n: 2 }), describeGoal({ id: 'fastR', n: 1 })];
    it('briefing: one row of three checkboxes, done ones ticked', () => {
        const html = briefingGoalsMarkup(goals, ['fewVaccines']);
        expect(html.match(/class="goal-row"/g).length).toBe(1);
        expect(html.match(/class="goal-chip/g).length).toBe(3);
        expect(html.match(/goal-chip done/g).length).toBe(1);
        expect(html).toContain('Max 2 vaccines');
        expect(html).toContain('aria-label="Bonus goals: Nobody dies, Use at most 2 vaccines (done), Get R under 1 by day 1"');
        expect(briefingGoalsMarkup([], [])).toBe('');
    });
    it('results: a tick for each goal met, what it paid, and what was done before', () => {
        const checked = [{ ...goals[0], met: true }, { ...goals[1], met: false }, { ...goals[2], met: false }];
        const html = resultsGoalsMarkup(checked, ['noDeaths'], ['fewVaccines']);
        expect(html.match(/goal-line met/g).length).toBe(1);
        expect(html.match(/goal-line earlier/g).length).toBe(1);
        expect(html.match(/goal-line open/g).length).toBe(1);
        expect(html).toContain(`+${GOAL_FUNDING} gold`);
        expect(resultsGoalsMarkup([])).toBe('');
    });
    it('each renders into its one container, and the briefing row cannot wrap', () => {
        const html = read('index.html');
        expect(html.match(/id="briefing-goals"/g).length).toBe(1);
        expect(html.match(/id="results-goals"/g).length).toBe(1);
        const css = read('src/ui/meta.css');
        expect(css).toMatch(/\.goal-row \{[^}]*flex-wrap: nowrap;[^}]*overflow: hidden;/s);
        const panels = read('src/ui/meta-panels.js');
        expect(panels).toContain("document.getElementById('briefing-goals')");
        expect(panels).toContain("document.getElementById('results-goals')");
        const meta = read('src/game-meta.js');
        expect(meta).toContain('renderResultsGoals(won ? checked : [], banked.fresh, before);');
        expect(read('src/game.js')).toContain('this.settleMeta(outcome, stats, stars, fundingEarned + bonus.total);');
        expect(read('src/ui/globe-view.js')).toContain('levelMetaLine(level, state.save)');
    });
});
