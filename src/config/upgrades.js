// Permanent shop upgrades (wide audience round): bought once with funding,
// kept in the save (save.upgrades). Each is a small, clear edge, so owning
// them feels like building a kit, not removing the puzzle.
//
// Prices against real earnings (node scripts/meta-report.mjs): the smart bot
// banks about 126 funding per win (75 to 125 for stars plus the care bonus),
// so the five cost about 1, 1.2, 1.6, 2.4 and 3.2 wins: 1,170 in all, a
// little over 9 wins of the 80 levels, with power-ups (40 to 120 a charge)
// competing for the same funding.
//
// Effects are pure modifiers on the rolled rules (applyUpgradeRules) or on
// the fresh game state (applyUpgradeState); the sim is unchanged, and the
// balance guardrails are measured without upgrades.
// Round 57: an upgrade never changes the web that is dealt, and the case cap
// stays measured from the plain level's par (src/sim/dealer.js withMeta), so
// each one is an honest edge when it comes to winning. Par itself is worked
// out again with the upgrades, so 3 stars still means the best play with
// the kit you own.
import { DEFAULT_TOOL_DAYS } from './toolkits.js';

export const UPGRADES = Object.freeze([
    { id: 'fieldTraining', name: 'Field training', icon: '✂️', cost: 120, effect: '+1 Sever on day 1 of every level.' },
    { id: 'mentor', name: 'Mentor on call', icon: '💡', cost: 150, effect: '2 free hints per level instead of 1.' },
    // Round 57: replaces Early warning (who is most likely to fall ill next),
    // which means nothing now that every red line is a certainty. Saves that
    // own earlyWarning are migrated to this (src/save.js).
    { id: 'rapidResponse', name: 'Rapid response', icon: '🚑', cost: 200, effect: 'Quarantine opens on day 2 instead of day 3.' },
    { id: 'coldChain', name: 'Cold chain', icon: '🧊', cost: 300, effect: 'Vaccinate opens one day earlier on levels where it is delayed.' },
    { id: 'extraWard', name: 'Extra ward', icon: '🏥', cost: 400, effect: 'Room for one more patient: the case cap is 1 higher.' },
]);

export const UPGRADE_IDS = UPGRADES.map((u) => u.id);
export const EXTRA_WARD_CAP = 1; // cases added to the case cap
// Upgrade ids that were replaced, old to new (src/save.js migrates saves).
export const UPGRADE_RENAMES = Object.freeze({ earlyWarning: 'rapidResponse' });
export const MENTOR_FREE_HINTS = 2;

export function upgradeById(id) {
    return UPGRADES.find((u) => u.id === id) || null;
}

const has = (owned, id) => Array.isArray(owned) && owned.includes(id);
const round3 = (x) => Math.round(x * 1000) / 1000;

// Rules in force with the owned upgrades. Returns NEW rules.
export function applyUpgradeRules(rules, owned = []) {
    const scenario = { ...rules.scenario };
    const difficulty = { ...rules.difficulty };
    if (has(owned, 'coldChain')) {
        const limit = difficulty.dailyLimits ? difficulty.dailyLimits.vaccinate : undefined;
        const offered = limit == null ? !difficulty.toolkit || difficulty.toolkit.includes('vaccinate') : limit > 0;
        const day = difficulty.toolDays?.vaccinate ?? DEFAULT_TOOL_DAYS.vaccinate;
        if (offered && day > 1) difficulty.toolDays = { ...(difficulty.toolDays || {}), vaccinate: day - 1 };
    }
    if (has(owned, 'rapidResponse')) {
        const limit = difficulty.dailyLimits ? difficulty.dailyLimits.quarantine : undefined;
        const offered = limit == null ? !difficulty.toolkit || difficulty.toolkit.includes('quarantine') : limit > 0;
        const day = difficulty.toolDays?.quarantine ?? DEFAULT_TOOL_DAYS.quarantine;
        // Never before day 2: on day 1 the first case could simply be
        // isolated, and there would be no puzzle left.
        if (offered && day > 2) difficulty.toolDays = { ...(difficulty.toolDays || {}), quarantine: day - 1 };
    }
    // Extra ward: one more case under the cap (the dealer's cap is par plus
    // scenario.capSlack; the old share of the town is kept for undealt webs).
    if (has(owned, 'extraWard')) {
        if (scenario.capSlack != null) scenario.capSlack += EXTRA_WARD_CAP;
        if (scenario.caseCapFraction != null) scenario.caseCapFraction = round3(scenario.caseCapFraction + 0.03);
    }
    return { ...rules, scenario, difficulty };
}

// Changes to a fresh game state (day 1, nothing used yet). Field training:
// one Sever already "given back" on day 1, so the tray shows one more use.
// The day reset in advanceDay clears it, so it lasts exactly one day.
export function applyUpgradeState(state, rules, owned = []) {
    if (has(owned, 'fieldTraining')) {
        const limit = rules.difficulty.dailyLimits ? rules.difficulty.dailyLimits.severLink : 1;
        if (limit > 0 && state.day === 1) state.dailyUsage.severLink -= 1;
    }
    return state;
}

// Free hints per level with the owned upgrades.
export function freeHints(owned = [], base = 1) {
    return has(owned, 'mentor') ? Math.max(base, MENTOR_FREE_HINTS) : base;
}

// Buy one upgrade. Pure: returns { ok, reason?, save } with a NEW save.
export function buyUpgrade(save, id) {
    const upgrade = upgradeById(id);
    const owned = Array.isArray(save.upgrades) ? save.upgrades : [];
    if (!upgrade) return { ok: false, reason: 'Unknown upgrade.', save };
    if (owned.includes(id)) return { ok: false, reason: 'You already own this.', save };
    if (save.funding < upgrade.cost) return { ok: false, reason: `Not enough gold. ${upgrade.name} costs ${upgrade.cost}.`, save };
    return { ok: true, save: { ...save, funding: save.funding - upgrade.cost, upgrades: [...owned, id] } };
}
