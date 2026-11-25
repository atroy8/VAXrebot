// Wide audience round, meta stream: Hint and Undo.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { LEVELS } from '../src/config/levels.js';
import { tools } from '../src/config/tools.js';
import { buildRun, mulberry32, playRun, BOTS } from '../src/sim/balance.js';
import { canUseTool } from '../src/sim/engine.js';
import { applyNodeTool, severLink, advanceDay } from '../src/sim/actions.js';
import { chooseMove, planDay, cloneRun, hintLine, hintPrice, hintOffer, hintLabel, HINT_RULES, NO_HINT_LINE } from '../src/sim/hint.js';
import { takeSnapshot, restoreSnapshot, canRestore } from '../src/sim/undo.js';
import { playMetaRun } from '../src/sim/meta-run.js';
import { barGeometry, markPoints } from '../src/ui/hint.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const first = LEVELS[0];
const last = LEVELS.at(-1);
const fresh = (level, seed) => buildRun(level, mulberry32(seed));
const freeze = (run) => JSON.stringify({ nodes: run.network.nodes, links: run.network.links.map((l) => [l.source, l.target]), stats: run.state.stats, usage: run.state.dailyUsage, used: [...run.state.usedOnPeople] });

describe('hint: one good move from the smart bot', () => {
    it('suggests a legal move on day 1 of every level and changes nothing', () => {
        for (const level of LEVELS) {
            const run = fresh(level, 7);
            const before = freeze(run);
            const move = chooseMove(run.state, run.network, tools, run.difficulty);
            expect(move, level.id).toBeTruthy();
            expect(freeze(run), level.id).toBe(before);
            expect(canUseTool(run.state, tools, move.toolId, run.difficulty, move.node || null).allowed, level.id).toBe(true);
            if (move.link) expect(run.network.links.includes(move.link), level.id).toBe(true);
            else expect(run.network.nodes.includes(move.node), level.id).toBe(true);
        }
    });

    it('is exactly what the smart bot does first', () => {
        for (const level of [first, LEVELS[12], LEVELS[36], last]) {
            for (const seed of [1, 2, 3]) {
                const a = fresh(level, seed);
                const b = fresh(level, seed);
                const move = chooseMove(a.state, a.network, tools, a.difficulty);
                b.trace = [];
                BOTS.smart(b);
                const botFirst = b.trace[0];
                expect(move.toolId).toBe(botFirst.toolId);
                if (botFirst.link) {
                    expect([move.link.source, move.link.target]).toEqual([botFirst.link.source, botFirst.link.target]);
                } else expect(move.node.id).toBe(botFirst.node.id);
            }
        }
    });

    it('playing the plan move by move ends the day where the bot ends it', () => {
        const a = fresh(last, 4);
        const b = fresh(last, 4);
        for (const move of planDay(a.state, a.network, a.difficulty)) {
            if (move.link) severLink(a.state, a.network, move.link);
            else applyNodeTool(a.state, tools, move.toolId, move.node);
        }
        BOTS.smart(b);
        expect(freeze(a)).toBe(freeze(b));
    });

    it('a cut hint points at a red line: one sick end, one healthy end', () => {
        const run = fresh(first, 3);
        const move = chooseMove(run.state, run.network, tools, run.difficulty);
        expect(move.toolId).toBe('severLink');
        const byId = new Map(run.network.nodes.map((n) => [n.id, n]));
        const states = [byId.get(move.link.source).state, byId.get(move.link.target).state].sort();
        expect(states).toEqual(['healthy', 'infected']);
        expect(hintLine(move)).toBe('Try cutting this red line.');
    });

    it('says so when there is nothing left to do today', () => {
        const run = fresh(first, 3);
        for (const id of Object.keys(run.state.dailyUsage)) run.state.dailyUsage[id] = 99;
        expect(chooseMove(run.state, run.network, tools, run.difficulty)).toBe(null);
        expect(hintLine(null)).toBe(NO_HINT_LINE);
    });

    it('names the tool in plain words for each kind of move', () => {
        expect(hintLine({ reason: 'isolate' })).toMatch(/isolating this sick person/);
        expect(hintLine({ reason: 'next' })).toMatch(/vaccinating this person/);
        expect(hintLine({ reason: 'hub' })).toMatch(/vaccinating this person/);
        expect(hintLine({ reason: 'shield' })).toMatch(/isolating this person/);
    });

    it('one free hint per level, then a small funding cost', () => {
        expect(HINT_RULES.freePerLevel).toBe(1);
        expect(hintPrice(0)).toBe(0);
        expect(hintPrice(1)).toBe(HINT_RULES.cost);
        expect(HINT_RULES.cost).toBeGreaterThan(0);
        expect(HINT_RULES.cost).toBeLessThanOrEqual(25); // well under one win (75 to 125)
        expect(hintOffer({ used: 0, funding: 0 })).toEqual({ ok: true, price: 0 });
        expect(hintOffer({ used: 1, funding: 0 }).ok).toBe(false);
        expect(hintOffer({ used: 1, funding: 0 }).reason).toMatch(/costs 15 gold/);
        expect(hintOffer({ used: 1, funding: 15 })).toEqual({ ok: true, price: 15 });
        expect(hintOffer({ used: 1, funding: 0, free: 2 }).ok).toBe(true); // Mentor on call
        expect(hintLabel(0)).toBe('Hint');
        expect(hintLabel(1)).toBe('Hint 15');
    });

    it('cloning a run never shares mutable parts with the live one', () => {
        const run = fresh(first, 5);
        const { run: copy } = cloneRun(run.state, run.network, run.difficulty);
        copy.state.stats.totalInfected = 999;
        copy.state.usedOnPeople.add('x');
        copy.network.nodes[0].state = 'dead';
        expect(run.state.stats.totalInfected).not.toBe(999);
        expect(run.state.usedOnPeople.has('x')).toBe(false);
        expect(run.network.nodes[0].state).not.toBe('dead');
    });
});

describe('the bots are untouched by the meta-game hooks', () => {
    it('a meta run with no options is the same run as playRun', () => {
        for (const level of [first, LEVELS[25], LEVELS[47], last]) {
            for (const bot of ['smart', 'beginner', 'random', 'passive']) {
                for (const seed of [11, 12, 13, 14]) {
                    const a = playRun(level, bot, seed);
                    const b = playMetaRun(level, { bot, seed });
                    expect([b.outcome, b.stars, b.day, b.stats.totalDead], `${level.id} ${bot} ${seed}`).toEqual([a.outcome, a.stars, a.day, a.deaths]);
                }
            }
        }
    });

    it('the run counters only record: tool uses, the day R fell under 1, cases by day', () => {
        const run = fresh(first, 2);
        const move = chooseMove(run.state, run.network, tools, run.difficulty);
        severLink(run.state, run.network, move.link);
        advanceDay(run.state, run.network, { scenario: run.scenario, difficulty: run.difficulty, rng: mulberry32(1) });
        expect(run.state.stats.activeByDay.length).toBe(2);
        expect(run.state.stats.linksSevered).toBe(1);
        const healthy = run.network.nodes.find((n) => n.state === 'healthy');
        run.state.day = 5;
        applyNodeTool(run.state, tools, 'vaccinate', healthy);
        expect(run.state.stats.toolUses).toEqual({ vaccinate: 1 });
    });
});

describe('undo: one step back within the day', () => {
    const setup = () => {
        const run = fresh(LEVELS[2], 9);
        run.state.day = 3; // every tool open
        return run;
    };

    it('restores a cut line, in place', () => {
        const run = setup();
        const before = freeze(run);
        const nodesBefore = [...run.network.nodes];
        const linksBefore = [...run.network.links];
        const snap = takeSnapshot(run.state, run.network);
        severLink(run.state, run.network, run.network.links[0]);
        expect(freeze(run)).not.toBe(before);
        expect(restoreSnapshot(run.state, run.network, snap)).toBe(true);
        expect(freeze(run)).toBe(before);
        // Same objects: the view keeps pointing at the right people and lines.
        run.network.nodes.forEach((n, i) => expect(n).toBe(nodesBefore[i]));
        run.network.links.forEach((l, i) => expect(l).toBe(linksBefore[i]));
    });

    it('restores a vaccination and a quarantine with their counters', () => {
        const run = setup();
        const healthy = run.network.nodes.find((n) => n.state === 'healthy');
        const sick = run.network.nodes.find((n) => n.state === 'infected');
        const before = freeze(run);
        let snap = takeSnapshot(run.state, run.network);
        applyNodeTool(run.state, tools, 'vaccinate', healthy);
        expect(run.state.usedOnPeople.size).toBe(1);
        restoreSnapshot(run.state, run.network, snap);
        expect(freeze(run)).toBe(before);
        expect(canUseTool(run.state, tools, 'vaccinate', run.difficulty, healthy).allowed).toBe(true);
        snap = takeSnapshot(run.state, run.network);
        applyNodeTool(run.state, tools, 'quarantine', sick);
        expect(sick.state).toBe('quarantined');
        expect(run.state.stats.treated).toBe(1);
        restoreSnapshot(run.state, run.network, snap);
        expect(sick.state).toBe('infected');
        expect('sickWhileQuarantined' in sick).toBe(false);
        expect(freeze(run)).toBe(before);
    });

    it('restores what a power-up changed and hands back what rode along', () => {
        const run = setup();
        const before = freeze(run);
        const snap = takeSnapshot(run.state, run.network, { powerups: { eureka: 1 } });
        // Stay Home Pay and Eureka style changes (src/economy.js).
        const sick = run.network.nodes.find((n) => n.state === 'infected');
        sick.state = 'quarantined';
        sick.sickWhileQuarantined = true;
        sick.homeUntilDay = 5;
        run.state.stats.powerUpsUsed = 1;
        run.state.stats.totalProtected += 1;
        restoreSnapshot(run.state, run.network, snap);
        expect(freeze(run)).toBe(before);
        expect('homeUntilDay' in sick).toBe(false);
        expect(snap.extra).toEqual({ powerups: { eureka: 1 } });
    });

    it('never goes back across Next day, or after the level has ended', () => {
        const run = setup();
        const snap = takeSnapshot(run.state, run.network);
        severLink(run.state, run.network, run.network.links[0]);
        advanceDay(run.state, run.network, { scenario: run.scenario, difficulty: run.difficulty, rng: mulberry32(3) });
        const after = freeze(run);
        expect(canRestore(run.state, snap)).toBe(false);
        expect(restoreSnapshot(run.state, run.network, snap)).toBe(false);
        expect(freeze(run)).toBe(after);
        const again = takeSnapshot(run.state, run.network);
        run.state.gameOver = true;
        expect(canRestore(run.state, again)).toBe(false);
        expect(canRestore(run.state, null)).toBe(false);
    });

    it('the stats object keeps its identity (the game holds on to it)', () => {
        const run = setup();
        const stats = run.state.stats;
        const snap = takeSnapshot(run.state, run.network);
        severLink(run.state, run.network, run.network.links[0]);
        run.state.stats.rBelowOneDay = 3;
        restoreSnapshot(run.state, run.network, snap);
        expect(run.state.stats).toBe(stats);
        expect('rBelowOneDay' in stats).toBe(false);
    });
});

describe('hint and undo are wired into the play screen', () => {
    const html = read('index.html');
    const game = read('src/game.js');
    const meta = read('src/game-meta.js');
    const css = read('src/ui/meta.css');

    it('two buttons in the day controls, Undo hidden until a move is made', () => {
        const controls = html.slice(html.indexOf('class="day-controls"'), html.indexOf('id="next-day"'));
        expect(controls).toContain('id="hint-btn"');
        expect(controls).toMatch(/id="undo-btn"[^>]*hidden/);
        expect(css).toMatch(/\.day-controls \.meta-btn \{[^}]*min-width: 56px;[^}]*min-height: 52px;/s);
    });

    it('every tool use and power-up is remembered first, and the day turning forgets it', () => {
        expect(game).toMatch(/applyToolToNode\(toolId, node\) \{\s*this\.rememberForUndo\(\);/);
        expect(game).toMatch(/applyToolToLink\(linkToRemove\) \{\s*this\.rememberForUndo\(\);/);
        expect(game).toMatch(/usePowerUpFlow\(powerUpId\) \{\s*if \(!this\.beforePowerUp\(\)\) return;/);
        expect(game).toContain('this.afterMetaDay();');
        expect(meta).toMatch(/afterMetaDay\(\) \{[^}]*this\.undoSnap = null;/s);
        expect(meta).toContain('undo: { visible: canRestore(this.gameState, this.undoSnap)');
    });

    it('the hint uses the shared chooser, charges only when it shows a move, and picks the tool', () => {
        expect(meta).toContain('chooseMove(this.gameState, this.network, this.tools, this.difficulty)');
        const use = meta.slice(meta.indexOf('    useHint() {'), meta.indexOf('queueEarlyWarning() {'));
        expect(use.indexOf('if (!move) {')).toBeLessThan(use.indexOf('spendFunding('));
        expect(use).toContain('this.selectTool(move.toolId, { hint: false })');
        expect(use).toContain('showMark(this.view, move)');
    });

    it('the marker follows a person or lies along a line', () => {
        const view = { nodeObjs: new Map([[1, { pos: { x: 0, y: 0 } }], [2, { pos: { x: 30, y: 40 } }]]), screenPoint: (p) => ({ x: p.x, y: p.y }) };
        expect(markPoints(view, { node: { id: 2 } })).toEqual([{ x: 30, y: 40 }]);
        expect(markPoints(view, { link: { source: 1, target: { id: 2 } } })).toEqual([{ x: 0, y: 0 }, { x: 30, y: 40 }]);
        expect(markPoints(view, { node: { id: 9 } })).toBe(null);
        const g = barGeometry({ x: 0, y: 0 }, { x: 30, y: 40 });
        expect(g.length).toBe(50);
        expect([g.x, g.y]).toEqual([15, 20]);
        expect(g.angle).toBeCloseTo(53.13, 1);
    });
});
