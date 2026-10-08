// Progression tests: save system + unlock gating + points-to-stars scoring.
// Pure logic and the memory storage backend; no DOM, node environment.
import { describe, it, expect } from 'vitest';
import {
    createMemoryBackend,
    createStorage,
    freshSave,
    loadSave,
    writeSave,
    resetSave,
    SAVE_VERSION,
} from '../src/save.js';
import {
    LEVELS,
    REGIONS,
    levelById,
} from '../src/config/levels.js';
import {
    totalStars,
    levelRecord,
    isLevelUnlocked,
    lockReason,
    calculatePoints,
    calculateScore,
    calculateStars,
    fundingAward,
    livesSavedForRun,
    recordCompletion,
    regionProgress,
} from '../src/progress.js';

// A contained win on level 0 (care scenario, duration 18, target 800) with
// stats shaped like the real game stats. No daysUsed: defaults to par, so
// no speed bonus unless the test stamps one.
function winStats(overrides = {}) {
    return {
        initialPopulation: 100,
        totalDead: 0,
        totalInfected: 10,
        totalRecovered: 10,
        totalProtected: 5,
        ...overrides,
    };
}

const LEVEL_0 = 'r1-care-home';

describe('save system', () => {
    it('round-trips a save through the memory backend', () => {
        const storage = createMemoryBackend();
        const save = freshSave();
        save.funding = 125;
        save.livesSaved = 340;
        save.powerups.blitz = 2;
        save.openedChests.push('chest-a');
        save.levels['r1-care-home'] = { stars: 2, completed: true, bestDeaths: 3 };
        expect(writeSave(storage, save)).toBe(true);
        expect(loadSave(storage)).toEqual(save);
    });

    it('returns a fresh save when nothing is stored', () => {
        expect(loadSave(createMemoryBackend())).toEqual(freshSave());
    });

    it('fresh saves carry empty charge inventory and chest lists', () => {
        expect(freshSave().powerups).toEqual({ eureka: 0, blitz: 0, pay: 0 });
        expect(freshSave().openedChests).toEqual([]);
    });

    it('migrates a version 1 save in place, keeping progress', () => {
        const storage = createMemoryBackend();
        storage.setItem(
            'vaxrebot-save-v1',
            JSON.stringify({
                version: 1,
                funding: 75,
                livesSaved: 40,
                levels: { 'r1-care-home': { stars: 1, completed: true, bestDeaths: 8 } },
            })
        );
        const loaded = loadSave(storage);
        expect(loaded.version).toBe(SAVE_VERSION);
        expect(loaded.funding).toBe(75);
        expect(loaded.levels['r1-care-home'].stars).toBe(1);
        expect(loaded.powerups).toEqual({ eureka: 0, blitz: 0, pay: 0 });
        expect(loaded.openedChests).toEqual([]);
    });

    it('resets corrupt JSON to a fresh save instead of crashing', () => {
        const storage = createMemoryBackend();
        storage.setItem('vaxrebot-save-v1', '{not valid json');
        expect(loadSave(storage)).toEqual(freshSave());
    });

    it('resets a wrong-version save to fresh (safe migration path)', () => {
        const storage = createMemoryBackend();
        storage.setItem('vaxrebot-save-v1', JSON.stringify({ version: 999, funding: 1, livesSaved: 1, levels: {} }));
        expect(loadSave(storage)).toEqual(freshSave());
    });

    it('resetSave clears progress back to fresh', () => {
        const storage = createMemoryBackend();
        writeSave(storage, { ...freshSave(), funding: 200 });
        const reset = resetSave(storage);
        expect(reset).toEqual(freshSave());
        expect(loadSave(storage)).toEqual(freshSave());
    });

    it('createStorage works without a window object (node/tests)', () => {
        const storage = createStorage();
        expect(writeSave(storage, freshSave())).toBe(true);
    });
});

describe('unlock gating', () => {
    it('only the first level is unlocked on a fresh save', () => {
        const save = freshSave();
        expect(isLevelUnlocked(save, LEVELS, REGIONS, LEVELS[0].id)).toBe(true);
        for (const level of LEVELS.slice(1)) {
            expect(isLevelUnlocked(save, LEVELS, REGIONS, level.id)).toBe(false);
        }
    });

    it('completing a level unlocks the next one', () => {
        let save = freshSave();
        save = recordCompletion(save, LEVELS[0].id, 'contained', winStats());
        expect(isLevelUnlocked(save, LEVELS, REGIONS, LEVELS[1].id)).toBe(true);
        expect(isLevelUnlocked(save, LEVELS, REGIONS, LEVELS[2].id)).toBe(false);
    });

    it('region 2 stays locked until 6 stars even when region 1 is done', () => {
        let save = freshSave();
        // Complete all of region 1 with 1 star each = 3 stars total.
        for (const level of LEVELS.filter((l) => l.regionId === 'hometown')) {
            save = recordCompletion(save, level.id, 'contained', winStats({ totalDead: 10 }));
        }
        expect(totalStars(save)).toBe(3);
        const region2First = LEVELS.find((l) => l.regionId === 'national');
        expect(isLevelUnlocked(save, LEVELS, REGIONS, region2First.id)).toBe(false);
        expect(lockReason(save, LEVELS, REGIONS, region2First.id)).toMatch(/6/);
    });

    it('region 2 unlocks at 6 stars', () => {
        let save = freshSave();
        // Solid wins: 2 stars each = 6 stars total on every hometown level
        // (daysUsed 12 keeps the speed bonus under the 3-star line on all
        // three scenario durations).
        for (const level of LEVELS.filter((l) => l.regionId === 'hometown')) {
            save = recordCompletion(
                save,
                level.id,
                'contained',
                winStats({ totalDead: 1, totalRecovered: 40, daysUsed: 12 })
            );
        }
        expect(totalStars(save)).toBe(6);
        const region2First = LEVELS.find((l) => l.regionId === 'national');
        expect(isLevelUnlocked(save, LEVELS, REGIONS, region2First.id)).toBe(true);
    });

    it('lock reason names the previous level when the chain is incomplete', () => {
        const save = freshSave();
        expect(lockReason(save, LEVELS, REGIONS, LEVELS[1].id)).toMatch(/Greenfield Care Home/);
    });

    it('unknown level ids are never unlocked', () => {
        expect(isLevelUnlocked(freshSave(), LEVELS, REGIONS, 'nope')).toBe(false);
    });
});

describe('points formula', () => {
    it('scores 10 per survivor plus 2 per recovered', () => {
        // pop 100, 5 dead, 10 recovered: 950 + 20 = 970
        expect(calculatePoints('contained', winStats({ totalDead: 5 }), LEVEL_0)).toBe(970);
    });

    it('adds a speed bonus for finishing under par days', () => {
        // care par is 18 days; day 8 finish: 20 * 10 = 200 bonus
        const fast = calculatePoints('contained', winStats({ daysUsed: 8 }), LEVEL_0);
        const slow = calculatePoints('contained', winStats({ daysUsed: 18 }), LEVEL_0);
        expect(fast - slow).toBe(200);
    });

    it('penalizes power-up use', () => {
        const clean = calculatePoints('contained', winStats(), LEVEL_0);
        const boosted = calculatePoints('contained', winStats({ powerUpsUsed: 2 }), LEVEL_0);
        expect(clean - boosted).toBe(40);
    });

    it('scores 0 for losses and timeouts', () => {
        expect(calculatePoints('overwhelmed', winStats(), LEVEL_0)).toBe(0);
        expect(calculatePoints('timeout', winStats(), LEVEL_0)).toBe(0);
    });

    it('normalizes per capita so population rolls do not inflate stars', () => {
        const small = calculateScore('contained', winStats({ initialPopulation: 50, totalDead: 0, totalRecovered: 5 }), LEVEL_0);
        const big = calculateScore('contained', winStats({ initialPopulation: 200, totalDead: 0, totalRecovered: 20 }), LEVEL_0);
        expect(small).toBeCloseTo(big, 5);
    });
});

describe('points-to-stars', () => {
    // LEVEL_0 target is 800: 1 star >= 800, 2 stars >= 1040, 3 stars >= 1280.
    it('awards 1 star for beating the target', () => {
        // 5 dead, 10 recovered: 970 points -> score 970
        expect(calculateStars('contained', winStats({ totalDead: 5 }), LEVEL_0)).toBe(1);
    });

    it('awards 2 stars at 130% of target', () => {
        // 2 dead, 30 recovered, day 10 of 18: 980 + 60 + 160 = 1200
        expect(calculateStars('contained', winStats({ totalDead: 2, totalRecovered: 30, daysUsed: 10 }), LEVEL_0)).toBe(2);
    });

    it('awards 3 stars at 160% of target', () => {
        // 0 dead, 40 recovered, day 8 of 18: 1000 + 80 + 200 = 1280
        expect(calculateStars('contained', winStats({ totalDead: 0, totalRecovered: 40, daysUsed: 8 }), LEVEL_0)).toBe(3);
    });

    it('awards 0 stars for a messy win below target', () => {
        // 40 dead: 600 + 20 = 620, still counts as completed but banks nothing
        expect(calculateStars('contained', winStats({ totalDead: 40 }), LEVEL_0)).toBe(0);
    });

    it('awards 0 stars for overwhelmed and timeout', () => {
        expect(calculateStars('overwhelmed', winStats(), LEVEL_0)).toBe(0);
        expect(calculateStars('timeout', winStats(), LEVEL_0)).toBe(0);
    });

    it('accepts a level object or id', () => {
        const stats = winStats({ totalDead: 5 });
        expect(calculateStars('contained', stats, levelById(LEVEL_0))).toBe(
            calculateStars('contained', stats, LEVEL_0)
        );
    });
});

describe('funding awards', () => {
    it('pays base plus per-star bonus: 75 / 100 / 125', () => {
        expect(fundingAward(1)).toBe(75);
        expect(fundingAward(2)).toBe(100);
        expect(fundingAward(3)).toBe(125);
    });

    it('pays nothing for 0 stars', () => {
        expect(fundingAward(0)).toBe(0);
    });
});

describe('lives saved', () => {
    it('counts population minus deaths on a win', () => {
        expect(livesSavedForRun('contained', winStats({ initialPopulation: 120, totalDead: 7 }))).toBe(113);
    });

    it('banks nothing on losses and timeouts', () => {
        expect(livesSavedForRun('overwhelmed', winStats())).toBe(0);
        expect(livesSavedForRun('timeout', winStats())).toBe(0);
    });
});

describe('recordCompletion', () => {
    it('banks stars, funding, and lives on a win', () => {
        // 2 dead, 10 recovered: 980 + 20 = 1000 -> 1 star
        const save = recordCompletion(freshSave(), 'r1-care-home', 'contained', winStats({ totalDead: 2 }));
        expect(save.levels['r1-care-home']).toEqual({ stars: 1, completed: true, bestDeaths: 2 });
        expect(save.funding).toBe(75);
        expect(save.livesSaved).toBe(98);
    });

    it('keeps the best star count on replay', () => {
        let save = recordCompletion(freshSave(), 'r1-care-home', 'contained', winStats({ totalDead: 10 }));
        expect(save.levels['r1-care-home'].stars).toBe(1);
        save = recordCompletion(
            save,
            'r1-care-home',
            'contained',
            winStats({ totalDead: 1, totalRecovered: 40, daysUsed: 8 })
        );
        expect(save.levels['r1-care-home'].stars).toBe(2);
        expect(save.levels['r1-care-home'].bestDeaths).toBe(1);
        // Funding and lives accumulate across both runs.
        expect(save.funding).toBe(75 + 100);
        expect(save.livesSaved).toBe(90 + 99);
    });

    it('passes power-up inventory and opened chests through untouched', () => {
        const before = freshSave();
        before.powerups.eureka = 1;
        before.openedChests.push('chest-a');
        const after = recordCompletion(before, 'r1-care-home', 'contained', winStats());
        expect(after.powerups.eureka).toBe(1);
        expect(after.openedChests).toEqual(['chest-a']);
    });

    it('records nothing on a loss', () => {
        const save = recordCompletion(freshSave(), 'r1-care-home', 'overwhelmed', winStats({ totalDead: 40 }));
        expect(save.levels['r1-care-home']).toBeUndefined();
        expect(save.funding).toBe(0);
        expect(save.livesSaved).toBe(0);
    });

    it('does not mutate the input save', () => {
        const before = freshSave();
        recordCompletion(before, 'r1-care-home', 'contained', winStats());
        expect(before).toEqual(freshSave());
    });
});

describe('level list sanity', () => {
    it('has 9 levels in 3 regions with valid scenario and difficulty refs', () => {
        expect(LEVELS).toHaveLength(9);
        expect(REGIONS).toHaveLength(3);
        for (const level of LEVELS) {
            expect(levelById(level.id)).toBeTruthy();
            expect(REGIONS.some((r) => r.id === level.regionId)).toBe(true);
        }
    });

    it('every level has a scoring target', () => {
        for (const level of LEVELS) {
            expect(typeof level.target).toBe('number');
            expect(level.target).toBeGreaterThan(0);
        }
    });

    it('regionProgress reports completion and stars', () => {
        let save = freshSave();
        save = recordCompletion(save, 'r1-care-home', 'contained', winStats({ totalDead: 2 }));
        const p = regionProgress(save, LEVELS, 'hometown');
        expect(p).toEqual({ total: 3, completed: 1, stars: 1, maxStars: 9 });
    });
});
