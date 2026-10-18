// Dev tool: `node scripts/tune-campaign.mjs [runs] [from] [to]` tunes the 80
// campaign levels (src/config/campaign.js) so the smart bot's win rate
// follows the target curve below, random play rarely wins, and par days
// spread the stars. Seeded, so results are repeatable. Writes
// src/config/campaign-tuning.js (merging with what is already there, so a
// range of levels can be retuned on its own).
//
// Target smart win rate for level i of 80 (t = i / 79):
//   base(t) = 0.92 - 0.42 t                 (0.92 on level 1, 0.50 at the end)
//   + 0.03 on a planet's first level, sliding to -0.03 on its 9th
//   - 0.06 on each planet's boss (10th) level
// so each planet starts a little easier than the last one ended.
import { writeFileSync } from 'node:fs';
import { LEVELS } from '../src/config/levels.js';
import { playRun } from '../src/sim/balance.js';
import { calculateStars } from '../src/progress.js';

const RUNS = Number(process.argv[2]) || 80;
const FROM = Number(process.argv[3] ?? 0);
const TO = Number(process.argv[4] ?? LEVELS.length - 1);
const OUT = process.env.TUNE_OUT ? new URL(process.env.TUNE_OUT, 'file://') : new URL('../src/config/campaign-tuning.js', import.meta.url);

export function winTarget(i, n = LEVELS.length) {
    const t = i / Math.max(1, n - 1);
    const k = i % 10;
    const base = 0.92 - 0.42 * t;
    const saw = k === 9 ? -0.06 : 0.03 - (0.06 * k) / 8;
    return Math.min(0.93, base + saw);
}
const starTarget = (i) => 2.4 - 0.9 * (i / (LEVELS.length - 1));
const randomCap = (i) => Math.max(0.1, 0.35 - 0.9 * (i / (LEVELS.length - 1)));

function rate(level, bot, runs, seedBase) {
    const res = [];
    for (let i = 0; i < runs; i++) res.push(playRun(level, bot, seedBase * (i + 1)));
    return { res, win: res.filter((r) => r.outcome === 'contained').length / runs };
}

async function current() {
    try {
        const mod = await import(`${OUT.href}?t=${Date.now()}`);
        return { ...mod.CAMPAIGN_TUNING };
    } catch {
        return {};
    }
}

const table = await current();
for (let li = FROM; li <= TO; li++) {
    const base = LEVELS[li];
    const target = winTarget(li);
    const cands = [];
    for (let inf = 1; inf <= 4; inf++) {
        if (base.variant?.type === 'superSpreader' && inf > 3) continue;
        for (let tm = 0.4; tm <= 3.01; tm += 0.2) {
            const tuning = { ...base.tuning, initialInfected: inf, transmissionMultiplier: +tm.toFixed(2) };
            const level = { ...base, tuning };
            const { win, res } = rate(level, 'smart', RUNS, 7919);
            cands.push({ level, win, res, err: (win - target) ** 2 });
        }
    }
    cands.sort((a, b) => a.err - b.err);
    let best = null;
    for (const c of cands.slice(0, 4)) {
        const rnd = rate(c.level, 'random', RUNS, 104729).win;
        const score = c.err + 4 * Math.max(0, rnd - randomCap(li)) ** 2;
        if (!best || score < best.score) best = { ...c, rnd, score };
    }
    // Par days: mean stars among smart wins closest to the star target.
    const wins = best.res.filter((r) => r.outcome === 'contained');
    let bestPar = null;
    for (let par = 3; par <= 24; par++) {
        const lv = { ...best.level, tuning: { ...best.level.tuning, parDays: par } };
        const stars = wins.map((r) => calculateStars('contained', { initialPopulation: r.pop, totalDead: r.deaths, totalRecovered: r.recovered, daysUsed: r.day }, lv));
        const mean = stars.reduce((a, b) => a + b, 0) / Math.max(1, stars.length);
        const e = (mean - starTarget(li)) ** 2;
        if (!bestPar || e < bestPar.e) bestPar = { e, par, mean };
    }
    const t = best.level.tuning;
    table[base.id] = { initialInfected: t.initialInfected, transmissionMultiplier: t.transmissionMultiplier, parDays: bestPar.par };
    console.error(`${base.id.padEnd(12)} target ${target.toFixed(2)} smart ${best.win.toFixed(2)} random ${best.rnd.toFixed(2)} stars ${bestPar.mean.toFixed(2)} ${JSON.stringify(table[base.id])}`);
}

const ordered = {};
for (const l of LEVELS) if (table[l.id]) ordered[l.id] = table[l.id];
const lines = Object.entries(ordered).map(([id, t]) => `    '${id}': { ${Object.entries(t).map(([k, v]) => `${k}: ${v}`).join(', ')} },`);
writeFileSync(
    OUT,
    `// Tuned per level by scripts/tune-campaign.mjs. Do not edit by hand:\n// rerun the script (it merges, so a range of levels can be retuned).\n// Each entry overrides the defaults in src/config/campaign.js defaultTuning.\nexport const CAMPAIGN_TUNING = {\n${lines.join('\n')}\n};\n`
);
