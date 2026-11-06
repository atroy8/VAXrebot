import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resultsActions, nextLevelInPlanet, RESULT_LABELS } from '../src/ui/results-actions.js';
import { LEVELS, REGIONS } from '../src/config/levels.js';

// Round 34: a win leads with Next level (same planet, already open), a loss
// leads with Try again, and Back to map always stays.

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const save = (levels = {}, extra = {}) => ({ levels, funding: 0, livesSaved: 0, ...extra });
const done = (stars = 1) => ({ stars, completed: true, bestDeaths: 0 });

describe('results actions (round 34)', () => {
    it('a win on level 1 leads straight into level 2', () => {
        const s = save({ [LEVELS[0].id]: done() });
        const plan = resultsActions({ outcome: 'contained', levelId: LEVELS[0].id, save: s, levels: LEVELS, regions: REGIONS });
        expect(plan.primary).toBe('next');
        expect(plan.nextLevelId).toBe(LEVELS[1].id);
        expect(plan.replayLabel).toBe(RESULT_LABELS.replayWin);
        expect(plan.mapLabel).toBe('Map');
    });

    it('every loss result leads with Try again and offers no next level', () => {
        const s = save({});
        for (const outcome of ['overwhelmed', 'timeout', 'envoy-lost']) {
            const plan = resultsActions({ outcome, levelId: LEVELS[0].id, save: s, levels: LEVELS, regions: REGIONS });
            expect(plan.primary).toBe('replay');
            expect(plan.nextLevelId).toBeNull();
            expect(plan.replayLabel).toBe('Try again');
            expect(plan.mapLabel).toBe('Back to map');
        }
    });

    it('the last level of a planet leads back to the map, which celebrates the new planet', () => {
        const lastIdx = LEVELS.findIndex((l, i) => LEVELS[i + 1] && LEVELS[i + 1].regionId !== l.regionId);
        expect(lastIdx).toBeGreaterThan(0);
        const levels = Object.fromEntries(LEVELS.slice(0, lastIdx + 1).map((l) => [l.id, done(3)]));
        const plan = resultsActions({ outcome: 'contained', levelId: LEVELS[lastIdx].id, save: save(levels), levels: LEVELS, regions: REGIONS });
        expect(plan.primary).toBe('map');
        expect(plan.nextLevelId).toBeNull();
    });

    it('the final level has no next level', () => {
        const last = LEVELS[LEVELS.length - 1];
        const levels = Object.fromEntries(LEVELS.map((l) => [l.id, done(3)]));
        expect(nextLevelInPlanet({ levelId: last.id, save: save(levels), levels: LEVELS, regions: REGIONS })).toBeNull();
    });

    it('never offers a level that is still locked', () => {
        const levels = [
            { id: 'a', regionId: 'r' },
            { id: 'b', regionId: 'r' },
        ];
        const regions = [{ id: 'r', starRequirement: 5 }];
        // a completed but only 1 star in total: b needs 5.
        const plan = resultsActions({ outcome: 'contained', levelId: 'a', save: save({ a: done(1) }), levels, regions });
        expect(plan.primary).toBe('map');
    });

    it('every next level offered on a clean run is on the same planet and open', () => {
        const levels = {};
        for (let i = 0; i < LEVELS.length - 1; i++) {
            levels[LEVELS[i].id] = done(3);
            const n = nextLevelInPlanet({ levelId: LEVELS[i].id, save: save({ ...levels }), levels: LEVELS, regions: REGIONS });
            if (LEVELS[i + 1].regionId === LEVELS[i].regionId) expect(n?.id).toBe(LEVELS[i + 1].id);
            else expect(n).toBeNull();
        }
    });

    it('the results screen has a hidden Next level button, wired in game.js', () => {
        const html = read('index.html');
        expect(html).toMatch(/<button[^>]*id="next-level"[^>]*hidden/);
        const game = read('src/game.js');
        expect(game).toMatch(/getElementById\('next-level'\)/);
        expect(game).toMatch(/this\.leaveResults\(\(\) => this\.selectLevel\(nextId\)\)/);
        expect(game).toMatch(/this\.applyResultsActions\(outcome\)/);
    });

    it('lays out Next level full width at the bottom, and hides it properly', () => {
        const css = read('src/ui/game-screen.css');
        expect(css).toMatch(/\.game-over-actions\.has-next \{[^}]*grid-template-columns:\s*1fr 1fr/);
        expect(css).toMatch(/\.game-over-actions\.has-next #next-level \{[^}]*grid-column:\s*1 \/ -1/);
        expect(css).toMatch(/#next-level\[hidden\] \{[^}]*display:\s*none/);
    });
});
