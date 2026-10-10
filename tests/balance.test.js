// Balance guardrails. Seeded bot runs (src/sim/balance.js) so the numbers
// are repeatable. Bands are deliberately loose: they catch a level that
// became trivial or impossible, not small tuning drift.
import { describe, it, expect } from 'vitest';
import { LEVELS } from '../src/config/levels.js';
import { summarize } from '../src/sim/balance.js';
import { levelRules } from '../src/config/level-rules.js';
import { actionsRemaining, allActionsSpent, caseCapFor, effectiveR } from '../src/sim/actions.js';
import { initGameState } from '../src/sim/state.js';
import { tools } from '../src/config/tools.js';

const RUNS = 80;
const first = LEVELS[0];
const last = LEVELS.at(-1);

describe('difficulty ramp', () => {
    const s1 = summarize(first, 'smart', RUNS, 11);
    const s9 = summarize(last, 'smart', RUNS, 11);

    it('a sensible player usually wins the first level', () => {
        expect(s1.winRate).toBeGreaterThanOrEqual(0.75);
    });
    it('the final level is a real challenge but winnable', () => {
        expect(s9.winRate).toBeGreaterThanOrEqual(0.25);
        expect(s9.winRate).toBeLessThanOrEqual(0.7);
    });
    it('difficulty climbs from first to last level', () => {
        expect(s1.winRate - s9.winRate).toBeGreaterThanOrEqual(0.2);
    });
    it('random clicking does not beat the final level', () => {
        expect(summarize(last, 'random', RUNS, 11).winRate).toBeLessThanOrEqual(0.1);
    });
});

describe('doing nothing never wins', () => {
    for (const level of LEVELS) {
        it(`${level.id}: the passive bot never earns 'contained'`, () => {
            expect(summarize(level, 'passive', 25, 3).counts.contained || 0).toBe(0);
        });
    }
});

describe('level rules and daily actions', () => {
    it('every level has tuning with a case cap and par days', () => {
        for (const level of LEVELS) {
            const { scenario, difficulty } = levelRules(level);
            expect(scenario.caseCapFraction).toBeGreaterThan(0);
            expect(level.tuning.parDays).toBeGreaterThan(0);
            expect(difficulty.dailyLimits.severLink).toBeGreaterThan(0);
        }
    });
    it('level rules never mutate the shared scenario config', () => {
        const before = JSON.stringify(levelRules(first).scenario);
        levelRules(first).scenario.initialInfected = 99;
        expect(JSON.stringify(levelRules(first).scenario)).toBe(before);
    });
    it('counts remaining actions across tools available today, ignoring power-ups', () => {
        const { difficulty } = levelRules(first);
        const state = initGameState(tools, 40);
        state.day = 1; // only Sever is available on day 1
        expect(actionsRemaining(state, tools, difficulty)).toBe(difficulty.dailyLimits.severLink);
        state.day = 3;
        const all = difficulty.dailyLimits.vaccinate + difficulty.dailyLimits.quarantine + difficulty.dailyLimits.severLink;
        expect(actionsRemaining(state, tools, difficulty)).toBe(all);
        state.dailyUsage.vaccinate = difficulty.dailyLimits.vaccinate;
        state.dailyUsage.quarantine = difficulty.dailyLimits.quarantine;
        expect(allActionsSpent(state, tools, difficulty)).toBe(false);
        state.dailyUsage.severLink = difficulty.dailyLimits.severLink;
        expect(allActionsSpent(state, tools, difficulty)).toBe(true);
    });
    it('case cap rounds up from the population share', () => {
        const state = initGameState(tools, 40);
        expect(caseCapFor(state, { caseCapFraction: 0.32 })).toBe(13);
        expect(caseCapFor(state, {})).toBe(Infinity);
    });
    it('effective R is new cases per infectious person times infectious days', () => {
        expect(effectiveR(3, 2, 5)).toBe(7.5);
        expect(effectiveR(0, 4, 7)).toBe(0);
        expect(effectiveR(2, 0, 7)).toBe(null);
    });
});
