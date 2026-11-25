// Wide audience round, mechanic 5: travellers change one contact each
// night, so yesterday's safe group is not safe today.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { travelNight, markTravellers, travelCanSpread } from '../src/sim/mechanics.js';
import { spreadIsOver } from '../src/sim/engine.js';
import { advanceDay } from '../src/sim/actions.js';
import { initGameState } from '../src/sim/state.js';
import { tools } from '../src/config/tools.js';
import { LEVELS } from '../src/config/levels.js';
import { levelRules } from '../src/config/level-rules.js';
import { lessonFor } from '../src/config/lessons.js';
import { variantCallout } from '../src/sim/variants.js';
import { BOTS, buildRun, mulberry32, summarize } from '../src/sim/balance.js';
import { nodeMarks } from '../src/ui/node-marks.js';
import { onsetToast, travelLine } from '../src/ui/mechanics-text.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const person = (id, state = 'healthy', extra = {}) => ({ id, state, daysInfected: 0, removed: false, ...extra });
// A line of people 0-1-2-...-(n-1).
function lineWeb(n, extra = {}) {
    const nodes = Array.from({ length: n }, (_, i) => person(i, 'healthy', extra[i] || {}));
    const links = nodes.slice(1).map((x) => ({ source: x.id - 1, target: x.id }));
    return { nodes, links };
}
const contactsOf = (net, id) => net.links.filter((l) => l.source === id || l.target === id).map((l) => (l.source === id ? l.target : l.source)).sort((a, b) => a - b);
const travelLevels = LEVELS.filter((l) => l.mechanics?.travellers);

describe('a night of travel', () => {
    it('a traveller drops one contact and makes a new one far away', () => {
        const net = lineWeb(8, { 0: { traveller: true } });
        const state = initGameState(tools, 8);
        const moves = travelNight(state, net, mulberry32(3));
        expect(moves).toHaveLength(1);
        expect(moves[0].traveller).toBe(0);
        expect(moves[0].from).toBe(1);
        // At least three steps away along the line: person 3 or beyond.
        expect(moves[0].to).toBeGreaterThanOrEqual(3);
        expect(contactsOf(net, 0)).toEqual([moves[0].to]);
        expect(net.links).toHaveLength(7); // one line out, one line in
        expect(state.stats.trips).toBe(1);
    });

    it('is seeded: the same dice give the same trip', () => {
        const run = () => {
            const net = lineWeb(10, { 4: { traveller: true }, 7: { traveller: true } });
            return JSON.stringify(travelNight(initGameState(tools, 10), net, mulberry32(11)));
        };
        expect(run()).toBe(run());
    });

    it('never doubles a line, links a traveller to themselves, or visits the isolated', () => {
        for (let seed = 1; seed <= 60; seed++) {
            const net = lineWeb(9, { 2: { traveller: true }, 6: { traveller: true } });
            net.nodes[8].state = 'quarantined';
            const state = initGameState(tools, 9);
            const rng = mulberry32(seed);
            for (let night = 0; night < 6; night++) {
                for (const m of travelNight(state, net, rng)) expect(m.to).not.toBe(8);
                const seen = new Set();
                for (const l of net.links) {
                    expect(l.source).not.toBe(l.target);
                    const key = [l.source, l.target].sort((a, b) => a - b).join('-');
                    expect(seen.has(key), `seed ${seed} ${key}`).toBe(false);
                    seen.add(key);
                }
            }
        }
    });

    it('an isolated traveller stays put, and one with every line cut has nowhere to go from', () => {
        const net = lineWeb(8, { 0: { traveller: true } });
        net.nodes[0].state = 'quarantined';
        expect(travelNight(initGameState(tools, 8), net, mulberry32(1))).toEqual([]);
        const cut = lineWeb(8, { 0: { traveller: true } });
        cut.links = cut.links.filter((l) => l.source !== 0 && l.target !== 0);
        expect(travelNight(initGameState(tools, 8), cut, mulberry32(1))).toEqual([]);
        // Nobody marked: nothing happens and no dice are rolled.
        let rolls = 0;
        expect(travelNight(initGameState(tools, 8), lineWeb(8), () => { rolls++; return 0.5; })).toEqual([]);
        expect(rolls).toBe(0);
    });

    it('works on links that hold node objects, as the 3D view leaves them', () => {
        const net = lineWeb(8, { 0: { traveller: true } });
        for (const l of net.links) {
            l.source = net.nodes[l.source];
            l.target = net.nodes[l.target];
        }
        const moves = travelNight(initGameState(tools, 8), net, mulberry32(3));
        expect(moves).toHaveLength(1);
        const fresh = net.links.at(-1);
        expect(fresh).toEqual({ source: 0, target: moves[0].to });
        expect(net.links).toHaveLength(7);
    });

    it('happens after the night\'s spread, so the new line cannot infect before it is seen', () => {
        // 0 is a sick traveller whose only contact is immune; everyone else is far away.
        const net = lineWeb(8, { 0: { traveller: true } });
        net.nodes[0].state = 'infected';
        net.nodes[1].state = 'vaccinated';
        const state = initGameState(tools, 8);
        state.stats.totalInfected = 1;
        const scenario = { baseTransmissionRate: 1, duration: 30, travellers: { count: 1 } };
        const difficulty = { transmissionMultiplier: 1, recoveryTime: 20, fatalityRate: 0 };
        const out = advanceDay(state, net, { scenario, difficulty, rng: mulberry32(2) });
        expect(out.spread.count).toBe(0); // nobody caught it tonight
        expect(out.spread.travel).toHaveLength(1);
        const dest = out.spread.travel[0].to;
        expect(net.nodes[dest].state).toBe('healthy');
        // The next night it can cross the new line.
        const next = advanceDay(state, net, { scenario, difficulty, rng: () => 0 });
        expect(next.spread.count).toBeGreaterThanOrEqual(1);
        expect(net.nodes[dest].state).toBe('infected');
    });

    it('without travellers on the level, advanceDay does not travel', () => {
        const net = lineWeb(6, { 0: { traveller: true } });
        const state = initGameState(tools, 6);
        const out = advanceDay(state, net, { scenario: { baseTransmissionRate: 0, duration: 30 }, difficulty: { transmissionMultiplier: 1, recoveryTime: 5, fatalityRate: 0 }, rng: mulberry32(1) });
        expect(out.spread.travel).toEqual([]);
        expect(contactsOf(net, 0)).toEqual([1]);
    });
});

describe('the outbreak is not over while travel can restart it', () => {
    it('a sick traveller apart from the healthy still counts as spreading', () => {
        const net = lineWeb(8, { 0: { traveller: true } });
        net.nodes[0].state = 'infected';
        net.nodes[1].state = 'vaccinated';
        expect(travelCanSpread(net)).toBe(true);
        expect(spreadIsOver(net)).toBe(false);
        // Isolate the traveller and it is over.
        net.nodes[0].state = 'quarantined';
        net.nodes[0].sickWhileQuarantined = true;
        expect(spreadIsOver(net)).toBe(true);
    });

    it('a healthy traveller can still walk into the sick', () => {
        const net = lineWeb(8, { 7: { traveller: true } });
        net.nodes[0].state = 'infected';
        net.nodes[1].state = 'vaccinated';
        expect(spreadIsOver(net)).toBe(false);
        net.nodes[7].state = 'vaccinated';
        // An immune traveller only ever joins themselves to others: harmless.
        expect(travelCanSpread(net)).toBe(false);
        expect(spreadIsOver(net)).toBe(true);
    });

    it('classic webs are judged exactly as before', () => {
        const net = lineWeb(4);
        net.nodes[0].state = 'infected';
        expect(spreadIsOver(net)).toBe(false);
        net.nodes[1].state = 'vaccinated';
        expect(spreadIsOver(net)).toBe(true);
    });
});

describe('traveller levels', () => {
    it('marks the travellers at setup: healthy people, the same for the same seed', () => {
        const nodes = Array.from({ length: 10 }, (_, i) => person(i, i < 2 ? 'infected' : 'healthy', i === 5 ? { hub: true } : {}));
        const picked = markTravellers(nodes, { count: 3 }, mulberry32(4));
        expect(picked).toHaveLength(3);
        for (const n of picked) {
            expect(n.state).toBe('healthy');
            expect(n.hub).toBeUndefined();
            expect(nodeMarks(n)).toContain('travel');
        }
        for (const level of travelLevels) {
            const a = buildRun(level, mulberry32(6));
            const b = buildRun(level, mulberry32(6));
            const ids = (run) => run.network.nodes.filter((n) => n.traveller).map((n) => n.id);
            expect(ids(a)).toEqual(ids(b));
            expect(ids(a)).toHaveLength(levelRules(level).scenario.travellers.count);
        }
    });

    it('a late planet introduces them and the spaceports use them', () => {
        expect(travelLevels.length).toBeGreaterThanOrEqual(3);
        expect(travelLevels.every((l) => l.planetIndex >= 2)).toBe(true);
        expect(travelLevels.some((l) => l.scenarioId === 'global')).toBe(true);
        for (const l of travelLevels) {
            expect(l.lessonId).toBe('borders-leak');
            expect(lessonFor(l.id).brief).toMatch(/Travellers swap one contact/);
            expect(variantCallout(l.variant, l.mechanics).title).toBe('New: travellers');
        }
        expect(LEVELS.filter((l) => l.planetIndex < 2).some((l) => levelRules(l).scenario.travellers)).toBe(false);
    });

    it('the web really changes during a level, and the line count holds', () => {
        const level = travelLevels[0];
        let trips = 0;
        for (let seed = 1; seed <= 10; seed++) {
            const rng = mulberry32(seed);
            const run = buildRun(level, rng);
            const before = run.network.links.length;
            const out = advanceDay(run.state, run.network, { scenario: run.scenario, difficulty: run.difficulty, rng });
            trips += out.spread.travel.length;
            if (!run.state.stats.totalDead) expect(run.network.links.length).toBe(before);
        }
        expect(trips).toBeGreaterThan(10);
    });

    it('the smart bot isolates a sick traveller first, and nobody wins by doing nothing', () => {
        const level = travelLevels.find((l) => l.toolkit.tools.includes('quarantine'));
        for (let seed = 1; seed <= 8; seed++) {
            const run = buildRun(level, mulberry32(seed));
            run.state.day = 3; // every tool is open
            run.difficulty.dailyLimits = { ...run.difficulty.dailyLimits, quarantine: 1 };
            // Several people are sick, one of them a traveller with a single contact.
            const roamer = run.network.nodes.find((n) => n.traveller);
            roamer.state = 'infected';
            BOTS.smart(run, mulberry32(seed));
            expect(roamer.state, `seed ${seed}`).toBe('quarantined');
        }
        for (const l of travelLevels) {
            expect(summarize(l, 'passive', 25, 3).counts.contained || 0, l.id).toBe(0);
            expect(summarize(l, 'smart', 100, 21).winRate, l.id).toBeGreaterThan(summarize(l, 'random', 100, 21).winRate);
        }
    });

    it('says so in the morning and is wired into the day step', () => {
        expect(travelLine({ travel: [{ traveller: 1, from: 2, to: 3 }] })).toMatch(/A traveller moved on overnight/);
        expect(travelLine({ travel: [{}, {}] })).toMatch(/2 travellers moved on/);
        expect(travelLine({ travel: [] })).toBe('');
        expect(onsetToast({ onsets: [], travel: [{}] })).toMatch(/traveller moved on/);
        expect(onsetToast({ onsets: [] })).toBe('');
        // Round 57: the night applies the plan that was on screen all day.
        expect(read('src/sim/actions.js')).toContain('const plan = scenario.travellers ? travelPlan(network) : null;');
        expect(read('src/sim/actions.js')).toContain('spread.travel = plan ? travelNight(state, network, plan) : [];');
        expect(read('src/game.js')).toContain('onsetToast(spread)');
    });
});
