// CLI: `npm run balance [runs]` prints win rates and stars per level for
// the passive, random and smart bots. See src/sim/balance.js.
import { balanceReport } from '../src/sim/balance.js';

const runs = Number(process.argv[2]) || 300;
const pct = (x) => `${Math.round(x * 100)}%`.padStart(5);
console.log(`Balance report, ${runs} runs per bot per level\n`);
console.log('level              diff    smart win  stars  0/1/2/3 stars        random win  passive outcomes');
for (const row of balanceReport(runs)) {
    const s = row.smart;
    console.log(
        `${row.level.id.padEnd(18)} ${row.level.difficultyId.padEnd(7)} ${pct(s.winRate)}      ${s.meanStars.toFixed(2)}   ${s.starDist.map((x) => pct(x / runs)).join(' ')}   ${pct(row.random.winRate)}       ${JSON.stringify(row.passive.counts)}`
    );
}
