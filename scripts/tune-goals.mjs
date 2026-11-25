// Writes src/config/goal-targets.js: the bonus goals each level can offer,
// with their numbers, chosen from bot play so every goal is possible and
// none is free (src/sim/goal-lab.js). Rerun after retuning levels or
// changing the sim: node scripts/tune-goals.mjs [runs]
import { writeFileSync } from 'node:fs';
import { LEVELS } from '../src/config/levels.js';
import { tuneLevelGoals } from '../src/sim/goal-lab.js';

const runs = Number(process.argv[2]) || 200;
const lines = [];
for (const level of LEVELS) {
    const offered = tuneLevelGoals(level, { runs });
    const text = offered.map((g) => (g.n == null ? `{ id: '${g.id}' }` : `{ id: '${g.id}', n: ${g.n} }`)).join(', ');
    lines.push(`    '${level.id}': { offered: [${text}] },`);
    console.log(level.id.padEnd(12), offered.map((g) => (g.n == null ? g.id : `${g.id}(${g.n})`)).join(' '));
}
const out = `// Bonus goals each level can offer, written by scripts/tune-goals.mjs. Do
// not edit by hand: rerun the script after retuning levels or the sim.
// A goal is listed only when bots met it on that level (it is possible) and
// the smart bot's wins do not meet it most of the time (it is not free).
// src/sim/goals.js picks up to three per level from this pool.
export const GOAL_TARGETS = {
${lines.join('\n')}
};
`;
writeFileSync(new URL('../src/config/goal-targets.js', import.meta.url), out);
console.log(`\nWrote src/config/goal-targets.js (${runs} runs per style per level).`);
