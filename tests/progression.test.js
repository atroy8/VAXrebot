// Progression phase 1 tests: save system + unlock gating + stars/funding.
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
    calculateStars,
    fundingAward,
    livesSavedForRun,
    recordCompletion,
    regionProgress,
} from '../src/progress.js';

// A contained win on level 0 with stats shaped like the real game stats.
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

describe('save system', () => {
    it('round-trips a save through the memory backend', () => {
        const storage = createMemoryBackend();
        const save = freshSave();
        save.funding = 125;
        save.livesSaved = 340;
        save.levels['r1-care-home'] = { stars: 2, completed: true, bestDeaths: 3 };
        expect(writeSave(storage, save)).toBe(true);
        expect(loadSave(storage)).toEqual(save);
    });

    it('returns a fresh save when nothing is stored', () => {
        const loaded = loadSave(createMemoryBackend());
        expect(loaded).toEqual({ version: SAVE_VERSION, funding: 0, livesSaved: 0, levels: {} });
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
        for (const level of LEVELS.filter((l) => l.regionId === 'hometown')) {
            save = recordCompletion(save, level.id, 'contained', winStats({ totalDead: 1 }));
        }
        expect(totalStars(save)).toBe(9);
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

describe('star calculation', () => {
    it('awards 1 star for a contained win regardless of deaths', () => {
        expect(calculateStars('contained', winStats({ totalDead: 40 }))).toBe(1);
    });

    it('awards 2 stars at or under 5% deaths', () => {
        expect(calculateStars('contained', winStats({ totalDead: 5 }))).toBe(2);
        expect(calculateStars('contained', winStats({ totalDead: 6 }))).toBe(1);
    });

    it('awards 3 stars at or under 2% deaths', () => {
        expect(calculateStars('contained', winStats({ totalDead: 2 }))).toBe(3);
        expect(calculateStars('contained', winStats({ totalDead: 3 }))).toBe(2);
    });

    it('awards 0 stars for overwhelmed and timeout', () => {
        expect(calculateStars('overwhelmed', winStats())).toBe(0);
        expect(calculateStars('timeout', winStats())).toBe(0);
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
        const save = recordCompletion(freshSave(), 'r1-care-home', 'contained', winStats({ totalDead: 2 }));
        expect(save.levels['r1-care-home']).toEqual({ stars: 3, completed: true, bestDeaths: 2 });
        expect(save.funding).toBe(125);
        expect(save.livesSaved).toBe(98);
    });

    it('keeps the best star count on replay', () => {
        let save = recordCompletion(freshSave(), 'r1-care-home', 'contained', winStats({ totalDead: 30 }));
        expect(save.levels['r1-care-home'].stars).toBe(1);
        save = recordCompletion(save, 'r1-care-home', 'contained', winStats({ totalDead: 1 }));
        expect(save.levels['r1-care-home'].stars).toBe(3);
        expect(save.levels['r1-care-home'].bestDeaths).toBe(1);
        // Funding and lives accumulate across both runs.
        expect(save.funding).toBe(75 + 125);
        expect(save.livesSaved).toBe(70 + 99);
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

    it('regionProgress reports completion and stars', () => {
        let save = freshSave();
        save = recordCompletion(save, 'r1-care-home', 'contained', winStats({ totalDead: 2 }));
        const p = regionProgress(save, LEVELS, 'hometown');
        expect(p).toEqual({ total: 3, completed: 1, stars: 3, maxStars: 9 });
    });
});
