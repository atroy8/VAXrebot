// Levels and regions. Since round 14 every region is one planet and the
// campaign (3 star systems, 8 planets, 10 levels each) is generated in
// src/config/campaign.js. This module keeps the shape every other module
// reads: REGIONS (planets in order) and LEVELS (all 80 levels in order).
//
// Gating rules (implemented in src/progress.js):
// - Level 0 is unlocked from the start.
// - Level N unlocks when level N-1 is completed (a 'contained' win).
// - Landing on a planet needs its star requirement (1.5 stars per earlier
//   level, see planetStarRequirement in campaign.js).
import { buildCampaign, SYSTEMS, PLANET_DEFS, LEVELS_PER_PLANET } from './campaign.js';

const built = buildCampaign();

export const REGIONS = built.regions;
export const LEVELS = built.levels;
export { SYSTEMS, PLANET_DEFS, LEVELS_PER_PLANET };

export function levelById(id) {
    return LEVELS.find((l) => l.id === id) || null;
}

export function regionById(id) {
    return REGIONS.find((r) => r.id === id) || null;
}

export function levelsInRegion(regionId) {
    return LEVELS.filter((l) => l.regionId === regionId);
}

export function levelsInSystem(systemId) {
    return LEVELS.filter((l) => l.systemId === systemId);
}
