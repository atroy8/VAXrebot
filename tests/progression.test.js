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
    SYSTEMS,
} from '../src/config/levels.js';
import { scenarios } from '../src/config/scenarios.js';
import { difficulties } from '../src/config/difficulties.js';
import {
    totalStars,
    levelRecord,
    isLevelUnlocked,
    lockReason,
    calculatePoints,
    calculateScore,
    calculateStars,
    fundingAward,
    goldAward,
    livesSavedForRun,
    recordCompletion,
    regionProgress,
    parDaysFor,
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

const LEVEL_0 = LEVELS[0].id;

// These tests check the scoring formula itself, so they pin the first
// planet to the classic 18 day par for the speed bonus (module state is per
// test file, so other tests see the real tuning). Round 57: the 800 point
// star target that was pinned here too is gone with the star targets.
for (const level of LEVELS.filter((l) => l.regionId === REGIONS[0].id)) {
    level.tuning.parDays = 18;
}

describe('save system', () => {
    it('round-trips a save through the memory backend', () => {
        const storage = createMemoryBackend();
        const save = freshSave();
        save.funding = 125;
        save.livesSaved = 340;
        save.powerups.blitz = 2;
        save.openedChests.push('chest-a');
        save.levels['mizuho-1'] = { stars: 2, completed: true, bestDeaths: 3 };
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
                levels: { 'mizuho-1': { stars: 1, completed: true, bestDeaths: 8 } },
            })
        );
        const loaded = loadSave(storage);
        expect(loaded.version).toBe(SAVE_VERSION);
        expect(loaded.funding).toBe(75);
        expect(loaded.levels['mizuho-1'].stars).toBe(1);
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

    it('planet 2 stays locked until 15 stars even when planet 1 is done', () => {
        let save = freshSave();
        // Complete all of planet 1 with 1 star each = 10 stars total.
        for (const level of LEVELS.filter((l) => l.regionId === REGIONS[0].id)) {
            save = recordCompletion(save, level.id, 'contained', winStats({ totalDead: 10 }));
        }
        expect(totalStars(save)).toBe(10);
        expect(REGIONS[1].starRequirement).toBe(15);
        const planet2First = LEVELS.find((l) => l.regionId === REGIONS[1].id);
        expect(isLevelUnlocked(save, LEVELS, REGIONS, planet2First.id)).toBe(false);
        expect(lockReason(save, LEVELS, REGIONS, planet2First.id)).toMatch(/15/);
    });

    it('planet 2 unlocks at 15 stars', () => {
        let save = freshSave();
        // Round 57: stars come from par. One case over par is 2 stars each = 20 stars.
        for (const level of LEVELS.filter((l) => l.regionId === REGIONS[0].id)) {
            save = recordCompletion(save, level.id, 'contained', winStats({ totalInfected: 10, par: { cases: 9, deaths: 0, days: 6 } }));
        }
        expect(totalStars(save)).toBe(20);
        const planet2First = LEVELS.find((l) => l.regionId === REGIONS[1].id);
        expect(isLevelUnlocked(save, LEVELS, REGIONS, planet2First.id)).toBe(true);
    });

    it('star requirements climb planet by planet', () => {
        expect(REGIONS[0].starRequirement).toBe(0);
        for (let i = 1; i < REGIONS.length; i++) expect(REGIONS[i].starRequirement).toBeGreaterThan(REGIONS[i - 1].starRequirement);
        // Never more than the stars available on the planets before it.
        for (let i = 1; i < REGIONS.length; i++) expect(REGIONS[i].starRequirement).toBeLessThanOrEqual(i * 10 * 3);
    });

    it('lock reason names the previous level when the chain is incomplete', () => {
        const save = freshSave();
        expect(lockReason(save, LEVELS, REGIONS, LEVELS[1].id)).toContain(LEVELS[0].name);
    });

    it('unknown level ids are never unlocked', () => {
        expect(isLevelUnlocked(freshSave(), LEVELS, REGIONS, 'nope')).toBe(false);
    });
});

describe('points formula', () => {
    // Round 57: the 2 points per recovered person (which paid for letting
    // people fall sick) became 1 point per person who never fell sick.
    it('scores 10 per survivor plus 1 per person kept well', () => {
        // pop 100, 5 dead, 10 ever sick: 950 + 90 = 1040
        expect(calculatePoints('contained', winStats({ totalDead: 5 }), LEVEL_0)).toBe(1040);
    });

    it('adds a speed bonus for finishing under par days', () => {
        // 20 points per day under the level's tuned par.
        const par = parDaysFor(levelById(LEVEL_0));
        expect(par).toBeGreaterThan(2);
        const fast = calculatePoints('contained', winStats({ daysUsed: par - 2 }), LEVEL_0);
        const slow = calculatePoints('contained', winStats({ daysUsed: par }), LEVEL_0);
        const late = calculatePoints('contained', winStats({ daysUsed: par + 3 }), LEVEL_0);
        expect(fast - slow).toBe(40);
        expect(late).toBe(slow);
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
        const small = calculateScore('contained', winStats({ initialPopulation: 50, totalDead: 0, totalInfected: 5 }), LEVEL_0);
        const big = calculateScore('contained', winStats({ initialPopulation: 200, totalDead: 0, totalInfected: 20 }), LEVEL_0);
        expect(small).toBeCloseTo(big, 5);
    });
});

// Round 57: stars no longer come from points against a per-level target.
// They compare the result with par (tests/round57-stars.test.js has the
// full table); these keep the old cases as they now read.
describe('stars against par', () => {
    const par = { cases: 10, deaths: 0, days: 6 };
    it('awards 1 star for a win well over par', () => {
        expect(calculateStars('contained', winStats({ totalInfected: 30, par }), LEVEL_0)).toBe(1);
    });

    it('awards 2 stars within the slack of par (2 cases on a web of 100)', () => {
        expect(calculateStars('contained', winStats({ totalInfected: 12, par }), LEVEL_0)).toBe(2);
        expect(calculateStars('contained', winStats({ totalInfected: 13, par }), LEVEL_0)).toBe(1);
    });

    it('awards 3 stars for matching par', () => {
        expect(calculateStars('contained', winStats({ totalInfected: 10, par }), LEVEL_0)).toBe(3);
        expect(calculateStars('contained', winStats({ totalInfected: 10, totalDead: 1, par }), LEVEL_0)).toBe(2);
    });

    it('a messy win still earns its star: any win is at least 1', () => {
        expect(calculateStars('contained', winStats({ totalDead: 40, totalInfected: 60, par }), LEVEL_0)).toBe(1);
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
        // 2 dead, 10 ever sick: 980 + 90 = 1070 points. No par on these
        // stats (a web that was not dealt), so the win is 1 star.
        const save = recordCompletion(freshSave(), 'mizuho-1', 'contained', winStats({ totalDead: 2 }));
        expect(save.levels['mizuho-1']).toEqual({ stars: 1, completed: true, bestDeaths: 2 });
        // Round 55: 10 points = 1 gold, so a score of 1070 pays 107.
        expect(save.funding).toBe(107);
        expect(save.livesSaved).toBe(98);
    });

    it('keeps the best star count on replay', () => {
        let save = recordCompletion(freshSave(), 'mizuho-1', 'contained', winStats({ totalDead: 10 }));
        expect(save.levels['mizuho-1'].stars).toBe(1);
        save = recordCompletion(
            save,
            'mizuho-1',
            'contained',
            winStats({ totalDead: 1, totalInfected: 10, par: { cases: 10, deaths: 0, days: 6 } })
        );
        expect(save.levels['mizuho-1'].stars).toBe(2);
        expect(save.levels['mizuho-1'].bestDeaths).toBe(1);
        // Funding and lives accumulate across both runs.
        // Round 55: gold follows each run's score (goldAward), not its stars.
        const first = goldAward('contained', winStats({ totalDead: 10 }), 'mizuho-1');
        const second = goldAward('contained', winStats({ totalDead: 1, totalRecovered: 40, daysUsed: parDaysFor(levelById('mizuho-1')) }), 'mizuho-1');
        expect(save.funding).toBe(first + second);
        expect(second).toBeGreaterThan(first);
        expect(save.livesSaved).toBe(90 + 99);
    });

    it('passes power-up inventory and opened chests through untouched', () => {
        const before = freshSave();
        before.powerups.eureka = 1;
        before.openedChests.push('chest-a');
        const after = recordCompletion(before, 'mizuho-1', 'contained', winStats());
        expect(after.powerups.eureka).toBe(1);
        expect(after.openedChests).toEqual(['chest-a']);
    });

    it('records nothing on a loss', () => {
        const save = recordCompletion(freshSave(), 'mizuho-1', 'overwhelmed', winStats({ totalDead: 40 }));
        expect(save.levels['mizuho-1']).toBeUndefined();
        expect(save.funding).toBe(0);
        expect(save.livesSaved).toBe(0);
    });

    it('does not mutate the input save', () => {
        const before = freshSave();
        recordCompletion(before, 'mizuho-1', 'contained', winStats());
        expect(before).toEqual(freshSave());
    });
});

describe('level list sanity', () => {
    it('has 80 levels: 10 on each of 8 planets in 3 systems, with valid refs', () => {
        expect(LEVELS).toHaveLength(80);
        expect(REGIONS).toHaveLength(8);
        expect(SYSTEMS).toHaveLength(3);
        for (const system of SYSTEMS) {
            const planets = REGIONS.filter((r) => r.systemId === system.id);
            expect(planets.length).toBeGreaterThanOrEqual(2);
            expect(planets.length).toBeLessThanOrEqual(3);
        }
        for (const region of REGIONS) expect(LEVELS.filter((l) => l.regionId === region.id)).toHaveLength(10);
        expect(new Set(LEVELS.map((l) => l.id)).size).toBe(80);
        expect(new Set(LEVELS.map((l) => l.name)).size).toBe(80);
        for (const level of LEVELS) {
            expect(levelById(level.id)).toBeTruthy();
            expect(scenarios[level.scenarioId], level.id).toBeTruthy();
            expect(difficulties[level.difficultyId], level.id).toBeTruthy();
        }
    });

    it('every planet has puzzle levels and ends on a boss carrier', () => {
        for (const region of REGIONS) {
            const lv = LEVELS.filter((l) => l.regionId === region.id);
            const types = new Set(lv.filter((l) => l.variant).map((l) => l.variant.type));
            expect([...types].sort()).toEqual(['envoy', 'noQuarantine', 'noVaccines', 'superSpreader']);
            expect(lv[9].variant).toMatchObject({ type: 'superSpreader', boss: true });
        }
    });

    // Round 57: per-level score targets are retired (stars come from par).
    it('no level has a scoring target any more, and every level has par days for the score', () => {
        for (const level of LEVELS) {
            expect(level.target).toBeUndefined();
            expect(level.tuning.parDays).toBeGreaterThan(0);
        }
    });

    it('regionProgress reports completion and stars', () => {
        let save = freshSave();
        save = recordCompletion(save, 'mizuho-1', 'contained', winStats({ totalDead: 2 }));
        const p = regionProgress(save, LEVELS, REGIONS[0].id);
        expect(p).toEqual({ total: 10, completed: 1, stars: 1, maxStars: 30 });
    });
});
