// Item 16: a toolkit per level. Each level starts with the tools that fit its
// scenario, and the briefing names them and says why. Pure data.
//
// A toolkit is { id, tools, why, toolDays? }:
//   tools     classic tool ids this level offers (vaccinate, quarantine,
//             severLink); every other classic tool is not on this world
//   why       one plain line for the briefing, grounded in real public health
//   toolDays  optional first day per tool (a vaccine rollout starts on day 1)
// Power-ups (Stay Home Pay and friends) are bought with funding and are not
// part of a toolkit: they stay available everywhere.
//
// Calls made for Adam (round 21): the first level of every planet and the
// urban levels keep the full kit so the tools stay familiar; the boss gets
// everything. School is Quarantine and Sever, as in Adam's example. Every kit
// keeps Sever: on webs of 10 to 25 people, random vaccinating and isolating
// wins on its own (47% to 73% in testing), while cutting the right line
// takes thought.

export const CLASSIC_TOOLS = Object.freeze(['vaccinate', 'quarantine', 'severLink']);

// First day of each classic tool when nothing brings it forward. Mirrors
// availableDay in src/config/tools.js (kept here to avoid an import cycle
// through economy.js; tests/toolkits.test.js checks they agree).
export const DEFAULT_TOOL_DAYS = Object.freeze({ vaccinate: 2, quarantine: 3, severLink: 1 });

export const TOOL_LABELS = Object.freeze({ vaccinate: 'Vaccinate', quarantine: 'Quarantine', severLink: 'Sever' });

export const TOOLKITS = Object.freeze({
    full: {
        id: 'full',
        tools: ['vaccinate', 'quarantine', 'severLink'],
        why: 'Every tool comes here: visiting rules from the start, then vaccines and isolation rooms as they arrive. Try each tool and see what it does.',
    },
    market: {
        id: 'market',
        tools: ['vaccinate', 'quarantine', 'severLink'],
        why: 'A market district has it all: a clinic for vaccines, wards for the sick, and stalls you can close.',
    },
    school: {
        id: 'school',
        tools: ['quarantine', 'severLink'],
        why: 'A flu shot takes about two weeks to protect, too slow for this outbreak. Send sick students home and split up classes.',
    },
    schoolNoVaccines: {
        id: 'schoolNoVaccines',
        tools: ['quarantine', 'severLink'],
        why: 'The vaccine shipment was lost. Send sick students home and split up classes.',
    },
    festival: {
        id: 'festival',
        tools: ['severLink'],
        why: 'Norovirus has no vaccine, and a festival field has no wards. Close the walkways between friend groups.',
    },
    festivalNoWards: {
        id: 'festivalNoWards',
        tools: ['vaccinate', 'severLink'],
        why: 'No wards on this world, but trial doses arrived. Vaccinate the people next in line and close walkways.',
    },
    rollout: {
        id: 'rollout',
        tools: ['vaccinate', 'severLink'],
        toolDays: { vaccinate: 1 },
        why: 'Trial doses just landed, so vaccinate from day 1. The wards are full: cancel flights between the sick and the healthy instead. Ring vaccination like this helped end Ebola in Guinea in 2015.',
    },
    envoy: {
        id: 'envoy',
        tools: ['quarantine', 'severLink'],
        why: 'Every vaccine dose went to the clinics. Keep the Envoy apart: isolate the sick and cut the contacts that lead to the Envoy.',
    },
    boss: {
        id: 'boss',
        tools: ['vaccinate', 'quarantine', 'severLink'],
        why: 'The final stand against the carrier. Every tool is yours.',
    },
});

// Which toolkit each slot on a planet uses (matches SLOTS in campaign.js).
export const SLOT_TOOLKITS = Object.freeze(['full', 'school', 'market', 'festival', 'schoolNoVaccines', 'rollout', 'envoy', 'market', 'festivalNoWards', 'boss']);

export function toolkitForSlot(k) {
    const kit = TOOLKITS[SLOT_TOOLKITS[k]];
    return { ...kit, tools: [...kit.tools], ...(kit.toolDays ? { toolDays: { ...kit.toolDays } } : {}) };
}

// Classic tool ids a level offers. Levels without a toolkit offer all three.
export function toolsOf(level) {
    return level && level.toolkit ? [...level.toolkit.tools] : [...CLASSIC_TOOLS];
}

// The day each kit tool opens on this level: the toolkit or the puzzle
// variant can bring a tool forward (the variant wins a tie, as in
// src/config/level-rules.js); otherwise the tool's own first day applies.
export function toolOpenDays(toolkit, variantToolDays = null) {
    const out = {};
    for (const id of toolkit ? toolkit.tools : []) {
        const pinned = variantToolDays?.[id] ?? toolkit.toolDays?.[id];
        out[id] = pinned ?? DEFAULT_TOOL_DAYS[id] ?? 1;
    }
    return out;
}

// Briefing card text: { title, tools: [labels], firstDay, days, why }.
// days pairs each tool label with the day it opens, so the briefing matches
// the tray (round 26: level 1 said everything was on hand while two tools
// stayed locked until day 2 and day 3).
export function toolkitCard(toolkit, variantToolDays = null) {
    if (!toolkit) return null;
    const labels = toolkit.tools.map((t) => TOOL_LABELS[t]);
    const open = toolOpenDays(toolkit, variantToolDays);
    // Chips run in the order the tools open (stable for ties).
    const days = toolkit.tools.map((t) => ({ label: TOOL_LABELS[t], day: open[t] })).sort((a, b) => a.day - b.day);
    const firstDay = days.filter((d) => d.day <= 1).map((d) => d.label);
    return {
        // Round 28: the title lists tools in the same opening order as the chips.
        title: labels.length === 1 ? `Your tool: ${labels[0]}` : `Your tools: ${days.map((d) => d.label).join(', ')}`,
        tools: labels,
        firstDay,
        days,
        why: toolkit.why,
    };
}
