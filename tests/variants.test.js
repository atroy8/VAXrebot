// Puzzle levels (round 14): super-spreader, Envoy, no vaccines, no quarantine.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { LEVELS } from '../src/config/levels.js';
import { levelRules } from '../src/config/level-rules.js';
import { tools } from '../src/config/tools.js';
import { scenarios } from '../src/config/scenarios.js';
import { buildOutbreak } from '../src/sim/setup.js';
import { placeSuperSpreader, placeEnvoy, distancesFromSick, adjacency, envoyLost, variantCallout, carrierDegree } from '../src/sim/variants.js';
import { checkGameOver, canUseTool, toolAvailableDay, spreadIsOver } from '../src/sim/engine.js';
import { actionsRemaining, advanceDay, endStayHome } from '../src/sim/actions.js';
import { initGameState } from '../src/sim/state.js';
import { mulberry32, buildRun, summarize } from '../src/sim/balance.js';
import { toolChips } from '../src/ui/game-screen-model.js';
import { calculateStars, recordCompletion, fundingAward, livesSavedForRun } from '../src/progress.js';
import { freshSave } from '../src/save.js';
import { careBonus } from '../src/rewards.js';
import { debriefLine, lessonFor } from '../src/config/lessons.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const byType = (type) => LEVELS.filter((l) => l.variant && l.variant.type === type);

describe('super-spreader levels', () => {
    it('one carrier starts sick with at least the variant degree of contacts', () => {
        for (const level of byType('superSpreader').slice(0, 6)) {
            for (let seed = 1; seed <= 5; seed++) {
                const run = buildRun(level, mulberry32(seed));
                const carriers = run.network.nodes.filter((n) => n.superSpreader);
                expect(carriers).toHaveLength(1);
                expect(carriers[0].state).toBe('infected');
                expect(run.state.superSpreaderId).toBe(carriers[0].id);
                const adj = adjacency(run.network.nodes, run.network.links);
                expect(adj.get(carriers[0].id).size).toBeGreaterThanOrEqual(carrierDegree(run.network.nodes.length, level.variant));
                // Nobody has more contacts than the carrier.
                for (const n of run.network.nodes) expect(adj.get(n.id).size).toBeLessThanOrEqual(adj.get(carriers[0].id).size);
                // Starting cases still match the level's tuning.
                expect(run.state.stats.totalInfected).toBe(run.network.nodes.filter((n) => n.state === 'infected').length);
            }
        }
    });

    it('bosses have the most connected carrier', () => {
        const boss = LEVELS[9];
        expect(boss.variant).toMatchObject({ type: 'superSpreader', boss: true });
        expect(boss.variant.degreeShare).toBeGreaterThan(LEVELS[2].variant.degreeShare);
        expect(carrierDegree(25, LEVELS.at(-1).variant)).toBe(14);
    });

    it('quarantine arrives on day 2 on super-spreader levels, day 3 elsewhere', () => {
        const ss = levelRules(byType('superSpreader')[0]).difficulty;
        const plain = levelRules(LEVELS[0]).difficulty;
        expect(toolAvailableDay(tools.quarantine, ss, 'quarantine')).toBe(2);
        expect(toolAvailableDay(tools.quarantine, plain, 'quarantine')).toBe(3);
        const state = initGameState(tools, 30);
        state.day = 2;
        expect(canUseTool(state, tools, 'quarantine', ss, { id: 1, state: 'infected' }).allowed).toBe(true);
        expect(canUseTool(state, tools, 'quarantine', plain, { id: 1, state: 'infected' }).allowed).toBe(false);
        const chips = toolChips(tools, ss, 1, state.dailyUsage);
        expect(chips.find((c) => c.id === 'quarantine').usage).toBe('Day 2');
        // On day 2 the carrier level counts quarantine among the day's actions.
        state.day = 2;
        const day2 = ss.dailyLimits.vaccinate + ss.dailyLimits.quarantine + ss.dailyLimits.severLink;
        expect(actionsRemaining(state, tools, ss)).toBe(day2);
    });

    it('placeSuperSpreader adds links only to people the carrier did not know', () => {
        const nodes = Array.from({ length: 12 }, (_, i) => ({ id: i, state: 'healthy' }));
        const links = [{ source: 0, target: 1 }, { source: 0, target: 2 }];
        const c = placeSuperSpreader(nodes, links, { degree: 8 }, mulberry32(3));
        expect(c.id).toBe(0);
        const adj = adjacency(nodes, links);
        expect(adj.get(0).size).toBe(8);
        const pairs = links.map((l) => [l.source, l.target].sort().join('-'));
        expect(new Set(pairs).size).toBe(pairs.length);
    });
});

describe('Envoy levels', () => {
    it('marks one healthy Envoy at least minDistance hops from the first cases when possible', () => {
        let far = 0;
        let total = 0;
        for (const level of byType('envoy')) {
            for (let seed = 1; seed <= 6; seed++) {
                const run = buildRun(level, mulberry32(seed));
                const envoys = run.network.nodes.filter((n) => n.envoy);
                expect(envoys).toHaveLength(1);
                expect(envoys[0].state).toBe('healthy');
                expect(run.state.envoyId).toBe(envoys[0].id);
                const d = distancesFromSick(run.network.nodes, run.network.links).get(envoys[0].id);
                total++;
                if (d >= level.variant.minDistance) far++;
                expect(d).toBeGreaterThanOrEqual(2);
            }
        }
        expect(far / total).toBeGreaterThan(0.8);
    });

    it('the round is lost the moment the Envoy falls ill, even in isolation', () => {
        const state = initGameState(tools, 4);
        state.envoyId = 2;
        state.stats.totalProtected = 1;
        const network = { nodes: [{ id: 1, state: 'infected' }, { id: 2, state: 'healthy' }], links: [] };
        expect(checkGameOver(state, network, 30)).toBe(null);
        network.nodes[1].state = 'infected';
        expect(checkGameOver(state, network, 30)).toBe('envoy-lost');
        network.nodes[1].state = 'quarantined';
        network.nodes[1].sickWhileQuarantined = true;
        expect(envoyLost(network, 2)).toBe(true);
        // Isolated while healthy is safe.
        network.nodes[1].sickWhileQuarantined = false;
        expect(envoyLost(network, 2)).toBe(false);
        // A dead Envoy leaves the network: still lost.
        network.nodes = network.nodes.filter((n) => n.id !== 2);
        expect(checkGameOver(state, network, 30)).toBe('envoy-lost');
    });

    it('a vaccinated Envoy is safe, and a normal win still counts', () => {
        const state = initGameState(tools, 4);
        state.envoyId = 2;
        state.stats.totalProtected = 1;
        const network = { nodes: [{ id: 1, state: 'recovered' }, { id: 2, state: 'vaccinated' }], links: [] };
        expect(checkGameOver(state, network, 30)).toBe('contained');
    });

    it('envoy-lost is a loss everywhere: no stars, funding, lives or care bonus', () => {
        const stats = { initialPopulation: 40, totalDead: 0, totalRecovered: 10, totalInfected: 8, totalProtected: 5, daysUsed: 5 };
        const level = byType('envoy')[0];
        expect(calculateStars('envoy-lost', stats, level)).toBe(0);
        expect(livesSavedForRun('envoy-lost', stats)).toBe(0);
        expect(careBonus('envoy-lost', stats, level).total).toBe(0);
        const save = recordCompletion(freshSave(), level.id, 'envoy-lost', stats);
        expect(save.levels[level.id]).toBeUndefined();
        expect(fundingAward(0)).toBe(0);
        expect(debriefLine(lessonFor(level.id), 'envoy-lost')).toBe(lessonFor(level.id).retry);
    });

    it('results screen names the Envoy loss', () => {
        const panels = read('src/ui/panels.js');
        expect(panels).toContain("'envoy-lost'");
        expect(panels).toContain('The Envoy Fell Ill');
    });

    it('placeEnvoy falls back to the farthest person when nobody is far enough', () => {
        const nodes = [{ id: 0, state: 'infected' }, { id: 1, state: 'healthy' }, { id: 2, state: 'healthy' }];
        const links = [{ source: 0, target: 1 }, { source: 1, target: 2 }];
        const e = placeEnvoy(nodes, links, { minDistance: 5 }, mulberry32(1));
        expect(e.id).toBe(2);
    });
});

describe('levels without a tool', () => {
    it('no-vaccine and no-quarantine levels pin that tool to 0 and give more of the others', () => {
        for (const level of byType('noVaccines')) {
            const d = levelRules(level).difficulty;
            expect(d.dailyLimits.vaccinate).toBe(0);
            expect(d.dailyLimits.severLink).toBeGreaterThanOrEqual(2);
        }
        for (const level of byType('noQuarantine')) expect(levelRules(level).difficulty.dailyLimits.quarantine).toBe(0);
    });

    it('a tool with no doses has no chip, cannot be used, and is never an unused action', () => {
        const d = levelRules(byType('noVaccines')[0]).difficulty;
        const state = initGameState(tools, 30);
        state.day = 5;
        // Item 16: tools outside the toolkit are left out of the tray.
        expect(toolChips(tools, d, 5, state.dailyUsage).find((c) => c.id === 'vaccinate')).toBeUndefined();
        // Without a toolkit a 0 limit still shows as None here.
        const bare = { ...d, toolkit: undefined };
        expect(toolChips(tools, bare, 5, state.dailyUsage).find((c) => c.id === 'vaccinate')).toMatchObject({ state: 'off', usage: 'None here' });
        const res = canUseTool(state, tools, 'vaccinate', d, { id: 1, state: 'healthy' });
        expect(res.allowed).toBe(false);
        expect(res.reason).toBe('No vaccines on this world.');
        expect(actionsRemaining(state, tools, d)).toBe(d.dailyLimits.quarantine + d.dailyLimits.severLink);
    });
});

describe('one shared outbreak setup', () => {
    it('game.js and the balance bots both build levels through buildOutbreak', () => {
        expect(read('src/game.js')).toContain('buildOutbreak(');
        expect(read('src/sim/balance.js')).toContain('buildOutbreak(');
        expect(read('src/game.js')).not.toContain('generateNetwork(');
    });

    it('seeds exactly the starting cases on normal levels', () => {
        const out = buildOutbreak({ scenario: { ...scenarios.school, initialInfected: 3 }, population: 30, rng: mulberry32(9) });
        expect(out.initialCases).toBe(3);
        expect(out.nodes.filter((n) => n.state === 'infected')).toHaveLength(3);
        expect(out.envoyId).toBe(null);
        expect(out.superSpreaderId).toBe(null);
    });

    it('is repeatable for a seed', () => {
        const a = buildOutbreak({ scenario: scenarios.urban, population: 40, variant: { type: 'envoy', minDistance: 3 }, rng: mulberry32(4) });
        const b = buildOutbreak({ scenario: scenarios.urban, population: 40, variant: { type: 'envoy', minDistance: 3 }, rng: mulberry32(4) });
        expect(a.envoyId).toBe(b.envoyId);
        expect(a.links).toEqual(b.links);
    });
});

describe('puzzle copy and visuals', () => {
    it('every variant has a briefing callout with no em dashes', () => {
        for (const type of ['superSpreader', 'envoy', 'noVaccines', 'noQuarantine']) {
            const c = variantCallout({ type });
            expect(c.title.length).toBeGreaterThan(5);
            expect(c.text.length).toBeLessThanOrEqual(140);
            expect(`${c.title} ${c.text}`).not.toMatch(/[\u2014\u2013]/);
        }
        expect(variantCallout({ type: 'superSpreader', boss: true }).title).toMatch(/Boss/);
        expect(variantCallout(null)).toBe(null);
    });

    it('the network view draws a crown for the carrier and a star for the Envoy', () => {
        const src = read('src/ui/network-view-3d.js');
        expect(src).toContain('superSpreader');
        expect(src).toContain('envoy');
        expect(src).toContain('badgeKind(node)');
    });

    it('game.js shows the callout and toasts when the carrier is isolated', () => {
        const game = read('src/game.js');
        expect(game).toContain('showVariantCallout(variantCallout(level.variant))');
        expect(game).toContain('node.superSpreader');
    });
});

describe('puzzle levels stay fair for the bots', () => {
    it('the smart bot beats the first super-spreader and Envoy levels most of the time', () => {
        expect(summarize(byType('superSpreader')[0], 'smart', 40, 5).winRate).toBeGreaterThanOrEqual(0.6);
        expect(summarize(byType('envoy')[0], 'smart', 40, 5).winRate).toBeGreaterThanOrEqual(0.6);
    });

    it('doing nothing on an Envoy level usually loses the Envoy', () => {
        const s = summarize(byType('envoy')[0], 'passive', 30, 2);
        expect(s.counts.contained || 0).toBe(0);
    });
});

describe('Stay Home Pay can never end a level by itself (round 14)', () => {
    it('people sent home come back out if still sick when the break ends', () => {
        const state = initGameState(tools, 3);
        state.day = 5;
        const network = { nodes: [{ id: 0, state: 'quarantined', sickWhileQuarantined: true, homeUntilDay: 7, daysInfected: 1 }, { id: 1, state: 'healthy', daysInfected: 0 }], links: [{ source: 0, target: 1 }] };
        // While home the outbreak is NOT over: they will be back.
        expect(spreadIsOver(network)).toBe(false);
        state.day = 6;
        expect(endStayHome(state, network)).toHaveLength(0);
        state.day = 7;
        const back = endStayHome(state, network);
        expect(back.map((n) => n.id)).toEqual([0]);
        expect(network.nodes[0].state).toBe('infected');
        expect(network.nodes[0].homeUntilDay).toBeUndefined();
    });

    it('a full day step with only stay-home cases never reports a win', () => {
        const state = initGameState(tools, 3);
        state.stats.totalProtected = 3;
        state.stats.totalInfected = 1;
        const network = {
            nodes: [
                { id: 0, state: 'quarantined', sickWhileQuarantined: true, homeUntilDay: 3, daysInfected: 0 },
                { id: 1, state: 'healthy', daysInfected: 0 },
                { id: 2, state: 'healthy', daysInfected: 0 },
            ],
            links: [{ source: 0, target: 1 }, { source: 1, target: 2 }],
        };
        const difficulty = { transmissionMultiplier: 1, recoveryTime: 9, fatalityRate: 0 };
        const scenario = { baseTransmissionRate: 0, duration: 30 };
        const r1 = advanceDay(state, network, { scenario, difficulty, rng: () => 0.5 });
        expect(r1.result).toBe(null);
        const r2 = advanceDay(state, network, { scenario, difficulty, rng: () => 0.5 });
        expect(r2.result).toBe(null);
        expect(network.nodes[0].state).toBe('infected');
    });

    it('someone who recovers at home stays recovered', () => {
        const state = initGameState(tools, 2);
        state.day = 9;
        const network = { nodes: [{ id: 0, state: 'recovered', homeUntilDay: 9 }], links: [] };
        endStayHome(state, network);
        expect(network.nodes[0].state).toBe('recovered');
        expect(network.nodes[0].homeUntilDay).toBeUndefined();
    });
});
