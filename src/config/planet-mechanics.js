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
//   incubation  { count, days }  hidden carriers dealt with the level, see src/sim/mechanics.js
//   toolDays    first day of a tool on this level, when the mechanic moves it
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
    // Round 57: two of the first case's contacts already carry it when the
    // level is dealt, and fall sick after two nights (src/sim/mechanics.js).
    incubation: { count: 2, days: 2 },
    tools: ['test'],
    // Enough tests to be certain on day 1 whatever order they are used in
    // (the dealer only deals webs where contacts - 1 <= tests).
    toolLimits: { test: 5 },
    // Tests and wards are ready at once: finding and isolating a carrier is
    // the point of the level.
    toolDays: { test: 1, quarantine: 1 },
    drop: ['vaccinate'],
    why: 'Two people here already carry it and feel fine, so a vaccine would come too late. Test the contacts of the sick person, isolate a carrier you find, and cut the lines around the others.',
    lessonId: 'hidden-carriers',
    callout: {
        title: 'New: 2 hidden carriers',
        text: 'Two contacts of the sick person already carry it. They look healthy, pass it on from tonight, and fall sick in 2 days. Use Test on the contacts to find out which two, then isolate them or cut their lines.',
    },
});

const MASKS = Object.freeze({
    id: 'masks',
    tools: ['mask'],
    toolLimits: { mask: 2 },
    whyAdd: 'Masks arrived too: a line with a masked person on it takes two nights to cross instead of one.',
    lessonId: 'masks',
    callout: {
        title: 'New: masks',
        text: 'A mask does not cut a line. Every line of the person who wears it takes two nights to cross instead of one: it charges the first night and crosses the second. A mask buys you a day to cut, vaccinate or isolate.',
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
        text: 'The people with the arrow mark travel. Each night they drop their oldest contact and make a new one. The dotted line shows where each one goes tonight, so you can plan for it. An isolated traveller stays put.',
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

// R0 that climbs. The briefing's "R0 here" is the number of contacts a
// person has (src/sim/r0.js): with predictable spread every contact of a
// sick person catches it, so contacts ARE the reproduction number. From the
// third planet on, each planet's people have a few more contacts (the web
// generators in src/sim/network.js take this as their degree), so the
// disease really is more contagious there and the briefing says so. The
// learning planets keep the classic 4 (null here).
// Round 57: the climb is gentler than before (it ran up to 5.8). When every
// contact is a certain case, one more contact per person is a much bigger
// step than it was with dice, and above about 5 the best possible play
// still lost a third of the town. Later planets are now harder because of
// their puzzles (src/config/puzzle-specs.js), not because they are denser.
export const PLANET_WEB_DEGREE = Object.freeze([null, null, 4.2, 4.3, 4.4, 4.6, 4.8, 5.0]);

export function webDegreeFor(planetIndex) {
    if (planetIndex == null || planetIndex < FIRST_MECHANICS_PLANET) return null;
    return PLANET_WEB_DEGREE[Math.min(PLANET_WEB_DEGREE.length - 1, planetIndex)] ?? null;
}
