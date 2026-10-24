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

export const TOOL_LABELS = Object.freeze({ vaccinate: 'Vaccinate', quarantine: 'Quarantine', severLink: 'Sever' });

export const TOOLKITS = Object.freeze({
    full: {
        id: 'full',
        tools: ['vaccinate', 'quarantine', 'severLink'],
        why: 'Everything is on hand here: vaccines, isolation rooms and visiting rules. Try each tool and see what it does.',
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

// Briefing card text: { title, tools: [labels], why }.
export function toolkitCard(toolkit) {
    if (!toolkit) return null;
    const labels = toolkit.tools.map((t) => TOOL_LABELS[t]);
    const firstDay = toolkit.toolDays ? Object.entries(toolkit.toolDays).filter(([, d]) => d <= 1).map(([t]) => TOOL_LABELS[t]) : [];
    return {
        title: labels.length === 1 ? `Your tool: ${labels[0]}` : `Your tools: ${labels.join(', ')}`,
        tools: labels,
        firstDay,
        why: toolkit.why,
    };
}
