// Round 57: a hint is a move on the solver's best line from the state as it
// stands, and following hints to the end reaches par.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { chooseMove, hintLine, moveReason, HINT_NODE_BUDGET, NO_HINT_LINE } from '../src/sim/hint.js';
import { solveRun, solveDeal, instantiate, applyMove } from '../src/sim/solver.js';
import { dealLevelCached, startDeal } from '../src/sim/dealer.js';
import { applyNodeTool, severLink, advanceDay } from '../src/sim/actions.js';
import { LEVELS } from '../src/config/levels.js';
import { handDeal, levelOfEachKind, tools } from './round57-helpers.js';

const idOf = (ref) => (ref && typeof ref === 'object' ? ref.id : ref);

function sameMove(hint, m) {
    if (hint.toolId !== m.toolId) return false;
    if (hint.link) {
        const a = idOf(hint.link.source);
        const b = idOf(hint.link.target);
        return (a === m.a && b === m.b) || (a === m.b && b === m.a);
    }
    return hint.node.id === m.node;
}

// Play a run by always doing what the hint says. Returns the final result.
function followHints(deal) {
    const run = startDeal(deal, tools);
    let result = null;
    for (let guard = 0; guard < 60 && !result; guard++) {
        for (let moves = 0; moves < 40; moves++) {
            const hint = chooseMove(run.state, run.network, tools, run.difficulty, run.scenario);
            if (!hint) break;
            if (hint.link) severLink(run.state, run.network, hint.link);
            else applyNodeTool(run.state, tools, hint.toolId, hint.node);
        }
        result = advanceDay(run.state, run.network, run).result;
    }
    return { outcome: result, cases: run.state.stats.totalInfected, deaths: run.state.stats.totalDead };
}

describe('a hint is a move on the best line', () => {
    it("is the first move of today on the solver's line from here", () => {
        for (const level of [LEVELS[0], LEVELS[3], LEVELS[11], LEVELS[24]]) {
            for (const seed of [1, 2, 3]) {
                const run = startDeal(dealLevelCached(level, seed), tools);
                let line = solveRun(run, { nodeBudget: HINT_NODE_BUDGET });
                if (!line.found) line = solveRun(run, { nodeBudget: HINT_NODE_BUDGET, cap: Infinity });
                const hint = chooseMove(run.state, run.network, tools, run.difficulty, run.scenario);
                expect(hint, `${level.id} seed ${seed}`).toBeTruthy();
                expect(line.moves.filter((m) => m.day === 1).some((m) => sameMove(hint, m)), `${level.id} seed ${seed}`).toBe(true);
                expect(hint.line).toEqual({ cases: line.cases, deaths: line.deaths, days: line.days });
            }
        }
    });

    it('on the bridge web the hint is the bridge, not a red line', () => {
        const deal = handDeal({
            n: 14,
            lines: [[0, 1], [0, 2], [0, 3], [1, 4], [2, 4], [3, 4], [4, 5], [4, 8], [4, 11], [5, 6], [5, 7], [8, 9], [8, 10], [11, 12], [11, 13]],
            limits: { severLink: 1 },
        });
        const run = instantiate(deal);
        const hint = chooseMove(run.state, run.network, tools, run.difficulty, run.scenario);
        expect(hint.toolId).toBe('severLink');
        expect([idOf(hint.link.source), idOf(hint.link.target)]).toContain(4);
        expect(hint.reason).toBe('bridge');
        expect(hintLine(hint)).toMatch(/way into the next group/);
    });

    it('changes nothing', () => {
        const run = startDeal(dealLevelCached(LEVELS[5], 4), tools);
        const before = JSON.stringify([run.state.stats, run.state.dailyUsage, run.network]);
        chooseMove(run.state, run.network, tools, run.difficulty, run.scenario);
        expect(JSON.stringify([run.state.stats, run.state.dailyUsage, run.network])).toBe(before);
    });

    it('is always a legal move, and stops when the day is used up', () => {
        const run = startDeal(dealLevelCached(LEVELS[1], 6), tools);
        for (let k = 0; k < 20; k++) {
            const hint = chooseMove(run.state, run.network, tools, run.difficulty, run.scenario);
            if (!hint) break;
            const move = hint.link ? { toolId: 'severLink', a: idOf(hint.link.source), b: idOf(hint.link.target) } : { toolId: hint.toolId, node: hint.node.id };
            expect(applyMove(run, move, tools)).toBe(true);
        }
        expect(chooseMove(run.state, run.network, tools, run.difficulty, run.scenario)).toBe(null);
        expect(NO_HINT_LINE).toMatch(/Next day/);
    });

    it('following the hints from the first morning to the end reaches par', () => {
        const kinds = levelOfEachKind();
        for (const kind of ['tutorial', 'plain', 'noVaccines', 'noQuarantine', 'envoy', 'masks', 'holdLine', 'incubation']) {
            const level = kinds[kind];
            for (const seed of [31, 32]) {
                const deal = dealLevelCached(level, seed);
                // Par itself was found with the dealer's budget; a hint has a
                // smaller one, so compare where the two searches are exhaustive.
                if (!solveDeal(deal, { nodeBudget: HINT_NODE_BUDGET }).exact) continue;
                const played = followHints(deal);
                expect(played.outcome, `${kind} seed ${seed}`).toBe('contained');
                expect(played.cases, `${kind} seed ${seed}`).toBeLessThanOrEqual(deal.par.cases);
            }
        }
    });

    it('on a level with hidden carriers the first hints are tests, never the carrier', () => {
        const level = levelOfEachKind().incubation;
        for (const seed of [1, 2, 3, 4]) {
            const run = startDeal(dealLevelCached(level, seed), tools);
            const hint = chooseMove(run.state, run.network, tools, run.difficulty, run.scenario);
            expect(hint.toolId, `seed ${seed}`).toBe('test');
            expect(hint.reason).toBe('test');
            // The person to test is a contact of the sick person: something the player can see.
            const sick = run.network.nodes.find((n) => n.state === 'infected');
            expect(run.network.links.some((l) => (l.source === sick.id && l.target === hint.node.id) || (l.target === sick.id && l.source === hint.node.id))).toBe(true);
        }
    });

    it('when the cap cannot be held any more it still points at the move that keeps most people well', () => {
        const deal = handDeal({ n: 6, lines: [[0, 1], [0, 2], [0, 3], [1, 4], [2, 5]], limits: { severLink: 1 } });
        const run = instantiate({ ...deal, scenario: { ...deal.scenario, caseCap: 2 } });
        const hint = chooseMove(run.state, run.network, tools, run.difficulty, run.scenario);
        expect(hint).toBeTruthy();
        expect(hint.toolId).toBe('severLink');
    });

    it('names why: a red line, a sick person, a frail person, someone next in line', () => {
        const nodes = [
            { id: 0, state: 'infected' },
            { id: 1, state: 'healthy' },
            { id: 2, state: 'healthy' },
            { id: 3, state: 'infected', frail: true },
        ];
        const links = [{ source: 0, target: 1 }, { source: 1, target: 2 }];
        const net = { nodes, links };
        expect(moveReason({ toolId: 'severLink', link: links[0] }, net)).toBe('cut');
        expect(moveReason({ toolId: 'severLink', link: links[1] }, net)).toBe('bridge');
        expect(moveReason({ toolId: 'quarantine', node: nodes[0] }, net)).toBe('isolate');
        expect(moveReason({ toolId: 'quarantine', node: nodes[3] }, net)).toBe('care');
        expect(moveReason({ toolId: 'vaccinate', node: nodes[1] }, net)).toBe('next');
        expect(moveReason({ toolId: 'vaccinate', node: nodes[2] }, net)).toBe('hub');
        for (const reason of ['cut', 'bridge', 'isolate', 'care', 'shield', 'next', 'hub', 'test', 'maskSick', 'mask']) expect(hintLine({ reason })).not.toBe('Try this move.');
    });
});

describe('the game asks the solver for its hints', () => {
    const meta = readFileSync(new URL('../src/game-meta.js', import.meta.url), 'utf8');
    const game = readFileSync(new URL('../src/game.js', import.meta.url), 'utf8');

    it('peekHint passes the scenario (goal, length, cap) and caches by the state of the web', () => {
        expect(meta).toContain('chooseMove(this.gameState, this.network, this.tools, this.difficulty, this.currentScenario, { nodeBudget })');
        expect(meta).toContain('hintKey(this.gameState, this.network)');
    });

    it('the next step glow still comes from peekHint', () => {
        expect(game).toContain('this.peekHint?.()');
        expect(game).toContain('markNextStep(nextStepTarget(');
    });
});
