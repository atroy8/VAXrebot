// Tool definitions. The three classic tools are daily-limited per run.
// The three power-ups below are funding-purchasable consumable charges:
// they carry `consumable: true` plus a chargeId and cost, and the game
// routes their clicks through src/economy.js (usePowerUp), which
// decrements the charge from the save. Costs and effects are documented
// in src/economy.js POWER_UPS; this file mirrors them into the tool
// system so the tool list, shop, and economy share one source of truth.
import { POWER_UPS, POWER_UP_IDS } from '../economy.js';

const powerUpTools = {};
for (const id of POWER_UP_IDS) {
    const p = POWER_UPS[id];
    powerUpTools[id] = {
        name: `${p.emoji} ${p.name}`,
        description: `${p.effect} Uses 1 charge. Buy more with funding.`,
        availableDay: 1,
        oncePerPerson: false,
        baseDailyLimit: 1,
        validTargets: [],
        consumable: true,
        chargeId: id,
        cost: p.cost,
        color: p.color,
    };
}

export const tools = {
    vaccinate: { name: "💉 Vaccinate", description: "Protect susceptible individuals", availableDay: 2, oncePerPerson: true, baseDailyLimit: 5, validTargets: ["healthy"] },
    quarantine: { name: "🚫 Quarantine", description: "Isolate any individual", availableDay: 3, oncePerPerson: true, baseDailyLimit: 3, validTargets: ["healthy", "infected", "recovered", "exposed"] },
    severLink: { name: "🔗 Sever Link", description: "Break a connection", availableDay: 1, oncePerPerson: false, baseDailyLimit: 3, validTargets: ["any"] },
    // Later planets only (src/config/planet-mechanics.js). baseDailyLimit 0
    // means "not on this world" unless the level pins a daily limit, so the
    // learning planets never see these tools.
    test: { name: "🧪 Test", description: "Find out who is carrying it", availableDay: 2, oncePerPerson: false, baseDailyLimit: 0, validTargets: ["healthy"] },
    mask: { name: "😷 Mask", description: "Halve the spread on all of a person's lines", availableDay: 1, oncePerPerson: true, baseDailyLimit: 0, validTargets: ["healthy", "infected", "exposed"] },
    ...powerUpTools,
};
