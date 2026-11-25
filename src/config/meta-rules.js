// The rules a play really runs by: the rolled level rules
// (src/config/difficulty-roll.js) with the player's shop upgrades and Gentle
// mode applied on top. Pure. The game calls this in rollThreat; the balance
// bots take the same function through buildRun's `modify` argument, so what
// the bots measure is what people play. The Daily puzzle passes no options:
// everyone gets the same rules.
import { applyGentle } from './gentle.js';
import { applyUpgradeRules, applyUpgradeState } from './upgrades.js';

export function applyMetaRules(rules, { gentle = false, upgrades = [] } = {}) {
    let out = rules;
    if (upgrades && upgrades.length) out = applyUpgradeRules(out, upgrades);
    if (gentle) out = applyGentle(out);
    return out;
}

export function applyMetaState(state, rules, { upgrades = [] } = {}) {
    return applyUpgradeState(state, rules, upgrades);
}

// For buildRun(level, rng, modify) in src/sim/balance.js.
export function metaModifier(options) {
    return (rules) => applyMetaRules(rules, options);
}
