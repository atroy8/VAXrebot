// Resolve the exact rules a level plays by: its scenario and difficulty,
// with the level's `tuning` overrides applied on top (src/config/levels.js).
// Tuning keys (round 57: picked by scripts/tune-puzzles.mjs, see
// src/config/puzzle-specs.js for the ones that steer the dealer):
//   initialInfected         starting cases (scenario override)
//   dailyLimits             exact daily caps per tool id (difficulty override);
//                           tools outside the level's toolkit are forced to 0
//   toolDays                first day of a tool, when the level moves it
//   parDays                 fallback par for the speed bonus in scoring
//                           (src/progress.js); a dealt web uses the solver's days
//   caseCapFraction         fallback share of people who may fall sick before
//                           the outbreak is 'overwhelmed'; a dealt web gets an
//                           exact cap from par instead (src/sim/dealer.js)
//   transmissionMultiplier  ignored since round 57: spread is certain
// level.mechanics (later planets) adds the hidden carrier rule and
// the daily limits of the tools the mechanic brings (Test, Mask).
// Pure: returns fresh objects and never mutates the shared configs.
import { scenarios } from './scenarios.js';
import { difficulties } from './difficulties.js';
import { CLASSIC_TOOLS } from './toolkits.js';
import { gameFatality } from '../sim/fatality.js';
import { webDegreeFor } from './planet-mechanics.js';

export function levelRules(level) {
    const t = level.tuning || {};
    const scenario = { ...scenarios[level.scenarioId] };
    if (t.initialInfected != null) scenario.initialInfected = t.initialInfected;
    if (t.caseCapFraction != null) scenario.caseCapFraction = t.caseCapFraction;
    // Item 14: each planet sets its own web size (src/config/campaign.js).
    if (Array.isArray(level.population)) scenario.populationRange = [...level.population];
    // Wide audience round: later planets have denser webs, so R0 climbs
    // (planet-mechanics.js). Absent on the learning planets.
    const degree = webDegreeFor(level.planetIndex);
    if (degree != null) scenario.webDegree = degree;
    const difficulty = { ...difficulties[level.difficultyId] };
    // Item 20: the death rate follows the disease's real CFR, scaled for
    // small webs (src/sim/fatality.js), not the difficulty.
    if (scenario.realCfr != null) difficulty.fatalityRate = gameFatality(scenario.realCfr);
    // Round 57: that rate now sets how many people are frail (fatality.js).
    scenario.frailRate = difficulty.fatalityRate;
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
    // Later planets (src/config/planet-mechanics.js): the level's new rules
    // ride on the difficulty, next to the daily limits of any tools they add.
    const m = level.mechanics;
    if (m) {
        if (m.incubation) {
            difficulty.incubation = { ...m.incubation };
            scenario.hiddenCarriers = { ...m.incubation };
        }
        const limits = { ...(difficulty.dailyLimits || {}) };
        for (const [id, n] of Object.entries(m.toolLimits || {})) if (limits[id] == null) limits[id] = n;
        difficulty.dailyLimits = limits;
        difficulty.mechanics = m.id;
        // A new way to win rides on the scenario (src/sim/mechanics.js).
        if (m.goal) scenario.goal = { ...m.goal };
        if (m.travellers) scenario.travellers = { ...m.travellers };
    }
    const toolDays = { ...(level.toolkit?.toolDays || {}), ...(level.variant?.toolDays || {}), ...(m?.toolDays || {}), ...(t.toolDays || {}) };
    if (Object.keys(toolDays).length) difficulty.toolDays = toolDays;
    return { scenario, difficulty };
}
