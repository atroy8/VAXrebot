// Meta-game report (wide audience round): what Gentle mode and the shop
// upgrades do to the bots, what a win pays, and how winnable the Daily is.
// Usage: node scripts/meta-report.mjs [runs]
import { LEVELS, REGIONS } from '../src/config/levels.js';
import { metaSummary, playMetaRun } from '../src/sim/meta-run.js';
import { metaModifier } from '../src/config/meta-rules.js';
import { UPGRADES, UPGRADE_IDS } from '../src/config/upgrades.js';
import { dailyLevel, dailySeed, addDays } from '../src/sim/daily.js';

const runs = Number(process.argv[2]) || 200;
const pct = (x) => `${(x * 100).toFixed(1)}%`.padStart(6);
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

const styles = {
    standard: {},
    gentle: { modify: metaModifier({ gentle: true }) },
    upgrades: { modify: metaModifier({ upgrades: UPGRADE_IDS }), upgrades: UPGRADE_IDS },
    'gentle+upgrades': { modify: metaModifier({ gentle: true, upgrades: UPGRADE_IDS }), upgrades: UPGRADE_IDS },
};

console.log(`Meta report, ${runs} runs per bot per level\n`);
console.log('planet     style             smart  beginner  random  passive');
const fundingPerWin = [];
for (const region of REGIONS) {
    const levels = LEVELS.filter((l) => l.regionId === region.id);
    for (const [name, options] of Object.entries(styles)) {
        const row = {};
        for (const bot of ['smart', 'beginner', 'random', 'passive']) {
            const sums = levels.map((l) => metaSummary(l, { ...options, bot }, runs, 1));
            row[bot] = mean(sums.map((s) => s.winRate));
            if (bot === 'smart' && name === 'standard') fundingPerWin.push({ region: region.name, funding: mean(sums.map((s) => s.meanFundingPerWin)) });
        }
        console.log(`${region.name.padEnd(10)} ${name.padEnd(16)} ${pct(row.smart)}  ${pct(row.beginner)}  ${pct(row.random)}  ${pct(row.passive)}`);
    }
}

console.log('\nEach upgrade alone, smart bot, last planet:');
const last = LEVELS.filter((l) => l.regionId === REGIONS.at(-1).id);
for (const u of UPGRADES) {
    const rate = mean(last.map((l) => metaSummary(l, { modify: metaModifier({ upgrades: [u.id] }), upgrades: [u.id] }, runs, 1).winRate));
    console.log(`  ${u.name.padEnd(16)} ${pct(rate)}`);
}

console.log('\nFunding the smart bot banks per win (stars plus care bonus):');
for (const f of fundingPerWin) console.log(`  ${f.region.padEnd(10)} ${f.funding.toFixed(0)}`);
const typical = mean(fundingPerWin.map((f) => f.funding));
console.log(`  typical    ${typical.toFixed(0)}`);
console.log('\nUpgrade prices in wins:');
for (const u of UPGRADES) console.log(`  ${u.name.padEnd(16)} ${String(u.cost).padStart(4)} funding = ${(u.cost / typical).toFixed(1)} wins`);
console.log(`  all five         ${UPGRADES.reduce((a, u) => a + u.cost, 0)} funding = ${(UPGRADES.reduce((a, u) => a + u.cost, 0) / typical).toFixed(1)} wins`);

console.log('\nDaily puzzle, one run per date (the real seed), 60 dates from 2026-11-25:');
for (const bot of ['smart', 'beginner', 'random', 'passive']) {
    let wins = 0;
    for (let i = 0; i < 60; i++) {
        const date = addDays('2026-11-25', i);
        if (playMetaRun(dailyLevel(date), { bot, seed: dailySeed(date) }).outcome === 'contained') wins++;
    }
    console.log(`  ${bot.padEnd(9)} ${pct(wins / 60)}`);
}
