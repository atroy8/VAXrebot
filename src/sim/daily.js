// Daily puzzle (wide audience round): one seeded level per calendar day
// (UTC). Everyone gets the same web, the same first cases and the same
// stream of dice, so the same moves always give the same outcome and
// friends can compare. Pure: no DOM, no storage, no clock unless asked.
//
// The level is borrowed from the middle of the campaign (the three medium
// planets, no boss), so it is approachable for anyone past the first worlds.
// The run is built exactly the way the balance bots build one
// (buildRun in src/sim/balance.js with the day's seed), which is how
// scripts/meta-report.mjs and the tests prove it is winnable.
import { LEVELS } from '../config/levels.js';
import { mulberry32 } from './balance.js';

export const DAILY_PREFIX = 'daily-';
export const DAILY_NAME = 'Daily Outbreak';

// Middle of the campaign: medium planets, bosses left out.
export const DAILY_TEMPLATES = LEVELS.filter((l) => l.difficultyId === 'medium' && !(l.variant && l.variant.boss)).map((l) => l.id);

const pad = (n) => String(n).padStart(2, '0');

// 'YYYY-MM-DD' in UTC.
export function utcDateString(date = new Date()) {
    return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

export function addDays(dateStr, days) {
    const [y, m, d] = dateStr.split('-').map(Number);
    return utcDateString(new Date(Date.UTC(y, m - 1, d + days)));
}

// FNV-1a over the date string: a stable 32 bit seed per day.
export function dailySeed(dateStr) {
    let h = 0x811c9dc5;
    for (const ch of `galactic-outbreak:${dateStr}`) {
        h ^= ch.charCodeAt(0);
        h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
}

// The level for a date: a campaign level under a daily id and name.
export function dailyLevel(dateStr, templates = DAILY_TEMPLATES, levels = LEVELS) {
    const templateId = templates[dailySeed(dateStr) % templates.length];
    const template = levels.find((l) => l.id === templateId);
    return {
        ...template,
        id: `${DAILY_PREFIX}${dateStr}`,
        name: DAILY_NAME,
        daily: true,
        dailyDate: dateStr,
        templateId,
        tuning: { ...template.tuning },
        toolkit: { ...template.toolkit, tools: [...template.toolkit.tools] },
    };
}

export function isDailyLevel(level) {
    return !!level && level.daily === true;
}

// The day's dice. One stream, read in the same order as buildRun: the first
// number rolls the threat (rules), the rest roll the web, the first cases
// and every night. `run` starts after the threat roll, so the game can take
// the rules at the briefing and the rest when the level starts, any number
// of times, and always get the same level.
export function dailyDice(dateStr) {
    const seed = dailySeed(dateStr);
    return {
        seed,
        rules: () => mulberry32(seed),
        run: () => {
            const rng = mulberry32(seed);
            rng(); // the threat roll
            return rng;
        },
    };
}

// ---- Streak ---------------------------------------------------------------
// save.daily = { lastDate, streak, best, last: { date, outcome, days, lost, stars } }
// Only the first finished attempt of a day counts. A win keeps the streak
// going when yesterday also counted as a win; a loss ends it.

export function freshDaily() {
    return { lastDate: null, streak: 0, best: 0, last: null };
}

export function dailyStatus(daily, today) {
    const d = daily || freshDaily();
    const done = d.lastDate === today;
    const alive = done || d.lastDate === addDays(today, -1);
    return { done, streak: alive ? d.streak || 0 : 0, best: d.best || 0, last: done ? d.last : null };
}

// Returns { daily, counted }. counted is false for a practice replay.
export function recordDaily(daily, { date, outcome, days = 0, lost = 0, stars = 0 }) {
    const d = daily || freshDaily();
    if (d.lastDate === date) return { daily: d, counted: false };
    const won = outcome === 'contained';
    const carried = d.lastDate === addDays(date, -1) ? d.streak || 0 : 0;
    const streak = won ? carried + 1 : 0;
    return {
        daily: { lastDate: date, streak, best: Math.max(d.best || 0, streak), last: { date, outcome, days, lost, stars } },
        counted: true,
    };
}

// ---- Share text -----------------------------------------------------------
// Spoiler free: the result and one square per night (red when more people
// were sick than the night before, yellow when the same, green when fewer).

export const SQUARES = Object.freeze({ up: '🟥', same: '🟨', down: '🟩' });

export function caseSquares(activeByDay = [], max = 20) {
    const out = [];
    for (let i = 1; i < activeByDay.length; i++) {
        const diff = activeByDay[i] - activeByDay[i - 1];
        out.push(diff > 0 ? SQUARES.up : diff < 0 ? SQUARES.down : SQUARES.same);
    }
    return out.slice(0, max).join('');
}

const OUTCOME_WORDS = { overwhelmed: 'overwhelmed', 'envoy-lost': 'Envoy lost', timeout: 'out of time', burnout: 'burned out' };

export function dailyShareText({ date, outcome, days = 0, lost = 0, stars = 0, activeByDay = [], streak = 0 } = {}) {
    const dayWord = `${days} day${days === 1 ? '' : 's'}`;
    const result = outcome === 'contained' ? `contained in ${dayWord}, ${lost} lost, ${stars} star${stars === 1 ? '' : 's'}` : `${OUTCOME_WORDS[outcome] || 'not contained'} on day ${days}, ${lost} lost`;
    const lines = [`Galactic Outbreak Daily ${date}: ${result}`];
    const squares = caseSquares(activeByDay);
    if (squares) lines.push(squares);
    if (streak > 1) lines.push(`Streak: ${streak} days`);
    return lines.join('\n');
}
