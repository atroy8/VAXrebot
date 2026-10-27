// Balance guardrails. Seeded bot runs (src/sim/balance.js) so the numbers
// are repeatable. Bands are deliberately loose: they catch a level that
// became trivial or impossible, not small tuning drift.
import { describe, it, expect } from 'vitest';
import { LEVELS, REGIONS, SYSTEMS } from '../src/config/levels.js';
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
    it('a new player who just does the obvious things usually wins the first level', () => {
        expect(summarize(first, 'beginner', RUNS, 11).winRate).toBeGreaterThanOrEqual(0.6);
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

describe('campaign ramp across 3 systems and 8 planets (round 14)', () => {
    // Round 24: 80 runs (was 40). Deaths spread scores out, and 40 runs left
    // the 3 star share about 3 points off its true value on some planets.
    const SAMPLE = 80;
    const planetSmart = REGIONS.map((r) => {
        const lv = LEVELS.filter((l) => l.regionId === r.id);
        const sums = lv.map((l) => summarize(l, 'smart', SAMPLE, 13));
        const rates = sums.map((x) => x.winRate);
        const threes = sums.map((x) => x.starDist[3] / x.runs);
        return { id: r.id, systemId: r.systemId, mean: rates.reduce((a, b) => a + b, 0) / rates.length, rates, threes };
    });
    const systemMean = (id) => {
        const p = planetSmart.filter((x) => x.systemId === id);
        return p.reduce((a, b) => a + b.mean, 0) / p.length;
    };

    it('average smart win rate falls from system 1 to system 3', () => {
        const [a, b, c] = SYSTEMS.map((s) => systemMean(s.id));
        expect(a).toBeGreaterThan(b);
        expect(b).toBeGreaterThan(c);
        expect(a - c).toBeGreaterThanOrEqual(0.15);
    });

    it('no level is a wall or a walkover for the smart bot', () => {
        for (const p of planetSmart) {
            for (const [k, rate] of p.rates.entries()) {
                expect(rate, `${p.id}-${k + 1}`).toBeGreaterThanOrEqual(0.2);
            }
        }
    });

    // Round 17: with one target for all 80 levels, the smart bot never earned
    // 3 stars on any level from the 4th planet on. Per-level targets fix that.
    it('3 stars is within reach on every planet, but never handed out', () => {
        for (const p of planetSmart) {
            const mean = p.threes.reduce((a, b) => a + b, 0) / p.threes.length;
            expect(mean, p.id).toBeGreaterThanOrEqual(0.08);
            for (const [k, share] of p.threes.entries()) expect(share, `${p.id}-${k + 1}`).toBeLessThanOrEqual(0.7);
        }
    });

    it('random clicking rarely wins after the first system', () => {
        for (const level of LEVELS.filter((l) => l.systemId !== SYSTEMS[0].id && l.levelInPlanet % 3 === 0)) {
            // 120 runs: with 40 the rate swung 10 points between seeds near the line.
            expect(summarize(level, 'random', 120, 17).winRate, level.id).toBeLessThanOrEqual(0.15);
        }
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
            // Item 16: every tool in the level's toolkit has at least 1 use a day.
            for (const id of level.toolkit.tools) expect(difficulty.dailyLimits[id], `${level.id} ${id}`).toBeGreaterThan(0);
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
