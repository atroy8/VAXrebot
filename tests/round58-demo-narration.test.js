// Round 58: the first-run coach bubble no longer hides the red lines, and
// Show best play names and marks each move before it happens, so
// the player can follow the solution instead of watching it flash past.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { demoMoveText, demoHeadText, demoNightText } from '../src/ui/demo-narration.js';
import { createDealer, startDeal } from '../src/sim/dealer.js';
import { findMove } from '../src/sim/solver.js';
import { LEVELS } from '../src/config/levels.js';
import { bubblePlacement, coveredCount, samplePoints } from '../src/ui/coach-model.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
// game-deal.js needs a browser to import, so its two timings are read from the source.
const timing = (name) => Number(read('src/game-deal.js').match(new RegExp(`export const ${name} = (\\d+);`))[1]);
const DEMO_LOOK_MS = timing('DEMO_LOOK_MS');
const DEMO_STEP_MS = timing('DEMO_STEP_MS');
const NAMES = ['Aiko', 'Bram', 'Chidi', 'Dana', 'Emre', 'Femi', 'Gita', 'Hana', 'Ines', 'Jun'];
const nameOf = (id) => NAMES[id % NAMES.length];

describe('the words for each move', () => {
    it('names both people on a cut and the person for every other tool', () => {
        expect(demoMoveText({ day: 1, toolId: 'severLink', a: 0, b: 1 }, nameOf)).toBe('Day 1: Cut the line between Aiko and Bram');
        expect(demoMoveText({ day: 2, toolId: 'vaccinate', node: 2 }, nameOf)).toBe('Day 2: Vaccinate Chidi');
        expect(demoMoveText({ day: 3, toolId: 'quarantine', node: 3 }, nameOf)).toBe('Day 3: Quarantine Dana');
        expect(demoMoveText({ day: 2, toolId: 'test', node: 4 }, nameOf)).toBe('Day 2: Test Emre');
        expect(demoMoveText({ day: 1, toolId: 'mask', node: 5 }, nameOf)).toBe('Day 1: Mask Femi');
    });

    it('never shows an empty or undefined name', () => {
        expect(demoMoveText({ day: 1, toolId: 'vaccinate', node: 4 }, () => undefined)).toBe('Day 1: Vaccinate person 5');
        expect(demoMoveText({ day: 1, toolId: 'severLink', a: 0, b: 9 })).toBe('Day 1: Cut the line between person 1 and person 10');
        expect(demoMoveText({ day: 4, toolId: 'newTool', node: 1 }, nameOf)).toBe('Day 4: newTool Bram');
        expect(demoMoveText(null, nameOf)).toBe('');
    });

    it('counts the moves under the par line', () => {
        expect(demoHeadText({ cases: 1 })).toBe('Best play: 1 case');
        expect(demoHeadText({ cases: 3, done: 2, total: 5 })).toBe('Best play: 3 cases · move 2 of 5');
        expect(demoHeadText({ cases: 3, done: 9, total: 5 })).toBe('Best play: 3 cases · move 5 of 5');
    });

    it('says when a day ends and when every move is made', () => {
        expect(demoNightText(2, 3)).toBe('Day 2 done. Night falls.');
        expect(demoNightText(4, 0)).toBe('Every move made. Now watch it fade out.');
    });

    it('uses no em dashes anywhere in the replay text', () => {
        expect(read('src/ui/demo-narration.js')).not.toContain('\u2014');
    });
});

describe('every real best play can be narrated', () => {
    it('on the first level of every planet, each solver move has a target and a full sentence', () => {
        const firsts = LEVELS.filter((l) => /-1$/.test(l.id));
        expect(firsts.length).toBeGreaterThanOrEqual(8);
        for (const level of firsts) {
            const deal = createDealer(level, 58).finish();
            expect(deal.par, level.id).toBeTruthy();
            const { network } = startDeal(deal);
            for (const move of deal.par.moves) {
                const text = demoMoveText(move, nameOf);
                expect(text, level.id).toMatch(/^Day \d+: [A-Z]/);
                expect(text, level.id).not.toMatch(/undefined|NaN|null/);
                // The move points at something that exists on the opening web
                // (cuts and people on day 1 at least; later moves may target
                // people the web still has).
                if (move.day === 1) expect(findMove(network, move), `${level.id} ${text}`).toBeTruthy();
            }
        }
    });
});

describe('the replay is wired to show, wait, then act', () => {
    const deal = read('src/game-deal.js');
    const demo = deal.slice(deal.indexOf('async showBestPlay()'), deal.indexOf('endDemo() {'));

    it('gives the player time to read each move', () => {
        expect(DEMO_LOOK_MS).toBeGreaterThanOrEqual(1000);
        expect(DEMO_STEP_MS).toBeGreaterThan(0);
    });

    it('names and marks a move before applying it', () => {
        const say = demo.indexOf('demoMoveText(move, nameOf)');
        const mark = demo.indexOf('showMark(this.view');
        const act = demo.indexOf('this.applyToolToLink(found.link)');
        expect(say).toBeGreaterThan(0);
        expect(mark).toBeGreaterThan(say);
        expect(act).toBeGreaterThan(mark);
        expect(demo).toContain('}, DEMO_LOOK_MS);');
        expect(demo).toContain('demoNightText(state.day, this.demo.moves.length)');
        expect(demo).toContain('demoHeadText(');
    });

    it('clears the marker when the replay ends early', () => {
        const end = deal.slice(deal.indexOf('endDemo() {'));
        expect(end).toContain('clearMarks()');
    });

    it('the banner has a progress line and a move line', () => {
        const html = read('index.html');
        expect(html).toContain('id="demo-head"');
        expect(html).toContain('id="demo-text"');
        expect(read('src/ui/round57.css')).toContain('.demo-head');
    });
});

// Round 58, second fix: the first-run coach bubble used to sit on the red
// lines it was talking about ("Red lines are where it will jump tonight").

describe('the coach bubble keeps the red lines in view', () => {
    const viewport = { width: 390, height: 844 };
    const bubble = { width: 280, height: 115 };
    // The level 1 case from the playtest: the sick person at (110, 365) with
    // red lines running down to (60, 527) and (160, 530), and one up to (205, 330).
    const sick = { x: 110, y: 365, r: 34 };
    const red = [
        { ax: 110, ay: 365, bx: 60, by: 527 },
        { ax: 110, ay: 365, bx: 160, by: 530 },
        { ax: 110, ay: 365, bx: 205, by: 330 },
    ];

    it('samples every red line from end to end', () => {
        const pts = samplePoints(red, 4);
        expect(pts.length).toBe(15);
        expect(pts[0]).toEqual({ x: 110, y: 365 });
        expect(pts[4]).toEqual({ x: 60, y: 527 });
    });

    it('moves the bubble to the other side when that hides fewer red lines', () => {
        const avoid = samplePoints(red);
        const old = bubblePlacement(sick, bubble, viewport);
        expect(old.side).toBe('below'); // the playtest problem
        const before = coveredCount(old, bubble, avoid);
        expect(before).toBeGreaterThan(0);
        const now = bubblePlacement(sick, bubble, viewport, { avoid });
        expect(now.side).toBe('above');
        expect(coveredCount(now, bubble, avoid)).toBeLessThan(before);
    });

    it('keeps the usual side when it hides nothing, or when both sides hide as much', () => {
        const clear = bubblePlacement({ x: 195, y: 200, r: 30 }, bubble, viewport, { avoid: [{ x: 20, y: 20 }] });
        expect(clear.side).toBe('below');
        // Points under both possible bubbles: no gain, so no flip.
        const both = [{ x: 195, y: 300 }, { x: 195, y: 100 }];
        expect(bubblePlacement({ x: 195, y: 200, r: 30 }, bubble, viewport, { avoid: both }).side).toBe('below');
    });

    it('stays on screen on either side', () => {
        for (const y of [60, 200, 422, 600, 800]) {
            const p = bubblePlacement({ x: 195, y, r: 34 }, bubble, viewport, { avoid: samplePoints(red) });
            expect(p.top).toBeGreaterThanOrEqual(8);
            expect(p.top + bubble.height).toBeLessThanOrEqual(844 - 8);
        }
    });

    it('the coach passes the red lines in', () => {
        expect(read('src/ui/coach.js')).toContain('bubblePlacement(anchor, size, view, { avoid: samplePoints(riskLines()) })');
    });
});
