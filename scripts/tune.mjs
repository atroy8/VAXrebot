// Dev tool: `node scripts/tune.mjs` searches per-level tuning so the smart
// bot's win rate follows a gentle difficulty ramp and random play rarely
// wins, then picks par days so stars spread out. Prints a tuning block to
// paste into src/config/levels.js. Seeded, so results are repeatable.
import { LEVELS } from '../src/config/levels.js';
import { playRun } from '../src/sim/balance.js';
import { calculateStars } from '../src/progress.js';

const RUNS = Number(process.argv[2]) || 120;
// Target smart-bot win rate per level (easy start, hard finish) and the
// mean stars a smart winner should earn.
const WIN_TARGET = [0.92, 0.88, 0.82, 0.78, 0.72, 0.66, 0.6, 0.52, 0.45];
const STAR_TARGET = [2.4, 2.3, 2.1, 2.0, 1.9, 1.8, 1.7, 1.6, 1.5];
const RANDOM_CAP = [0.45, 0.4, 0.3, 0.25, 0.2, 0.15, 0.1, 0.1, 0.1];
const CAP = { easy: 0.45, medium: 0.38, hard: 0.32 };
const LIMITS = {
    easy: { vaccinate: 3, quarantine: 2, severLink: 2 },
    medium: { vaccinate: 2, quarantine: 2, severLink: 2 },
    hard: { vaccinate: 2, quarantine: 1, severLink: 2 },
};

function evaluate(level, bot) {
    const res = [];
    for (let i = 0; i < RUNS; i++) res.push(playRun(level, bot, 7919 * (i + 1)));
    return res;
}

const out = [];
LEVELS.forEach((base, li) => {
    let best = null;
    for (let tm = 0.6; tm <= 2.41; tm += 0.2) {
        for (let inf = 1; inf <= 4; inf++) {
            const level = { ...base, tuning: { initialInfected: inf, transmissionMultiplier: +tm.toFixed(2), dailyLimits: LIMITS[base.difficultyId], caseCapFraction: CAP[base.difficultyId] } };
            const smart = evaluate(level, 'smart');
            const win = smart.filter((r) => r.outcome === 'contained').length / RUNS;
            const err = (win - WIN_TARGET[li]) ** 2;
            if (!best || err < best.err) best = { err, level, smart, win };
        }
    }
    const random = evaluate(best.level, 'random');
    const rWin = random.filter((r) => r.outcome === 'contained').length / RUNS;
    // Par days: pick the par whose mean stars among smart wins is closest to target.
    const wins = best.smart.filter((r) => r.outcome === 'contained');
    let bestPar = null;
    for (let par = 3; par <= 22; par++) {
        const lv = { ...best.level, tuning: { ...best.level.tuning, parDays: par } };
        const stars = wins.map((r) => calculateStars('contained', { initialPopulation: r.pop, totalDead: r.deaths, totalRecovered: r.recovered, daysUsed: r.day }, lv));
        const mean = stars.reduce((a, b) => a + b, 0) / Math.max(1, stars.length);
        const e = (mean - STAR_TARGET[li]) ** 2;
        if (!bestPar || e < bestPar.e) bestPar = { e, par, mean };
    }
    const tuning = { ...best.level.tuning, parDays: bestPar.par };
    out.push({ id: base.id, tuning, smartWin: best.win, randomWin: rWin, meanStarsOnWin: +bestPar.mean.toFixed(2), randomOk: rWin <= RANDOM_CAP[li] });
    console.error(base.id, JSON.stringify(out.at(-1)));
});
console.log(JSON.stringify(out, null, 2));
