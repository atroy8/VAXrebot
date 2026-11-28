// Galactic Outbreak campaign (round 14): 3 star systems, 8 inhabited
// planets, 10 levels on each planet, 80 levels in all.
//
// This file is pure data plus a deterministic generator. src/config/levels.js
// re-exports what it builds as REGIONS (one per planet) and LEVELS, so the
// rest of the game (progress, balance bots, map, briefing) keeps one shape.
//
// Level shape (unchanged from rounds 1 to 13, plus optional fields):
//   { id, name, regionId, scenarioId, difficultyId, blurb, target, tuning,
//     systemId, planetIndex, levelInPlanet, lessonId, population, variant? }
// population: [lo, hi] people for this level (item 14, PLANET_POPULATION).
// toolkit: { id, tools, why, toolDays? } (item 16, src/config/toolkits.js).
// Variants (puzzle levels, see src/sim/variants.js):
//   superSpreader  one alien carrier with many contacts starts sick; stop it
//   envoy          protect one marked person: if they fall ill, you lose
//   noVaccines     no vaccine doses on this world (cut links and isolate)
//   noQuarantine   no isolation wards (vaccinate and cut links)
// Round 57: tuning comes from the level's puzzle spec. The tool counts and
// first cases are picked by scripts/tune-puzzles.mjs (src/config/puzzle-tuning.js);
// levels without an entry use the defaults below. The old spread
// multipliers, star targets and their tuners are retired: spread is certain
// and stars come from the solver's par (src/sim/solver.js, src/progress.js).
import { puzzleTuning, TUTORIAL_LEVEL_ID, FINALE_TUNING } from './puzzle-specs.js';

// Hand-set tuning that wins over the tuner's table and that
// scripts/tune-puzzles.mjs leaves alone. Level 1 is a new player's first
// game: one first case and three cuts a day, so "cut the red lines" (the
// coach's lesson) is also the best play.
export const ONBOARDING_TUNING = {
    [TUTORIAL_LEVEL_ID]: { initialInfected: 1, dailyLimits: { vaccinate: 2, quarantine: 2, severLink: 3 } },
};
import { toolkitForSlot } from './toolkits.js';
import { mechanicsFor } from './planet-mechanics.js';

export const SYSTEMS = [
    {
        id: 'kasumi',
        name: 'Kasumi Reach',
        tagline: 'The first worlds the Blightborne reached. Learn the tools here.',
        paletteId: 126,
    },
    {
        id: 'akatsuki',
        name: 'Akatsuki Belt',
        tagline: 'Busy trade worlds where the virus rides every star lane.',
        paletteId: 164,
    },
    {
        id: 'hoshizora',
        name: 'Hoshizora Crown',
        tagline: 'The Blightborne home front. The hardest outbreaks in the galaxy.',
        paletteId: 232,
    },
];

// size: planet radius as a share of the largest planet (0.55 to 1).
// paletteId: a colour combination number from Sanzo Wada's dictionary
// (src/config/wada-palettes.js), used by the map to paint the planet.
export const PLANET_DEFS = [
    { id: 'mizuho', systemId: 'kasumi', name: 'Mizuho', size: 0.8, paletteId: 126, tagline: 'A gentle ocean world of island towns.', places: ['Tidewater', 'Coral Bay', 'Lantern Isle', 'Pearlwater', 'Driftwood'] },
    { id: 'hanabi', systemId: 'kasumi', name: 'Hanabi', size: 0.62, paletteId: 151, tagline: 'Festival planet, famous for its fireworks.', places: ['Ember Square', 'Sparkfall', 'Rocket Row', 'Glowmarket', 'Cinder Hill'] },
    { id: 'tsukimi', systemId: 'akatsuki', name: 'Tsukimi', size: 1, paletteId: 247, tagline: 'Moon-watching world with three bright moons.', places: ['Silver Crater', 'Moonbridge', 'Crescent Quay', 'Tidelock', 'Lunar Gardens'] },
    { id: 'kumoji', systemId: 'akatsuki', name: 'Kumoji', size: 0.7, paletteId: 284, tagline: 'Cloud cities that float above a golden sea.', places: ['Skyhaven', 'Nimbus Deck', 'Windmill Ward', 'Cirrus Port', 'Mistvale'] },
    { id: 'sango', systemId: 'akatsuki', name: 'Sango', size: 0.56, paletteId: 259, tagline: 'Coral reef world where everyone lives by the water.', places: ['Reefside', 'Kelp Market', 'Shell Shore', 'Lagoon Gate', 'Brightwater'] },
    { id: 'yukimi', systemId: 'hoshizora', name: 'Yukimi', size: 0.9, paletteId: 286, tagline: 'A snow world of crowded warm domes.', places: ['Frostdome', 'Glacier Hall', 'Snowlight', 'Icefall Market', 'Aurora Rise'] },
    { id: 'hotaru', systemId: 'hoshizora', name: 'Hotaru', size: 0.66, paletteId: 271, tagline: 'Firefly forests and glowing night markets.', places: ['Glowwood', 'Lantern Grove', 'Firefly Fair', 'Mossgate', 'Duskhollow'] },
    { id: 'kaminari', systemId: 'hoshizora', name: 'Kaminari', size: 0.78, paletteId: 307, tagline: 'Storm world and the Blightborne stronghold.', places: ['Thunderhead', 'Stormport', 'Bolt Bazaar', 'Skyforge', 'Cloudbreak'] },
];

export const LEVELS_PER_PLANET = 10;

// Item 14 (Adam's Oct 21 notes): small webs you can read at a glance.
// Item 28 (round 43, Adam's Nov 14 notes): more variety. Each planet now has
// a wider range, about 8 to 16 people on the first planet up to 16 to 32 on
// the last, and the kind of place decides where in that range a level sits:
// a healing hall is small, a festival or an airport is big. Ranges never
// shrink from one planet to the next, and a boss sits at the top.
export const PLANET_POPULATION = [
    [8, 16], // Mizuho
    [9, 18], // Hanabi
    [10, 20], // Tsukimi
    [11, 22], // Kumoji
    [12, 24], // Sango
    [13, 26], // Yukimi
    [14, 28], // Hotaru
    [16, 32], // Kaminari
];

// Where in its planet's range each kind of place sits, as shares of the
// range [from, to]. Bands overlap a little so neighbours can surprise you.
export const SCENARIO_SIZE = {
    care: [0, 0.4], // a healing hall: a few residents and carers
    school: [0.15, 0.55], // one school
    urban: [0.4, 0.8], // a neighbourhood
    festival: [0.6, 1], // a crowd
    global: [0.65, 1], // an airport hub
};
// Protecting an Envoy needs room for them to live a few contacts away from
// the first cases, so Envoy levels sit mid range whatever the place.
export const ENVOY_SIZE = [0.35, 0.75];
// A boss plays at the very top of its planet's range, with a little spread.
export const BOSS_SPREAD = 2;

// The people range one level plays with: [lo, hi], both inclusive.
export function populationFor(planetIndex, slot = {}) {
    const [lo, hi] = PLANET_POPULATION[Math.min(PLANET_POPULATION.length - 1, Math.max(0, planetIndex))];
    if (slot.boss) return [hi - BOSS_SPREAD, hi];
    const [f0, f1] = slot.variant === 'envoy' ? ENVOY_SIZE : SCENARIO_SIZE[slot.scenarioId] || [0, 1];
    const span = hi - lo;
    const a = lo + Math.round(f0 * span);
    // At least three sizes per level, so a replay can roll a new count.
    const b = Math.min(hi, Math.max(a + 2, lo + Math.round(f1 * span)));
    return [a, b];
}

// Roll how many people this play has. A replay never repeats the last
// count when the range allows another one (item 28).
export function rollPopulation([lo, hi], rng = Math.random, previous = null) {
    if (hi <= lo) return lo;
    let n = lo + Math.floor(rng() * (hi - lo + 1));
    if (n === previous) {
        // Step to another count in the range, chosen by the same roll.
        const step = 1 + Math.floor(rng() * (hi - lo));
        n = lo + ((n - lo + step) % (hi - lo + 1));
    }
    return n;
}

// What each slot on a planet plays like. Every planet keeps the same rhythm:
// learn, play, a puzzle, play, a twist, play, protect someone, play, a twist,
// then a boss carrier at the end.
const SLOTS = [
    { scenarioId: 'care' },
    { scenarioId: 'school' },
    { scenarioId: 'urban', variant: 'superSpreader' },
    { scenarioId: 'festival' },
    { scenarioId: 'school', variant: 'noVaccines' },
    { scenarioId: 'global' },
    { scenarioId: 'care', variant: 'envoy' },
    { scenarioId: 'urban' },
    { scenarioId: 'festival', variant: 'noQuarantine' },
    { scenarioId: 'global', variant: 'superSpreader', boss: true },
];

// How each kind of place is named.
const SITE = {
    care: (p) => `${p} Healing Halls`,
    school: (p) => `${p} Academy`,
    urban: (p) => `${p} Market District`,
    festival: (p) => `${p} Moon Festival`,
    global: (p) => `${p} Spaceport`,
};

const BLURB = {
    care: 'A healing hall reports a strange fever. Protect the most vulnerable.',
    school: 'Students are falling ill. Keep the classrooms safe.',
    urban: 'A crowded market district where everyone knows everyone.',
    festival: 'A festival crowd is the perfect place for a virus to travel.',
    global: 'Ships from every world dock here. Stop it before it travels on.',
};

const VARIANT_BLURB = {
    superSpreader: 'A Blightborne carrier is loose, with more contacts than anyone. Stop the super-spreader.',
    envoy: "The planet's Envoy is here to sign a peace treaty. Keep the Envoy from falling ill.",
    noVaccines: 'The vaccine shipment was lost in a meteor storm. Cut contacts and isolate the sick.',
    noQuarantine: 'No isolation wards on this world. Vaccinate and cut contacts.',
};

// Lessons rotate through the core ideas on normal levels; puzzle levels
// teach the idea they are built around (see src/config/lessons.js).
const CORE_LESSONS = ['act-early', 'isolation', 'hubs', 'keep-r-below-1', 'herd-immunity', 'cut-bridges', 'ring-vaccination', 'layers', 'flatten-curve'];
// Item 16: a lesson that teaches a tool only goes to levels whose toolkit
// has that tool (no ring vaccination lesson on a Sever-only festival).
export const LESSON_NEEDS = {
    isolation: ['quarantine'],
    'herd-immunity': ['vaccinate'],
    'ring-vaccination': ['vaccinate'],
    layers: ['vaccinate', 'quarantine', 'severLink'],
};
export function lessonFits(lessonId, kitTools) {
    return (LESSON_NEEDS[lessonId] || []).every((t) => kitTools.includes(t));
}
const VARIANT_LESSON = { superSpreader: 'super-spreaders', envoy: 'protect-vulnerable', noVaccines: 'contact-tracing', noQuarantine: 'ring-vaccination' };

// Difficulty bands by planet: easy on the first system, medium in the
// middle, hard on the last.
const DIFFICULTY_BY_PLANET = ['easy', 'easy', 'medium', 'medium', 'medium', 'hard', 'hard', 'hard'];

// Stars needed to land on a planet: 1.5 per level on the planets before it.
export function planetStarRequirement(planetIndex) {
    return Math.round(1.5 * LEVELS_PER_PLANET * planetIndex);
}

// Default tuning before scripts/tune-puzzles.mjs has picked a level's
// numbers. caseCapFraction is only a fallback for a web that was not dealt
// (the dealer sets an exact cap from par); parDays is the fallback for the
// score's speed bonus (a dealt level uses the solver's own days).
export function defaultTuning(difficultyId, slot) {
    const caps = { easy: 0.45, medium: 0.38, hard: 0.32 };
    const limits = {
        easy: { vaccinate: 2, quarantine: 2, severLink: 2 },
        medium: { vaccinate: 2, quarantine: 1, severLink: 2 },
        hard: { vaccinate: 1, quarantine: 1, severLink: 2 },
    };
    const dailyLimits = { ...limits[difficultyId] };
    if (slot.variant === 'noVaccines') {
        dailyLimits.vaccinate = 0;
        dailyLimits.severLink += 1;
    }
    if (slot.variant === 'noQuarantine') {
        dailyLimits.quarantine = 0;
        dailyLimits.severLink += 1;
    }
    return {
        initialInfected: 1,
        caseCapFraction: caps[difficultyId],
        parDays: 8,
        dailyLimits,
    };
}

function variantFor(slot) {
    if (!slot.variant) return undefined;
    if (slot.variant === 'superSpreader') {
        // Round 57: the carrier has a few more contacts than there are cuts
        // on day 1 (carrierExtra, a little more on a boss), so the puzzle is
        // who to save tonight. Quarantine arrives a day early, in time for
        // the people the carrier reaches.
        return { type: 'superSpreader', carrierExtra: slot.boss ? 3 : 2, toolDays: { quarantine: 2 }, boss: !!slot.boss };
    }
    if (slot.variant === 'envoy') return { type: 'envoy', minDistance: 3 };
    return { type: slot.variant };
}

// The tray fits three tools and Shop on a phone (tests/round50-tray.test.js),
// so a mechanic that adds a tool to a full kit also names the classic tool
// it replaces (mechanics.drop), and its `why` line explains the whole kit.
export const MAX_KIT_TOOLS = 3;
export function applyMechanicsToKit(toolkit, mechanics) {
    for (const t of mechanics.tools || []) if (!toolkit.tools.includes(t)) toolkit.tools.push(t);
    for (const t of mechanics.drop || []) {
        if (toolkit.tools.length <= MAX_KIT_TOOLS) break;
        toolkit.tools = toolkit.tools.filter((x) => x !== t);
        if (toolkit.toolDays) delete toolkit.toolDays[t];
    }
    if (mechanics.why) toolkit.why = mechanics.why;
    else if (mechanics.whyAdd) toolkit.why = `${toolkit.why} ${mechanics.whyAdd}`;
    return toolkit;
}

// Wide audience round: levels with a new idea teach that idea, so the core
// rotation reaches fewer levels on later planets and a core lesson could be
// left out. Each missing one goes to the last plain level (no variant, no
// mechanic) from the third planet on whose kit fits it and whose lesson is
// taught elsewhere too. The learning planets are never touched.
function keepEveryCoreLesson(levels) {
    const count = (id) => levels.filter((l) => l.lessonId === id).length;
    for (const lessonId of CORE_LESSONS) {
        if (count(lessonId)) continue;
        for (let i = levels.length - 1; i >= 0; i--) {
            const l = levels[i];
            if (l.planetIndex < 2 || l.variant || l.mechanics || !lessonFits(lessonId, l.toolkit.tools) || count(l.lessonId) < 2) continue;
            l.lessonId = lessonId;
            break;
        }
    }
}

export function buildCampaign() {
    const regions = [];
    const levels = [];
    PLANET_DEFS.forEach((planet, pi) => {
        const system = SYSTEMS.find((s) => s.id === planet.systemId);
        regions.push({
            id: planet.id,
            name: planet.name,
            tagline: planet.tagline,
            starRequirement: planetStarRequirement(pi),
            systemId: system.id,
            systemName: system.name,
        });
        let core = pi; // offset so each planet opens on a different idea
        SLOTS.forEach((slot, k) => {
            const id = `${planet.id}-${k + 1}`;
            const difficultyId = DIFFICULTY_BY_PLANET[pi];
            // Spread the place names so no two levels on a planet share a name.
            const place = planet.places[(k + Math.floor(k / 5)) % planet.places.length];
            const variant = variantFor(slot);
            const toolkit = toolkitForSlot(k);
            // Later planets add one new idea each (planet-mechanics.js):
            // its tools join the kit and the briefing says why.
            const mechanics = mechanicsFor(pi, k);
            if (mechanics) applyMechanicsToKit(toolkit, mechanics);
            let lessonId = slot.variant ? VARIANT_LESSON[slot.variant] : null;
            if (!lessonId && mechanics && mechanics.lessonId) lessonId = mechanics.lessonId;
            if (!lessonId) {
                // Next core lesson in the rotation that fits this toolkit.
                for (let tries = 0; tries < CORE_LESSONS.length; tries++) {
                    const pick = CORE_LESSONS[(core + tries) % CORE_LESSONS.length];
                    if (lessonFits(pick, toolkit.tools)) {
                        lessonId = pick;
                        core += tries + 1;
                        break;
                    }
                }
            }
            const name = slot.boss ? `${planet.name} Carrier Showdown` : SITE[slot.scenarioId](place);
            const level = {
                id,
                name,
                regionId: planet.id,
                systemId: system.id,
                planetIndex: pi,
                levelInPlanet: k,
                scenarioId: slot.scenarioId,
                difficultyId,
                blurb: slot.variant ? VARIANT_BLURB[slot.variant] : BLURB[slot.scenarioId],
                lessonId,
                population: populationFor(pi, slot),
                // Item 16: the tools this level offers (src/config/toolkits.js).
                toolkit,
                tuning: { ...defaultTuning(difficultyId, slot), ...(puzzleTuning(id) || {}), ...(ONBOARDING_TUNING[id] || {}), ...(FINALE_TUNING[id] || {}) },
            };
            if (variant) level.variant = variant;
            if (mechanics) {
                level.mechanics = mechanics;
                if (mechanics.blurb && !slot.variant) level.blurb = mechanics.blurb;
                // Daily uses of the tools the mechanic adds, unless tuned.
                level.tuning.dailyLimits = { ...(mechanics.toolLimits || {}), ...level.tuning.dailyLimits };
                // The days a mechanic moves a tool to (Test on day 1).
                if (mechanics.toolDays) toolkit.toolDays = { ...(toolkit.toolDays || {}), ...mechanics.toolDays };
            }
            // The tuner may move a tool's first day too: the kit carries it,
            // so the briefing and the tray always agree.
            if (level.tuning.toolDays) toolkit.toolDays = { ...(toolkit.toolDays || {}), ...level.tuning.toolDays };
            if (variant && level.tuning.carrierExtra != null) variant.carrierExtra = level.tuning.carrierExtra;
            levels.push(level);
        });
    });
    // The very first level teaches the tools: always the act-early lesson.
    levels[0].lessonId = 'act-early';
    keepEveryCoreLesson(levels);
    return { regions, levels };
}
