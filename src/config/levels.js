// Level and region definitions for progression phase 1.
//
// The five scenarios in scenarios.js become nine ordered levels in three
// regions. Difficulty is fixed per level and ramps across regions: region 1
// is mostly easy, region 2 is medium, region 3 is hard. This replaces the
// old free-pick scenario menu; the world map UI arrives in phase 2.
//
// Each level carries a `tuning` block (applied by src/config/level-rules.js):
// starting cases, spread, a case cap, par days and exact daily tool caps.
// Regenerate it with `node scripts/tune.mjs`; check it with `npm run balance`.
//
// Gating rules (implemented in src/progress.js):
// - Level 0 is unlocked from the start.
// - Level N unlocks when level N-1 is completed (a 'contained' win).
// - Region 2 requires 6 total stars; region 3 requires 12 total stars.
//   (Max is 27: 9 levels x 3 stars.)
// - Locked levels are not playable.

export const REGIONS = [
    {
        id: 'hometown',
        name: 'Hometown',
        tagline: 'Local outbreaks. Learn the tools of the trade.',
        starRequirement: 0,
    },
    {
        id: 'national',
        name: 'National Response',
        tagline: 'The outbreak is spreading. The country is calling.',
        starRequirement: 6,
    },
    {
        id: 'global',
        name: 'Global Frontline',
        tagline: 'Pandemic pressure. The hardest missions on earth.',
        starRequirement: 12,
    },
];

export const LEVELS = [
    // Region 1: Hometown
    {
        id: 'r1-care-home',
        name: 'Greenfield Care Home',
        regionId: 'hometown',
        scenarioId: 'care',
        difficultyId: 'easy',
        blurb: 'A nursing home reports respiratory symptoms. Protect the vulnerable.',
        target: 800, // per-capita score target: 1 star >= 800, 2 stars >= 1040, 3 stars >= 1280
        // Tuned by scripts/tune.mjs (smart bot win 89%, random bot 18%), then
        // eased by hand in round 6 (spread 1.2 to 1.1): the beginner bot now
        // wins about 67% instead of 58%, smart 90%, random 25%. The first
        // level is where new players learn the tools.
        tuning: { initialInfected: 2, transmissionMultiplier: 1.1, caseCapFraction: 0.45, parDays: 12, dailyLimits: { vaccinate: 3, quarantine: 2, severLink: 2 } },
    },
    {
        id: 'r1-elementary',
        name: 'Brookside Elementary',
        regionId: 'hometown',
        scenarioId: 'school',
        difficultyId: 'easy',
        blurb: 'Flu-like illness is moving through classrooms. Keep the school safe.',
        target: 800, // per-capita score target: 1 star >= 800, 2 stars >= 1040, 3 stars >= 1280
        // Tuned by scripts/tune.mjs (smart bot win 89%, random bot 24%).
        tuning: { initialInfected: 3, transmissionMultiplier: 1.2, caseCapFraction: 0.45, parDays: 13, dailyLimits: { vaccinate: 3, quarantine: 2, severLink: 2 } },
    },
    {
        id: 'r1-old-town',
        name: 'Old Town District',
        regionId: 'hometown',
        scenarioId: 'urban',
        difficultyId: 'medium',
        blurb: 'A tight-knit neighborhood with low vaccination rates needs you.',
        target: 800, // per-capita score target: 1 star >= 800, 2 stars >= 1040, 3 stars >= 1280
        // Tuned by scripts/tune.mjs (smart bot win 82%, random bot 0%).
        tuning: { initialInfected: 2, transmissionMultiplier: 1.2, caseCapFraction: 0.38, parDays: 15, dailyLimits: { vaccinate: 2, quarantine: 2, severLink: 2 } },
    },
    // Region 2: National Response
    {
        id: 'r2-festival',
        name: 'Sunfield Music Festival',
        regionId: 'national',
        scenarioId: 'festival',
        difficultyId: 'medium',
        blurb: 'Festival flu is surfacing among attendees. Stop a multi-state outbreak.',
        target: 800, // per-capita score target: 1 star >= 800, 2 stars >= 1040, 3 stars >= 1280
        // Tuned by scripts/tune.mjs (smart bot win 79%, random bot 0%).
        tuning: { initialInfected: 3, transmissionMultiplier: 1.8, caseCapFraction: 0.38, parDays: 12, dailyLimits: { vaccinate: 2, quarantine: 2, severLink: 2 } },
    },
    {
        id: 'r2-high-school',
        name: 'Westfield High School',
        regionId: 'national',
        scenarioId: 'school',
        difficultyId: 'medium',
        blurb: 'A large high school is a tinderbox. Balance safety and staying open.',
        target: 800, // per-capita score target: 1 star >= 800, 2 stars >= 1040, 3 stars >= 1280
        // Tuned by scripts/tune.mjs (smart bot win 71%, random bot 7%).
        tuning: { initialInfected: 4, transmissionMultiplier: 0.8, caseCapFraction: 0.38, parDays: 11, dailyLimits: { vaccinate: 2, quarantine: 2, severLink: 2 } },
    },
    {
        id: 'r2-airport',
        name: 'Meridian International Airport',
        regionId: 'national',
        scenarioId: 'global',
        difficultyId: 'medium',
        blurb: 'Cases among travelers. You are the first line of defense.',
        target: 800, // per-capita score target: 1 star >= 800, 2 stars >= 1040, 3 stars >= 1280
        // Tuned by scripts/tune.mjs (smart bot win 67%, random bot 0%).
        tuning: { initialInfected: 2, transmissionMultiplier: 1.6, caseCapFraction: 0.38, parDays: 11, dailyLimits: { vaccinate: 2, quarantine: 2, severLink: 2 } },
    },
    // Region 3: Global Frontline
    {
        id: 'r3-metro',
        name: 'Metro Eastside',
        regionId: 'global',
        scenarioId: 'urban',
        difficultyId: 'hard',
        blurb: 'A dense metro district. High fatality, rapid spread.',
        target: 800, // per-capita score target: 1 star >= 800, 2 stars >= 1040, 3 stars >= 1280
        // Tuned by scripts/tune.mjs (smart bot win 59%, random bot 0%).
        tuning: { initialInfected: 1, transmissionMultiplier: 2.4, caseCapFraction: 0.32, parDays: 12, dailyLimits: { vaccinate: 2, quarantine: 1, severLink: 2 } },
    },
    {
        id: 'r3-harbor',
        name: 'Harborlights Festival',
        regionId: 'global',
        scenarioId: 'festival',
        difficultyId: 'hard',
        blurb: 'A mega-festival seeding outbreaks worldwide. Your hardest test yet.',
        target: 800, // per-capita score target: 1 star >= 800, 2 stars >= 1040, 3 stars >= 1280
        // Tuned by scripts/tune.mjs (smart bot win 52%, random bot 0%), then
        // retuned in round 10: most of its losses had been timeouts after the
        // outbreak could no longer spread, which now play on to a win. Spread
        // 0.6 to 1.8 and 4 starting cases bring the smart bot back to about 50%.
        tuning: { initialInfected: 4, transmissionMultiplier: 1.8, caseCapFraction: 0.32, parDays: 11, dailyLimits: { vaccinate: 2, quarantine: 1, severLink: 2 } },
    },
    {
        id: 'r3-hub',
        name: 'Transcontinental Hub',
        regionId: 'global',
        scenarioId: 'global',
        difficultyId: 'hard',
        blurb: 'The pandemic frontline. Everything you have learned, all at once.',
        target: 800, // per-capita score target: 1 star >= 800, 2 stars >= 1040, 3 stars >= 1280
        // Tuned by scripts/tune.mjs (smart bot win 40%, random bot 0%).
        tuning: { initialInfected: 3, transmissionMultiplier: 1, caseCapFraction: 0.32, parDays: 13, dailyLimits: { vaccinate: 2, quarantine: 1, severLink: 2 } },
    },
];

export function levelById(id) {
    return LEVELS.find((l) => l.id === id) || null;
}

export function regionById(id) {
    return REGIONS.find((r) => r.id === id) || null;
}

export function levelsInRegion(regionId) {
    return LEVELS.filter((l) => l.regionId === regionId);
}
