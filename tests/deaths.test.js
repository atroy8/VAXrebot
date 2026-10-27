// Item 20 (round 24): people can die, at odds that follow each disease's
// real case fatality rate, scaled so deaths show up on small webs.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { scenarios } from '../src/config/scenarios.js';
import { LEVELS, REGIONS } from '../src/config/levels.js';
import { levelRules } from '../src/config/level-rules.js';
import { gameFatality, dailyDeathChance, personFatality, oneIn, GAME_CFR_MIN, GAME_CFR_MAX, TREATED_FACTOR } from '../src/sim/fatality.js';
import { updateOutcomes, resolveAftermath } from '../src/sim/engine.js';
import { advanceDay } from '../src/sim/actions.js';
import { playRun } from '../src/sim/balance.js';
import { deathToast, resultsDeathLines, briefingCfr } from '../src/ui/deaths.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const stateWith = () => ({ day: 1, stats: { totalDead: 0, totalRecovered: 0, totalInfected: 0, initialPopulation: 10, totalProtected: 0, linksSevered: 0 }, dailyUsage: {} });

describe('real case fatality rates', () => {
    it('every disease has a real CFR, a note and an https source', () => {
        for (const s of Object.values(scenarios)) {
            expect(s.realCfr, s.id).toBeGreaterThan(0);
            expect(s.realCfr, s.id).toBeLessThan(1);
            expect(s.cfrNote.length, s.id).toBeGreaterThan(20);
            expect(s.cfrSource, s.id).toMatch(/^https:\/\//);
            expect(s.cfrNote, s.id).not.toContain('—');
        }
    });

    it('the game scale keeps the order of the real rates and stays in its band', () => {
        const sorted = Object.values(scenarios).sort((a, b) => a.realCfr - b.realCfr);
        const game = sorted.map((s) => gameFatality(s.realCfr));
        for (let i = 1; i < game.length; i++) expect(game[i]).toBeGreaterThanOrEqual(game[i - 1]);
        for (const g of game) {
            expect(g).toBeGreaterThanOrEqual(GAME_CFR_MIN);
            expect(g).toBeLessThanOrEqual(GAME_CFR_MAX);
        }
        expect(gameFatality(scenarios.global.realCfr)).toBeGreaterThan(gameFatality(scenarios.school.realCfr) * 1.8);
    });

    it('every level plays with its disease rate, not the old difficulty rate', () => {
        for (const level of LEVELS) {
            const { scenario, difficulty } = levelRules(level);
            expect(difficulty.fatalityRate, level.id).toBe(gameFatality(scenario.realCfr));
        }
    });

    it('daily chances add up to the illness chance, and ward care halves it', () => {
        const h = dailyDeathChance(0.3, 7);
        expect(1 - Math.pow(1 - h, 7)).toBeCloseTo(0.3, 10);
        expect(dailyDeathChance(0, 7)).toBe(0);
        expect(dailyDeathChance(1, 7)).toBe(1);
        expect(personFatality({ state: 'infected' }, 0.3)).toBe(0.3);
        expect(personFatality({ state: 'quarantined', sickWhileQuarantined: true }, 0.3)).toBeCloseTo(0.3 * TREATED_FACTOR);
    });

    it('reads out odds in plain words', () => {
        expect(oneIn(0.36)).toBe('about 1 in 3');
        expect(oneIn(0.0002)).toBe('about 1 in 5,000');
        expect(briefingCfr(scenarios.global)).toBe('about 1 in 3 cases');
    });
});

describe('dying during the illness', () => {
    it('a sick person can die on the first day of illness, not only the last', () => {
        const state = stateWith();
        const network = { nodes: [{ id: 0, state: 'infected', daysInfected: 1 }], links: [] };
        const out = updateOutcomes(state, network, 7, 0.3, () => 0.01);
        expect(out).toEqual([{ node: expect.objectContaining({ id: 0, state: 'dead' }), outcome: 'died', inWard: false }]);
        expect(state.stats.totalDead).toBe(1);
        expect(network.nodes).toHaveLength(0);
    });

    it('a roll that kills an untreated person spares one in a ward', () => {
        const roll = () => dailyDeathChance(0.3, 7) * 0.75; // under the untreated chance, over the ward chance
        const a = stateWith();
        const sick = { nodes: [{ id: 0, state: 'infected', daysInfected: 2 }], links: [] };
        expect(updateOutcomes(a, sick, 7, 0.3, roll)[0].outcome).toBe('died');
        const b = stateWith();
        const ward = { nodes: [{ id: 0, state: 'quarantined', sickWhileQuarantined: true, daysInfected: 2 }], links: [] };
        expect(updateOutcomes(b, ward, 7, 0.3, roll)).toHaveLength(0);
    });

    it('nobody freshly infected (day 0) is rolled', () => {
        const state = stateWith();
        const network = { nodes: [{ id: 0, state: 'infected', daysInfected: 0 }], links: [] };
        expect(updateOutcomes(state, network, 7, 1, () => 0)).toHaveLength(0);
    });
});

describe('aftermath of a lost level', () => {
    it('settles everyone still sick in the stats, once, without touching the web', () => {
        const state = stateWith();
        const network = {
            nodes: [
                { id: 0, state: 'infected', daysInfected: 2 },
                { id: 1, state: 'infected', daysInfected: 1 },
                { id: 2, state: 'healthy', daysInfected: 0 },
            ],
            links: [],
        };
        const rolls = [0, 0.99];
        let i = 0;
        const out = resolveAftermath(state, network, 7, 0.3, () => rolls[i++]);
        expect(out.map((o) => o.outcome)).toEqual(['died', 'recovered']);
        expect(state.stats.aftermathDead).toBe(1);
        expect(state.stats.totalDead).toBe(1);
        // The web is left as it ended: only the stats settle.
        expect(network.nodes.map((n) => n.state)).toEqual(['infected', 'infected', 'healthy']);
        expect(state.stats.totalRecovered).toBe(1);
        expect(resolveAftermath(state, network, 7, 0.3, () => 0)).toEqual([]);
    });

    it('advanceDay runs it on a loss and never on a win', () => {
        const level = LEVELS[0];
        const { scenario, difficulty } = levelRules(level);
        const lose = stateWith();
        lose.stats.totalInfected = 99; // over any case cap
        const sick = { nodes: [{ id: 0, state: 'infected', daysInfected: 1 }, { id: 1, state: 'healthy', daysInfected: 0 }], links: [] };
        const r = advanceDay(lose, sick, { scenario: { ...scenario, caseCapFraction: 0.5 }, difficulty, rng: () => 0.999 });
        expect(r.result).toBe('overwhelmed');
        expect(lose.aftermathDone).toBe(true);
        const win = stateWith();
        win.stats.totalProtected = 1;
        const calm = { nodes: [{ id: 0, state: 'healthy', daysInfected: 0 }], links: [] };
        const w = advanceDay(win, calm, { scenario, difficulty, rng: () => 0.999 });
        expect(w.result).toBe('contained');
        expect(w.aftermath).toEqual([]);
    });
});

describe('deaths on every planet (balance)', () => {
    const RUNS = 30;
    const perPlanet = REGIONS.map((r) => {
        const lv = LEVELS.filter((l) => l.regionId === r.id);
        const tally = { passive: { runs: 0, withDeaths: 0, deaths: 0 }, random: { runs: 0, deaths: 0 }, smart: { runs: 0, deaths: 0 } };
        for (const level of lv) {
            for (let k = 0; k < RUNS; k++) {
                for (const bot of ['passive', 'random', 'smart']) {
                    const run = playRun(level, bot, 9001 + k * 31);
                    const t = tally[bot];
                    t.runs++;
                    t.deaths += run.deaths;
                    if (bot === 'passive' && run.deaths > 0) t.withDeaths++;
                }
            }
        }
        return { id: r.id, tally };
    });

    it('doing nothing costs lives in most runs', () => {
        for (const p of perPlanet) expect(p.tally.passive.withDeaths / p.tally.passive.runs, p.id).toBeGreaterThan(0.5);
    });

    it('smart play loses fewer people than random play', () => {
        for (const p of perPlanet) {
            const smart = p.tally.smart.deaths / p.tally.smart.runs;
            const random = p.tally.random.deaths / p.tally.random.runs;
            expect(smart, p.id).toBeLessThan(random);
        }
    });
});

describe('death words and screens', () => {
    it('the first death in a level teaches ward care, later ones just count', () => {
        expect(deathToast({ count: 1, firstThisLevel: true })).toMatch(/ward/);
        expect(deathToast({ count: 2 })).toBe('2 people did not survive.');
        expect(deathToast({ count: 1, firstThisLevel: true, inWard: true })).toMatch(/Even with care/);
    });

    it('results explain aftermath deaths and the real rate', () => {
        const lines = resultsDeathLines({ outcome: 'overwhelmed', stats: { totalDead: 3, aftermathDead: 2 }, scenario: scenarios.global, fatalityRate: 0.3 });
        expect(lines[0]).toMatch(/^2 more people/);
        expect(lines.at(-1)).toMatch(/^For real: WHO counts/);
        const clean = resultsDeathLines({ outcome: 'contained', stats: { totalDead: 0 }, scenario: scenarios.school, fatalityRate: 0.135 });
        expect(clean[0]).toMatch(/Nobody died/);
        for (const l of [...lines, ...clean]) expect(l).not.toContain('—');
    });

    it('the HUD has a Lost stat, results list deaths, and the web plays a death moment', () => {
        const html = read('../index.html');
        expect(html).toContain('id="deaths-count"');
        expect(html).toContain('id="lost-stat" hidden');
        expect(html).toContain('id="final-total-dead"');
        expect(html).toContain('id="final-death-notes"');
        expect(html).toContain('id="briefing-cfr"');
        expect(read('../src/ui/panels.js')).toContain("getElementById('deaths-count')");
        expect(read('../src/ui/network-view-3d.js')).toContain('animateDeath(node)');
        expect(read('../src/game.js')).toContain('this.view.animateDeath?.(node)');
    });
});
