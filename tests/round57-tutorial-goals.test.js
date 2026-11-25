import { describe, it, expect } from 'vitest';
import { goalsFor, TUTORIAL_LEVEL_ID } from '../src/sim/goals.js';
import { LEVELS } from '../src/config/levels.js';

describe('the tutorial offers no bonus goals (round 57)', () => {
    it('level 1 has none, so nothing contradicts "cut the red lines"', () => {
        expect(LEVELS[0].id).toBe(TUTORIAL_LEVEL_ID);
        expect(goalsFor(LEVELS[0])).toEqual([]);
    });
    it('later levels still offer goals', () => {
        expect(LEVELS.slice(1).filter((l) => goalsFor(l).length > 0).length).toBeGreaterThan(60);
    });
});
