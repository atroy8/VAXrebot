// Meta-game save rules (wide audience round): pure functions over the save
// (src/save.js) for Gentle mode, clear badges, bonus goals, hints and the
// loss streak. No DOM, no storage: game.js writes the save they return.
import { mergeGoals } from './sim/goals.js';
import { nextLossStreak } from './config/gentle.js';

export function gentleOn(save) {
    return !!(save && save.settings && save.settings.gentle);
}

export function setGentle(save, on) {
    return { ...save, settings: { ...(save.settings || {}), gentle: !!on } };
}

// Mark how a level was cleared. Stars earned in Gentle mode count; the mark
// lets a "standard" clear show as a small badge.
export function markClear(save, levelId, { gentle = false } = {}) {
    const rec = save.levels[levelId];
    if (!rec || !rec.completed) return save;
    const key = gentle ? 'gentleClear' : 'standardClear';
    if (rec[key]) return save;
    return { ...save, levels: { ...save.levels, [levelId]: { ...rec, [key]: true } } };
}

// 'standard' | 'gentle' | null for a level record.
export function clearBadge(record) {
    if (!record || !record.completed) return null;
    if (record.standardClear) return 'standard';
    return record.gentleClear ? 'gentle' : null;
}

// Bank this run's bonus goals: the best set ever completed is kept per
// level and each goal pays once. Returns { save, fresh, funding }.
export function saveGoals(save, levelId, checked) {
    const before = (save.goals && save.goals[levelId]) || [];
    const { done, fresh, funding } = mergeGoals(before, checked);
    if (!fresh.length) return { save, fresh, funding: 0 };
    return { save: { ...save, funding: save.funding + funding, goals: { ...(save.goals || {}), [levelId]: done } }, fresh, funding };
}

export function noteResult(save, levelId, won) {
    return { ...save, lossStreak: nextLossStreak(save.lossStreak, levelId, won) };
}

// Pay for a hint. Returns the new save, or null when the player cannot pay.
export function spendFunding(save, amount) {
    if (amount <= 0) return save;
    if (save.funding < amount) return null;
    return { ...save, funding: save.funding - amount };
}
