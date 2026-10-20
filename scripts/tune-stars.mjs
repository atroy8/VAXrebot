// Dev tool: `node scripts/tune-stars.mjs [runs]` picks each level's star
// target (src/config/star-targets.js) from the smart bot's winning scores.
//
// Round 17: every level used one target (800), and 3 stars needs 1.6x the
// target. Medium and hard levels spread faster and kill more people, so from
// the 4th planet on the smart bot never earned 3 stars on any of 50 levels.
// Now each level's 3 star line sits where the top slice of smart wins land:
//   share of smart wins that earn 3 stars = 0.32 on level 1, 0.18 on level 80
// The target never rises above the old 800, so no level gets stingier.
// Seeds differ from the balance report so the guardrails are a fair check.
import { writeFileSync } from 'node:fs';
import { LEVELS } from '../src/config/levels.js';
import { playRun } from '../src/sim/balance.js';
import { SCORING } from '../src/progress.js';

const RUNS = Number(process.argv[2]) || 300;
export const DEFAULT_TARGET = 800;
const threeStarShare = (i) => 0.32 - 0.14 * (i / (LEVELS.length - 1));

const out = {};
LEVELS.forEach((level, i) => {
    const wins = [];
    for (let k = 0; k < RUNS; k++) {
        const r = playRun(level, 'smart', 424243 + k * 7);
        if (r.outcome === 'contained') wins.push(r.score);
    }
    wins.sort((a, b) => a - b);
    const q = wins[Math.min(wins.length - 1, Math.floor(wins.length * (1 - threeStarShare(i))))] ?? DEFAULT_TARGET * SCORING.threeStarRatio;
    const target = Math.min(DEFAULT_TARGET, Math.floor(q / SCORING.threeStarRatio / 10) * 10);
    out[level.id] = target;
    console.log(level.id.padEnd(12), String(wins.length).padStart(4), 'wins', 'target', target);
});

const body = Object.entries(out).map(([id, t]) => `    '${id}': ${t},`).join('\n');
writeFileSync(
    new URL('../src/config/star-targets.js', import.meta.url),
    `// Star target per level, written by scripts/tune-stars.mjs. Do not edit by
// hand: rerun the script after retuning levels. 1 star at the target, 2 at
// 1.3x, 3 at 1.6x (src/progress.js SCORING).
export const STAR_TARGETS = {
${body}
};
`
);
