// Wide audience round: new mechanics start on the third planet. The two
// learning planets (Mizuho and Hanabi) must keep their rules, their tuning
// and their games exactly, so their composed rules and seeded bot results
// are held to a snapshot taken before any mechanic was added
// (scripts/snapshot-learning-planets.mjs writes it).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { LEVELS } from '../src/config/levels.js';
import { levelRules } from '../src/config/level-rules.js';
import { learningLevels, composedRules, seededPlay, LEARNING_PLANETS } from '../src/sim/learning-snapshot.js';
import { FIRST_MECHANICS_PLANET, PLANET_MECHANICS, mechanicsFor, MECHANIC_TOOLS } from '../src/config/planet-mechanics.js';
import { tools } from '../src/config/tools.js';
import { toolChips } from '../src/ui/game-screen-model.js';
import { actionsRemaining } from '../src/sim/actions.js';
import { initGameState } from '../src/sim/state.js';

const snapshot = JSON.parse(readFileSync(new URL('./wide-mechanics-planets12.snapshot.json', import.meta.url), 'utf8'));
const plain = (x) => JSON.parse(JSON.stringify(x));

describe('the learning planets keep their rules (wide audience round)', () => {
    const levels = learningLevels();

    it('covers the first twenty levels', () => {
        expect(LEARNING_PLANETS).toBe(2);
        expect(FIRST_MECHANICS_PLANET).toBe(LEARNING_PLANETS);
        expect(levels).toHaveLength(20);
        expect(snapshot.map((s) => s.rules.id)).toEqual(levels.map((l) => l.id));
    });

    it('composed level rules match the snapshot taken before the new mechanics', () => {
        for (const [i, level] of levels.entries()) {
            expect(plain(composedRules(level)), level.id).toEqual(snapshot[i].rules);
        }
    });

    it('the same seeds still play the same games for every bot', () => {
        for (const [i, level] of levels.entries()) {
            expect(plain(seededPlay(level)), level.id).toEqual(snapshot[i].play);
        }
    });

    it('no mechanic can be configured on a learning planet', () => {
        for (const key of Object.keys(PLANET_MECHANICS)) expect(Number(key)).toBeGreaterThanOrEqual(FIRST_MECHANICS_PLANET);
        for (let k = 0; k < 10; k++) {
            expect(mechanicsFor(0, k)).toBe(null);
            expect(mechanicsFor(1, k)).toBe(null);
        }
        for (const level of levels) {
            expect(level.mechanics, level.id).toBeUndefined();
            const { difficulty } = levelRules(level);
            expect(difficulty.incubation, level.id).toBeUndefined();
            expect(difficulty.maskFactor, level.id).toBeUndefined();
            for (const t of MECHANIC_TOOLS) expect(level.toolkit.tools, level.id).not.toContain(t);
        }
    });

    it('the new tools do not exist there: no chip, no daily action', () => {
        for (const level of levels) {
            const { difficulty } = levelRules(level);
            const chips = toolChips(tools, difficulty, 3, initGameState(tools, 12).dailyUsage, {});
            for (const t of MECHANIC_TOOLS) expect(chips.find((c) => c.id === t), `${level.id} ${t}`).toBeUndefined();
            // Day 3: only the three classic tools count as actions.
            const state = initGameState(tools, 12);
            state.day = 3;
            const classic = ['vaccinate', 'quarantine', 'severLink'].reduce((a, id) => a + (difficulty.dailyLimits[id] || 0), 0);
            expect(actionsRemaining(state, tools, difficulty), level.id).toBe(classic);
        }
    });

    it('later planets do get mechanics', () => {
        expect(LEVELS.filter((l) => l.mechanics).length).toBeGreaterThanOrEqual(6);
        expect(LEVELS.filter((l) => l.mechanics).every((l) => l.planetIndex >= FIRST_MECHANICS_PLANET)).toBe(true);
    });
});
