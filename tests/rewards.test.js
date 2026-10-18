import { describe, it, expect } from 'vitest';
import { careBonus, newlyUnlockedChests, CARE_BONUS } from '../src/rewards.js';
import { LEVELS } from '../src/config/levels.js';
import { CHESTS } from '../src/config/chests.js';
import { freshSave } from '../src/save.js';
import { applyNodeTool } from '../src/sim/actions.js';
import { initGameState } from '../src/sim/state.js';
import { tools } from '../src/config/tools.js';
import { parDaysFor } from '../src/progress.js';

const level = LEVELS[0];
const par = parDaysFor(level);
const stats = (o = {}) => ({ initialPopulation: 40, totalDead: 0, totalRecovered: 5, treated: 3, isolated: 2, daysUsed: par - 3, ...o });

describe('care bonus', () => {
    it('pays per person in each bin plus clean and fast extras', () => {
        const { lines, total } = careBonus('contained', stats(), level);
        const by = Object.fromEntries(lines.map((l) => [l.id, l.amount]));
        expect(by).toEqual({ treatment: 9, cured: 10, isolated: 2, noDeaths: 20, speed: 15 });
        expect(total).toBe(56);
    });

    it('pays nothing for a loss or a burnout', () => {
        expect(careBonus('overwhelmed', stats(), level).total).toBe(0);
        expect(careBonus('burnout', stats(), level).total).toBe(0);
    });

    it('leaves out empty lines and caps the speed bonus', () => {
        const { lines } = careBonus('contained', stats({ treated: 0, isolated: 0, totalDead: 1, daysUsed: 1 }), level);
        expect(lines.map((l) => l.id)).toEqual(['cured', 'speed']);
        expect(lines[1].amount).toBe(CARE_BONUS.maxSpeedBonus);
    });

    it('treating the sick pays more than isolating the healthy', () => {
        expect(CARE_BONUS.perTreated).toBeGreaterThan(CARE_BONUS.perIsolated);
    });
});

describe('treated and isolated counts', () => {
    it('quarantine counts sick people as treated and healthy people as isolated', () => {
        const state = initGameState(tools, 30);
        applyNodeTool(state, tools, 'quarantine', { id: 1, state: 'infected' });
        applyNodeTool(state, tools, 'quarantine', { id: 2, state: 'healthy' });
        applyNodeTool(state, tools, 'vaccinate', { id: 3, state: 'healthy' });
        expect(state.stats.treated).toBe(1);
        expect(state.stats.isolated).toBe(1);
    });
});

describe('prize boxes a win unlocks', () => {
    const win = (save, id, stars) => ({ ...save, levels: { ...save.levels, [id]: { stars, completed: true, bestDeaths: 0 } } });

    // Round 14: two boxes per planet, after its 5th level and its boss.
    const BOX = LEVELS[CHESTS[0].afterLevelIndex];

    it('every planet has two prize boxes, after its 5th and 10th levels', () => {
        expect(CHESTS).toHaveLength(16);
        expect(CHESTS.slice(0, 2).map((c) => c.afterLevelIndex)).toEqual([4, 9]);
        expect(new Set(CHESTS.map((c) => c.id)).size).toBe(16);
        for (const c of CHESTS) expect(LEVELS[c.afterLevelIndex], c.id).toBeTruthy();
        const gives = new Set(CHESTS.flatMap((c) => Object.keys(c.gives)));
        expect([...gives].sort()).toEqual(['blitz', 'eureka', 'pay']);
    });

    it('a first star on the box level unlocks its box', () => {
        const before = freshSave();
        const after = win(before, BOX.id, 2);
        const got = newlyUnlockedChests({ chests: CHESTS, levels: LEVELS, levelId: BOX.id, saveBefore: before, saveAfter: after });
        expect(got.map((c) => c.id)).toEqual([CHESTS[0].id]);
    });

    it('not again on a replay, not on a 0 star win, not once opened, not on other levels', () => {
        const one = win(freshSave(), BOX.id, 1);
        expect(newlyUnlockedChests({ chests: CHESTS, levels: LEVELS, levelId: BOX.id, saveBefore: one, saveAfter: win(one, BOX.id, 3) })).toEqual([]);
        const zero = win(freshSave(), BOX.id, 0);
        expect(newlyUnlockedChests({ chests: CHESTS, levels: LEVELS, levelId: BOX.id, saveBefore: freshSave(), saveAfter: zero })).toEqual([]);
        const opened = { ...win(freshSave(), BOX.id, 2), openedChests: [CHESTS[0].id] };
        expect(newlyUnlockedChests({ chests: CHESTS, levels: LEVELS, levelId: BOX.id, saveBefore: freshSave(), saveAfter: opened })).toEqual([]);
        expect(newlyUnlockedChests({ chests: CHESTS, levels: LEVELS, levelId: LEVELS[1].id, saveBefore: freshSave(), saveAfter: win(freshSave(), LEVELS[1].id, 3) })).toEqual([]);
    });
});
