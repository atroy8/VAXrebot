// Round 57: every rule that decides a result is free of dice.
import { describe, it, expect } from 'vitest';
import { simulateSpread, updateOutcomes, careStillHelps, checkGameOver } from '../src/sim/engine.js';
import { advanceDay, liveR, caseCapFor, applyNodeTool } from '../src/sim/actions.js';
import { travelPlan, travelNight, markTravellers, placeCarriers, carrierCandidates, crossesTonight, maskedLink, viewNode, MASK_NIGHTS } from '../src/sim/mechanics.js';
import { frailCount, frailDeathNight, diesTonight, careDaysLeft, MAX_FRAIL, FRAIL_DEATH_NIGHT, gameFatality } from '../src/sim/fatality.js';
import { webR0, levelR0Range, linkChance } from '../src/sim/r0.js';
import { buildOutbreak } from '../src/sim/setup.js';
import { placeSuperSpreader, adjacency } from '../src/sim/variants.js';
import { initGameState } from '../src/sim/state.js';
import { mulberry32, hashSeed, randomSeed } from '../src/sim/rng.js';
import { rollLevelRules, threatLine, PRIZE_CLOSE_THREAT } from '../src/config/difficulty-roll.js';
import { levelRules } from '../src/config/level-rules.js';
import { applyGentle, GENTLE } from '../src/config/gentle.js';
import { UPGRADES, UPGRADE_IDS, UPGRADE_RENAMES, applyUpgradeRules } from '../src/config/upgrades.js';
import { PLANET_WEB_DEGREE } from '../src/config/planet-mechanics.js';
import { loadSave, createMemoryBackend, SAVE_KEY } from '../src/save.js';
import { dealLevelCached, dealRules, startDeal } from '../src/sim/dealer.js';
import { solveRun } from '../src/sim/solver.js';
import { dailyLevel, dailySeed, dailyShareText } from '../src/sim/daily.js';
import { noResponseCases, avertedSummary } from '../src/sim/counterfactual.js';
import { LEVELS } from '../src/config/levels.js';
import { OVERWHELMED_DEATH_FLOOR } from '../src/sim/engine.js';
import { levelOfEachKind, tools } from './round57-helpers.js';

const person = (id, state = 'healthy', extra = {}) => ({ id, state, daysInfected: 0, removed: false, ...extra });
const freshState = () => ({ day: 1, stats: { totalInfected: 1, totalDead: 0, totalRecovered: 0, totalProtected: 0, linksSevered: 0 }, dailyUsage: {} });

describe('masks: a masked line takes two nights', () => {
    it('charges the first night and crosses the second', () => {
        const net = { nodes: [person(0, 'infected', { masked: true }), person(1), person(2)], links: [{ source: 0, target: 1 }, { source: 1, target: 2 }] };
        const state = freshState();
        const first = simulateSpread(state, net);
        expect(first.count).toBe(0);
        expect(first.charging).toHaveLength(1);
        expect(net.links[0].charged).toBe(true);
        expect(net.nodes[1].state).toBe('healthy');
        const second = simulateSpread(state, net);
        expect(second.count).toBe(1);
        expect(net.nodes[1].state).toBe('infected');
        expect(MASK_NIGHTS).toBe(2);
    });

    it('a mask on either end slows the line, and a plain line is not slowed', () => {
        const a = person(0, 'infected');
        const b = person(1, 'healthy', { masked: true });
        expect(maskedLink(a, b)).toBe(true);
        expect(crossesTonight({}, a, b)).toBe(false);
        expect(crossesTonight({ charged: true }, a, b)).toBe(true);
        expect(crossesTonight({}, a, person(2))).toBe(true);
    });

    it('a cut during the day the line charged saves the person', () => {
        const net = { nodes: [person(0, 'infected', { masked: true }), person(1)], links: [{ source: 0, target: 1 }] };
        const state = freshState();
        simulateSpread(state, net);
        net.links = [];
        simulateSpread(state, net);
        expect(net.nodes[1].state).toBe('healthy');
    });
});

describe('travellers: tonight is on screen all day', () => {
    const build = () => {
        const nodes = [0, 1, 2, 3, 4, 5].map((id) => person(id));
        Object.assign(nodes[1], { traveller: true, route: [4, 2, 5, 0, 3], routeAt: 0 });
        return { nodes, links: [{ source: 1, target: 0 }, { source: 1, target: 2 }, { source: 3, target: 4 }, { source: 4, target: 5 }] };
    };

    it('the plan is pure and names the oldest line and the next stop on the route', () => {
        const net = build();
        const before = JSON.stringify(net);
        expect(travelPlan(net)).toEqual([{ traveller: 1, from: 0, to: 4, at: 0 }]);
        expect(JSON.stringify(net)).toBe(before);
    });

    it('the night does exactly what the plan showed', () => {
        const net = build();
        const plan = travelPlan(net);
        const moves = travelNight({ stats: {} }, net, plan);
        expect(moves).toEqual([{ traveller: 1, from: 0, to: 4 }]);
        expect(net.links.some((l) => l.source === 1 && l.target === 0)).toBe(false);
        expect(net.links.at(-1)).toEqual({ source: 1, target: 4 });
        expect(net.nodes[1].routeAt).toBe(1);
        // Next night: 2 is already a contact, so the route moves on to 5.
        expect(travelPlan(net)).toEqual([{ traveller: 1, from: 2, to: 5, at: 2 }]);
    });

    it('the plan follows the moves of the day: cut the oldest line and another one is dropped', () => {
        const net = build();
        net.links = net.links.filter((l) => !(l.source === 1 && l.target === 0));
        expect(travelPlan(net)[0]).toMatchObject({ from: 2, to: 4 });
        // Nobody travels to a person in isolation, and an isolated traveller stays put.
        net.nodes[4].state = 'quarantined';
        expect(travelPlan(net)[0].to).toBe(5);
        net.nodes[1].state = 'quarantined';
        expect(travelPlan(net)).toEqual([]);
    });

    it('advanceDay applies the plan made before the night, after the spread', () => {
        const net = build();
        net.nodes[0].state = 'infected';
        const state = initGameState(tools, 6);
        state.stats.totalInfected = 1;
        const planned = travelPlan(net);
        const out = advanceDay(state, net, { scenario: { duration: 30, travellers: { count: 1 } }, difficulty: { recoveryTime: 5 } });
        expect(out.spread.travel).toEqual([{ traveller: 1, from: planned[0].from, to: planned[0].to }]);
        // The traveller caught it over the old line before moving on; the new
        // line could not carry anything yet.
        expect(net.nodes[1].state).toBe('infected');
        expect(net.nodes[4].state).toBe('healthy');
    });

    it('routes are fixed when the level is dealt', () => {
        const mk = () => {
            const nodes = [0, 1, 2, 3, 4, 5, 6, 7].map((id) => person(id));
            return markTravellers(nodes, { count: 2 }, mulberry32(9)).map((n) => ({ id: n.id, route: n.route }));
        };
        expect(mk()).toEqual(mk());
        for (const t of mk()) {
            expect(t.route).toHaveLength(7);
            expect(t.route).not.toContain(t.id);
        }
    });
});

describe('hidden carriers are dealt, not rolled', () => {
    it('are contacts of the first case, fixed by the seed', () => {
        const mk = (seed) => {
            const nodes = [0, 1, 2, 3, 4, 5].map((id) => person(id));
            nodes[0].state = 'infected';
            const links = [{ source: 0, target: 1 }, { source: 0, target: 2 }, { source: 0, target: 3 }, { source: 3, target: 4 }, { source: 4, target: 5 }];
            const picked = placeCarriers(nodes, links, { count: 2, days: 2 }, mulberry32(seed));
            return { nodes, links, ids: picked.map((n) => n.id).sort() };
        };
        const a = mk(3);
        expect(mk(3).ids).toEqual(a.ids);
        expect(a.ids).toHaveLength(2);
        for (const id of a.ids) expect([1, 2, 3]).toContain(id);
        expect(a.nodes.filter((n) => n.incubating === 2)).toHaveLength(2);
        // What the player can work out: the candidates are the sick person's contacts.
        expect(carrierCandidates(a.nodes, a.links).map((n) => n.id)).toEqual([1, 2, 3]);
    });

    it('a carrier looks exactly like a healthy person', () => {
        const carrier = person(4, 'healthy', { incubating: 2 });
        expect(viewNode(carrier)).toEqual(viewNode(person(4)));
    });

    it('spread like the sick from the first night, and fall sick after the stated days', () => {
        const net = { nodes: [person(0, 'healthy', { incubating: 2 }), person(1), person(2)], links: [{ source: 0, target: 1 }, { source: 1, target: 2 }] };
        const state = freshState();
        state.stats.totalInfected = 0;
        const first = simulateSpread(state, net);
        expect(net.nodes[1].state).toBe('infected'); // caught it from someone who looks healthy
        expect(first.onsets).toHaveLength(0);
        expect(net.nodes[0].state).toBe('healthy');
        const second = simulateSpread(state, net);
        expect(second.onsets).toHaveLength(1);
        expect(net.nodes[0].state).toBe('infected');
        // Nobody who catches it later is hidden.
        expect(net.nodes.filter((n) => n.incubating != null)).toHaveLength(0);
        expect(state.stats.totalInfected).toBe(3);
    });

    it('a test finds a carrier, and the count on the briefing is the dealt count', () => {
        const level = levelOfEachKind().incubation;
        const run = startDeal(dealLevelCached(level, 2), tools);
        expect(run.state.stats.hiddenInfections).toBe(2);
        const carrier = run.network.nodes.find((n) => n.incubating != null);
        expect(applyNodeTool(run.state, tools, 'test', carrier)).toEqual({ positive: true });
        expect(carrier.state).toBe('exposed');
        expect(level.mechanics.callout.title).toMatch(/2 hidden carriers/);
        expect(level.mechanics.callout.text).toMatch(/fall sick in 2 days/);
        expect(run.difficulty.toolDays.test).toBe(1);
    });
});

describe('deaths: only the frail, only outside a ward, always on the third night', () => {
    it('the rule', () => {
        expect(FRAIL_DEATH_NIGHT).toBe(3);
        expect(frailDeathNight(5)).toBe(3);
        expect(frailDeathNight(2)).toBe(2);
        expect(diesTonight(person(1, 'infected', { frail: true, daysInfected: 3 }), 5)).toBe(true);
        expect(diesTonight(person(1, 'infected', { frail: true, daysInfected: 2 }), 5)).toBe(false);
        expect(diesTonight(person(1, 'infected', { daysInfected: 9 }), 5)).toBe(false);
        expect(diesTonight(person(1, 'quarantined', { frail: true, sickWhileQuarantined: true, daysInfected: 4 }), 5)).toBe(false);
        expect(careDaysLeft(person(1, 'infected', { frail: true, daysInfected: 1 }), 5)).toBe(2);
        expect(careDaysLeft(person(1, 'infected', { frail: true, daysInfected: 3 }), 5)).toBe(0);
    });

    it('the number of frail people follows the disease and never reaches the death line', () => {
        expect(frailCount(8, 0.12)).toBe(1);
        expect(frailCount(32, 0.3)).toBe(MAX_FRAIL);
        expect(MAX_FRAIL).toBeLessThan(OVERWHELMED_DEATH_FLOOR);
        expect(frailCount(20, gameFatality(0.35))).toBeGreaterThanOrEqual(frailCount(20, gameFatality(0.0002)));
    });

    it('every dealt level marks its frail people, never the first cases or a marked puzzle person', () => {
        for (const level of Object.values(levelOfEachKind())) {
            const deal = dealLevelCached(level, 3);
            const frail = deal.nodes.filter((n) => n.frail);
            expect(frail.length, level.id).toBeGreaterThanOrEqual(1);
            expect(frail.length).toBeLessThanOrEqual(MAX_FRAIL);
            for (const n of frail) {
                expect(n.state).toBe('healthy');
                expect(!!(n.envoy || n.hub || n.superSpreader)).toBe(false);
            }
        }
    });

    it('a frail person who falls sick on night 1 can be saved on day 2 and day 3, and is lost that night', () => {
        const mk = () => ({ nodes: [person(0, 'infected'), person(1, 'healthy', { frail: true })], links: [{ source: 0, target: 1 }] });
        const rules = { scenario: { duration: 30 }, difficulty: { recoveryTime: 5 } };
        const lost = mk();
        const state = initGameState(tools, 2);
        state.stats.totalInfected = 1;
        const deaths = [];
        for (let k = 0; k < 4; k++) deaths.push(advanceDay(state, lost, rules).outcomes.filter((o) => o.outcome === 'died').length);
        expect(deaths).toEqual([0, 0, 1, 0]); // sick after night 1, lost on night 3
        const saved = mk();
        const state2 = initGameState(tools, 2);
        state2.stats.totalInfected = 1;
        advanceDay(state2, saved, rules);
        advanceDay(state2, saved, rules); // day 3: the last morning a ward helps
        applyNodeTool(state2, tools, 'quarantine', saved.nodes[1]);
        for (let k = 0; k < 6; k++) advanceDay(state2, saved, rules);
        expect(saved.nodes.find((n) => n.id === 1).state).toBe('recovered');
        expect(state2.stats.totalDead).toBe(0);
    });

    it('care still helps only while a frail person can be reached in time', () => {
        const difficulty = { recoveryTime: 5, dailyLimits: { quarantine: 1 }, toolLimitMultiplier: 1 };
        const net = (days) => ({ nodes: [person(0, 'infected', { frail: true, daysInfected: days }), person(1, 'infected', { daysInfected: 1 })], links: [] });
        const state = (day) => ({ day, dailyUsage: { quarantine: 0 }, usedOnPeople: new Set() });
        expect(careStillHelps(state(3), net(1), tools, difficulty, 5)).toEqual({ day: 3, sick: 1 });
        // Quarantine opens on day 3: on day 1 a person one night sick can still wait two days.
        expect(careStillHelps(state(1), net(0), tools, difficulty, 5)).toEqual({ day: 3, sick: 1 });
        expect(careStillHelps(state(1), net(1), tools, difficulty, 5)).toBe(null);
        // Someone who is not frail does not need the ward.
        expect(careStillHelps(state(3), { nodes: [person(1, 'infected', { daysInfected: 1 })], links: [] }, tools, difficulty, 5)).toBe(null);
    });
});

describe('R is honest under the new rule', () => {
    it('live R is healthy contacts per spreader', () => {
        const net = {
            nodes: [person(0, 'infected'), person(1, 'infected'), person(2), person(3), person(4), person(5, 'vaccinated')],
            links: [{ source: 0, target: 2 }, { source: 0, target: 3 }, { source: 1, target: 3 }, { source: 1, target: 4 }, { source: 1, target: 5 }],
        };
        expect(liveR(net)).toBe(1.5); // 3 people in danger, 2 spreaders
        net.links = net.links.filter((l) => l.target !== 4);
        expect(liveR(net)).toBe(1);
        expect(liveR({ nodes: [person(0)], links: [] })).toBe(0);
    });

    it('R0 here is the average number of contacts, and a contact is a certainty', () => {
        const nodes = [0, 1, 2, 3].map((id) => person(id));
        expect(webR0({ nodes, links: [{ source: 0, target: 1 }, { source: 1, target: 2 }, { source: 2, target: 3 }, { source: 3, target: 0 }] })).toBe(2);
        expect(linkChance()).toBe(1);
        const r = levelR0Range({ networkType: 'small-world', populationRange: [10, 14], rng: mulberry32(1) });
        expect(r.lo).toBeGreaterThan(3);
        expect(r.hi).toBeLessThan(5);
    });

    it('later planets still have more contacts, but the climb is gentle', () => {
        expect(PLANET_WEB_DEGREE.slice(0, 2)).toEqual([null, null]);
        for (let p = 3; p < PLANET_WEB_DEGREE.length; p++) expect(PLANET_WEB_DEGREE[p]).toBeGreaterThan(PLANET_WEB_DEGREE[p - 1]);
        expect(PLANET_WEB_DEGREE.at(-1)).toBeLessThanOrEqual(5);
    });

    it('the no-response baseline is one certain run', () => {
        const snap = { nodes: [0, 1, 2, 3, 4].map((id) => ({ id, state: id === 0 ? 'infected' : 'healthy' })), links: [{ source: 0, target: 1 }, { source: 1, target: 2 }, { source: 3, target: 4 }] };
        expect(noResponseCases(snap, { recoveryTime: 5 })).toBe(3);
        expect(noResponseCases(snap, { recoveryTime: 5 })).toBe(3);
        expect(avertedSummary({ actual: 2, baseline: 3, population: 5, outcome: 'contained' }).text).toBe('With no response, 3 of 5 people would have caught it. You kept it to 2.');
    });
});

describe('the threat no longer wobbles the spread', () => {
    it('the same level always has the same rules, whatever dice are handed in', () => {
        for (const level of [LEVELS[0], LEVELS[9], LEVELS[44], LEVELS[79]]) {
            const a = rollLevelRules(level, () => 0.01);
            const b = rollLevelRules(level, () => 0.99);
            expect(JSON.stringify(b)).toBe(JSON.stringify(a));
            expect(a.pips).toBeGreaterThanOrEqual(1);
            expect(a.pips).toBeLessThanOrEqual(5);
        }
    });

    it('close to a prize box the cap has one less spare case, and the briefing says so', () => {
        const far = rollLevelRules(LEVELS[5]); // right after the first box
        const near = rollLevelRules(LEVELS[9]); // the level that unlocks the next
        expect(far.threat).toBeLessThan(PRIZE_CLOSE_THREAT);
        expect(near.threat).toBeGreaterThanOrEqual(PRIZE_CLOSE_THREAT);
        expect(threatLine(near.threat)).toMatch(/one less spare case/);
        expect(threatLine(far.threat)).not.toMatch(/fast|slow/);
        expect(near.scenario.capSlack).toBe(near.spec.capSlack);
    });

    it('the case cap of a deal is par plus the slack, shown before day 1', () => {
        for (const level of [LEVELS[4], LEVELS[33], LEVELS[66]]) {
            const deal = dealLevelCached(level, 5);
            expect(deal.caseCap).toBe(Math.min(deal.population, deal.par.cases + deal.scenario.capSlack));
            expect(caseCapFor({ stats: { initialPopulation: deal.population } }, deal.scenario)).toBe(deal.caseCap);
        }
        // An undealt web keeps the old share of the town.
        expect(caseCapFor({ stats: { initialPopulation: 40 } }, { caseCapFraction: 0.32 })).toBe(13);
    });
});

describe('the opening is dealt with stable picks', () => {
    it('buildOutbreak is a pure function of its seed', () => {
        for (const level of Object.values(levelOfEachKind())) {
            const { scenario } = levelRules(level);
            const mk = () => JSON.stringify(buildOutbreak({ scenario, population: scenario.populationRange[0] + 2, variant: level.variant || null, rng: mulberry32(77) }));
            expect(mk(), level.id).toBe(mk());
        }
    });

    it('a carrier has more contacts than anyone on every deal', () => {
        for (const level of LEVELS.filter((l) => l.variant && l.variant.type === 'superSpreader')) {
            for (const seed of [1, 2, 3]) {
                const deal = dealLevelCached(level, seed);
                const adj = adjacency(deal.nodes, deal.links);
                const carrier = deal.superSpreaderId;
                const mine = adj.get(carrier).size;
                for (const n of deal.nodes) if (n.id !== carrier) expect(adj.get(n.id).size, `${level.id} seed ${seed}`).toBeLessThan(mine);
                // A few more contacts than there are cuts on day 1: someone cannot be saved.
                expect(mine).toBeGreaterThan(deal.difficulty.dailyLimits.severLink);
            }
        }
    });

    it('placeSuperSpreader keeps its old behaviour without the new option', () => {
        const nodes = [0, 1, 2, 3, 4, 5, 6, 7].map((id) => person(id));
        const links = [{ source: 0, target: 1 }, { source: 1, target: 2 }];
        const carrier = placeSuperSpreader(nodes, links, { degree: 5 }, mulberry32(1));
        expect(adjacency(nodes, links).get(carrier.id).size).toBe(5);
    });

    it('seeds are 32 bit and repeatable', () => {
        expect(hashSeed('a')).toBe(hashSeed('a'));
        expect(hashSeed('a')).not.toBe(hashSeed('b'));
        expect(randomSeed(() => 0.5)).toBe(2147483648);
        const a = mulberry32(5);
        const b = mulberry32(5);
        expect([a(), a(), a()]).toEqual([b(), b(), b()]);
    });
});

describe('gentle mode, redefined honestly', () => {
    it('is one more use of every tool the level has and one more spare case', () => {
        expect(GENTLE).toEqual({ extraUses: 1, extraCap: 1 });
        const rules = rollLevelRules(LEVELS[14]);
        const gentle = applyGentle(rules);
        for (const [id, n] of Object.entries(rules.difficulty.dailyLimits)) expect(gentle.difficulty.dailyLimits[id]).toBe(n > 0 ? n + 1 : 0);
        expect(gentle.scenario.capSlack).toBe(rules.scenario.capSlack + 1);
        expect(gentle.difficulty.gentle).toBe(true);
        expect(rules.difficulty.gentle).toBeUndefined();
        expect(gentle.difficulty.transmissionMultiplier).toBe(rules.difficulty.transmissionMultiplier);
    });

    it('a gentle deal is the same web with the extra uses, a roomier cap, and a par worked out with them', () => {
        for (const level of [LEVELS[7], LEVELS[23], LEVELS[52]]) {
            for (const seed of [3, 4]) {
                const plain = dealLevelCached(level, seed);
                const gentle = dealLevelCached(level, seed, { meta: { gentle: true, upgrades: [] } });
                // Gentle mode never changes what is dealt.
                expect(JSON.stringify([gentle.nodes, gentle.links])).toBe(JSON.stringify([plain.nodes, plain.links]));
                for (const [id, n] of Object.entries(plain.difficulty.dailyLimits)) expect(gentle.difficulty.dailyLimits[id]).toBe(n > 0 ? n + 1 : 0);
                // The cap is the plain one plus a case: it does not follow par down.
                expect(gentle.caseCap).toBe(Math.min(plain.population, plain.caseCap + 1));
                expect(gentle.plainPar).toEqual({ cases: plain.par.cases, deaths: plain.par.deaths, days: plain.par.days });
                // Par with the extra uses is never worse, and can be reached.
                expect(gentle.par.cases).toBeLessThanOrEqual(plain.par.cases);
                const run = startDeal(gentle, tools);
                expect(run.state.stats.par.cases).toBe(gentle.par.cases);
            }
        }
    });

    it('gentle mode is kinder: over many deals the best play keeps more people well', () => {
        let plain = 0;
        let gentle = 0;
        for (const level of [LEVELS[7], LEVELS[23], LEVELS[52], LEVELS[71]]) {
            for (let seed = 1; seed <= 8; seed++) {
                const a = dealLevelCached(level, seed);
                const b = dealLevelCached(level, seed, { meta: { gentle: true, upgrades: [] } });
                expect(b.par.cases).toBeLessThanOrEqual(a.par.cases);
                plain += a.par.cases;
                gentle += b.par.cases;
            }
        }
        expect(gentle).toBeLessThan(plain);
    });
});

describe('upgrades', () => {
    it('Early warning is gone: Rapid response opens Quarantine a day earlier', () => {
        expect(UPGRADE_IDS).not.toContain('earlyWarning');
        expect(UPGRADE_IDS).toContain('rapidResponse');
        expect(UPGRADES.find((u) => u.id === 'rapidResponse').cost).toBe(200);
        const rules = rollLevelRules(LEVELS[0]);
        const day = (r) => r.difficulty.toolDays?.quarantine ?? 3;
        expect(day(rules)).toBe(3);
        expect(day(applyUpgradeRules(rules, ['rapidResponse']))).toBe(2);
        // Never to day 1: a carrier level (Quarantine on day 2) is left alone.
        const carrier = rollLevelRules(LEVELS[2]);
        expect(day(carrier)).toBe(2);
        expect(day(applyUpgradeRules(carrier, ['rapidResponse']))).toBe(2);
        // A level without Quarantine is left alone.
        const none = rollLevelRules(LEVELS.find((l) => !l.toolkit.tools.includes('quarantine')));
        expect(applyUpgradeRules(none, ['rapidResponse']).difficulty.toolDays?.quarantine).toBe(none.difficulty.toolDays?.quarantine);
    });

    it('a save that owns Early warning owns Rapid response after loading', () => {
        expect(UPGRADE_RENAMES).toEqual({ earlyWarning: 'rapidResponse' });
        const storage = createMemoryBackend();
        storage.setItem(SAVE_KEY, JSON.stringify({ version: 2, funding: 10, livesSaved: 0, levels: {}, powerups: {}, openedChests: [], upgrades: ['mentor', 'earlyWarning', 'rapidResponse'] }));
        expect(loadSave(storage).upgrades).toEqual(['mentor', 'rapidResponse']);
    });

    it('Extra ward is one more case under the cap', () => {
        const rules = rollLevelRules(LEVELS[20]);
        expect(applyUpgradeRules(rules, ['extraWard']).scenario.capSlack).toBe(rules.scenario.capSlack + 1);
        const plain = dealRules(LEVELS[20]);
        const owned = dealRules(LEVELS[20], { gentle: false, upgrades: ['extraWard'] });
        expect(owned.scenario.capSlack).toBe(plain.scenario.capSlack + 1);
    });

    it('Field training shows in the deal: one more cut on day 1, the same web, and par knows it', () => {
        const level = LEVELS[3];
        for (const seed of [2, 3, 4]) {
            const plainDeal = dealLevelCached(level, seed);
            const ownedDeal = dealLevelCached(level, seed, { meta: { gentle: false, upgrades: ['fieldTraining'] } });
            const plain = startDeal(plainDeal, tools);
            const owned = startDeal(ownedDeal, tools);
            expect(owned.state.dailyUsage.severLink).toBe(plain.state.dailyUsage.severLink - 1);
            // An upgrade never changes the web, and the cap stays where the plain level put it.
            expect(JSON.stringify(ownedDeal.links)).toBe(JSON.stringify(plainDeal.links));
            expect(ownedDeal.caseCap).toBe(plainDeal.caseCap);
            // The extra cut can only help the best play, and par is still reachable.
            expect(ownedDeal.par.cases).toBeLessThanOrEqual(plainDeal.par.cases);
            const again = solveRun(startDeal(ownedDeal, tools), { cap: Infinity });
            expect(again.cases).toBeLessThanOrEqual(plainDeal.par.cases);
        }
    });
});

describe('the Daily is the same for everyone', () => {
    it('the date deals one web with one par', () => {
        for (const date of ['2026-11-26', '2026-12-01', '2027-01-15']) {
            const a = dealLevelCached(dailyLevel(date), dailySeed(date));
            const b = dealLevelCached(dailyLevel(date), dailySeed(date), { nodeBudget: undefined });
            expect(JSON.stringify(b.links)).toBe(JSON.stringify(a.links));
            expect(b.par).toEqual(a.par);
            expect(a.par).toBeTruthy();
        }
    });

    it('the share text carries par', () => {
        const text = dailyShareText({ date: '2026-11-26', outcome: 'contained', days: 8, lost: 0, stars: 3, activeByDay: [1, 3, 2, 0], cases: 4, par: { cases: 4 } });
        expect(text.split('\n')[1]).toBe('par 4, you 4');
        expect(dailyShareText({ date: '2026-11-26', outcome: 'overwhelmed', days: 4, lost: 1, cases: 9, par: { cases: 4 } })).toContain('par 4, you 9');
        expect(dailyShareText({ date: '2026-11-26', outcome: 'contained', days: 8 })).not.toContain('par');
    });
});

describe('hold the line and the cap', () => {
    it('reaching the cap still loses, and holding out until help lands still wins', () => {
        const state = { day: 8, stats: { totalInfected: 6, totalDead: 0, initialPopulation: 20, totalProtected: 1, linksSevered: 1 }, envoyId: null };
        const net = { nodes: [person(0, 'infected'), person(1)], links: [{ source: 0, target: 1 }] };
        expect(checkGameOver(state, net, 30, 7, { type: 'holdLine', days: 7 })).toBe('contained');
        expect(checkGameOver({ ...state, day: 5 }, net, 30, 6, { type: 'holdLine', days: 7 })).toBe('overwhelmed');
    });
});
