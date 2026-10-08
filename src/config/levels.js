// Level and region definitions for progression phase 1.
//
// The five scenarios in scenarios.js become nine ordered levels in three
// regions. Difficulty is fixed per level and ramps across regions: region 1
// is mostly easy, region 2 is medium, region 3 is hard. This replaces the
// old free-pick scenario menu; the world map UI arrives in phase 2.
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
    },
    {
        id: 'r1-elementary',
        name: 'Brookside Elementary',
        regionId: 'hometown',
        scenarioId: 'school',
        difficultyId: 'easy',
        blurb: 'Flu-like illness is moving through classrooms. Keep the school safe.',
        target: 800, // per-capita score target: 1 star >= 800, 2 stars >= 1040, 3 stars >= 1280
    },
    {
        id: 'r1-old-town',
        name: 'Old Town District',
        regionId: 'hometown',
        scenarioId: 'urban',
        difficultyId: 'medium',
        blurb: 'A tight-knit neighborhood with low vaccination rates needs you.',
        target: 800, // per-capita score target: 1 star >= 800, 2 stars >= 1040, 3 stars >= 1280
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
    },
    {
        id: 'r2-high-school',
        name: 'Westfield High School',
        regionId: 'national',
        scenarioId: 'school',
        difficultyId: 'medium',
        blurb: 'A large high school is a tinderbox. Balance safety and staying open.',
        target: 800, // per-capita score target: 1 star >= 800, 2 stars >= 1040, 3 stars >= 1280
    },
    {
        id: 'r2-airport',
        name: 'Meridian International Airport',
        regionId: 'national',
        scenarioId: 'global',
        difficultyId: 'medium',
        blurb: 'Cases among travelers. You are the first line of defense.',
        target: 800, // per-capita score target: 1 star >= 800, 2 stars >= 1040, 3 stars >= 1280
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
    },
    {
        id: 'r3-harbor',
        name: 'Harborlights Festival',
        regionId: 'global',
        scenarioId: 'festival',
        difficultyId: 'hard',
        blurb: 'A mega-festival seeding outbreaks worldwide. Your hardest test yet.',
        target: 800, // per-capita score target: 1 star >= 800, 2 stars >= 1040, 3 stars >= 1280
    },
    {
        id: 'r3-hub',
        name: 'Transcontinental Hub',
        regionId: 'global',
        scenarioId: 'global',
        difficultyId: 'hard',
        blurb: 'The pandemic frontline. Everything you have learned, all at once.',
        target: 800, // per-capita score target: 1 star >= 800, 2 stars >= 1040, 3 stars >= 1280
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
