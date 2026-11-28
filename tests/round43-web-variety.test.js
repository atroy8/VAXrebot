// Item 28 (round 43): more variety in how many people a scenario has. Wider
// ranges per planet, the kind of place decides where in the range a level
// sits, and a replay rolls a different count.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { LEVELS, REGIONS } from '../src/config/levels.js';
import { PLANET_POPULATION, SCENARIO_SIZE, populationFor, rollPopulation } from '../src/config/campaign.js';
import { levelRules } from '../src/config/level-rules.js';
import { buildRun, mulberry32 } from '../src/sim/balance.js';
import { SMALL_WEB_MAX } from '../src/sim/network.js';

const mid = (l) => (l.population[0] + l.population[1]) / 2;

describe('wider ranges per planet', () => {
    it('about 8 to 16 on the first planet, up to about 32 on the last, never shrinking', () => {
        expect(PLANET_POPULATION[0]).toEqual([8, 16]);
        expect(PLANET_POPULATION.at(-1)[1]).toBe(32);
        for (const [lo, hi] of PLANET_POPULATION) expect(hi).toBeGreaterThanOrEqual(lo * 1.8);
        expect(SMALL_WEB_MAX).toBeGreaterThanOrEqual(32);
    });

    it("each planet's levels span the wider range, and the biggest is at least 1.5 times the smallest", () => {
        for (const r of REGIONS) {
            const lv = LEVELS.filter((l) => l.regionId === r.id);
            const [lo, hi] = PLANET_POPULATION[lv[0].planetIndex];
            const mids = lv.map(mid);
            expect(Math.max(...mids) / Math.min(...mids), r.id).toBeGreaterThanOrEqual(1.5);
            expect(Math.min(...lv.map((l) => l.population[0])), r.id).toBe(lo);
            expect(Math.max(...lv.map((l) => l.population[1])), r.id).toBe(hi);
        }
    });

    it('the place sets the size: a healing hall is smaller than a festival or an airport', () => {
        expect(SCENARIO_SIZE.care[1]).toBeLessThan(SCENARIO_SIZE.festival[0]);
        expect(SCENARIO_SIZE.care[1]).toBeLessThan(SCENARIO_SIZE.global[0]);
        for (let pi = 0; pi < PLANET_POPULATION.length; pi++) {
            const care = populationFor(pi, { scenarioId: 'care' });
            const fest = populationFor(pi, { scenarioId: 'festival' });
            const air = populationFor(pi, { scenarioId: 'global' });
            expect(care[1]).toBeLessThan(fest[0] + 1);
            expect(care[1]).toBeLessThan(air[0] + 1);
        }
        // Every level keeps at least three sizes, so replays can vary.
        for (const l of LEVELS) expect(l.population[1] - l.population[0], l.id).toBeGreaterThanOrEqual(2);
    });

    it('the rules, the game and the bots all use the level range', () => {
        for (const level of [LEVELS[0], LEVELS[3], LEVELS.at(-1)]) {
            const { scenario } = levelRules(level);
            expect(scenario.populationRange).toEqual(level.population);
            for (let seed = 1; seed <= 6; seed++) {
                const n = buildRun(level, mulberry32(seed)).network.nodes.length;
                expect(n).toBeGreaterThanOrEqual(level.population[0]);
                expect(n).toBeLessThanOrEqual(level.population[1]);
            }
        }
        const game = readFileSync(new URL('../src/game.js', import.meta.url), 'utf8');
        // Round 57: the dealer rolls the size with the deal's seed (a replay
        // is a new seed, so a new web), and the game opens what was dealt.
        expect(readFileSync(new URL('../src/sim/dealer.js', import.meta.url), 'utf8')).toContain('const population = lo + Math.floor(rng() * (hi - lo + 1));');
        expect(game).toContain('this.openDeal()');
        expect(game).not.toContain('rollPopulation(');
    });
});

describe('replays roll a different count', () => {
    it('never repeats the previous count when the range allows another', () => {
        const rng = mulberry32(9);
        let prev = null;
        const seen = new Set();
        for (let i = 0; i < 300; i++) {
            const n = rollPopulation([8, 11], rng, prev);
            expect(n).toBeGreaterThanOrEqual(8);
            expect(n).toBeLessThanOrEqual(11);
            expect(n).not.toBe(prev);
            seen.add(n);
            prev = n;
        }
        expect(seen.size).toBe(4);
    });

    it('a one-size range still works', () => {
        expect(rollPopulation([12, 12], Math.random, 12)).toBe(12);
    });
});
