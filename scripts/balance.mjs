// CLI: `npm run balance [runs]` prints win rates and stars per level for
// the passive, random, beginner and smart bots, grouped by star system and
// planet. See src/sim/balance.js.
import { balanceReport } from '../src/sim/balance.js';
import { REGIONS, SYSTEMS } from '../src/config/levels.js';

const runs = Number(process.argv[2]) || 200;
const pct = (x) => `${Math.round(x * 100)}%`.padStart(5);
console.log(`Balance report, ${runs} runs per bot per level\n`);
const rows = balanceReport(runs);
for (const system of SYSTEMS) {
    console.log(`\n=== ${system.name} ===`);
    for (const region of REGIONS.filter((r) => r.systemId === system.id)) {
        const mine = rows.filter((row) => row.level.regionId === region.id);
        const mean = (k) => mine.reduce((a, r) => a + r[k].winRate, 0) / mine.length;
        console.log(`\n${region.name} (needs ${region.starRequirement} stars): smart avg ${pct(mean('smart'))}, beginner avg ${pct(mean('beginner'))}, random avg ${pct(mean('random'))}`);
        console.log('level         variant        diff    smart win  stars  0/1/2/3 stars        beginner  random win  passive outcomes');
        for (const row of mine) {
            const s = row.smart;
            const v = row.level.variant ? row.level.variant.type + (row.level.variant.boss ? '*' : '') : '';
            console.log(
                `${row.level.id.padEnd(13)} ${v.padEnd(14)} ${row.level.difficultyId.padEnd(7)} ${pct(s.winRate)}      ${s.meanStars.toFixed(2)}   ${s.starDist.map((x) => pct(x / runs)).join(' ')}   ${pct(row.beginner.winRate)}     ${pct(row.random.winRate)}       ${JSON.stringify(row.passive.counts)}`
            );
        }
    }
}
console.log('\n* boss level');
