// Round 57: after the deal, the same moves always give the same result.
// Recorded move lists are replayed twice on seeded levels of every variant
// and mechanic, and the full state histories are compared line by line.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dealLevel, startDeal, simpleDay } from '../src/sim/dealer.js';
import { replayMoves, snapshotLine } from '../src/sim/solver.js';
import { advanceDay } from '../src/sim/actions.js';
import { simulateSpread, updateOutcomes, resolveAftermath } from '../src/sim/engine.js';
import { BOTS } from '../src/sim/balance.js';
import { mulberry32 } from '../src/sim/rng.js';
import { levelOfEachKind, tools } from './round57-helpers.js';

// Play a deal with a seeded policy and record every move and every morning.
function record(deal, policy, seed) {
    const run = startDeal(deal, tools);
    run.trace = [];
    const rng = mulberry32(seed);
    const moves = [];
    const history = [];
    let result = null;
    for (let guard = 0; guard < 60 && !result; guard++) {
        run.trace.length = 0;
        const linksBefore = run.network.links.map((l) => ({ l, a: l.source, b: l.target }));
        const usedBefore = JSON.stringify(run.state.dailyUsage);
        if (policy === 'simple') {
            // simpleDay does not trace, so the moves are read off the web.
            const before = new Map(run.network.nodes.map((n) => [n.id, `${n.state}${n.masked ? 'm' : ''}${n.testedClear ? 't' : ''}`]));
            simpleDay(run, rng, tools);
            for (const { l, a, b } of linksBefore) if (!run.network.links.includes(l)) moves.push({ day: run.state.day, toolId: 'severLink', a: Math.min(a, b), b: Math.max(a, b) });
            for (const n of run.network.nodes) {
                const now = `${n.state}${n.masked ? 'm' : ''}${n.testedClear ? 't' : ''}`;
                if (before.get(n.id) !== now) moves.push({ day: run.state.day, changed: n.id, to: now });
            }
        } else {
            BOTS[policy](run, rng);
            for (const m of run.trace) moves.push(m.link ? { day: run.state.day, toolId: 'severLink', a: m.link.source, b: m.link.target } : { day: run.state.day, toolId: m.toolId, node: m.node.id });
        }
        history.push(`${snapshotLine(run.state, run.network)} | used ${usedBefore}>${JSON.stringify(run.state.dailyUsage)}`);
        result = advanceDay(run.state, run.network, { scenario: run.scenario, difficulty: run.difficulty }).result;
    }
    history.push(snapshotLine(run.state, run.network));
    return { moves, history, result, stats: JSON.stringify(run.state.stats) };
}

describe('same moves, same history', () => {
    const kinds = levelOfEachKind();
    for (const [kind, level] of Object.entries(kinds)) {
        it(`${kind} (${level.id}): the solver's line replays to the same history twice`, () => {
            for (const seed of [11, 12, 13]) {
                const deal = dealLevel(level, seed);
                const a = replayMoves(deal, deal.par.moves, { keepHistory: true });
                const b = replayMoves(deal, deal.par.moves, { keepHistory: true });
                expect(a.history.length).toBeGreaterThan(1);
                expect(b.history).toEqual(a.history);
                expect(JSON.stringify(b.stats)).toBe(JSON.stringify(a.stats));
            }
        });

        it(`${kind} (${level.id}): bot plays recorded once replay move for move`, () => {
            for (const policy of ['smart', 'beginner', 'simple']) {
                const deal = dealLevel(level, 21);
                const first = record(deal, policy, 5);
                const second = record(deal, policy, 5);
                expect(second.moves, policy).toEqual(first.moves);
                expect(second.history, policy).toEqual(first.history);
                expect(second.result).toBe(first.result);
                expect(second.stats).toBe(first.stats);
                // A recorded list of solver style moves, played back with no
                // policy at all, gives the very same mornings.
                if (policy !== 'simple') {
                    const again = replayMoves(deal, first.moves, { keepHistory: true });
                    expect(again.valid).toBe(true);
                    expect(again.history.map((h) => h.split(' | used')[0])).toEqual(first.history.map((h) => h.split(' | used')[0]));
                    expect(again.outcome).toBe(first.result);
                }
            }
        });
    }

    it('covers every variant and every later mechanic', () => {
        for (const [kind, level] of Object.entries(kinds)) expect(level, kind).toBeTruthy();
        expect(kinds.masks.mechanics.id).toBe('masks');
        expect(kinds.travellers.mechanics.id).toBe('travellers');
        expect(kinds.incubation.mechanics.id).toBe('incubation');
    });
});

describe('the night rolls no dice', () => {
    const web = () => ({
        nodes: [0, 1, 2, 3, 4].map((id) => ({ id, state: id === 0 ? 'infected' : 'healthy', daysInfected: 0, removed: false })),
        links: [{ source: 0, target: 1 }, { source: 0, target: 2 }, { source: 2, target: 3 }, { source: 3, target: 4 }],
    });
    const stats = () => ({ stats: { totalInfected: 1, totalDead: 0, totalRecovered: 0 } });

    it('every healthy contact of a sick person is sick the next morning', () => {
        const net = web();
        const state = stats();
        const out = simulateSpread(state, net);
        expect(net.nodes.map((n) => n.state)).toEqual(['infected', 'infected', 'infected', 'healthy', 'healthy']);
        expect(out.count).toBe(2);
        expect(state.stats.totalInfected).toBe(3);
        // People who caught it tonight do not pass it on until tomorrow night.
        simulateSpread(state, net);
        expect(net.nodes[3].state).toBe('infected');
        expect(net.nodes[4].state).toBe('healthy');
    });

    it('a dice function that always says no changes nothing', () => {
        const a = web();
        const b = web();
        simulateSpread(stats(), a, 0, () => 0.999999);
        simulateSpread(stats(), b, 1, () => 0);
        expect(a.nodes.map((n) => n.state)).toEqual(b.nodes.map((n) => n.state));
    });

    it('nobody without the heart mark dies, and a frail person in a ward recovers', () => {
        const net = {
            nodes: [
                { id: 0, state: 'infected', daysInfected: 3, removed: false },
                { id: 1, state: 'infected', daysInfected: 3, removed: false, frail: true },
                { id: 2, state: 'quarantined', sickWhileQuarantined: true, daysInfected: 5, removed: false, frail: true },
                { id: 3, state: 'infected', daysInfected: 2, removed: false, frail: true },
            ],
            links: [],
        };
        const state = stats();
        const outcomes = updateOutcomes(state, net, 5, 0.99, () => 0);
        expect(outcomes.map((o) => `${o.node.id}:${o.outcome}`)).toEqual(['1:died', '2:recovered']);
        expect(state.stats.totalDead).toBe(1);
        // The frail person on their second night is still alive, and can still be saved.
        expect(net.nodes.find((n) => n.id === 3).state).toBe('infected');
    });

    it('a lost level settles the sick by the same rule', () => {
        const net = { nodes: [{ id: 0, state: 'infected', daysInfected: 1 }, { id: 1, state: 'infected', daysInfected: 1, frail: true }, { id: 2, state: 'quarantined', sickWhileQuarantined: true, frail: true }], links: [] };
        const state = stats();
        expect(resolveAftermath(state, net).map((o) => o.outcome)).toEqual(['recovered', 'died', 'recovered']);
        expect(resolveAftermath(state, net)).toEqual([]);
    });

    it('nothing in the sim reads Math.random after the deal', () => {
        for (const file of ['engine.js', 'actions.js', 'mechanics.js', 'fatality.js', 'solver.js', 'hint.js', 'undo.js', 'counterfactual.js']) {
            const src = readFileSync(new URL(`../src/sim/${file}`, import.meta.url), 'utf8');
            // Dealing helpers (placing carriers and travellers) take an rng argument; nothing calls Math.random().
            expect(src.includes('Math.random()'), file).toBe(false);
        }
        const actions = readFileSync(new URL('../src/sim/actions.js', import.meta.url), 'utf8');
        expect(actions).not.toMatch(/rng\(/);
    });
});
