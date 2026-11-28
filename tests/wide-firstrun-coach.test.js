// Wide audience pass, first minutes: a new player used to read three How to
// play cards before touching the web. Level 1 now teaches by doing: one small
// coach bubble next to the thing to tap, one step at a time, each step moving
// on when the player does it. The step logic is a pure state machine
// (src/ui/coach-model.js); the bubble is src/ui/coach.js + coach.css.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
    COACH_FLAG,
    COACH_TEXT,
    COACH_LAST_DAY,
    newCoachMemory,
    coachStep,
    coachDismiss,
    coachRecall,
    COACH_RECALL_MS,
    coachSkip,
    coachFinished,
    bubblePlacement,
    pickRiskLine,
    coachSeen,
    markCoachSeen,
} from '../src/ui/coach-model.js';
import { coachFacts } from '../src/ui/coach.js';
import { HOW_TO_PLAY } from '../src/ui/onboarding.js';
import { tools } from '../src/config/tools.js';
import { LEVELS } from '../src/config/levels.js';
import { rollLevelRules } from '../src/config/difficulty-roll.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

// Day 1 of level 1 as the player finds it: one sick person, three cuts,
// Vaccinate and Quarantine still closed.
const day1 = (over = {}) => ({
    day: 1,
    gameOver: false,
    blocked: false,
    selectedTool: null,
    sick: 1,
    riskLines: 4,
    sever: { state: 'ready', left: 3, limit: 3 },
    vaccinate: { state: 'locked' },
    quarantine: { state: 'locked' },
    countdown: false,
    ...over,
});

describe('coach steps on day 1 (pure state machine)', () => {
    it('starts by pointing at the sick person', () => {
        const step = coachStep(day1());
        expect(step.id).toBe('sick');
        expect(step.kind).toBe('info');
        expect(step.anchor).toEqual({ type: 'sick' });
        // Round 57: spread is certain, so the line says "will", not "can".
        expect(step.text).toBe('This person is sick. Red lines are where it will jump tonight.');
    });

    it('then asks for the Sever Link chip, then for a red line', () => {
        let memory = newCoachMemory();
        memory = coachDismiss(memory, coachStep(day1(), memory));
        const pick = coachStep(day1(), memory);
        expect(pick.id).toBe('pick-sever');
        expect(pick.anchor).toEqual({ type: 'tool', id: 'severLink' });
        expect(pick.text).toBe('Tap Sever Link.');
        // The player taps the chip: the tap waves the step away and selects the tool.
        memory = coachDismiss(memory, pick);
        const cut = coachStep(day1({ selectedTool: 'severLink' }), memory);
        expect(cut.id).toBe('cut');
        expect(cut.anchor).toEqual({ type: 'risk' });
        expect(cut.text).toBe('Now tap a red line to cut it.');
    });

    it('skips straight to the cut when the player picks Sever on their own', () => {
        const step = coachStep(day1({ selectedTool: 'severLink' }));
        expect(step.id).toBe('cut');
    });

    it('each cut completes the step and the next one counts down', () => {
        let memory = newCoachMemory();
        const first = coachStep(day1({ selectedTool: 'severLink' }), memory);
        memory = coachDismiss(memory, first); // the tap on the line
        const second = coachStep(day1({ selectedTool: 'severLink', sever: { state: 'ready', left: 2, limit: 3 }, riskLines: 3 }), memory);
        expect(second.id).toBe('cut');
        expect(second.key).not.toBe(first.key);
        expect(second.text).toBe('Cut another red line. 2 left.');
        // A missed tap waved "2 left" away: nothing nags until a cut lands.
        memory = coachDismiss(memory, second);
        expect(coachStep(day1({ selectedTool: 'severLink', sever: { state: 'ready', left: 2, limit: 3 }, riskLines: 3 }), memory)).toBeNull();
        const third = coachStep(day1({ selectedTool: 'severLink', sever: { state: 'ready', left: 1, limit: 3 }, riskLines: 2 }), memory);
        expect(third.text).toBe('Cut another red line. 1 left.');
    });

    it('a tap on a red line with no tool chosen still moves on (the game picks Sever)', () => {
        let memory = newCoachMemory();
        memory = coachDismiss(memory, coachStep(day1(), memory));
        // The cut happened and Sever is now selected with 2 left.
        const step = coachStep(day1({ selectedTool: 'severLink', sever: { state: 'ready', left: 2, limit: 3 }, riskLines: 3 }), memory);
        expect(step.id).toBe('cut');
    });

    it('once the cuts are spent it points at Next day', () => {
        const spent = day1({ sever: { state: 'spent', left: 0, limit: 3 }, riskLines: 1 });
        const step = coachStep(spent);
        expect(step.id).toBe('next-day');
        expect(step.anchor).toEqual({ type: 'next-day' });
        expect(step.text).toBe('Tap Next day.');
    });

    it('copes with the auto-advance countdown: says the day ends on its own', () => {
        const step = coachStep(day1({ sever: { state: 'spent', left: 0, limit: 3 }, riskLines: 1, countdown: true }));
        expect(step.id).toBe('next-day');
        expect(step.text).toBe(COACH_TEXT.nextDayAuto);
        expect(step.text).toMatch(/on its own/);
    });

    it('points at Next day when every red line is cut with cuts to spare', () => {
        const step = coachStep(day1({ selectedTool: 'severLink', sever: { state: 'ready', left: 1, limit: 3 }, riskLines: 0 }));
        expect(step.id).toBe('next-day');
        expect(step.text).toBe('No red lines left. Tap Next day.');
    });
});

describe('coach hints on later days', () => {
    const day2 = (over = {}) => day1({ day: 2, vaccinate: { state: 'ready' }, sever: { state: 'ready', left: 3, limit: 3 }, ...over });

    it('day 2: one line about Vaccinate when it opens', () => {
        const step = coachStep(day2());
        expect(step.id).toBe('vaccinate');
        expect(step.kind).toBe('info');
        expect(step.anchor).toEqual({ type: 'tool', id: 'vaccinate' });
        expect(step.text).toMatch(/Vaccinate protects a healthy person/);
    });

    it('then gets out of the way until Quarantine opens on day 3', () => {
        let memory = newCoachMemory();
        memory = coachDismiss(memory, coachStep(day2(), memory));
        expect(coachStep(day2(), memory)).toBeNull();
        expect(coachFinished(day2(), memory)).toBe(false);
        const day3 = day2({ day: 3, quarantine: { state: 'ready' } });
        const step = coachStep(day3, memory);
        expect(step.id).toBe('quarantine');
        expect(step.text).toMatch(/Quarantine isolates the sick/);
        memory = coachDismiss(memory, step);
        expect(coachStep(day3, memory)).toBeNull();
        expect(coachFinished(day3, memory)).toBe(true);
    });

    it('never repeats day 1 steps after day 1', () => {
        const ids = [coachStep(day2()), coachStep(day2({ selectedTool: 'severLink' }))].map((s) => s.id);
        expect(ids).toEqual(['vaccinate', 'vaccinate']);
    });
});

describe('coach never blocks and never comes back', () => {
    it('shows nothing while the game is paused, a sheet is open or the level is over', () => {
        expect(coachStep(day1({ blocked: true }))).toBeNull();
        expect(coachStep(day1({ gameOver: true }))).toBeNull();
        expect(coachStep(null)).toBeNull();
    });

    it('Skip ends it for good', () => {
        const memory = coachSkip(newCoachMemory());
        expect(coachStep(day1(), memory)).toBeNull();
        expect(coachFinished(day1(), memory)).toBe(true);
    });

    it('is finished when the level ends or the days run out, not before', () => {
        expect(coachFinished(day1())).toBe(false);
        expect(coachFinished(day1({ gameOver: true }))).toBe(true);
        expect(coachFinished(day1({ day: COACH_LAST_DAY + 1 }))).toBe(true);
    });

    it('dismissing does not mutate the memory it was given', () => {
        const memory = newCoachMemory();
        const next = coachDismiss(memory, coachStep(day1(), memory));
        expect(memory.dismissed).toEqual({});
        expect(next.dismissed).toEqual({ sick: true });
    });

    it('remembers under the flag the old How to play cards used', () => {
        expect(COACH_FLAG).toBe('vaxrebot-onboarded');
        const store = new Map();
        const storage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, v) };
        expect(coachSeen(storage)).toBe(false);
        markCoachSeen(storage);
        expect(store.get(COACH_FLAG)).toBe('true');
        expect(coachSeen(storage)).toBe(true);
    });

    it('survives storage that is missing or throws', () => {
        const broken = {
            getItem() {
                throw new Error('no storage');
            },
            setItem() {
                throw new Error('no storage');
            },
        };
        expect(coachSeen(null)).toBe(false);
        expect(coachSeen(broken)).toBe(false);
        expect(() => markCoachSeen(broken)).not.toThrow();
        expect(() => markCoachSeen(null)).not.toThrow();
    });
});

describe('a missed tap does not strand a new player', () => {
    const holding = day1({ selectedTool: 'severLink', sever: { state: 'ready', left: 2, limit: 3 }, riskLines: 3 });

    it('a waved-away "tap this" step comes back after a quiet moment', () => {
        let memory = coachDismiss(newCoachMemory(), coachStep(holding));
        expect(coachStep(holding, memory)).toBeNull();
        expect(coachRecall(holding, memory, COACH_RECALL_MS - 1)).toBe(memory);
        memory = coachRecall(holding, memory, COACH_RECALL_MS);
        expect(coachStep(holding, memory).text).toBe('Cut another red line. 2 left.');
    });

    it('brings back Tap Sever Link, not the reading step before it', () => {
        let memory = newCoachMemory();
        memory = coachDismiss(memory, coachStep(day1(), memory)); // sick
        memory = coachDismiss(memory, coachStep(day1(), memory)); // pick-sever
        expect(coachStep(day1(), memory)).toBeNull();
        memory = coachRecall(day1(), memory, 9000);
        expect(coachStep(day1(), memory).id).toBe('pick-sever');
        expect(memory.dismissed.sick).toBe(true);
    });

    it('never brings back a hint that only needed reading', () => {
        const day2 = day1({ day: 2, vaccinate: { state: 'ready' } });
        const memory = coachDismiss(newCoachMemory(), coachStep(day2));
        expect(coachRecall(day2, memory, 60000)).toBe(memory);
    });

    it('leaves things alone while a step is showing, the game is blocked or the coach was skipped', () => {
        const fresh = newCoachMemory();
        expect(coachRecall(day1(), fresh, 60000)).toBe(fresh);
        const waved = coachDismiss(fresh, coachStep(holding));
        expect(coachRecall({ ...holding, blocked: true }, waved, 60000)).toBe(waved);
        const skipped = coachSkip(waved);
        expect(coachRecall(holding, skipped, 60000)).toBe(skipped);
    });
});

describe('where the bubble goes', () => {
    const viewport = { width: 390, height: 844 };
    const bubble = { width: 260, height: 100 };

    it('sits below an anchor in the top half and above one in the bottom half', () => {
        const top = bubblePlacement({ x: 195, y: 200, r: 30 }, bubble, viewport);
        expect(top.side).toBe('below');
        expect(top.top).toBeGreaterThan(230);
        const bottom = bubblePlacement({ x: 195, y: 800, r: 26 }, bubble, viewport);
        expect(bottom.side).toBe('above');
        expect(bottom.top + bubble.height).toBeLessThan(800 - 26);
    });

    it('never leaves the screen, and the arrow still aims at the anchor', () => {
        for (const x of [5, 60, 195, 330, 385]) {
            const p = bubblePlacement({ x, y: 730, r: 40 }, bubble, viewport);
            expect(p.left).toBeGreaterThanOrEqual(8);
            expect(p.left + bubble.width).toBeLessThanOrEqual(390 - 8);
            expect(p.arrow).toBeGreaterThanOrEqual(18);
            expect(p.arrow).toBeLessThanOrEqual(bubble.width - 18);
        }
        const p = bubblePlacement({ x: 60, y: 730, r: 40 }, bubble, viewport);
        expect(p.left + p.arrow).toBe(60);
    });

    it('points at the longest red line and sticks with it', () => {
        const lines = [
            { id: 'a', ax: 0, ay: 0, bx: 30, by: 0 },
            { id: 'b', ax: 100, ay: 100, bx: 100, by: 300 },
        ];
        expect(pickRiskLine(lines)).toEqual({ id: 'b', x: 100, y: 200 });
        expect(pickRiskLine(lines, 'a')).toEqual({ id: 'a', x: 15, y: 0 });
        expect(pickRiskLine(lines, 'gone').id).toBe('b');
        expect(pickRiskLine([])).toBeNull();
    });
});

describe('facts read off the live game', () => {
    const level = LEVELS[0];
    const rules = rollLevelRules(level);
    const node = (id, state) => ({ id, state });
    const makeGame = (over = {}) => {
        const a = node(1, 'infected');
        const b = node(2, 'healthy');
        const c = node(3, 'healthy');
        const chips = (day, used) => [
            { id: 'severLink', state: used >= 3 ? 'spent' : 'ready', powerUp: false },
            { id: 'vaccinate', state: day >= 2 ? 'ready' : 'locked', powerUp: false },
            { id: 'quarantine', state: day >= 3 ? 'ready' : 'locked', powerUp: false },
            { id: 'eureka', state: 'empty', powerUp: true },
        ];
        const game = {
            gameState: { day: 1, gameOver: false, paused: false, dailyUsage: { severLink: 0 } },
            network: { nodes: [a, b, c], links: [{ source: a, target: b }, { source: a, target: c }, { source: b, target: c }] },
            tools,
            difficulty: rules.difficulty,
            selectedTool: null,
            currentScreen: 'game',
            wrapUp: null,
            view: { linkKind: (l) => (l.source.state === 'infected' || l.target.state === 'infected' ? 'risk' : 'normal') },
            autoAdvance: { isRunning: () => false },
            ...over,
        };
        game.currentChips = () => chips(game.gameState.day, game.gameState.dailyUsage.severLink || 0);
        return game;
    };

    it('level 1 really opens with Sever on day 1, Vaccinate on day 2, Quarantine on day 3', () => {
        expect(level.toolkit).toBeTruthy();
        const facts = coachFacts(makeGame(), null);
        expect(facts.sever).toEqual({ state: 'ready', left: 3, limit: 3 });
        expect(facts.sick).toBe(1);
        expect(facts.riskLines).toBe(2);
        expect(facts.blocked).toBe(false);
        expect(coachStep(facts).id).toBe('sick');
    });

    it('walks the day as the game state changes', () => {
        const game = makeGame();
        let memory = newCoachMemory();
        memory = coachDismiss(memory, coachStep(coachFacts(game, null), memory));
        expect(coachStep(coachFacts(game, null), memory).id).toBe('pick-sever');
        game.selectedTool = 'severLink';
        expect(coachStep(coachFacts(game, null), memory).id).toBe('cut');
        game.gameState.dailyUsage.severLink = 3;
        game.selectedTool = null;
        game.autoAdvance = { isRunning: () => true };
        const next = coachStep(coachFacts(game, null), memory);
        expect(next.id).toBe('next-day');
        expect(next.text).toBe(COACH_TEXT.nextDayAuto);
        game.gameState.day = 2;
        game.gameState.dailyUsage = {};
        game.autoAdvance = { isRunning: () => false };
        expect(coachStep(coachFacts(game, null), memory).id).toBe('vaccinate');
    });

    it('is blocked while paused, in wrap-up or off the game screen', () => {
        expect(coachFacts(makeGame({ wrapUp: {} }), null).blocked).toBe(true);
        expect(coachFacts(makeGame({ currentScreen: 'game-over' }), null).blocked).toBe(true);
        const paused = makeGame();
        paused.gameState.paused = true;
        expect(coachFacts(paused, null).blocked).toBe(true);
        expect(coachFacts({ gameState: null }, null)).toBeNull();
    });
});

describe('coach wiring, markup and style', () => {
    const game = read('src/game.js');
    const js = read('src/ui/coach.js');
    const css = read('src/ui/coach.css');

    it('the first level starts the coach; the old cards no longer open by themselves', () => {
        // Round 57: not while the solver is showing its best play.
        expect(game).toMatch(/this\.currentLevel\.id === LEVELS\[0\]\.id && !this\.demo\) \{\s*import\('\.\/ui\/coach\.js'\)\.then\(\(m\) => m\.startCoach\(this\)\);/);
        expect(game).not.toContain('maybeShowOnboarding');
        expect(read('src/ui/onboarding.js')).not.toContain('maybeShowOnboarding');
    });

    it('does not show for a player who has already seen it', () => {
        expect(js).toMatch(/if \(coachSeen\(storage\)\) return false;/);
        expect(js).toMatch(/function finish\(\) \{\s*markCoachSeen\(storage\);/);
    });

    it('never takes a tap: the layer ignores pointers and any tap waves the step away', () => {
        expect(css).toMatch(/\.coach \{[^}]*pointer-events:\s*none/);
        expect(js).toMatch(/addEventListener\('pointerdown', onPointerDown, true\)/);
        expect(js).toMatch(/memory = coachDismiss\(memory, step\)/);
        // The listener only watches; it must not swallow the tap.
        const handler = js.slice(js.indexOf('function onPointerDown'), js.indexOf('function onKeyDown'));
        expect(handler).not.toMatch(/preventDefault|stopPropagation/);
    });

    it('has a Skip control with a 44 px target', () => {
        expect(js).toContain('<button type="button" class="coach-skip">Skip tips</button>');
        const rule = css.match(/\.coach-skip,\s*\.coach-ok \{([^}]*)\}/)[1];
        expect(rule).toMatch(/pointer-events:\s*auto/);
        expect(rule).toMatch(/min-width:\s*44px/);
        expect(rule).toMatch(/min-height:\s*44px/);
    });

    it('anchors to the real tray chips, the Next day button and the live web', () => {
        expect(js).toContain('#tools-list [data-tool="${a.id}"]');
        expect(js).toContain("doc.getElementById('next-day')");
        expect(js).toContain("view.linkKind(l) !== 'risk'");
        expect(js).toContain('view.screenPoint(');
        expect(read('src/ui/panels.js')).toContain('data-tool="${c.id}"');
        expect(read('index.html')).toContain('id="next-day"');
    });

    it('respects reduced motion', () => {
        expect(css).toMatch(/prefers-reduced-motion: reduce\) \{\s*\.coach-ring, \.coach-bubble\.coach-in \{ animation: none; \}/);
    });

    it('"?" still opens a short reference that no longer says Start Playing', () => {
        expect(game).toMatch(/getElementById\('how-to-play'\)\.addEventListener\('click', \(\) => \{\s*import\('\.\/ui\/onboarding\.js'\)\.then\(\(m\) => m\.showOnboarding\(\)\);/);
        const ref = read('src/ui/onboarding.js');
        expect(ref).not.toContain('Start Playing');
        expect(ref).toContain('>Got it</button>');
        expect(ref).not.toContain('localStorage');
        expect(HOW_TO_PLAY).toHaveLength(3);
        for (const card of HOW_TO_PLAY) expect(card.body.length).toBeLessThanOrEqual(150);
    });

    it('uses no long dashes in anything a player reads', () => {
        const texts = Object.values(COACH_TEXT).map((t) => (typeof t === 'function' ? t(2) : t));
        for (const t of [...texts, js, css, read('src/ui/coach-model.js')]) expect(t).not.toMatch(/[\u2013\u2014]/);
    });
});
