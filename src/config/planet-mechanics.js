// New ideas on later planets (wide audience round). Pure data.
//
// The first two planets (Mizuho and Hanabi) are where players learn the
// three classic tools, so nothing here touches them: FIRST_MECHANICS_PLANET
// is the third planet and tests/wide-mechanics-learning-planets.test.js holds
// the first twenty levels to a snapshot. From the third planet on, each
// planet brings in one idea that changes how you think, and later planets
// bring the earlier ideas back on a few levels so they stay in play.
//
//   Tsukimi   hidden carriers and the Test tool (incubation)
//   Kumoji    masks: weaken a line instead of cutting it
//   Sango     new ways to win: hold the line, keep it open
//   Yukimi    travellers: a few people change a contact every night
//   Hotaru, Kaminari   every idea returns, mixed
// and from Tsukimi on every planet's webs are a little denser, so R0 climbs
// (PLANET_WEB_DEGREE below).
//
// A level's mechanics entry is { id, ...rules }:
//   incubation  { minDays, maxDays, factor }  see src/sim/mechanics.js
//   maskFactor  share of the usual chance that passes a masked person
//   tools       extra tool ids added to the level's toolkit
//   drop        classic tools that make room when the kit would pass three
//               (the tray fits three tools and Shop on a phone)
//   toolLimits  daily uses of those tools (fixed, not searched by the tuner)
//   why         the briefing's toolkit line for this level (replaces the kit's)
//   travellers  { count } people who swap one contact each night
//   goal        a new way to win, see src/sim/mechanics.js
//   blurb       the level's story line on the briefing
//   whyAdd      or one sentence added after the kit's own line
//   lessonId    the lesson the level teaches instead of its usual one
//   callout     { title, text } briefing callout (like a puzzle variant's)
// Slots are 0 based and match SLOTS in src/config/campaign.js.

export const FIRST_MECHANICS_PLANET = 2;

// The core lessons every planet rotates through (src/config/campaign.js).
// Levels with a new idea teach that idea instead, so a few core lessons
// could drop out of the rotation; campaign.js hands any such lesson to a
// plain level on a later planet (never a learning planet).

// Extra tools a mechanic can add. Classic tools stay in toolkits.js.
export const MECHANIC_TOOLS = Object.freeze(['test', 'mask']);

const INCUBATION = Object.freeze({
    id: 'incubation',
    incubation: { minDays: 1, maxDays: 2, factor: 0.5 },
    tools: ['test'],
    toolLimits: { test: 2 },
    drop: ['vaccinate'],
    why: 'People here carry it for a day or two before they feel sick, so a vaccine would come too late. Test the contacts of the sick, isolate the carriers you find, and cut the lines around them.',
    lessonId: 'hidden-carriers',
    callout: {
        title: 'New: hidden carriers',
        text: 'A newly infected person looks healthy for a day or two and can already pass it on. Use Test on the contacts of the sick to find them, then isolate them.',
    },
});

const MASKS = Object.freeze({
    id: 'masks',
    maskFactor: 0.5,
    tools: ['mask'],
    toolLimits: { mask: 3 },
    whyAdd: 'Masks arrived too: one halves the spread on every line of the person who wears it.',
    lessonId: 'masks',
    callout: {
        title: 'New: masks',
        text: 'A mask does not cut a line. It halves the chance on every line of the person who wears it, both ways, for the whole level. You get more masks than cuts.',
    },
});

// Hold the line: help lands after `days` days. Stay under the cap till then.
function holdLine(days) {
    return Object.freeze({
        id: 'holdLine',
        goal: { type: 'holdLine', days },
        // Holding out until help comes is flattening the curve.
        lessonId: 'flatten-curve',
        blurb: `A vaccine shipment is on its way. Hold the line for ${days} days.`,
        callout: {
            title: `New goal: hold the line for ${days} days`,
            text: `You do not have to stop every case. Keep cases under the cap until day ${days} ends: then the vaccine shipment lands and you win. Stopping it sooner wins too.`,
        },
    });
}

// Keep it open: one hub (school, market) whose lines cannot be cut.
const KEEP_OPEN = Object.freeze({
    id: 'keepOpen',
    goal: { type: 'keepOpen', degreeShare: 0.35 },
    lessonId: 'keep-it-open',
    blurb: 'Everyone passes through the central market, and it must stay open. Stop the outbreak without closing it.',
    callout: {
        title: 'New goal: keep it open',
        text: 'The person with the house mark is the central market: lots of contacts, and none of their lines may be cut. Stop the spread before it gets there, or cut the lines around it.',
    },
});

// Travellers: borders leak.
const TRAVELLERS = Object.freeze({
    id: 'travellers',
    travellers: { count: 2 },
    lessonId: 'borders-leak',
    callout: {
        title: 'New: travellers',
        text: 'The people with the arrow mark travel. Each night they drop one contact and make a new one far away, so check their new line every morning. An isolated traveller stays put.',
    },
});

// Which slots of which planet play with which idea.
export const PLANET_MECHANICS = Object.freeze({
    2: { 1: INCUBATION, 4: INCUBATION, 7: INCUBATION }, // Tsukimi
    3: { 1: MASKS, 3: MASKS, 5: MASKS, 8: MASKS }, // Kumoji
    4: { 1: holdLine(7), 3: KEEP_OPEN, 7: holdLine(7) }, // Sango
    5: { 0: TRAVELLERS, 1: INCUBATION, 3: MASKS, 5: TRAVELLERS, 7: holdLine(8) }, // Yukimi
    6: { 1: MASKS, 3: KEEP_OPEN, 4: INCUBATION, 5: TRAVELLERS, 7: holdLine(8) }, // Hotaru
    7: { 0: TRAVELLERS, 1: INCUBATION, 3: KEEP_OPEN, 5: MASKS, 7: INCUBATION }, // Kaminari
});

// The mechanics of one level, or null. Always a fresh copy.
export function mechanicsFor(planetIndex, slotIndex) {
    if (planetIndex < FIRST_MECHANICS_PLANET) return null;
    const m = PLANET_MECHANICS[planetIndex]?.[slotIndex];
    return m ? JSON.parse(JSON.stringify(m)) : null;
}

// R0 that climbs (wide audience round). The briefing's "R0 here" is contacts
// per person times the chance per contact over a sick spell (src/sim/r0.js),
// and that chance is close to 1 on every level, so R0 sat near 3.5 to 4 from
// the first planet to the last. From the third planet on, each planet's
// people have more contacts (the web generators in src/sim/network.js take
// this as their degree), so the disease really is more contagious there and
// the briefing says so. The learning planets keep the classic 4 (null here).
export const PLANET_WEB_DEGREE = Object.freeze([null, null, 4.4, 4.7, 5.0, 5.3, 5.6, 5.8]);

export function webDegreeFor(planetIndex) {
    if (planetIndex == null || planetIndex < FIRST_MECHANICS_PLANET) return null;
    return PLANET_WEB_DEGREE[Math.min(PLANET_WEB_DEGREE.length - 1, planetIndex)] ?? null;
}
