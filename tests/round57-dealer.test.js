// Round 57: the dealer only deals good puzzles, and par can always be
// reached. Every level of the campaign is dealt on several seeds.
import { describe, it, expect } from 'vitest';
import { LEVELS } from '../src/config/levels.js';
import { dealLevel, dealLevelCached, createDealer, simplePlay, reachesPar, startDeal, candidateSeed, decisionDays, DEAL_RULES } from '../src/sim/dealer.js';
import { replayMoves, solveDeal } from '../src/sim/solver.js';
import { puzzleSpecFor, simpleHitsAllowed, SIMPLE_PLAYS, TUTORIAL_LEVEL_ID, PLANET_PUZZLE } from '../src/config/puzzle-specs.js';
import { calculateStars } from '../src/progress.js';
import { advanceDay } from '../src/sim/actions.js';
import { tools } from './round57-helpers.js';

const SEEDS = [101, 102, 103, 104, 105, 106];
const DEALS = new Map(LEVELS.map((level) => [level.id, SEEDS.map((seed) => dealLevelCached(level, seed))]));
const allDeals = () => LEVELS.flatMap((level) => DEALS.get(level.id).map((deal) => ({ level, deal })));

describe('par is achievable by construction', () => {
    it('every deal of every level has a par, and no deal is unwinnable', () => {
        for (const { level, deal } of allDeals()) {
            expect(deal.par, `${level.id} seed ${deal.dealSeed}`).toBeTruthy();
            expect(deal.info.verdict).not.toBe('unwinnable');
        }
    });

    it("replaying the solver's move list through the public action functions reproduces par", () => {
        for (const { level, deal } of allDeals()) {
            const played = replayMoves(deal, deal.par.moves);
            const tag = `${level.id} seed ${deal.dealSeed}`;
            expect(played.valid, tag).toBe(true);
            expect(played.outcome, tag).toBe('contained');
            expect({ cases: played.cases, deaths: played.deaths, days: played.days }, tag).toEqual({ cases: deal.par.cases, deaths: deal.par.deaths, days: deal.par.days });
            expect(deal.info.mismatch, tag).toBe(false);
        }
    });

    it('3 stars is reachable on every level: the par line earns it, under the real case cap', () => {
        for (const { level, deal } of allDeals()) {
            const played = replayMoves(deal, deal.par.moves);
            expect(calculateStars(played.outcome, played.stats, level), `${level.id} seed ${deal.dealSeed}`).toBe(3);
            expect(deal.caseCap).toBeGreaterThan(deal.par.cases);
            expect(deal.caseCap).toBeLessThanOrEqual(deal.population);
        }
    });

    it('3 stars is never reached by doing nothing', () => {
        for (const { level, deal } of allDeals()) {
            const run = startDeal(deal, tools);
            let result = null;
            for (let guard = 0; guard < 60 && !result; guard++) result = advanceDay(run.state, run.network, run).result;
            expect(result, `${level.id} seed ${deal.dealSeed}`).not.toBe('contained');
            expect(calculateStars(result, run.state.stats, level)).toBe(0);
        }
    });
});

describe('the dealer never deals a bad puzzle', () => {
    it('outside the tutorial, day 1 can never deal with everything at risk', () => {
        for (const { level, deal } of allDeals()) {
            if (level.id === TUTORIAL_LEVEL_ID) continue;
            // depth: mornings on which the best play still faces a red line.
            // 1 would be the "3 red lines, 3 cuts" case.
            expect(deal.info.depth, `${level.id} seed ${deal.dealSeed}`).toBeGreaterThanOrEqual(2);
            expect(decisionDays(deal, deal.par.moves)).toBe(deal.info.depth);
        }
    });

    it('accepted deals meet their level spec: depth, share of people kept well, simple play', () => {
        for (const { level, deal } of allDeals()) {
            if (!deal.info.accepted || level.id === TUTORIAL_LEVEL_ID) continue;
            const spec = puzzleSpecFor(level);
            const tag = `${level.id} seed ${deal.dealSeed}`;
            expect(deal.info.depth, tag).toBeGreaterThanOrEqual(spec.minDepth);
            expect(deal.par.cases, tag).toBeLessThanOrEqual(spec.maxParShare * deal.population);
            expect(deal.info.simpleHits, tag).toBeLessThanOrEqual(simpleHitsAllowed(spec.missRate));
        }
    });

    it('nearly every deal is an accepted one (the fallback is rare)', () => {
        const all = allDeals();
        const fallbacks = all.filter(({ deal }) => !deal.info.accepted);
        expect(fallbacks.length / all.length).toBeLessThanOrEqual(0.05);
    });

    it('simple greedy play misses 3 stars at least as often as the level spec requires', () => {
        // Fresh simple plays (other seeds than the dealer judged with), pooled
        // per planet so the sample is large enough to compare with the spec.
        for (let planet = 0; planet < PLANET_PUZZLE.length; planet++) {
            let plays = 0;
            let hits = 0;
            for (const { level, deal } of allDeals()) {
                if (level.planetIndex !== planet || level.id === TUTORIAL_LEVEL_ID) continue;
                for (let k = 0; k < 4; k++) {
                    plays++;
                    if (reachesPar(simplePlay(deal, candidateSeed(deal.dealSeed, 500 + k)), deal.par)) hits++;
                }
            }
            const missRate = 1 - hits / plays;
            // The dealer allows floor((1 - missRate) * 6) hits in 6 tries per
            // deal, so the pooled rate has to clear the spec less a little noise.
            expect(missRate, `planet ${planet}`).toBeGreaterThanOrEqual(PLANET_PUZZLE[planet].missRate - 0.08);
        }
    });

    it('the miss rate the spec asks for never falls along the campaign', () => {
        for (let p = 1; p < PLANET_PUZZLE.length; p++) {
            expect(PLANET_PUZZLE[p].missRate).toBeGreaterThanOrEqual(PLANET_PUZZLE[p - 1].missRate);
            expect(PLANET_PUZZLE[p].minDepth).toBeGreaterThanOrEqual(PLANET_PUZZLE[p - 1].minDepth);
            expect(PLANET_PUZZLE[p].capSlack).toBeLessThanOrEqual(PLANET_PUZZLE[p - 1].capSlack);
        }
        expect(simpleHitsAllowed(0.5)).toBe(3);
        expect(simpleHitsAllowed(0.83)).toBe(1);
        expect(SIMPLE_PLAYS).toBe(6);
    });

    it('the tutorial is solved by simply cutting red lines, in any order, without Quarantine', () => {
        const level = LEVELS[0];
        expect(level.id).toBe(TUTORIAL_LEVEL_ID);
        for (let seed = 1; seed <= 25; seed++) {
            const deal = dealLevelCached(level, seed);
            expect(deal.info.accepted, `seed ${seed}`).toBe(true);
            expect(deal.initialCases).toBe(1);
            for (let k = 0; k < 6; k++) {
                const played = simplePlay(deal, seed * 31 + k, { only: ['severLink'] });
                expect(played.outcome, `seed ${seed} play ${k}`).toBe('contained');
                expect(reachesPar(played, deal.par), `seed ${seed} play ${k}`).toBe(true);
            }
            // The best line itself never needs Quarantine either.
            expect(deal.par.moves.some((m) => m.toolId === 'quarantine' && m.day < 3)).toBe(false);
        }
    });

    it('hidden carrier levels are only dealt when day 1 tests can settle who carries it', () => {
        for (const { level, deal } of allDeals()) {
            if (!level.mechanics || level.mechanics.id !== 'incubation') continue;
            const tag = `${level.id} seed ${deal.dealSeed}`;
            expect(deal.carrierCount, tag).toBe(2);
            const first = deal.nodes.find((n) => n.state === 'infected');
            const contacts = deal.links.filter((l) => l.source === first.id || l.target === first.id).length;
            expect(contacts - 1, tag).toBeLessThanOrEqual(deal.difficulty.dailyLimits.test);
            const carriers = deal.nodes.filter((n) => n.incubating != null);
            for (const c of carriers) expect(deal.links.some((l) => (l.source === first.id && l.target === c.id) || (l.target === first.id && l.source === c.id)), tag).toBe(true);
            expect(deal.par.moves[0].toolId).toBe('test');
        }
    });
});

describe('a new web on every replay, the same web on a retry', () => {
    const level = LEVELS[12];

    it('the same seed deals the same web, par and cap', () => {
        const a = dealLevel(level, 4242);
        const b = dealLevel(level, 4242);
        expect(JSON.stringify(b)).toBe(JSON.stringify(a));
    });

    it('another seed deals another web', () => {
        const webs = new Set();
        for (let seed = 1; seed <= 12; seed++) {
            const d = dealLevel(level, seed);
            webs.add(JSON.stringify([d.nodes.map((n) => n.state), d.links]));
        }
        expect(webs.size).toBe(12);
    });

    it('opening a deal twice gives two separate, equal games', () => {
        const deal = dealLevel(level, 7);
        const a = startDeal(deal, tools);
        const b = startDeal(deal, tools);
        expect(a.network).not.toBe(b.network);
        expect(JSON.stringify(a.network)).toBe(JSON.stringify(b.network));
        a.network.nodes[0].state = 'vaccinated';
        a.network.links.pop();
        expect(startDeal(deal, tools).network.links.length).toBe(deal.links.length);
        expect(deal.nodes[0].state).not.toBe('vaccinated');
        expect(a.state.stats.par).toEqual({ cases: deal.par.cases, deaths: deal.par.deaths, days: deal.par.days });
    });

    it('a deal is plain data: it survives JSON', () => {
        const deal = dealLevel(level, 9);
        const copy = JSON.parse(JSON.stringify(deal));
        const played = replayMoves(copy, copy.par.moves);
        expect(played).toMatchObject({ valid: true, outcome: 'contained', cases: deal.par.cases });
    });
});

describe('the time budget', () => {
    it('the solver never spends more than its node budget on a candidate', () => {
        for (const { level, deal } of allDeals()) expect(deal.info.nodes, level.id).toBeLessThanOrEqual(DEAL_RULES.nodeBudget + 1);
    });

    it('a dealer can be stepped one candidate at a time and settled early', () => {
        const level = LEVELS.at(-1);
        const dealer = createDealer(level, 77);
        expect(dealer.deal).toBe(null);
        dealer.step();
        expect(dealer.tries).toBe(1);
        const deal = dealer.finish();
        expect(deal).toBeTruthy();
        expect(deal.par).toBeTruthy();
        expect(dealer.step()).toBe(true); // nothing more to do
        expect(deal.info.tries).toBeLessThanOrEqual(DEAL_RULES.maxCandidates);
    });

    it('dealing is fast enough for a phone: the biggest levels deal in well under the budget here', () => {
        // Node on a desktop is about 5 times faster than a mid-range phone, so
        // 80 ms here is the 400 ms hard budget there. Measured on fresh seeds.
        const biggest = LEVELS.filter((l) => l.population[1] >= 28);
        expect(biggest.length).toBeGreaterThan(3);
        const times = [];
        for (const level of biggest) {
            for (let seed = 900; seed < 906; seed++) {
                const t0 = performance.now();
                const deal = dealLevel(level, seed);
                times.push(performance.now() - t0);
                expect(deal.population).toBeLessThanOrEqual(32);
            }
        }
        times.sort((a, b) => a - b);
        const median = times[Math.floor(times.length / 2)];
        expect(median).toBeLessThan(30);
        // Generous: test machines are noisy. The report has the real numbers.
        expect(times.at(-1)).toBeLessThan(1500);
    });

    it('one solve of the largest web (32 people) is quick', () => {
        const level = LEVELS.at(-1);
        let worst = 0;
        for (let seed = 1; seed <= 10; seed++) {
            const deal = dealLevelCached(level, seed);
            const t0 = performance.now();
            const sol = solveDeal(deal);
            worst = Math.max(worst, performance.now() - t0);
            expect(sol.cases).toBe(deal.par.cases);
        }
        expect(worst).toBeLessThan(400);
    });
});
