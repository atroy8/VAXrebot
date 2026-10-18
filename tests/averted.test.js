import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { snapshotNetwork, noResponseRun, noResponseCases, avertedSummary } from '../src/sim/counterfactual.js';
import { avertedMarkup } from '../src/ui/averted.js';
import { mulberry32, buildRun } from '../src/sim/balance.js';
import { LEVELS } from '../src/config/levels.js';
import { LESSONS, debriefLine, UNUSED_ACTIONS_NUDGE } from '../src/config/lessons.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

// A chain 0-1-2-3-4 with person 0 sick.
const chain = () => ({
    nodes: [0, 1, 2, 3, 4].map((id) => ({ id, state: id === 0 ? 'infected' : 'healthy', daysInfected: 0 })),
    links: [[0, 1], [1, 2], [2, 3], [3, 4]].map(([a, b]) => ({ source: a, target: b })),
});

describe('no-response baseline (cases averted, round 13)', () => {
    it('snapshot stores plain ids even when link ends are node objects', () => {
        const net = chain();
        net.links = net.links.map((l) => ({ source: net.nodes[l.source], target: net.nodes[l.target] }));
        const snap = snapshotNetwork(net);
        expect(snap.links[0]).toEqual({ source: 0, target: 1 });
        expect(snap.nodes[0]).toEqual({ id: 0, state: 'infected' });
    });

    it('the baseline never touches the live network', () => {
        const net = chain();
        const snap = snapshotNetwork(net);
        noResponseRun(snap, { transmissionRate: 1, recoveryTime: 3, fatalityRate: 0.5, rng: mulberry32(1) });
        expect(net.nodes.map((n) => n.state)).toEqual(['infected', 'healthy', 'healthy', 'healthy', 'healthy']);
        expect(snap.nodes[1].state).toBe('healthy');
    });

    it('certain spread infects the whole chain; zero spread infects only the first case', () => {
        const snap = snapshotNetwork(chain());
        expect(noResponseRun(snap, { transmissionRate: 1, recoveryTime: 2, fatalityRate: 0 })).toBe(5);
        expect(noResponseRun(snap, { transmissionRate: 0, recoveryTime: 2, fatalityRate: 0 })).toBe(1);
    });

    it('ends: an outbreak always burns out within the day limit', () => {
        const snap = snapshotNetwork(chain());
        const n = noResponseRun(snap, { transmissionRate: 0.5, recoveryTime: 4, fatalityRate: 0.1, rng: mulberry32(7), maxDays: 365 });
        expect(n).toBeGreaterThanOrEqual(1);
        expect(n).toBeLessThanOrEqual(5);
    });

    it('is repeatable with a seeded rng and takes the median', () => {
        const snap = snapshotNetwork(chain());
        const opts = { transmissionRate: 0.5, recoveryTime: 3, fatalityRate: 0, runs: 11 };
        expect(noResponseCases(snap, { ...opts, rng: mulberry32(3) })).toBe(noResponseCases(snap, { ...opts, rng: mulberry32(3) }));
    });

    it('on every level the no-response outbreak is bigger than the case cap (doing nothing never wins)', () => {
        for (const level of LEVELS) {
            const rng = mulberry32(42);
            const run = buildRun(level, rng);
            const snap = snapshotNetwork(run.network);
            const baseline = noResponseCases(snap, {
                transmissionRate: run.scenario.baseTransmissionRate * run.difficulty.transmissionMultiplier,
                recoveryTime: run.difficulty.recoveryTime,
                fatalityRate: run.difficulty.fatalityRate,
                rng,
            });
            const cap = Math.ceil(run.scenario.caseCapFraction * run.state.stats.initialPopulation);
            expect(baseline, level.id).toBeGreaterThan(cap);
        }
    });

    it('baseline sims are cheap enough to run as the results screen opens', () => {
        const run = buildRun(LEVELS[LEVELS.length - 1], mulberry32(5));
        const snap = snapshotNetwork(run.network);
        const t0 = performance.now();
        noResponseCases(snap, {
            transmissionRate: run.scenario.baseTransmissionRate * run.difficulty.transmissionMultiplier,
            recoveryTime: run.difficulty.recoveryTime,
            fatalityRate: run.difficulty.fatalityRate,
        });
        expect(performance.now() - t0).toBeLessThan(250);
    });
});

describe('cases averted summary and card', () => {
    it('a win names the baseline and the player result, and counts cases averted', () => {
        const s = avertedSummary({ actual: 8, baseline: 27, population: 33, outcome: 'contained' });
        expect(s.averted).toBe(19);
        expect(s.text).toBe('With no response, about 27 of 33 people would have caught it. You kept it to 8.');
    });

    it('says all when nobody would have escaped', () => {
        const s = avertedSummary({ actual: 3, baseline: 34, population: 34, outcome: 'contained' });
        expect(s.text).toBe('With no response, all 34 people would have caught it. You kept it to 3.');
    });

    it('a loss shows only the baseline (the round ended early at the cap)', () => {
        const s = avertedSummary({ actual: 16, baseline: 29, population: 33, outcome: 'overwhelmed' });
        expect(s.averted).toBeNull();
        expect(s.text).not.toContain('averted');
        expect(avertedMarkup({ summary: s, actual: 16, baseline: 29, population: 33 })).not.toContain('averted-bars');
    });

    it('a win that came in over an unlucky baseline claims nothing', () => {
        const s = avertedSummary({ actual: 12, baseline: 10, population: 30, outcome: 'contained' });
        expect(s.averted).toBe(0);
        expect(s.text).not.toContain('kept it');
    });

    it('nothing to show without a baseline', () => {
        expect(avertedSummary({ actual: 3, baseline: null, population: 30, outcome: 'contained' })).toBeNull();
        expect(avertedMarkup({ summary: null })).toBe('');
    });

    it('the card shows the headline and two bars on one scale', () => {
        const summary = avertedSummary({ actual: 6, baseline: 30, population: 30, outcome: 'contained' });
        const html = avertedMarkup({ summary, actual: 6, baseline: 30, population: 30 });
        expect(html).toContain('24 cases averted');
        expect(html).toContain('How health teams score a response');
        expect(html).toContain('--w:100%');
        expect(html).toContain('--w:20%');
        expect(avertedMarkup({ summary: { ...summary, averted: 1 }, actual: 29, baseline: 30, population: 30 })).toContain('1 case averted');
    });

    it('the results screen has the card and game.js fills it', () => {
        expect(read('index.html')).toContain('id="averted"');
        const game = read('src/game.js');
        expect(game).toContain('snapshotNetwork(this.network)');
        expect(game).toContain('this.renderAvertedCard(outcome, stats)');
    });
});

describe('loss coaching follows how the round was played (round 13)', () => {
    const care = LESSONS['r1-care-home'];
    const metro = LESSONS['r3-metro'];

    it('wins are unchanged', () => {
        expect(debriefLine(care, 'contained', { unusedActions: 9 })).toBe(care.win);
    });

    it('unused actions get named on a loss', () => {
        const line = debriefLine(metro, 'overwhelmed', { unusedActions: 4 });
        expect(line.startsWith('You ended days with 4 actions unused.')).toBe(true);
        expect(line).toContain(metro.retry);
        expect(debriefLine(metro, 'overwhelmed', { unusedActions: UNUSED_ACTIONS_NUDGE - 1 })).toBe(metro.retry);
    });

    it('a player who used every action is not told to act sooner', () => {
        expect(debriefLine(care, 'overwhelmed', { unusedActions: 0 })).toBe(care.retryBusy);
        expect(care.retryBusy).not.toMatch(/day 1/);
        expect(debriefLine(metro, 'overwhelmed', { unusedActions: 0 })).toBe(metro.retry);
    });

    it('no em dashes in the new copy', () => {
        for (const l of Object.values(LESSONS)) expect(JSON.stringify(l)).not.toContain('—');
        expect(read('src/sim/counterfactual.js')).not.toContain('—');
        expect(read('src/ui/averted.js')).not.toContain('—');
    });

    it('game.js counts unused actions only on days the player ends, not fast-forwarded ones', () => {
        const game = read('src/game.js');
        expect(game).toMatch(/if \(!this\.wrapUp\) \{\s*const left = actionsRemaining/);
        expect(game).toContain('unusedActions: stats.unusedActions ?? 0');
    });
});

describe('page font on controls (round 13 playtest fix)', () => {
    it('buttons and inputs inherit Fredoka instead of the browser default', () => {
        expect(read('src/styles.css')).toMatch(/button,\s*input,\s*select,\s*textarea\s*\{\s*font-family: inherit;/);
    });
});
