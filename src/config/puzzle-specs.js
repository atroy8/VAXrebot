// Puzzle specs (round 57): what makes a deal a good puzzle on each level.
// Pure data plus one lookup. src/sim/dealer.js deals webs until one passes
// the level's spec; scripts/tune-puzzles.mjs picks the tool counts in
// PUZZLE_TUNING (src/config/puzzle-tuning.js) and reports on every level.
//
// Difficulty used to come from spread multipliers. Spread is now certain,
// so a level is hard because of its puzzle: how few tool uses it gets next
// to how wide the outbreak opens, how many days of real decisions the best
// play needs, how rarely plain "tap the red lines" play finds that best
// play, and how many spare cases the cap allows.
//
// A spec:
//   initialInfected  first cases
//   dailyLimits      uses per day of each tool in the level's kit
//   toolDays         first day of a tool, when the spec moves it
//   carrierExtra     super-spreader levels: the carrier has this many more
//                    contacts than there are cuts on day 1
//   capSlack         the case cap is par + capSlack (never above everyone)
//   minDepth         the best play must face red lines on at least this many
//                    mornings (1 = may be over on day 1: the tutorial only)
//   missRate         share of simple plays (src/sim/dealer.js simplePlay)
//                    that must fail to reach par
//   maxParShare      reject a deal whose best play still lets more than
//                    this share of people fall sick (no fun to "win")
//   tutorial         the first level: the best play must be found by simply
//                    cutting red lines, in any order, without Quarantine
import { PUZZLE_TUNING } from './puzzle-tuning.js';

// By planet (0 Mizuho ... 7 Kaminari). The two learning planets are the
// gentlest: more spare cases, shallower puzzles, and half of the simple
// plays may still find the best line.
export const PLANET_PUZZLE = Object.freeze([
    { capSlack: 4, minDepth: 2, missRate: 0.5, maxParShare: 0.5 },
    { capSlack: 4, minDepth: 2, missRate: 0.5, maxParShare: 0.5 },
    { capSlack: 3, minDepth: 2, missRate: 0.6, maxParShare: 0.5 },
    { capSlack: 3, minDepth: 2, missRate: 0.6, maxParShare: 0.5 },
    { capSlack: 3, minDepth: 2, missRate: 0.67, maxParShare: 0.55 },
    { capSlack: 2, minDepth: 3, missRate: 0.67, maxParShare: 0.55 },
    { capSlack: 2, minDepth: 3, missRate: 0.75, maxParShare: 0.6 },
    { capSlack: 2, minDepth: 3, missRate: 0.83, maxParShare: 0.6 },
]);

// The first level of the game. Three cuts a day (round 51) so the coach's
// lesson, cut the red lines, is also the best play.
export const TUTORIAL_LEVEL_ID = 'mizuho-1';
export const TUTORIAL_SPEC = Object.freeze({ tutorial: true, minDepth: 1, missRate: 0, capSlack: 3, maxParShare: 0.6 });

// The last level of the game, hand-set like the first (the tuner leaves both
// alone). The final boss should be the hardest carrier in the game: the
// tuner's own pick left a sensible player winning about 6 times in 10, and
// with one dose less a day it is about 5 in 10 (25% to 70% is the guardrail).
export const FINALE_LEVEL_ID = 'kaminari-10';
export const FINALE_TUNING = Object.freeze({
    [FINALE_LEVEL_ID]: { initialInfected: 1, dailyLimits: { vaccinate: 1, quarantine: 1, severLink: 2 }, carrierExtra: 3, capSlack: 1 },
});
// Levels whose numbers are set by hand: scripts/tune-puzzles.mjs skips them.
export const HAND_SET_LEVELS = Object.freeze([TUTORIAL_LEVEL_ID, FINALE_LEVEL_ID]);

// The deepest best play a carrier (super-spreader) level is asked for.
export const CARRIER_MIN_DEPTH = 2;

// How many simple plays the dealer tries on a deal. A level's missRate is
// read against this many tries.
export const SIMPLE_PLAYS = 6;

// Most simple plays that may reach par on an accepted deal.
export function simpleHitsAllowed(missRate, plays = SIMPLE_PLAYS) {
    return Math.max(0, Math.floor((1 - missRate) * plays + 1e-9));
}

// Two stars: this many cases over par (a little more room on big webs).
export function twoStarSlack(population) {
    return population >= 20 ? 2 : 1;
}

// The tuned numbers of one level (initialInfected, dailyLimits, ...).
export function puzzleTuning(levelId) {
    return PUZZLE_TUNING[levelId] || null;
}

// The dealing rules of a level: planet defaults, then the level's own
// tuning (level.tuning, which src/config/campaign.js fills from the tuner's
// table), then the tutorial's. `level` needs id, planetIndex and tuning.
export function puzzleSpecFor(level) {
    const planet = PLANET_PUZZLE[Math.min(PLANET_PUZZLE.length - 1, Math.max(0, level.planetIndex || 0))];
    const tuned = level.tuning || PUZZLE_TUNING[level.templateId || level.id] || {};
    const spec = { ...planet };
    // A carrier level is decided on its first two days by its nature (who to
    // save tonight, then how to hold the people the carrier reached), so it
    // is never asked for a deeper best play than that.
    if (level.variant && level.variant.type === 'superSpreader') spec.minDepth = Math.min(spec.minDepth, CARRIER_MIN_DEPTH);
    for (const key of ['capSlack', 'minDepth', 'missRate', 'maxParShare']) if (tuned[key] != null) spec[key] = tuned[key];
    if ((level.templateId || level.id) === TUTORIAL_LEVEL_ID) Object.assign(spec, TUTORIAL_SPEC);
    return spec;
}
