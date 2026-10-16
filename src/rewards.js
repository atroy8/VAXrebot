// End-of-level rewards shown in the results tally: a care bonus (funding)
// for the people you looked after, and the prize boxes a win just unlocked.
// Pure, no DOM; tested in tests/rewards.test.js. Only a contained win pays.
//
// Why these weights: isolating sick people (treated) is what actually breaks
// chains of spread, so it pays the most. Cures are what the player is
// working toward. Isolating healthy people is a precaution and pays a
// little. A clean, fast win earns small extras.

import { parDaysFor, levelRecord } from './progress.js';

export const CARE_BONUS = Object.freeze({
    perTreated: 3,
    perCured: 2,
    perIsolated: 1,
    noDeaths: 20,
    perDayUnderPar: 5,
    maxSpeedBonus: 30,
});

// Returns { lines: [{ id, label, count, each, amount }], total }.
// `count`/`each` are set for per-person lines (the bins); flat extras have
// only `amount`. Lines worth nothing are left out.
export function careBonus(outcome, stats, level, rules = CARE_BONUS) {
    if (outcome !== 'contained') return { lines: [], total: 0 };
    const treated = stats.treated || 0;
    const isolated = stats.isolated || 0;
    const cured = stats.totalRecovered || 0;
    const lines = [
        { id: 'treatment', label: 'Treated in isolation', count: treated, each: rules.perTreated },
        { id: 'cured', label: 'Cured', count: cured, each: rules.perCured },
        { id: 'isolated', label: 'Kept safe in isolation', count: isolated, each: rules.perIsolated },
    ].map((l) => ({ ...l, amount: l.count * l.each }));
    if ((stats.totalDead || 0) === 0) lines.push({ id: 'noDeaths', label: 'Nobody died', amount: rules.noDeaths });
    const par = level ? parDaysFor(level) : 0;
    const used = stats.daysUsed == null ? par : stats.daysUsed;
    const early = Math.max(0, par - used);
    if (early > 0) {
        lines.push({ id: 'speed', label: `Finished ${early} day${early === 1 ? '' : 's'} early`, amount: Math.min(rules.maxSpeedBonus, early * rules.perDayUnderPar) });
    }
    const kept = lines.filter((l) => l.amount > 0);
    return { lines: kept, total: kept.reduce((s, l) => s + l.amount, 0) };
}

// Prize boxes this result just made openable: boxes behind this level that
// need its first star, when the level had no star before and has one now,
// and the box has not been opened yet.
export function newlyUnlockedChests({ chests, levels, levelId, saveBefore, saveAfter }) {
    const idx = levels.findIndex((l) => l.id === levelId);
    if (idx < 0) return [];
    const before = levelRecord(saveBefore, levelId).stars || 0;
    const after = levelRecord(saveAfter, levelId).stars || 0;
    if (before >= 1 || after < 1) return [];
    const opened = new Set(saveAfter.openedChests || []);
    return chests.filter((c) => c.afterLevelIndex === idx && !opened.has(c.id));
}
