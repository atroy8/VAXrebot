// Shared helpers for the round 57 tests (not a test file itself).
import { tools } from '../src/config/tools.js';
import { LEVELS } from '../src/config/levels.js';

// A hand-built deal: people 0..n-1, lines as [a, b] pairs.
//   sick     ids that start sick          frail  ids with the heart mark
//   limits   uses per day, e.g. { severLink: 1 }   (tools left out are not offered)
//   days     first day per tool, e.g. { vaccinate: 1 }
export function handDeal({ n, lines, sick = [0], frail = [], masked = [], limits = { severLink: 1 }, days = {}, recoveryTime = 5, goal = null, envoy = null, hub = null, duration = 40, travellers = null }) {
    const nodes = Array.from({ length: n }, (_, id) => ({ id, state: sick.includes(id) ? 'infected' : 'healthy', daysInfected: 0, removed: false }));
    for (const id of frail) nodes[id].frail = true;
    for (const id of masked) nodes[id].masked = true;
    if (envoy != null) nodes[envoy].envoy = true;
    if (hub != null) nodes[hub].hub = true;
    for (const t of travellers || []) Object.assign(nodes[t.id], { traveller: true, route: t.route, routeAt: 0 });
    const dailyLimits = { vaccinate: 0, quarantine: 0, severLink: 0, test: 0, mask: 0, ...limits };
    const toolkit = Object.keys(dailyLimits).filter((id) => dailyLimits[id] > 0);
    return {
        levelId: 'hand',
        seed: 1,
        population: n,
        scenario: { duration, ...(goal ? { goal } : {}), ...(travellers ? { travellers: { count: travellers.length } } : {}) },
        difficulty: { recoveryTime, dailyLimits, toolkit, toolDays: { severLink: 1, vaccinate: 1, quarantine: 1, mask: 1, test: 1, ...days } },
        nodes,
        links: lines.map(([a, b]) => ({ source: a, target: b })),
        initialCases: sick.length,
        envoyId: envoy,
        superSpreaderId: null,
        hubId: hub,
    };
}

// One level of each kind: plain, every variant and every later mechanic.
export function levelOfEachKind() {
    const pick = (f) => LEVELS.find(f);
    return {
        tutorial: LEVELS[0],
        plain: pick((l) => !l.variant && !l.mechanics && l.planetIndex === 1),
        superSpreader: pick((l) => l.variant?.type === 'superSpreader' && !l.variant.boss),
        boss: pick((l) => l.variant?.boss),
        noVaccines: pick((l) => l.variant?.type === 'noVaccines' && !l.mechanics),
        noQuarantine: pick((l) => l.variant?.type === 'noQuarantine' && !l.mechanics),
        envoy: pick((l) => l.variant?.type === 'envoy'),
        incubation: pick((l) => l.mechanics?.id === 'incubation'),
        masks: pick((l) => l.mechanics?.id === 'masks'),
        holdLine: pick((l) => l.mechanics?.id === 'holdLine'),
        keepOpen: pick((l) => l.mechanics?.id === 'keepOpen'),
        travellers: pick((l) => l.mechanics?.id === 'travellers'),
    };
}

export { tools };
