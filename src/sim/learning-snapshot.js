// The rules and seeded results of the learning planets (Mizuho and Hanabi),
// in one plain object, so a test can prove that mechanics added on later
// planets never change how the first twenty levels are built or played.
// Only numbers and ids are kept (no names or story text), so rewording a
// disease or a place does not trip the check. Pure and seeded.
import { LEVELS } from '../config/levels.js';
import { levelRules } from '../config/level-rules.js';
import { summarize } from './balance.js';

export const LEARNING_PLANETS = 2;
const SCENARIO_KEYS = ['networkType', 'duration', 'initialInfected', 'baseTransmissionRate', 'populationRange', 'caseCapFraction', 'realCfr'];
const DIFFICULTY_KEYS = ['transmissionMultiplier', 'toolLimitMultiplier', 'recoveryTime', 'fatalityRate', 'dailyLimits', 'toolkit', 'toolDays'];

const pick = (obj, keys) => Object.fromEntries(keys.filter((k) => obj[k] !== undefined).map((k) => [k, obj[k]]));

export function learningLevels(levels = LEVELS) {
    return levels.filter((l) => l.planetIndex < LEARNING_PLANETS);
}

export function composedRules(level) {
    const { scenario, difficulty } = levelRules(level);
    return {
        id: level.id,
        scenarioId: level.scenarioId,
        difficultyId: level.difficultyId,
        lessonId: level.lessonId,
        target: level.target,
        population: level.population,
        variant: level.variant || null,
        toolkitId: level.toolkit.id,
        tools: level.toolkit.tools,
        tuning: level.tuning,
        scenario: pick(scenario, SCENARIO_KEYS),
        difficulty: pick(difficulty, DIFFICULTY_KEYS),
        // Every key the composed rules carry, so a new rule cannot slip in.
        difficultyKeys: Object.keys(difficulty).sort(),
    };
}

// Seeded bot results: the same seeds must give the same games.
export function seededPlay(level, runs = 30, seed = 5) {
    const out = {};
    for (const bot of ['smart', 'beginner', 'random']) {
        const s = summarize(level, bot, runs, seed);
        out[bot] = { counts: s.counts, stars: s.starDist };
    }
    return out;
}

export function learningPlanetSnapshot() {
    const snap = JSON.parse(JSON.stringify(learningLevels().map((level) => ({ rules: composedRules(level), play: seededPlay(level) }))));
    return snap;
}
