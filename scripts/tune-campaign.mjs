// Dev tool: `node scripts/tune-campaign.mjs [runs] [from] [to]` tunes the 80
// campaign levels (src/config/campaign.js) so the smart bot's win rate
// follows the target curve below and random play rarely wins. Seeded, so
// results are repeatable. Writes src/config/campaign-tuning.js (merging with
// what is already there, so a range of levels can be retuned on its own).
// Splits the levels across worker threads (TUNE_WORKERS, default: CPU count).
//
// Item 17 (round 20): small webs (10 to 25 people) need their own tuning.
// Per level the tuner now picks, besides starting cases and spread speed:
//   dailyLimits      1 or 2 uses a day of each tool (was 2 or 3)
//   caseCapFraction  share of the web that may fall sick before you lose
// and par days are the smart bot's median winning day.
//
// Target smart win rate for level i of 80 (t = i / 79):
//   base(t) = 0.92 - 0.42 t                 (0.92 on level 1, 0.50 at the end)
//   + 0.03 on a planet's first level, sliding to -0.03 on its 9th
//   - 0.06 on each planet's boss (10th) level
// so each planet starts a little easier than the last one ended.
import { writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { LEVELS } from '../src/config/levels.js';
import { playRun } from '../src/sim/balance.js';

export function winTarget(i, n = LEVELS.length) {
    const t = i / Math.max(1, n - 1);
    const k = i % 10;
    const base = 0.92 - 0.42 * t;
    const saw = k === 9 ? -0.06 : 0.03 - (0.06 * k) / 8;
    return Math.min(0.93, base + saw);
}
export const randomCap = (i, n = LEVELS.length) => Math.max(0.06, 0.2 - 0.9 * (i / (n - 1)));

// Daily uses per tool before a level's twist (no vaccines / no wards).
export const LIMIT_PRESETS = [
    { vaccinate: 2, quarantine: 2, severLink: 2 },
    { vaccinate: 2, quarantine: 1, severLink: 2 },
    { vaccinate: 1, quarantine: 2, severLink: 2 },
    { vaccinate: 2, quarantine: 2, severLink: 1 },
    { vaccinate: 1, quarantine: 1, severLink: 2 },
    { vaccinate: 2, quarantine: 1, severLink: 1 },
    { vaccinate: 1, quarantine: 2, severLink: 1 },
    { vaccinate: 1, quarantine: 1, severLink: 1 },
];
export const CAPS = [0.25, 0.35, 0.45, 0.55];

export function limitsFor(preset, variant) {
    const d = { ...preset };
    if (variant?.type === 'noVaccines') {
        d.vaccinate = 0;
        d.severLink += 1;
        d.quarantine += 1;
    }
    if (variant?.type === 'noQuarantine') {
        d.quarantine = 0;
        d.vaccinate += 1;
        d.severLink += 1;
    }
    return d;
}

function rate(level, bot, runs, seedBase) {
    const res = [];
    for (let i = 0; i < runs; i++) res.push(playRun(level, bot, seedBase * (i + 1)));
    return { res, win: res.filter((r) => r.outcome === 'contained').length / runs };
}

function median(xs) {
    if (!xs.length) return null;
    const s = [...xs].sort((a, b) => a - b);
    return s[Math.floor((s.length - 1) / 2)];
}

export function tuneLevel(li, runs) {
    const base = LEVELS[li];
    const target = winTarget(li);
    const t = li / (LEVELS.length - 1);
    const cands = [];
    const quick = Math.max(24, Math.round(runs / 2));
    for (const preset of LIMIT_PRESETS) {
        const dailyLimits = limitsFor(preset, base.variant);
        for (const cap of CAPS) {
            for (let inf = 1; inf <= 3; inf++) {
                const make = (tm) => ({ ...base, tuning: { ...base.tuning, initialInfected: inf, transmissionMultiplier: +tm.toFixed(2), caseCapFraction: cap, dailyLimits } });
                // Win rate falls as spread speeds up: bisect the multiplier.
                let lo = 0.4;
                let hi = 5;
                for (let step = 0; step < 6; step++) {
                    const mid = (lo + hi) / 2;
                    if (rate(make(mid), 'smart', quick, 7919).win > target) lo = mid;
                    else hi = mid;
                }
                const tm = Math.round(((lo + hi) / 2) * 10) / 10;
                const level = make(tm);
                const r = rate(level, 'smart', runs, 7919);
                // Early planets lean toward more actions a day, so the first
                // levels feel like you are in control.
                const fewer = 6 - (preset.vaccinate + preset.quarantine + preset.severLink);
                cands.push({ level, win: r.win, res: r.res, err: (r.win - target) ** 2 + 0.0015 * fewer * (1 - t) });
            }
        }
    }
    cands.sort((a, b) => a.err - b.err);
    let best = null;
    for (const c of cands.slice(0, 60)) {
        const rnd = rate(c.level, 'random', Math.round(runs * 1.5), 104729).win;
        const score = c.err + 30 * Math.max(0, rnd - randomCap(li)) ** 2;
        if (!best || score < best.score) best = { ...c, rnd, score };
    }
    const days = best.res.filter((r) => r.outcome === 'contained').map((r) => r.day);
    const tu = best.level.tuning;
    const entry = {
        initialInfected: tu.initialInfected,
        transmissionMultiplier: tu.transmissionMultiplier,
        caseCapFraction: tu.caseCapFraction,
        parDays: median(days) ?? 8,
        dailyLimits: tu.dailyLimits,
    };
    return { id: base.id, entry, log: `${base.id.padEnd(12)} target ${target.toFixed(2)} smart ${best.win.toFixed(2)} random ${best.rnd.toFixed(2)} ${JSON.stringify(entry)}` };
}

if (!isMainThread) {
    const { levels, runs } = workerData;
    for (const li of levels) parentPort.postMessage(tuneLevel(li, runs));
} else if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
    const RUNS = Number(process.argv[2]) || 80;
    const FROM = Number(process.argv[3] ?? 0);
    const TO = Number(process.argv[4] ?? LEVELS.length - 1);
    const OUT = process.env.TUNE_OUT ? new URL(process.env.TUNE_OUT, 'file://') : new URL('../src/config/campaign-tuning.js', import.meta.url);
    const N = Math.max(1, Number(process.env.TUNE_WORKERS) || cpus().length);

    let table = {};
    try {
        table = { ...(await import(`${OUT.href}?t=${Date.now()}`)).CAMPAIGN_TUNING };
    } catch {
        table = {};
    }
    const all = [];
    for (let li = FROM; li <= TO; li++) all.push(li);
    const shards = Array.from({ length: N }, (_, k) => all.filter((_, j) => j % N === k)).filter((s) => s.length);
    await Promise.all(
        shards.map(
            (levels) =>
                new Promise((resolve, reject) => {
                    const w = new Worker(new URL(import.meta.url), { workerData: { levels, runs: RUNS } });
                    w.on('message', (m) => {
                        table[m.id] = m.entry;
                        console.error(m.log);
                    });
                    w.on('error', reject);
                    w.on('exit', resolve);
                })
        )
    );

    const fmt = (v) => (v && typeof v === 'object' ? `{ ${Object.entries(v).map(([k, x]) => `${k}: ${x}`).join(', ')} }` : v);
    const ordered = LEVELS.filter((l) => table[l.id]).map((l) => [l.id, table[l.id]]);
    const lines = ordered.map(([id, t]) => `    '${id}': { ${Object.entries(t).map(([k, v]) => `${k}: ${fmt(v)}`).join(', ')} },`);
    writeFileSync(
        OUT,
        `// Tuned per level by scripts/tune-campaign.mjs. Do not edit by hand:\n// rerun the script (it merges, so a range of levels can be retuned).\n// Each entry overrides the defaults in src/config/campaign.js defaultTuning.\nexport const CAMPAIGN_TUNING = {\n${lines.join('\n')}\n};\n`
    );
}
