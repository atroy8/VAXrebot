import { describe, it, expect } from 'vitest';
import { careBonus, newlyUnlockedChests, CARE_BONUS } from '../src/rewards.js';
import { LEVELS } from '../src/config/levels.js';
import { CHESTS } from '../src/config/chests.js';
import { freshSave } from '../src/save.js';
import { applyNodeTool } from '../src/sim/actions.js';
import { initGameState } from '../src/sim/state.js';
import { tools } from '../src/config/tools.js';

const level = LEVELS[0]; // par 12
const stats = (o = {}) => ({ initialPopulation: 40, totalDead: 0, totalRecovered: 5, treated: 3, isolated: 2, daysUsed: 9, ...o });

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

    it('a first star on the box level unlocks its box', () => {
        const before = freshSave();
        const after = win(before, LEVELS[0].id, 2);
        const got = newlyUnlockedChests({ chests: CHESTS, levels: LEVELS, levelId: LEVELS[0].id, saveBefore: before, saveAfter: after });
        expect(got.map((c) => c.id)).toEqual(['chest-a']);
    });

    it('not again on a replay, not on a 0 star win, not once opened, not on other levels', () => {
        const one = win(freshSave(), LEVELS[0].id, 1);
        expect(newlyUnlockedChests({ chests: CHESTS, levels: LEVELS, levelId: LEVELS[0].id, saveBefore: one, saveAfter: win(one, LEVELS[0].id, 3) })).toEqual([]);
        const zero = win(freshSave(), LEVELS[0].id, 0);
        expect(newlyUnlockedChests({ chests: CHESTS, levels: LEVELS, levelId: LEVELS[0].id, saveBefore: freshSave(), saveAfter: zero })).toEqual([]);
        const opened = { ...win(freshSave(), LEVELS[0].id, 2), openedChests: ['chest-a'] };
        expect(newlyUnlockedChests({ chests: CHESTS, levels: LEVELS, levelId: LEVELS[0].id, saveBefore: freshSave(), saveAfter: opened })).toEqual([]);
        expect(newlyUnlockedChests({ chests: CHESTS, levels: LEVELS, levelId: LEVELS[1].id, saveBefore: freshSave(), saveAfter: win(freshSave(), LEVELS[1].id, 3) })).toEqual([]);
    });
});
