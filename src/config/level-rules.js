// Resolve the exact rules a level plays by: its scenario and difficulty,
// with the level's `tuning` overrides applied on top (src/config/levels.js).
// Tuning keys:
//   initialInfected         starting cases (scenario override)
//   transmissionMultiplier  per-contact spread multiplier (difficulty override)
//   dailyLimits             exact daily caps per tool id (difficulty override);
//                           tools outside the level's toolkit are forced to 0
//   parDays                 par for the speed bonus in scoring (src/progress.js)
//   caseCapFraction         share of people who may fall sick before the
//                           outbreak is 'overwhelmed' (scenario override)
// Pure: returns fresh objects and never mutates the shared configs.
import { scenarios } from './scenarios.js';
import { difficulties } from './difficulties.js';
import { CLASSIC_TOOLS } from './toolkits.js';
import { gameFatality } from '../sim/fatality.js';

export function levelRules(level) {
    const t = level.tuning || {};
    const scenario = { ...scenarios[level.scenarioId] };
    if (t.initialInfected != null) scenario.initialInfected = t.initialInfected;
    if (t.caseCapFraction != null) scenario.caseCapFraction = t.caseCapFraction;
    // Item 14: each planet sets its own web size (src/config/campaign.js).
    if (Array.isArray(level.population)) scenario.populationRange = [...level.population];
    const difficulty = { ...difficulties[level.difficultyId] };
    // Item 20: the death rate follows the disease's real CFR, scaled for
    // small webs (src/sim/fatality.js), not the difficulty.
    if (scenario.realCfr != null) difficulty.fatalityRate = gameFatality(scenario.realCfr);
    if (t.transmissionMultiplier != null) difficulty.transmissionMultiplier = t.transmissionMultiplier;
    if (t.dailyLimits) difficulty.dailyLimits = { ...t.dailyLimits };
    // Item 16: a level's toolkit decides which classic tools exist at all.
    // Tools outside the kit get a daily limit of 0, so the engine, the tray
    // and the balance bots all treat them as not on this world.
    if (level.toolkit) {
        difficulty.toolkit = [...level.toolkit.tools];
        const limits = { ...(difficulty.dailyLimits || {}) };
        for (const id of CLASSIC_TOOLS) if (!difficulty.toolkit.includes(id)) limits[id] = 0;
        difficulty.dailyLimits = limits;
    }
    // Toolkits and puzzle levels can bring a tool forward (a vaccine rollout
    // on day 1, quarantine on day 2 on super-spreader levels). See
    // toolAvailableDay in src/sim/engine.js. The variant wins a tie.
    const toolDays = { ...(level.toolkit?.toolDays || {}), ...(level.variant?.toolDays || {}) };
    if (Object.keys(toolDays).length) difficulty.toolDays = toolDays;
    return { scenario, difficulty };
}
