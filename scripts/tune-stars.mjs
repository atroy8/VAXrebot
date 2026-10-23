// Dev tool: `node scripts/tune-stars.mjs [runs]` picks each level's star
// target (src/config/star-targets.js) from the smart bot's winning scores.
//
// Round 17: every level used one target (800), and 3 stars needs 1.6x the
// target. Medium and hard levels spread faster and kill more people, so from
// the 4th planet on the smart bot never earned 3 stars on any of 50 levels.
// Now each level's 3 star line sits where the top slice of smart wins land:
//   share of smart wins that earn 3 stars = 0.32 on level 1, 0.18 on level 80
// Round 20: the line sits on a real score value (see pickTarget), with no
// 800 ceiling, since small webs score higher and cluster.
// Seeds differ from the balance report so the guardrails are a fair check.
import { writeFileSync } from 'node:fs';
import { LEVELS } from '../src/config/levels.js';
import { playRun } from '../src/sim/balance.js';
import { SCORING } from '../src/progress.js';

const RUNS = Number(process.argv[2]) || 300;
export const DEFAULT_TARGET = 800;
const threeStarShare = (i) => 0.32 - 0.14 * (i / (LEVELS.length - 1));

// Round 20: small webs (item 14) end most wins on the same day with the same
// score, so a plain quantile can hand 3 stars to 90% of wins. Instead the 3
// star line sits on a real score value: the one whose share of wins at or
// above it is closest to the wanted share, never more than 60%.
export function pickTarget(wins, share) {
    if (!wins.length) return DEFAULT_TARGET;
    const values = [...new Set(wins)].sort((a, b) => a - b);
    let best = null;
    for (const v of values) {
        const above = wins.filter((w) => w >= v).length / wins.length;
        if (above > 0.6) continue;
        const e = Math.abs(above - share);
        if (!best || e < best.e) best = { v, e };
    }
    const line = best ? best.v : values.at(-1);
    return Math.floor(line / SCORING.threeStarRatio);
}

const out = {};
LEVELS.forEach((level, i) => {
    const wins = [];
    for (let k = 0; k < RUNS; k++) {
        const r = playRun(level, 'smart', 424243 + k * 7);
        if (r.outcome === 'contained') wins.push(r.score);
    }
    wins.sort((a, b) => a - b);
    const target = pickTarget(wins, threeStarShare(i));
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
