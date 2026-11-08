// Round 36: deaths lag cases. Nobody dies in their first two days sick, the
// whole-illness death chance is unchanged, and on level 1 nobody can die
// before Quarantine opens on day 3.
import { describe, it, expect } from 'vitest';
import { difficulties } from '../src/config/difficulties.js';
import { LEVELS } from '../src/config/levels.js';
import { toolOpenDays } from '../src/config/toolkits.js';
import {
    DEATH_LAG_DAYS,
    deathLag,
    riskDays,
    canDieOnDay,
    dailyRisk,
    riskDaysLeft,
    TREATED_FACTOR,
} from '../src/sim/fatality.js';
import { updateOutcomes, resolveAftermath } from '../src/sim/engine.js';
import { advanceDay } from '../src/sim/actions.js';
import { buildRun, mulberry32 } from '../src/sim/balance.js';
import { deathToast } from '../src/ui/deaths.js';

const stateWith = () => ({ day: 1, stats: { totalDead: 0, totalRecovered: 0, totalInfected: 0, initialPopulation: 10 }, dailyUsage: {} });
const recoveryTimes = Object.values(difficulties).map((d) => d.recoveryTime);

describe('deaths lag cases', () => {
    it('lags two days, and always leaves at least one day at risk', () => {
        expect(DEATH_LAG_DAYS).toBe(2);
        for (const rt of recoveryTimes) {
            expect(deathLag(rt)).toBe(2);
            expect(riskDays(rt)).toBe(rt - 2);
        }
        expect(riskDays(1)).toBe(1);
        expect(riskDays(2)).toBe(1);
        expect(canDieOnDay(1, 2)).toBe(false);
        expect(canDieOnDay(2, 2)).toBe(true);
    });

    it('nobody dies on their first or second day sick, even at certain death', () => {
        for (const rt of recoveryTimes) {
            for (const d of [1, 2]) {
                const state = stateWith();
                const network = { nodes: [{ id: 0, state: 'infected', daysInfected: d }], links: [] };
                expect(updateOutcomes(state, network, rt, 1, () => 0), `rt ${rt} day ${d}`).toEqual([]);
                expect(state.stats.totalDead).toBe(0);
            }
            const state = stateWith();
            const network = { nodes: [{ id: 0, state: 'infected', daysInfected: 3 }], links: [] };
            expect(updateOutcomes(state, network, rt, 1, () => 0)[0].outcome).toBe('died');
        }
    });

    it('keeps each disease exactly as deadly over the whole illness, in a ward or not', () => {
        for (const rt of recoveryTimes) {
            for (const p of [0.12, 0.2, 0.3]) {
                const daily = dailyRisk({ state: 'infected' }, p, rt);
                expect(1 - Math.pow(1 - daily, riskDays(rt))).toBeCloseTo(p, 10);
                const ward = dailyRisk({ state: 'quarantined', sickWhileQuarantined: true }, p, rt);
                expect(1 - Math.pow(1 - ward, riskDays(rt))).toBeCloseTo(p * TREATED_FACTOR, 10);
            }
        }
    });

    it('a simulated illness dies at the disease rate and never in the first two days', () => {
        const rt = 7;
        const p = 0.3;
        const rng = mulberry32(36);
        let dead = 0;
        const N = 20000;
        for (let i = 0; i < N; i++) {
            const state = stateWith();
            const node = { id: 0, state: 'infected', daysInfected: 0 };
            const network = { nodes: [node], links: [] };
            for (let day = 1; day <= rt; day++) {
                node.daysInfected = day;
                const out = updateOutcomes(state, network, rt, p, rng);
                if (out.length) {
                    if (out[0].outcome === 'died') {
                        expect(day).toBeGreaterThan(2);
                        dead++;
                    }
                    break;
                }
            }
        }
        expect(dead / N).toBeGreaterThan(p - 0.015);
        expect(dead / N).toBeLessThan(p + 0.015);
    });

    it('the aftermath only counts the risk days still ahead', () => {
        expect(riskDaysLeft(0, 7)).toBe(5);
        expect(riskDaysLeft(2, 7)).toBe(5);
        expect(riskDaysLeft(4, 7)).toBe(3);
        expect(riskDaysLeft(7, 7)).toBe(1);
        // A fresh case on a lost level faces the full illness chance.
        const p = 0.3;
        const daily = dailyRisk({ state: 'infected' }, p, 7);
        const threshold = 1 - Math.pow(1 - daily, 5);
        expect(threshold).toBeCloseTo(p, 10);
        const state = stateWith();
        const network = { nodes: [{ id: 0, state: 'infected', daysInfected: 0 }], links: [] };
        expect(resolveAftermath(state, network, 7, p, () => threshold - 1e-6)[0].outcome).toBe('died');
    });

    it('level 1: nobody can die before Quarantine opens', () => {
        const level = LEVELS[0];
        const quarantineDay = toolOpenDays(level.toolkit).quarantine;
        expect(quarantineDay).toBe(3);
        for (let seed = 1; seed <= 300; seed++) {
            const rng = mulberry32(seed);
            const run = buildRun(level, rng);
            // Certain death the moment it is allowed: still nobody dies during
            // play before the day Quarantine opens. (A level already lost by
            // then settles its aftermath, which is not a death in play.)
            const difficulty = { ...run.difficulty, fatalityRate: 1 };
            let diedInPlay = 0;
            while (run.state.day < quarantineDay) {
                const r = advanceDay(run.state, run.network, { scenario: run.scenario, difficulty, rng });
                diedInPlay += r.outcomes.filter((o) => o.outcome === 'died').length;
                if (r.result) break;
            }
            expect(diedInPlay, `seed ${seed}`).toBe(0);
        }
    });

    it('the first death toast teaches the lag in a short line', () => {
        const t = deathToast({ count: 1, firstThisLevel: true });
        expect(t).toMatch(/days after/);
        expect(t).toMatch(/ward/);
        expect(t).not.toContain('—');
        expect(t.length).toBeLessThanOrEqual(90);
    });
});
