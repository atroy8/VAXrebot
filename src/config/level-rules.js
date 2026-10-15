// Resolve the exact rules a level plays by: its scenario and difficulty,
// with the level's `tuning` overrides applied on top (src/config/levels.js).
// Tuning keys:
//   initialInfected         starting cases (scenario override)
//   transmissionMultiplier  per-contact spread multiplier (difficulty override)
//   dailyLimits             exact daily caps per tool id (difficulty override)
//   parDays                 par for the speed bonus in scoring (src/progress.js)
//   caseCapFraction         share of people who may fall sick before the
//                           outbreak is 'overwhelmed' (scenario override)
// Pure: returns fresh objects and never mutates the shared configs.
import { scenarios } from './scenarios.js';
import { difficulties } from './difficulties.js';

export function levelRules(level) {
    const t = level.tuning || {};
    const scenario = { ...scenarios[level.scenarioId] };
    if (t.initialInfected != null) scenario.initialInfected = t.initialInfected;
    if (t.caseCapFraction != null) scenario.caseCapFraction = t.caseCapFraction;
    const difficulty = { ...difficulties[level.difficultyId] };
    if (t.transmissionMultiplier != null) difficulty.transmissionMultiplier = t.transmissionMultiplier;
    if (t.dailyLimits) difficulty.dailyLimits = { ...t.dailyLimits };
    return { scenario, difficulty };
}
