// The threat of a level. There is no difficulty picker, and since round 57
// there are no dice either: a level's threat is fixed by where it sits on
// the road to the next prize box (supply crate). It rises as the box gets
// closer and eases right after one is opened. The level's puzzle spec
// (src/config/puzzle-specs.js) sets the overall climb across the game.
//
// What the threat changes is small, fixed before day 1 and shown: on the
// levels closest to a prize box the case cap leaves one less spare case
// (the briefing says so and the HUD shows the cap). It never touches how
// the infection spreads: that is certain on every level.
//
// Pure. The name rollLevelRules is kept from when this was a roll; the
// second argument (the old dice) is ignored.
import { LEVELS } from './levels.js';
import { CHESTS } from './chests.js';
import { levelRules } from './level-rules.js';
import { puzzleSpecFor } from './puzzle-specs.js';

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

// From this threat up, a prize box is close and the cap is one case tighter.
export const PRIZE_CLOSE_THREAT = 0.6;

// The rules of this level. Returns { scenario, difficulty, threat, pips,
// spec }: threat in [0, 1] (the middle of the level's band), pips (1 to 5)
// is what the player sees, spec is the level's puzzle spec with the cap
// slack in force (also copied to scenario.capSlack for the dealer).
export function rollLevelRules(level, _rng) {
    const id = level.templateId || level.id;
    const index = Math.max(0, LEVELS.findIndex((l) => l.id === id));
    const { scenario, difficulty } = levelRules(level);
    const { lo, hi } = threatBand(index);
    const threat = round3((lo + hi) / 2);
    const spec = { ...puzzleSpecFor(level) };
    if (threat >= PRIZE_CLOSE_THREAT && !spec.tutorial) spec.capSlack = Math.max(1, spec.capSlack - 1);
    scenario.capSlack = spec.capSlack;
    const overall = LEVELS.length > 1 ? index / (LEVELS.length - 1) : 0;
    const pips = Math.min(5, Math.max(1, 1 + Math.round(overall * 2.4 + threat * 1.6)));
    return { scenario, difficulty, threat, pips, spec };
}

// One plain line for the briefing.
export function threatLine(threat) {
    if (threat < PRIZE_CLOSE_THREAT) return 'The case cap leaves room for a few mistakes.';
    return 'A prize box is close: the case cap leaves one less spare case.';
}

function round3(x) {
    return Math.round(x * 1000) / 1000;
}
