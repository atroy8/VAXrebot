// Round 47: a fair opening on the learning planets. Playtesting level 1 at
// 390x844 lost on the first Next day after cutting both red lines: patient
// zero knew 5 of 8 people, Sever allows 2 cuts on day 1, and the 3 contacts
// left all caught it and hit the case cap of 4 before Vaccinate or
// Quarantine ever opened. Randomly placed first cases are now re-rolled
// until the best day 1 moves keep the level alive.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { worstDayOneCases, isFairOpening, dayOneBudget, dayOneActions, openingLimits, hasFairOpening, buildOutbreak } from '../src/sim/setup.js';
import { buildRun, playRun, mulberry32 } from '../src/sim/balance.js';
import { tools } from '../src/config/tools.js';
import { LEVELS, levelById } from '../src/config/levels.js';
import { rollLevelRules } from '../src/config/difficulty-roll.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const person = (id, state = 'healthy') => ({ id, state, daysInfected: 0, removed: false });
const link = (a, b) => ({ source: a, target: b });

describe('worst case at the end of day 1', () => {
    // Patient zero (0) knows 1 to 5; 6 and 7 are out of reach.
    const nodes = [person(0, 'infected'), ...[1, 2, 3, 4, 5, 6, 7].map((i) => person(i))];
    const star = [1, 2, 3, 4, 5].map((i) => link(0, i)).concat([link(6, 7)]);

    it('counts every contact left open after the cuts', () => {
        expect(worstDayOneCases(nodes, star, { severLink: 2 })).toBe(1 + 3);
        expect(worstDayOneCases(nodes, star, { severLink: 5 })).toBe(1);
        expect(worstDayOneCases(nodes, star, {})).toBe(6);
    });

    it('a person linked to two sick people needs two cuts, but only one vaccine', () => {
        const two = [person(0, 'infected'), person(1, 'infected'), person(2)];
        const lines = [link(0, 2), link(1, 2)];
        expect(worstDayOneCases(two, lines, { severLink: 1 })).toBe(3);
        expect(worstDayOneCases(two, lines, { severLink: 2 })).toBe(2);
        expect(worstDayOneCases(two, lines, { vaccinate: 1 })).toBe(2);
    });

    it('isolating a sick person closes all of their lines', () => {
        expect(worstDayOneCases(nodes, star, { quarantine: 1 })).toBe(1);
    });

    it('accepts links already resolved to node objects', () => {
        const resolved = star.map((l) => ({ source: nodes[l.source], target: nodes[l.target] }));
        expect(worstDayOneCases(nodes, resolved, { severLink: 2 })).toBe(4);
    });

    it('fair means the worst case stays under the case cap', () => {
        expect(isFairOpening(nodes, star, { cap: 4, budget: { severLink: 2 } })).toBe(false);
        expect(isFairOpening(nodes, star, { cap: 5, budget: { severLink: 2 } })).toBe(true);
        expect(isFairOpening(nodes, star, null)).toBe(true);
        expect(isFairOpening(nodes, star, { cap: Infinity, budget: {} })).toBe(true);
    });
});

describe('day 1 budget', () => {
    it('only counts toolkit tools that open on day 1', () => {
        const { difficulty } = rollLevelRules(levelById('mizuho-1'), mulberry32(1));
        const b = dayOneBudget(difficulty, tools);
        expect(b.severLink).toBe(difficulty.dailyLimits.severLink);
        expect(b.vaccinate).toBe(0); // opens on day 2
        expect(b.quarantine).toBe(0); // opens on day 3
        expect(dayOneActions(difficulty, tools)).toBe(b.severLink);
    });
    it('a tool brought forward to day 1 counts', () => {
        const difficulty = { toolkit: ['quarantine', 'severLink'], dailyLimits: { quarantine: 2, severLink: 1 }, toolDays: { quarantine: 1 }, toolLimitMultiplier: 1 };
        expect(dayOneBudget(difficulty, tools)).toEqual({ severLink: 1, vaccinate: 0, quarantine: 2 });
    });
});

describe('which levels get a fair opening', () => {
    it('the learning planets (easy levels) do, later planets keep their openings', () => {
        expect(hasFairOpening(levelById('mizuho-1'))).toBe(true);
        expect(hasFairOpening(levelById('hanabi-10'))).toBe(true);
        expect(hasFairOpening(levelById('tsukimi-1'))).toBe(false);
        expect(hasFairOpening(levelById('kaminari-10'))).toBe(false);
        const { scenario, difficulty } = rollLevelRules(levelById('kaminari-1'), mulberry32(2));
        expect(openingLimits({ level: levelById('kaminari-1'), scenario, difficulty, tools, population: 20 })).toBe(null);
    });
});

describe('the opening on the learning planets', () => {
    const learning = LEVELS.filter((l) => hasFairOpening(l) && !(l.variant && ['superSpreader', 'envoy'].includes(l.variant.type)));

    it('covers every non-puzzle level on Mizuho and Hanabi', () => {
        expect(learning.length).toBeGreaterThanOrEqual(14);
    });

    it('every random start leaves room for the best day 1 moves', () => {
        for (const level of learning) {
            let unfair = 0;
            for (let i = 0; i < 60; i++) {
                const run = buildRun(level, mulberry32(4000 + i));
                const opening = openingLimits({ level, scenario: run.scenario, difficulty: run.difficulty, tools, population: run.state.stats.initialPopulation });
                if (!isFairOpening(run.network.nodes, run.network.links, opening)) unfair++;
            }
            expect(unfair, level.id).toBeLessThanOrEqual(1);
        }
    });

    it('level 1 is never lost at the end of day 1 by a sensible player', () => {
        const level = levelById('mizuho-1');
        for (let i = 0; i < 300; i++) {
            const r = playRun(level, 'smart', 7000 + i);
            if (r.outcome !== 'contained') expect(r.day, `seed ${7000 + i}`).toBeGreaterThan(2);
        }
    });

    it('the number of first cases never changes, only who they are', () => {
        const { scenario, difficulty } = rollLevelRules(levelById('mizuho-6'), mulberry32(3));
        for (let i = 0; i < 20; i++) {
            const opening = openingLimits({ level: levelById('mizuho-6'), scenario, difficulty, tools, population: 10 });
            const out = buildOutbreak({ scenario, population: 10, rng: mulberry32(50 + i), opening });
            expect(out.nodes.filter((n) => n.state === 'infected').length).toBe(Math.min(10, scenario.initialInfected));
            expect(out.initialCases).toBe(Math.min(10, scenario.initialInfected));
        }
    });

    it('a puzzle carrier stays where the puzzle put it', () => {
        const level = levelById('mizuho-3');
        const { scenario, difficulty } = rollLevelRules(level, mulberry32(5));
        const opening = { cap: 2, budget: dayOneBudget(difficulty, tools) };
        const out = buildOutbreak({ scenario, population: 12, variant: level.variant, rng: mulberry32(9), opening });
        const carrier = out.nodes.find((n) => n.superSpreader);
        expect(carrier.state).toBe('infected');
        expect(carrier.id).toBe(out.superSpreaderId);
    });
});

describe('the game and the bots share the rule', () => {
    // Round 57: the re-roll of the first cases is superseded by the dealer,
    // which solves every candidate web and never deals one that cannot be
    // won (tests/round57-dealer.test.js). The game and the bots both deal
    // through it; buildOutbreak keeps its `opening` option for other callers.
    it('both deal through the dealer, which never deals a web that is lost on day 1', () => {
        expect(read('src/game-deal.js')).toContain('createDealer(level, dealSeed');
        expect(read('src/sim/balance.js')).toContain('dealLevelCached(level, dealSeed >>> 0');
        expect(read('src/sim/dealer.js')).toContain("verdict: 'unwinnable'");
    });
});
