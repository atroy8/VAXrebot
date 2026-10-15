// Per-play difficulty roll. There is no difficulty picker: every time a
// level starts it rolls its own threat inside a band, and the band rises
// as the player gets closer to the next prize box (supply crate), then
// eases right after a box is opened. The level's tuned baseline
// (src/config/levels.js) still sets the overall climb across the game.
//
// Pure and seedable: the balance bots use the same roll (src/sim/balance.js).
import { LEVELS } from './levels.js';
import { CHESTS } from './chests.js';
import { levelRules } from './level-rules.js';

const CHEST_AFTER = CHESTS.map((c) => c.afterLevelIndex).sort((a, b) => a - b);

// 0 right after a prize box, 1 on the level that unlocks the next box.
export function progressToPrize(levelIndex, chestAfter = CHEST_AFTER, levelCount = LEVELS.length) {
    let prev = -1;
    let next = levelCount - 1;
    for (const c of chestAfter) {
        if (c < levelIndex) prev = Math.max(prev, c);
        else {
            next = c;
            break;
        }
    }
    const span = next - prev - 1;
    if (span <= 0) return 0;
    return Math.min(1, Math.max(0, (levelIndex - prev - 1) / span));
}

// The band a level's threat is rolled in, both ends in [0, 1].
export function threatBand(levelIndex) {
    const center = 0.4 + 0.4 * progressToPrize(levelIndex);
    return { lo: Math.max(0, center - 0.2), hi: Math.min(1, center + 0.2) };
}

// Roll this play's rules. Returns { scenario, difficulty, threat, pips }.
// threat in [0, 1] nudges spread speed (0.85x to 1.15x) and the case cap
// (+1 to -2 points of the town); pips (1 to 5) is what the player sees.
export function rollLevelRules(level, rng = Math.random) {
    const index = Math.max(0, LEVELS.findIndex((l) => l.id === level.id));
    const { scenario, difficulty } = levelRules(level);
    const { lo, hi } = threatBand(index);
    const threat = lo + (hi - lo) * rng();
    difficulty.transmissionMultiplier = round3((difficulty.transmissionMultiplier ?? 1) * (0.85 + 0.3 * threat));
    if (scenario.caseCapFraction != null) {
        scenario.caseCapFraction = round3(scenario.caseCapFraction + 0.01 - 0.03 * threat);
    }
    const overall = LEVELS.length > 1 ? index / (LEVELS.length - 1) : 0;
    const pips = Math.min(5, Math.max(1, 1 + Math.round(overall * 2.4 + threat * 1.6)));
    return { scenario, difficulty, threat, pips };
}

// One plain line for the briefing, based on the roll.
export function threatLine(threat) {
    if (threat < 0.3) return 'This outbreak is spreading slower than usual.';
    if (threat < 0.6) return 'This outbreak is spreading at a typical pace.';
    return 'This outbreak is spreading fast. A prize box is close.';
}

function round3(x) {
    return Math.round(x * 1000) / 1000;
}
