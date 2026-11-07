// Round 34: the buttons under the results.
//
// Before this round a win offered only Replay Level and Back to map, so
// going on to the next mission took four taps and a trip over the map:
// Back to map, wait for the globe, Play level N, then Begin. A win now leads
// with Next level, which opens the next level's briefing at once. A loss
// leads with Try again. Back to map always stays.
//
// Next level only shows when the next level is open AND on the same planet.
// Reaching a new planet is a big moment that the map celebrates (it flies
// there and says New planet unlocked), so that win still leads back to the
// map. Pure: no DOM, tested in tests/results-actions.test.js.
import { isLevelUnlocked } from '../progress.js';

export const RESULT_LABELS = Object.freeze({
    next: 'Next level',
    replayWin: 'Replay',
    replayLoss: 'Try again',
    map: 'Back to map',
    mapShort: 'Map',
});

// The level after `levelId` that a win can lead straight into, or null.
export function nextLevelInPlanet({ levelId, save, levels, regions }) {
    const idx = levels.findIndex((l) => l.id === levelId);
    if (idx < 0 || idx + 1 >= levels.length) return null;
    const next = levels[idx + 1];
    if (next.regionId !== levels[idx].regionId) return null;
    if (!isLevelUnlocked(save, levels, regions, next.id)) return null;
    return next;
}

// What the results buttons say and which one leads.
// Returns { primary: 'next' | 'replay' | 'map', nextLevelId, replayLabel, mapLabel }.
export function resultsActions({ outcome, levelId, save, levels, regions }) {
    const won = outcome === 'contained';
    if (!levelId) {
        return { primary: 'map', nextLevelId: null, replayLabel: RESULT_LABELS.replayWin, mapLabel: RESULT_LABELS.map };
    }
    if (!won) {
        return { primary: 'replay', nextLevelId: null, replayLabel: RESULT_LABELS.replayLoss, mapLabel: RESULT_LABELS.map };
    }
    const next = nextLevelInPlanet({ levelId, save, levels, regions });
    if (next) {
        return { primary: 'next', nextLevelId: next.id, replayLabel: RESULT_LABELS.replayWin, mapLabel: RESULT_LABELS.mapShort };
    }
    return { primary: 'map', nextLevelId: null, replayLabel: RESULT_LABELS.replayWin, mapLabel: RESULT_LABELS.map };
}
