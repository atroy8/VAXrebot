// Round 57: the solver finds the best play, and par can always be reached.
import { describe, it, expect } from 'vitest';
import { solveDeal, solveRun, replayMoves, instantiate, compile, search, testPrefix, DEFAULT_NODE_BUDGET } from '../src/sim/solver.js';
import { simplePlay, reachesPar } from '../src/sim/dealer.js';
import { handDeal } from './round57-helpers.js';

const cuts = (moves, day = null) => moves.filter((m) => m.toolId === 'severLink' && (day == null || m.day === day)).map((m) => `${m.a}-${m.b}`);

describe('known optimum on small hand-built webs', () => {
    it('a chain: one cut next to the first case stops it at 1 case', () => {
        const deal = handDeal({ n: 4, lines: [[0, 1], [1, 2], [2, 3]] });
        const sol = solveDeal(deal);
        expect(sol).toMatchObject({ found: true, cases: 1, deaths: 0, exact: true, mismatch: false });
        expect(cuts(sol.moves)).toEqual(['0-1']);
    });

    it('a star with 3 contacts and 2 cuts a day: one person cannot be saved', () => {
        const deal = handDeal({ n: 4, lines: [[0, 1], [0, 2], [0, 3]], limits: { severLink: 2 } });
        expect(solveDeal(deal)).toMatchObject({ found: true, cases: 2, exact: true });
    });

    it('isolating the sick person closes every line at once', () => {
        const deal = handDeal({ n: 4, lines: [[0, 1], [0, 2], [0, 3]], limits: { quarantine: 1 } });
        const sol = solveDeal(deal);
        expect(sol.cases).toBe(1);
        expect(sol.moves).toEqual([{ day: 1, toolId: 'quarantine', node: 0 }]);
    });

    it('one dose does the work of two cuts on a person with two red lines', () => {
        // 0 and 1 are sick, both touch 2; 2 leads on to 3 and 4.
        const deal = handDeal({ n: 5, sick: [0, 1], lines: [[0, 2], [1, 2], [2, 3], [2, 4]], limits: { severLink: 1, vaccinate: 1 } });
        const sol = solveDeal(deal);
        expect(sol.cases).toBe(2);
        expect(sol.moves.some((m) => m.toolId === 'vaccinate' && m.node === 2)).toBe(true);
    });

    // The case from the brief. The first case (0) touches 1, 2 and 3. All
    // three touch the hub 4, and the hub is the only way into three groups
    // (4-5, 4-8 and 4-11, each leading to two more people). One cut a day.
    // Cutting a red line is wasted: whoever is saved on day 1 catches it from
    // the hub two nights later, and by then a bridge is still open. The best
    // play never touches a red line. It cuts the three bridges, two of them
    // before the outbreak has even reached the hub.
    const bridgeWeb = () =>
        handDeal({
            n: 14,
            lines: [[0, 1], [0, 2], [0, 3], [1, 4], [2, 4], [3, 4], [4, 5], [4, 8], [4, 11], [5, 6], [5, 7], [8, 9], [8, 10], [11, 12], [11, 13]],
            limits: { severLink: 1 },
        });

    it('cutting the nearest red line is wrong and cutting the bridge is right', () => {
        const deal = bridgeWeb();
        const sol = solveDeal(deal);
        expect(sol).toMatchObject({ found: true, cases: 5, exact: true, mismatch: false });
        // Every cut is a bridge, and the first two are made on days 1 and 2,
        // when no bridge is red yet.
        expect(cuts(sol.moves).sort()).toEqual(['4-11', '4-5', '4-8']);
        expect(cuts(sol.moves, 1)).toHaveLength(1);
        expect(cuts(sol.moves, 2)).toHaveLength(1);
        expect(cuts(sol.moves).some((c) => c.startsWith('0-'))).toBe(false);
    });

    it('on that web, every play that only taps red lines does worse', () => {
        const deal = bridgeWeb();
        const par = solveDeal(deal);
        for (let seed = 1; seed <= 12; seed++) {
            const played = simplePlay(deal, seed);
            expect(played.cases, `seed ${seed}`).toBeGreaterThan(par.cases);
            expect(reachesPar(played, par)).toBe(false);
        }
    });

    it('a mask buys the night that makes a second cut possible', () => {
        // The first case touches 1 and 2. One cut a day: without a mask one of
        // them falls sick. Masking the sick person delays both lines a night.
        const lines = [[0, 1], [0, 2], [1, 3], [2, 4]];
        expect(solveDeal(handDeal({ n: 5, lines, limits: { severLink: 1 } })).cases).toBe(2);
        const sol = solveDeal(handDeal({ n: 5, lines, limits: { severLink: 1, mask: 1 } }));
        expect(sol).toMatchObject({ found: true, cases: 1, mismatch: false });
        expect(sol.moves.some((m) => m.toolId === 'mask')).toBe(true);
    });

    it('between two plays with the same cases it keeps the frail person well', () => {
        // One cut, two contacts, no wards: someone falls sick either way.
        const deal = handDeal({ n: 3, lines: [[0, 1], [0, 2]], frail: [2], limits: { severLink: 1 } });
        const sol = solveDeal(deal);
        expect(sol).toMatchObject({ cases: 2, deaths: 0 });
        expect(cuts(sol.moves)).toEqual(['0-2']);
    });

    it('puts a sick frail person into a ward in time', () => {
        // Both contacts are frail and there is one cut: one falls sick on
        // night 1 and is saved by the ward that opens on day 3.
        const deal = handDeal({ n: 3, lines: [[0, 1], [0, 2]], frail: [1, 2], limits: { severLink: 1, quarantine: 1 }, days: { quarantine: 3 } });
        const sol = solveDeal(deal);
        expect(sol).toMatchObject({ cases: 2, deaths: 0, mismatch: false });
        expect(sol.moves.some((m) => m.toolId === 'quarantine' && m.day === 3)).toBe(true);
    });

    it('never cuts a line of the place that must stay open', () => {
        // 0 is sick next to the hub 1; the only way to keep 2 and 3 well is to
        // cut behind the hub, which is not allowed, so the hub's lines stay.
        const deal = handDeal({ n: 5, lines: [[0, 1], [0, 4], [1, 2], [1, 3]], hub: 1, limits: { severLink: 2 } });
        const sol = solveDeal(deal);
        expect(sol.found).toBe(true);
        expect(cuts(sol.moves).every((c) => !c.split('-').includes('1'))).toBe(true);
        expect(sol.mismatch).toBe(false);
    });

    it('says so when the Envoy cannot be saved', () => {
        const deal = handDeal({ n: 3, lines: [[0, 1], [1, 2]], envoy: 1, limits: { vaccinate: 1 }, days: { vaccinate: 2 } });
        expect(solveDeal(deal).found).toBe(false);
    });

    it('hold the line: the count that matters is the one when help lands', () => {
        const deal = handDeal({ n: 6, lines: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5]], limits: { severLink: 1 }, goal: { type: 'holdLine', days: 3 }, days: { severLink: 2 } });
        const sol = solveDeal(deal);
        // Day 1 has no tool, so 1 falls sick; the cut on day 2 ends it.
        expect(sol).toMatchObject({ found: true, cases: 2, mismatch: false });
    });
});

describe('travellers are part of the plan', () => {
    it('the solver sees where a traveller goes tonight', () => {
        // 0 is sick with one contact, the traveller 1, whose route leads to 3.
        // One cut a day: cutting 0-1 on day 1 ends it at 1 case.
        const deal = handDeal({ n: 5, lines: [[0, 1], [1, 2], [3, 4]], limits: { severLink: 1 }, travellers: [{ id: 1, route: [3, 4, 2, 0] }] });
        const sol = solveDeal(deal);
        expect(sol).toMatchObject({ found: true, cases: 1, mismatch: false });
    });
});

describe('hidden carriers: the solver only knows what tests can show', () => {
    const web = () => {
        // 0 is sick; 1, 2 and 3 are its contacts and 2 carries it unseen.
        // The carrier touches 4, 5 and 6. Two cuts and one ward a day.
        const deal = handDeal({ n: 8, lines: [[0, 1], [0, 2], [0, 3], [2, 4], [2, 5], [2, 6], [6, 7]], limits: { severLink: 2, test: 2, quarantine: 1 } });
        deal.nodes[2].incubating = 2;
        deal.carrierCount = 1;
        return deal;
    };

    it('its plan opens with tests in id order and stops when the carrier is certain', () => {
        const run = instantiate(web());
        // Contact 1 tests clear, contact 2 tests positive: 3 need not be tested.
        expect(testPrefix(run)).toEqual({ tests: [1, 2], certain: true });
        const sol = solveRun(run);
        expect(sol.moves.slice(0, 2)).toEqual([{ day: 1, toolId: 'test', node: 1 }, { day: 1, toolId: 'test', node: 2 }]);
    });

    it('isolates the carrier only after a test has found them', () => {
        const sol = solveDeal(web());
        expect(sol).toMatchObject({ found: true, mismatch: false });
        const order = sol.moves.filter((m) => m.day === 1).map((m) => `${m.toolId}:${m.node ?? ''}`);
        // The only best play: isolate the carrier (three lines at once) and
        // cut the sick person's two other lines.
        expect(order.indexOf('quarantine:2')).toBeGreaterThan(order.indexOf('test:2'));
        // The sick person and the carrier are cases; everyone else is kept well.
        expect(sol.cases).toBe(2);
    });

    it('without enough tests to be certain it plans on what can be seen', () => {
        const deal = web();
        deal.difficulty.dailyLimits.test = 0;
        deal.difficulty.toolkit = ['severLink', 'quarantine'];
        const run = instantiate(deal);
        expect(testPrefix(run).certain).toBe(false);
        // The compact copy of the game shows the carrier as the healthy person they look like.
        const { s } = compile(run, undefined, { visibleOnly: true });
        expect(s.st[2]).toBe(0);
        const truth = compile(run).s;
        expect(truth.st[2]).not.toBe(0);
    });
});

describe('the search itself', () => {
    it('respects its node budget and says when it was not exhaustive', () => {
        // A dense web with a wide front: far too big to finish in 20 nodes.
        const lines = [];
        for (let a = 0; a < 24; a++) for (const d of [1, 2, 5, 7]) lines.push([a, (a + d) % 24]);
        const deal = handDeal({ n: 24, sick: [0, 12], lines, limits: { severLink: 2, vaccinate: 1 } });
        const run = instantiate(deal);
        const { P, s } = compile(run, undefined, { cap: Infinity });
        const small = search(P, s, { nodeBudget: 20 });
        expect(small.nodes).toBeLessThanOrEqual(21);
        expect(small.exact).toBe(false);
        expect(small.found).toBe(true);
        // More budget never gives a worse line.
        const big = search(P, s, { nodeBudget: DEFAULT_NODE_BUDGET });
        expect(big.cases).toBeLessThanOrEqual(small.cases);
    });

    it('a line it returns is played by the real game to the same result', () => {
        const lines = [];
        for (let a = 0; a < 16; a++) for (const d of [1, 3]) lines.push([a, (a + d) % 16]);
        const deal = handDeal({ n: 16, sick: [0], frail: [5, 9], lines, limits: { severLink: 2, vaccinate: 1, quarantine: 1 }, days: { vaccinate: 2, quarantine: 3 } });
        const sol = solveDeal(deal);
        const played = replayMoves(deal, sol.moves);
        expect(played).toMatchObject({ valid: true, outcome: 'contained', cases: sol.cases, deaths: sol.deaths, days: sol.days });
    });

    it('does not change the deal it is given', () => {
        const deal = handDeal({ n: 4, lines: [[0, 1], [1, 2], [2, 3]] });
        const before = JSON.stringify(deal);
        solveDeal(deal);
        expect(JSON.stringify(deal)).toBe(before);
    });
});
