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
import { DEFAULT_TOOL_DAYS } from './toolkits.js';

export const UPGRADES = Object.freeze([
    { id: 'fieldTraining', name: 'Field training', icon: '✂️', cost: 120, effect: '+1 Sever on day 1 of every level.' },
    { id: 'mentor', name: 'Mentor on call', icon: '💡', cost: 150, effect: '2 free hints per level instead of 1.' },
    { id: 'earlyWarning', name: 'Early warning', icon: '🔔', cost: 200, effect: 'Each morning, see who is most likely to fall ill next.' },
    { id: 'coldChain', name: 'Cold chain', icon: '🧊', cost: 300, effect: 'Vaccinate opens one day earlier on levels where it is delayed.' },
    { id: 'extraWard', name: 'Extra ward', icon: '🏥', cost: 400, effect: 'Room for more patients: the case cap is a little higher.' },
]);

export const UPGRADE_IDS = UPGRADES.map((u) => u.id);
export const EXTRA_WARD_CAP = 0.03; // share of the town added to the case cap
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
    if (has(owned, 'extraWard') && scenario.caseCapFraction != null) {
        scenario.caseCapFraction = round3(scenario.caseCapFraction + EXTRA_WARD_CAP);
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

// Early warning: the healthy person most likely to catch it tonight, or
// null when nobody can. Chance = 1 - (1 - rate)^(sick contacts).
export function likelyNextCase(network, transmissionRate) {
    const id = (ref) => (ref && typeof ref === 'object' ? ref.id : ref);
    const byId = new Map(network.nodes.map((n) => [n.id, n]));
    const sickContacts = new Map();
    for (const l of network.links) {
        const a = byId.get(id(l.source));
        const b = byId.get(id(l.target));
        if (!a || !b) continue;
        if (a.state === 'infected' && b.state === 'healthy') sickContacts.set(b, (sickContacts.get(b) || 0) + 1);
        if (b.state === 'infected' && a.state === 'healthy') sickContacts.set(a, (sickContacts.get(a) || 0) + 1);
    }
    let best = null;
    for (const [node, k] of sickContacts) {
        if (!best || k > best.contacts || (k === best.contacts && node.id < best.node.id)) best = { node, contacts: k };
    }
    if (!best) return null;
    const rate = Math.min(1, Math.max(0, transmissionRate || 0));
    return { node: best.node, contacts: best.contacts, chance: 1 - Math.pow(1 - rate, best.contacts) };
}
