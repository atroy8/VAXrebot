// Wide audience round, mechanic 3: new ways to win.
//   hold the line  survive N days under the cap until the vaccines land
//   keep it open   a marked hub whose lines cannot be cut
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { checkGameOver, canUseTool } from '../src/sim/engine.js';
import { advanceDay, severLink } from '../src/sim/actions.js';
import { buildOutbreak } from '../src/sim/setup.js';
import { placeHub, adjacency, distancesFromSick, variantCallout } from '../src/sim/variants.js';
import { initGameState } from '../src/sim/state.js';
import { tools } from '../src/config/tools.js';
import { LEVELS } from '../src/config/levels.js';
import { levelRules } from '../src/config/level-rules.js';
import { lessonFor } from '../src/config/lessons.js';
import { linkLocked, hubContacts, goalOf } from '../src/sim/mechanics.js';
import { BOTS, buildRun, mulberry32, summarize, playRun } from '../src/sim/balance.js';
import { nodeMarks } from '../src/ui/node-marks.js';
import { dayLabel, goalLine, mechanicsResultsLine, HUB_LOCKED_TEXT } from '../src/ui/mechanics-text.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const person = (id, state = 'healthy', extra = {}) => ({ id, state, daysInfected: 0, removed: false, ...extra });
const holdLevels = LEVELS.filter((l) => l.mechanics?.goal?.type === 'holdLine');
const openLevels = LEVELS.filter((l) => l.mechanics?.goal?.type === 'keepOpen');

describe('hold the line', () => {
    const goal = { type: 'holdLine', days: 5 };
    const sickWeb = () => ({ nodes: [person(0, 'infected'), person(1), person(2)], links: [{ source: 0, target: 1 }, { source: 1, target: 2 }] });
    const acted = (day, cases = 1) => {
        const state = initGameState(tools, 10);
        state.day = day;
        state.stats.totalInfected = cases;
        state.stats.linksSevered = 1;
        return state;
    };

    it('is won at the dawn after the last day, with people still sick', () => {
        expect(checkGameOver(acted(5), sickWeb(), 30, 4, goal)).toBe(null);
        const state = acted(6);
        expect(checkGameOver(state, sickWeb(), 30, 4, goal)).toBe('contained');
        expect(state.stats.heldLine).toBe(true);
    });

    it('is still lost when the cap is reached first', () => {
        expect(checkGameOver(acted(3, 4), sickWeb(), 30, 4, goal)).toBe('overwhelmed');
        // Reaching the cap on the very last night is a loss, not a win.
        expect(checkGameOver(acted(6, 4), sickWeb(), 30, 4, goal)).toBe('overwhelmed');
    });

    it('stopping the outbreak sooner still wins, the classic way', () => {
        const state = acted(3);
        const net = { nodes: [person(0, 'recovered'), person(1)], links: [] };
        expect(checkGameOver(state, net, 30, 4, goal)).toBe('contained');
        expect(state.stats.heldLine).toBeUndefined();
    });

    it('waiting it out without doing anything is not a win', () => {
        const state = initGameState(tools, 10);
        state.day = 6;
        state.stats.totalInfected = 1;
        expect(checkGameOver(state, sickWeb(), 30, 4, goal)).toBe(null);
        for (const level of holdLevels) expect(summarize(level, 'passive', 25, 3).counts.contained || 0, level.id).toBe(0);
    });

    it('without the goal nothing changes', () => {
        expect(checkGameOver(acted(6), sickWeb(), 30, 4)).toBe(null);
        expect(checkGameOver(acted(6), sickWeb(), 30, 4, null)).toBe(null);
    });

    it('advanceDay reads the goal from the scenario', () => {
        const state = acted(5);
        const net = sickWeb();
        const scenario = { baseTransmissionRate: 0, duration: 30, goal };
        const difficulty = { transmissionMultiplier: 1, recoveryTime: 20, fatalityRate: 0 };
        const out = advanceDay(state, net, { scenario, difficulty, rng: () => 0.99 });
        expect(out.result).toBe('contained');
        expect(state.stats.heldLine).toBe(true);
    });

    it('levels: the goal, the callout, the lesson and the day counter', () => {
        expect(holdLevels.filter((l) => l.regionId === 'sango').length).toBeGreaterThanOrEqual(2);
        for (const l of holdLevels) {
            expect(l.planetIndex).toBeGreaterThanOrEqual(2);
            const { scenario } = levelRules(l);
            expect(goalOf(scenario).type).toBe('holdLine');
            expect(goalOf(scenario).days).toBeGreaterThanOrEqual(5);
            // The win comes before the level's own time limit.
            expect(goalOf(scenario).days).toBeLessThan(scenario.duration);
            expect(l.lessonId).toBe('flatten-curve');
            expect(lessonFor(l.id).win).toMatch(/flattening the curve/);
            const call = variantCallout(l.variant, l.mechanics);
            expect(call.title).toBe(`New goal: hold the line for ${scenario.goal.days} days`);
            expect(l.blurb).toMatch(/Hold the line/);
        }
        expect(dayLabel(3, goal)).toBe('3/5');
        expect(dayLabel(6, goal)).toBe('5/5');
        expect(dayLabel(3, null)).toBe(3);
        expect(goalLine({ heldLine: true }, { goal })).toMatch(/held the line.*after day 5/);
        expect(goalLine({}, { goal })).toBe('');
        expect(mechanicsResultsLine({}, {})).toBe('');
    });

    it('the smart bot wins some of them by holding out, not only by stopping it', () => {
        let held = 0;
        let stopped = 0;
        for (const level of holdLevels) {
            const { scenario } = levelRules(level);
            for (let seed = 1; seed <= 60; seed++) {
                const r = playRun(level, 'smart', seed);
                if (r.outcome !== 'contained') continue;
                if (r.day > scenario.goal.days && r.recovered + r.deaths < r.pop) held++;
                stopped++;
            }
        }
        expect(stopped).toBeGreaterThan(20);
        expect(held).toBeGreaterThan(5);
    });
});

describe('keep it open', () => {
    it('marks one well connected healthy person who is not next to a first case', () => {
        for (const level of openLevels) {
            for (let seed = 1; seed <= 15; seed++) {
                const run = buildRun(level, mulberry32(seed));
                const hubs = run.network.nodes.filter((n) => n.hub);
                expect(hubs, `${level.id} seed ${seed}`).toHaveLength(1);
                const hub = hubs[0];
                expect(hub.state).toBe('healthy');
                const adj = adjacency(run.network.nodes, run.network.links);
                const n = run.network.nodes.length;
                expect(adj.get(hub.id).size).toBeGreaterThanOrEqual(Math.min(5, n - 3));
                // The busiest person on the web is the hub.
                expect(adj.get(hub.id).size).toBe(Math.max(...run.network.nodes.map((x) => adj.get(x.id).size)));
                // No new contact was drawn to someone sick.
                const dist = distancesFromSick(run.network.nodes, run.network.links);
                expect(dist.get(hub.id), `${level.id} seed ${seed}`).toBeGreaterThanOrEqual(1);
            }
        }
    });

    it('placeHub is seeded and never links the hub to the sick', () => {
        const build = () => {
            const nodes = Array.from({ length: 12 }, (_, i) => person(i, i === 0 ? 'infected' : 'healthy'));
            const links = nodes.slice(1).map((n) => ({ source: n.id - 1, target: n.id })); // a line 0-1-2-...-11
            const hub = placeHub(nodes, links, { degreeShare: 0.5 }, mulberry32(4));
            return { nodes, links, hub };
        };
        const a = build();
        const b = build();
        expect(a.hub.id).toBe(b.hub.id);
        expect(a.links).toEqual(b.links);
        const adj = adjacency(a.nodes, a.links);
        expect(adj.get(a.hub.id).size).toBe(6);
        expect(adj.get(a.hub.id).has(0)).toBe(false);
        expect(distancesFromSick(a.nodes, a.links).get(a.hub.id)).toBeGreaterThanOrEqual(2);
    });

    it('the hub\'s lines cannot be cut, whether the link holds ids or node objects', () => {
        const nodes = [person(0, 'infected'), person(1, 'healthy', { hub: true }), person(2)];
        const net = { nodes, links: [{ source: 0, target: 1 }, { source: 1, target: 2 }, { source: 0, target: 2 }] };
        expect(linkLocked(net.links[0], net)).toBe(true);
        expect(linkLocked(net.links[1], net)).toBe(true);
        expect(linkLocked(net.links[2], net)).toBe(false);
        expect(linkLocked({ source: nodes[0], target: nodes[1] }, net)).toBe(true);
        expect(linkLocked({ source: nodes[0], target: nodes[2] }, net)).toBe(false);
        expect([...hubContacts(net)].sort()).toEqual([0, 2]);
        expect(HUB_LOCKED_TEXT).toMatch(/must stay open/);
    });

    it('the hub cannot be isolated while healthy, and shows a mark', () => {
        const { difficulty } = levelRules(LEVELS.find((l) => l.toolkit.tools.includes('quarantine')));
        const state = initGameState(tools, 6);
        state.day = 5;
        const hub = person(1, 'healthy', { hub: true });
        expect(canUseTool(state, tools, 'quarantine', difficulty, hub).reason).toMatch(/must stay open/);
        expect(canUseTool(state, tools, 'quarantine', difficulty, person(2)).allowed).toBe(true);
        // A hub who falls ill is a patient like anyone else.
        expect(canUseTool(state, tools, 'quarantine', difficulty, { ...hub, state: 'infected' }).allowed).toBe(true);
        expect(nodeMarks(hub)).toEqual(['hub']);
    });

    it('the bots never cut a hub line and still play the level', () => {
        for (const level of openLevels) {
            for (const bot of ['smart', 'beginner', 'random']) {
                for (let seed = 1; seed <= 10; seed++) {
                    const rng = mulberry32(seed);
                    const run = buildRun(level, rng);
                    const hubId = run.network.nodes.find((n) => n.hub).id;
                    const hubLines = () => run.network.links.filter((l) => l.source === hubId || l.target === hubId).length;
                    const before = hubLines();
                    for (let d = 0; d < 4; d++) {
                        BOTS[bot](run, rng);
                        // Only a death at the far end may remove a hub line.
                        if (run.state.stats.totalDead === 0) expect(hubLines(), `${level.id} ${bot}`).toBe(before);
                        if (advanceDay(run.state, run.network, { scenario: run.scenario, difficulty: run.difficulty, rng }).result) break;
                    }
                }
            }
            // Round 57: every run deals and solves a web first, so fewer runs
            // (40, was 100) and a longer time limit.
            expect(summarize(level, 'passive', 15, 3).counts.contained || 0, level.id).toBe(0);
            expect(summarize(level, 'smart', 40, 21).winRate, level.id).toBeGreaterThan(summarize(level, 'random', 40, 21).winRate);
        }
    }, 60000);

    it('levels: the goal, the callout and the lesson', () => {
        expect(openLevels.some((l) => l.regionId === 'sango')).toBe(true);
        expect(openLevels.length).toBeGreaterThanOrEqual(2);
        for (const l of openLevels) {
            expect(levelRules(l).scenario.goal.type).toBe('keepOpen');
            expect(l.lessonId).toBe('keep-it-open');
            expect(lessonFor(l.id).brief).toMatch(/must stay open/);
            expect(variantCallout(l.variant, l.mechanics).title).toBe('New goal: keep it open');
            // No vaccine on these levels, or one dose on the hub would end the puzzle.
            expect(l.toolkit.tools).not.toContain('vaccinate');
        }
    });

    it('classic levels have no hub and no goal', () => {
        const classic = LEVELS[3];
        expect(levelRules(classic).scenario.goal).toBeUndefined();
        const run = buildRun(classic, mulberry32(2));
        expect(run.network.nodes.some((n) => n.hub)).toBe(false);
        const out = buildOutbreak({ scenario: levelRules(classic).scenario, population: 12, rng: mulberry32(1) });
        expect(out.hubId).toBe(null);
    });

    it('is wired into the game: locked lines say why, the day counter shows the goal', () => {
        const game = read('src/game.js');
        expect(game).toContain('if (linkLocked(link, this.network)) {');
        expect(game).toContain('showNotification(HUB_LOCKED_TEXT');
        expect(game).toContain('day: dayLabel(this.gameState.day, this.currentScenario.goal)');
        expect(read('src/sim/actions.js')).toContain('scenario.goal || null');
        // severLink itself is unchanged: the rule lives in linkLocked.
        expect(typeof severLink).toBe('function');
    });
});
