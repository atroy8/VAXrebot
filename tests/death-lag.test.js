// Round 36: deaths lag cases. Round 57 rewrote this file: the daily death
// roll is gone (src/sim/fatality.js). The lag is kept as a fixed rule a
// player can read: a frail person is lost on the third night of their
// illness, so nobody dies in their first two nights, and on level 1 nobody
// can die before Quarantine opens on day 3.
import { describe, it, expect } from 'vitest';
import { difficulties } from '../src/config/difficulties.js';
import { LEVELS } from '../src/config/levels.js';
import { toolOpenDays } from '../src/config/toolkits.js';
import { FRAIL_DEATH_NIGHT, frailDeathNight, diesTonight } from '../src/sim/fatality.js';
import { updateOutcomes, resolveAftermath } from '../src/sim/engine.js';
import { advanceDay } from '../src/sim/actions.js';
import { buildRun } from '../src/sim/balance.js';
import { deathToast } from '../src/ui/deaths.js';

const stateWith = () => ({ day: 1, stats: { totalDead: 0, totalRecovered: 0, totalInfected: 0, initialPopulation: 10 }, dailyUsage: {} });
const recoveryTimes = Object.values(difficulties).map((d) => d.recoveryTime);

describe('deaths lag cases', () => {
    it('the lag is two nights for every disease in the game', () => {
        expect(FRAIL_DEATH_NIGHT).toBe(3);
        for (const rt of recoveryTimes) expect(frailDeathNight(rt)).toBe(3);
        // A very short illness still leaves a night on which care can come first.
        expect(frailDeathNight(2)).toBe(2);
        expect(frailDeathNight(1)).toBe(1);
    });

    it('nobody dies on their first or second night sick, frail or not', () => {
        for (const rt of recoveryTimes) {
            for (const d of [1, 2]) {
                const state = stateWith();
                const network = { nodes: [{ id: 0, state: 'infected', daysInfected: d, frail: true }], links: [] };
                expect(updateOutcomes(state, network, rt), `rt ${rt} night ${d}`).toEqual([]);
                expect(state.stats.totalDead).toBe(0);
            }
            const state = stateWith();
            const network = { nodes: [{ id: 0, state: 'infected', daysInfected: 3, frail: true }], links: [] };
            expect(updateOutcomes(state, network, rt)[0].outcome).toBe('died');
        }
    });

    it('the rule has no dice: the same illness always ends the same way', () => {
        for (const frail of [true, false]) {
            const ends = new Set();
            for (let k = 0; k < 50; k++) {
                const node = { id: 0, state: 'infected', daysInfected: 0, frail };
                const network = { nodes: [node], links: [] };
                const state = stateWith();
                let end = null;
                for (let night = 1; night <= 7 && !end; night++) {
                    node.daysInfected = night;
                    const out = updateOutcomes(state, network, 7, 0.99, Math.random);
                    if (out.length) end = `${out[0].outcome} on night ${night}`;
                }
                ends.add(end);
            }
            expect([...ends]).toEqual([frail ? 'died on night 3' : 'recovered on night 7']);
        }
        expect(diesTonight({ frail: true, state: 'infected', daysInfected: 3 }, 7)).toBe(true);
    });

    it('a lost level settles the sick at once: the frail outside a ward are lost', () => {
        const state = stateWith();
        const network = { nodes: [{ id: 0, state: 'infected', daysInfected: 0, frail: true }, { id: 1, state: 'infected', daysInfected: 4 }], links: [] };
        expect(resolveAftermath(state, network).map((o) => o.outcome)).toEqual(['died', 'recovered']);
    });

    it('level 1: nobody can die before Quarantine opens', () => {
        const level = LEVELS[0];
        const quarantineDay = toolOpenDays(level.toolkit).quarantine;
        expect(quarantineDay).toBe(3);
        for (let seed = 1; seed <= 60; seed++) {
            const run = buildRun(level, seed);
            // The first case is never frail, and anyone who catches it on
            // night 1 has until the night of day 3.
            expect(run.network.nodes.filter((n) => n.state === 'infected' && n.frail)).toHaveLength(0);
            let diedInPlay = 0;
            while (run.state.day < quarantineDay) {
                const r = advanceDay(run.state, run.network, { scenario: run.scenario, difficulty: run.difficulty });
                diedInPlay += r.outcomes.filter((o) => o.outcome === 'died').length;
                if (r.result) break;
            }
            expect(diedInPlay, `seed ${seed}`).toBe(0);
        }
    });

    it('the first death toast teaches the rule in a short line', () => {
        const t = deathToast({ count: 1, firstThisLevel: true });
        expect(t).toMatch(/third night/);
        expect(t).toMatch(/Quarantine saves them/);
        expect(t).not.toContain(String.fromCharCode(0x2014));
        expect(t.length).toBeLessThanOrEqual(110);
    });
});
