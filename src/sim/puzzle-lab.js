// Numbers about the puzzles the dealer deals (round 57), for
// scripts/tune-puzzles.mjs and the tests. Pure and seeded apart from the
// clock used to time a deal.
import { dealLevel, simplePlay, reachesPar, candidateSeed } from './dealer.js';
import { playDeal } from './balance.js';
import { CLASSIC_TOOLS } from '../config/toolkits.js';
import { HAND_SET_LEVELS, PLANET_PUZZLE } from '../config/puzzle-specs.js';

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const share = (xs, f) => (xs.length ? xs.filter(f).length / xs.length : 0);

// A copy of a level with other tuning (what campaign.js would build). The
// spec numbers the tuner may set (cap slack and so on) start from the planet
// defaults again, not from whatever the table holds for the level now.
export function withTuning(level, tuning) {
    const base = { ...level.tuning };
    for (const key of ['capSlack', 'minDepth', 'missRate', 'maxParShare', 'carrierExtra', 'toolDays']) delete base[key];
    const out = { ...level, tuning: { ...base, ...tuning, dailyLimits: { ...level.tuning.dailyLimits, ...(tuning.dailyLimits || {}) } }, toolkit: { ...level.toolkit, tools: [...level.toolkit.tools] } };
    if (tuning.toolDays) out.toolkit.toolDays = { ...(level.toolkit.toolDays || {}), ...tuning.toolDays };
    if (level.variant) out.variant = { ...level.variant, ...(tuning.carrierExtra != null ? { carrierExtra: tuning.carrierExtra } : {}) };
    return out;
}

// Deal a level `deals` times and measure. simplePlays: extra simple plays
// per deal (fresh seeds, not the ones the dealer judged with).
export function levelReport(level, { deals = 40, seed = 1, simplePlays = 6, bots = ['smart', 'beginner', 'random', 'passive'], dealOptions = {} } = {}) {
    const rows = [];
    for (let i = 0; i < deals; i++) {
        const s = (seed * 100003 + i) >>> 0;
        const t0 = now();
        const deal = dealLevel(level, s, dealOptions);
        const ms = now() - t0;
        const par = deal.par;
        let simpleHits = 0;
        if (par) for (let k = 0; k < simplePlays; k++) if (reachesPar(simplePlay(deal, candidateSeed(s, 900 + k)), par)) simpleHits++;
        const played = {};
        for (const bot of bots) played[bot] = playDeal(deal, bot, s, level);
        rows.push({ deal, ms, par, simpleHits, played });
    }
    const ok = rows.filter((r) => r.par);
    const out = {
        level: level.id,
        kind: `${level.variant ? level.variant.type + (level.variant.boss ? '*' : '') : ''}${level.mechanics ? ` ${level.mechanics.id}` : ''}`.trim(),
        deals,
        acceptRate: rows.reduce((a, r) => a + (r.deal.info.accepted ? 1 : 0), 0) / rows.reduce((a, r) => a + r.deal.info.tries, 0),
        fallbackShare: share(rows, (r) => !r.deal.info.accepted),
        unwinnable: rows.length - ok.length,
        dealMs: mean(rows.map((r) => r.ms)),
        dealMsMax: Math.max(...rows.map((r) => r.ms)),
        solveMs: mean(rows.map((r) => r.ms / r.deal.info.tries)),
        tries: mean(rows.map((r) => r.deal.info.tries)),
        exactShare: share(ok, (r) => r.deal.info.exact),
        mismatches: rows.filter((r) => r.deal.info.mismatch).length,
        population: mean(rows.map((r) => r.deal.population)),
        parCases: mean(ok.map((r) => r.par.cases)),
        parDeaths: mean(ok.map((r) => r.par.deaths)),
        parDays: mean(ok.map((r) => r.par.days)),
        depth: mean(ok.map((r) => r.deal.info.depth || 0)),
        cap: mean(ok.map((r) => r.deal.caseCap)),
        simpleThree: ok.length ? ok.reduce((a, r) => a + r.simpleHits, 0) / (ok.length * simplePlays) : 0,
        bots: {},
    };
    for (const bot of bots) {
        out.bots[bot] = {
            win: share(rows, (r) => r.played[bot].outcome === 'contained'),
            three: share(rows, (r) => r.played[bot].stars === 3),
            stars: mean(rows.map((r) => r.played[bot].stars)),
        };
    }
    return out;
}

const pct = (x) => `${Math.round(x * 100)}%`.padStart(4);
const num = (x, d = 1) => x.toFixed(d).padStart(5);

export const REPORT_HEAD = 'level         kind                 accept fallb  deal ms (max)  solve ms  tries  people  par cases/deaths/days  cap   depth exact  simple 3★  smart win/3★  beginner  random  passive';

export function formatRow(r) {
    const b = r.bots;
    return [
        r.level.padEnd(13),
        r.kind.padEnd(20),
        pct(r.acceptRate),
        pct(r.fallbackShare),
        `${num(r.dealMs)} (${num(r.dealMsMax, 0).trim()})`.padEnd(14),
        num(r.solveMs, 2),
        num(r.tries),
        num(r.population),
        `${num(r.parCases)}/${num(r.parDeaths, 2).trim()}/${num(r.parDays).trim()}`.padEnd(20),
        num(r.cap),
        num(r.depth),
        pct(r.exactShare),
        pct(r.simpleThree).padStart(9),
        b.smart ? `${pct(b.smart.win)}/${pct(b.smart.three)}`.padStart(13) : '',
        b.beginner ? pct(b.beginner.win).padStart(8) : '',
        b.random ? pct(b.random.win).padStart(7) : '',
        b.passive ? pct(b.passive.win).padStart(7) : '',
    ].join(' ');
}

export function planetSummary(rows) {
    const m = (f) => mean(rows.map(f));
    return `planet mean: accept ${pct(m((r) => r.acceptRate))}, deal ${num(m((r) => r.dealMs))} ms, par ${num(m((r) => r.parCases))} cases of ${num(m((r) => r.population))} in ${num(m((r) => r.parDays))} days, simple 3★ ${pct(m((r) => r.simpleThree))}, smart win ${pct(m((r) => r.bots.smart?.win || 0))} 3★ ${pct(m((r) => r.bots.smart?.three || 0))}, beginner ${pct(m((r) => r.bots.beginner?.win || 0))}, random ${pct(m((r) => r.bots.random?.win || 0))}`;
}

// ---- Tuning ---------------------------------------------------------------------

// What the tuner wants from a level, by planet: how often a sensible player
// (the smart bot) should win, so the campaign climbs; how often a new player
// who taps red lines in any order (the beginner bot) should still win on the
// learning planets; and the fewest spare cases the cap may leave (a cap one
// case over par turns every small mistake into a loss, which is right for
// the last planets and wrong for the first).
export const TUNE_TARGETS = Object.freeze([
    { smartWin: 0.97, beginnerWin: 0.6, accept: 0.3, minSlack: 3 },
    { smartWin: 0.93, beginnerWin: 0.5, accept: 0.3, minSlack: 3 },
    { smartWin: 0.84, beginnerWin: 0, accept: 0.25, minSlack: 2 },
    { smartWin: 0.78, beginnerWin: 0, accept: 0.25, minSlack: 2 },
    { smartWin: 0.72, beginnerWin: 0, accept: 0.25, minSlack: 2 },
    { smartWin: 0.66, beginnerWin: 0, accept: 0.2, minSlack: 1 },
    { smartWin: 0.6, beginnerWin: 0, accept: 0.2, minSlack: 1 },
    { smartWin: 0.54, beginnerWin: 0, accept: 0.2, minSlack: 1 },
]);

// Tool counts worth trying for a level: every tool of its kit from 1 use up
// to a few, first cases 1 or 2, and (super-spreader levels) how many more
// contacts the carrier has than there are cuts.
export function tuningCandidates(level) {
    const kit = level.toolkit.tools;
    // Later planets have denser webs (PLANET_WEB_DEGREE), so their kits may
    // need more uses a day to stay playable.
    const p = level.planetIndex || 0;
    const ranges = {
        severLink: p < 2 ? [1, 2, 3, 4] : p < 5 ? [2, 3, 4, 5] : [2, 3, 4, 5, 6],
        vaccinate: p < 5 ? [1, 2, 3] : [1, 2, 3, 4],
        quarantine: p < 5 ? [1, 2] : [1, 2, 3],
        mask: [1, 2, 3],
        test: [5],
    };
    let combos = [{}];
    for (const id of kit) {
        const next = [];
        for (const c of combos) for (const n of ranges[id] || [1]) next.push({ ...c, [id]: n });
        combos = next;
    }
    const out = [];
    for (const limits of combos) {
        const dailyLimits = { ...limits };
        for (const id of CLASSIC_TOOLS) if (!kit.includes(id)) dailyLimits[id] = 0;
        const firsts = level.mechanics && level.mechanics.incubation ? [1] : level.variant && level.variant.type === 'superSpreader' ? [1] : [1, 2];
        for (const initialInfected of firsts) {
            if (level.variant && level.variant.type === 'superSpreader') {
                for (const carrierExtra of level.variant.boss ? [2, 3, 4] : [1, 2, 3]) out.push({ initialInfected, dailyLimits, carrierExtra });
            } else out.push({ initialInfected, dailyLimits });
        }
    }
    return out;
}

// How far a measured level is from what the tuner wants (lower is better).
export function tuneScore(report, target) {
    let score = Math.abs(report.bots.smart.win - target.smartWin) * 100;
    // No level may be a wall: well clear of the 20% floor the guardrails ask for.
    if (report.bots.smart.win < 0.4) score += (0.4 - report.bots.smart.win) * 300;
    if (target.beginnerWin && report.bots.beginner && report.bots.beginner.win < target.beginnerWin) score += (target.beginnerWin - report.bots.beginner.win) * 120;
    if (report.acceptRate < target.accept) score += (target.accept - report.acceptRate) * 400;
    score += report.fallbackShare * 300 + report.unwinnable * 100;
    score += report.bots.random.win * 60;
    // A puzzle where the smart bot always finds the best line is too plain.
    // (The guardrail is 70% at most on any level; aim well under it.)
    if (report.bots.smart.three > 0.5) score += (report.bots.smart.three - 0.5) * 400;
    if (report.bots.smart.three < 0.1) score += (0.1 - report.bots.smart.three) * 150;
    // The best play should keep most people well: a par that loses half
    // the town does not feel like winning.
    const parShare = report.population ? report.parCases / report.population : 0;
    if (parShare > 0.38) score += (parShare - 0.38) * 200;
    // Slow deals cost the player time on the briefing.
    if (report.dealMs > 25) score += (report.dealMs - 25) * 0.5;
    return score;
}

// Pick the tuning of one level: measure every candidate on a few deals,
// the best few on more, then set the cap slack of the winner so the smart
// bot's win rate lands nearest the planet's target. Returns { tuning, note }
// or null (hand set).
export function tuneLevel(level, { quick = 10, full = 40, keep = 4 } = {}) {
    if (HAND_SET_LEVELS.includes(level.id)) return null;
    const target = TUNE_TARGETS[Math.min(TUNE_TARGETS.length - 1, level.planetIndex)];
    const bots = target.beginnerWin ? ['smart', 'random', 'beginner'] : ['smart', 'random'];
    const measure = (tuning, deals) => {
        const report = levelReport(withTuning(level, tuning), { deals, seed: 7, simplePlays: 0, bots, dealOptions: { maxCandidates: 20 } });
        return { tuning, report, score: tuneScore(report, target) };
    };
    // Every candidate starts at the smallest cap slack the planet allows.
    const first = tuningCandidates(level).map((t) => measure({ ...t, capSlack: target.minSlack }, quick));
    first.sort((a, b) => a.score - b.score);
    const second = first.slice(0, keep).map((x) => measure(x.tuning, full));
    second.sort((a, b) => a.score - b.score);
    let best = second[0];
    for (const base of second.slice(0, 2)) {
        for (let capSlack = target.minSlack + 1; capSlack <= 6; capSlack++) {
            const tried = measure({ ...base.tuning, capSlack }, full);
            if (tried.score < best.score - 0.01) best = tried;
        }
    }
    // Still too easy to find the best line? Ask the dealer for webs where
    // simple play misses it more often (one fewer simple play in six may
    // reach par, then two fewer).
    const base = PLANET_PUZZLE[Math.min(PLANET_PUZZLE.length - 1, level.planetIndex)].missRate;
    for (const step of [1, 2]) {
        if (best.report.bots.smart.three <= 0.5) break;
        const missRate = Math.min(0.84, Math.round((base + step / 6) * 100) / 100);
        const tried = measure({ ...best.tuning, missRate }, full);
        // Taken when it makes the best line clearly harder to stumble on
        // without costing much elsewhere (or simply scores better).
        const harder = tried.report.bots.smart.three < best.report.bots.smart.three - 0.02 && tried.report.acceptRate >= target.accept && tried.score < best.score + 15;
        if (harder || tried.score < best.score - 0.01) best = tried;
    }
    const r = best.report;
    return { tuning: best.tuning, note: `smart ${Math.round(r.bots.smart.win * 100)}% (3 stars ${Math.round(r.bots.smart.three * 100)}%)${r.bots.beginner ? `, beginner ${Math.round(r.bots.beginner.win * 100)}%` : ''}, accept ${Math.round(r.acceptRate * 100)}%, par ${r.parCases.toFixed(1)} of ${r.population.toFixed(0)}, deal ${r.dealMs.toFixed(0)} ms` };
}
