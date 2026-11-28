// Round 51: the first level is a new player's first game. With 2 cuts a
// day about 1 in 7 sensible first games were lost on day 2 or 3, before
// Quarantine opens. Level 1 now gets a third cut a day (hand-set in
// src/config/campaign.js, left alone by the tuner).
// Round 57: the tuner is scripts/tune-puzzles.mjs (src/sim/puzzle-lab.js)
// and the table is src/config/puzzle-tuning.js. Level 1 is the tutorial:
// the dealer only deals webs where simply cutting red lines is the best
// play, so 3 stars there are meant to be easy (the old "stars on level 1
// still have to be earned" check is replaced by the one below it).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { LEVELS } from '../src/config/levels.js';
import { ONBOARDING_TUNING } from '../src/config/campaign.js';
import { PUZZLE_TUNING } from '../src/config/puzzle-tuning.js';
import { TUTORIAL_LEVEL_ID, HAND_SET_LEVELS, puzzleSpecFor } from '../src/config/puzzle-specs.js';
import { levelRules } from '../src/config/level-rules.js';
import { playRun, summarize } from '../src/sim/balance.js';
import { tuneLevel } from '../src/sim/puzzle-lab.js';

const first = LEVELS[0];

describe('round 51: a fair first level', () => {
    it('level 1 allows three cuts a day and keeps its other limits', () => {
        const { difficulty } = levelRules(first);
        expect(difficulty.dailyLimits.severLink).toBe(3);
        expect(difficulty.dailyLimits.vaccinate).toBe(2);
        expect(difficulty.dailyLimits.quarantine).toBe(2);
    });

    it('only the first level is hand-set; every other level keeps its tuned limits', () => {
        expect(Object.keys(ONBOARDING_TUNING)).toEqual([first.id]);
        expect(first.id).toBe(TUTORIAL_LEVEL_ID);
        expect(PUZZLE_TUNING[first.id]).toBeUndefined();
        // (The last level of the game is hand-set too, in FINALE_TUNING.)
        expect(HAND_SET_LEVELS).toEqual([first.id, LEVELS.at(-1).id]);
        for (const level of LEVELS.slice(1, -1)) {
            const tuned = PUZZLE_TUNING[level.id];
            expect(tuned, level.id).toBeTruthy();
            for (const [tool, n] of Object.entries(tuned.dailyLimits)) expect(level.tuning.dailyLimits[tool], `${level.id} ${tool}`).toBe(n);
        }
    });

    it('the tuner never retunes a hand-set level', () => {
        expect(tuneLevel(first)).toBe(null);
        expect(tuneLevel(LEVELS.at(-1))).toBe(null);
        expect(puzzleSpecFor(first).tutorial).toBe(true);
        expect(puzzleSpecFor(LEVELS[1]).tutorial).toBeUndefined();
    });

    it('a new player who does the obvious things almost always wins level 1', () => {
        expect(summarize(first, 'beginner', 150, 51).winRate).toBeGreaterThanOrEqual(0.95);
        expect(summarize(first, 'smart', 150, 51).winRate).toBeGreaterThanOrEqual(0.97);
    });

    it('sensible play is almost never lost before Quarantine can help (day 3)', () => {
        let early = 0;
        const N = 150;
        for (let i = 0; i < N; i++) {
            const r = playRun(first, 'beginner', 5100 + i);
            if (r.outcome !== 'contained' && r.day <= 3) early++;
        }
        expect(early / N).toBeLessThanOrEqual(0.02);
    });

    it('level 1 still asks for real moves: random taps rarely win and doing nothing never does', () => {
        expect(summarize(first, 'random', 150, 51).winRate).toBeLessThanOrEqual(0.25);
        expect(summarize(first, 'passive', 60, 51).counts.contained || 0).toBe(0);
    });

    it('3 stars on level 1 are there for anyone who cuts the red lines, and for nobody who taps at random', () => {
        const smart = summarize(first, 'smart', 150, 51);
        expect(smart.starDist[3] / 150).toBeGreaterThanOrEqual(0.9);
        const random = summarize(first, 'random', 150, 51);
        expect(random.starDist[3] / 150).toBeLessThanOrEqual(0.1);
    });
});

describe('round 51: results text no longer shows sliced above the buttons', () => {
    const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
    const rule = (css, selector) => {
        const i = css.indexOf(selector + ' {');
        return i < 0 ? null : css.slice(i, css.indexOf('}', i));
    };
    const base = read('src/ui/game-screen.css');
    const theme = read('src/ui/theme-ai-gold.css');

    it('the sticky bar is solid paper, with no see-through band at its top', () => {
        expect(rule(base, '#game-over-screen .game-over-actions')).toMatch(/background:\s*var\(--results-paper/);
        const themed = rule(theme, 'html #game-over-screen .game-over-actions');
        expect(themed).toMatch(/background:\s*var\(--results-paper\)/);
        expect(themed).not.toMatch(/gradient/);
    });

    it('a fade above the bar lets text melt away before it reaches the buttons', () => {
        const fade = rule(base, '#game-over-screen .game-over-actions::before');
        expect(fade).not.toBeNull();
        expect(fade).toMatch(/bottom:\s*100%/);
        expect(fade).toMatch(/pointer-events:\s*none/);
        expect(fade).toMatch(/linear-gradient\([^;]*var\(--results-paper/);
    });
});
