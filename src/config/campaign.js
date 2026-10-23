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
// Variants (puzzle levels, see src/sim/variants.js):
//   superSpreader  one alien carrier with many contacts starts sick; stop it
//   envoy          protect one marked person: if they fall ill, you lose
//   noVaccines     no vaccine doses on this world (cut links and isolate)
//   noQuarantine   no isolation wards (vaccinate and cut links)
// Tuning comes from src/config/campaign-tuning.js (written by
// scripts/tune-campaign.mjs); levels without an entry use the defaults below.
import { CAMPAIGN_TUNING } from './campaign-tuning.js';
import { STAR_TARGETS } from './star-targets.js';

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

// Item 14 (Adam's Oct 21 notes): small webs you can read at a glance. Each
// planet sets how many people its levels have, growing from 10 to 12 on the
// first planet to 21 to 25 on the last. Ranges never shrink from one planet
// to the next, and a planet's boss uses the top of its range.
export const PLANET_POPULATION = [
    [10, 12], // Mizuho
    [11, 13], // Hanabi
    [12, 15], // Tsukimi
    [14, 17], // Kumoji
    [15, 19], // Sango
    [17, 21], // Yukimi
    [19, 23], // Hotaru
    [21, 25], // Kaminari
];

// The people range one level plays with: [lo, hi], both inclusive.
export function populationFor(planetIndex, slot = {}) {
    const [lo, hi] = PLANET_POPULATION[Math.min(PLANET_POPULATION.length - 1, Math.max(0, planetIndex))];
    return slot.boss ? [hi, hi] : [lo, hi];
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
const VARIANT_LESSON = { superSpreader: 'super-spreaders', envoy: 'protect-vulnerable', noVaccines: 'contact-tracing', noQuarantine: 'ring-vaccination' };

// Difficulty bands by planet: easy on the first system, medium in the
// middle, hard on the last.
const DIFFICULTY_BY_PLANET = ['easy', 'easy', 'medium', 'medium', 'medium', 'hard', 'hard', 'hard'];

// Stars needed to land on a planet: 1.5 per level on the planets before it.
export function planetStarRequirement(planetIndex) {
    return Math.round(1.5 * LEVELS_PER_PLANET * planetIndex);
}

// Default tuning before scripts/tune-campaign.mjs has run for a level.
export function defaultTuning(difficultyId, slot) {
    const caps = { easy: 0.45, medium: 0.38, hard: 0.32 };
    const limits = {
        easy: { vaccinate: 3, quarantine: 2, severLink: 2 },
        medium: { vaccinate: 2, quarantine: 2, severLink: 2 },
        hard: { vaccinate: 2, quarantine: 1, severLink: 2 },
    };
    const dailyLimits = { ...limits[difficultyId] };
    if (slot.variant === 'noVaccines') {
        dailyLimits.vaccinate = 0;
        dailyLimits.severLink += 1;
        dailyLimits.quarantine += 1;
    }
    if (slot.variant === 'noQuarantine') {
        dailyLimits.quarantine = 0;
        dailyLimits.vaccinate += 1;
        dailyLimits.severLink += 1;
    }
    return {
        initialInfected: 2,
        transmissionMultiplier: 1,
        caseCapFraction: caps[difficultyId],
        parDays: 12,
        dailyLimits,
    };
}

function variantFor(slot) {
    if (!slot.variant) return undefined;
    if (slot.variant === 'superSpreader') {
        // The carrier knows about half the web (a bit more on a boss); on
        // puzzle levels quarantine arrives a day early so isolating the
        // carrier is possible in time.
        return { type: 'superSpreader', degreeShare: slot.boss ? 0.56 : 0.5, toolDays: { quarantine: 2 }, boss: !!slot.boss };
    }
    if (slot.variant === 'envoy') return { type: 'envoy', minDistance: 3 };
    return { type: slot.variant };
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
            const lessonId = slot.variant ? VARIANT_LESSON[slot.variant] : CORE_LESSONS[(core++) % CORE_LESSONS.length];
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
                // Per-level star target (round 17, scripts/tune-stars.mjs).
                target: STAR_TARGETS[id] ?? 800,
                lessonId,
                population: populationFor(pi, slot),
                tuning: { ...defaultTuning(difficultyId, slot), ...(CAMPAIGN_TUNING[id] || {}) },
            };
            if (variant) level.variant = variant;
            levels.push(level);
        });
    });
    // The very first level teaches the tools: always the act-early lesson.
    levels[0].lessonId = 'act-early';
    return { regions, levels };
}
