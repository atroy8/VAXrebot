// The galaxy on the home screen (round 14): 3 star systems, each a sun with
// 2 or 3 inhabited planets on circular orbits. Pure data and layout, shared
// by the 3D view (src/ui/globe-view.js) and its tests.
//
// The map is seen from straight above, so every orbit is a true circle on
// screen (Adam: "have the systems appear circular not elliptical"). The
// planets' fronts (where the level road is) face up, toward the camera.
//
// Planet sizes come from PLANET_DEFS[].size in src/config/campaign.js, and
// colours from each planet's Wada colour combination (paletteId, see
// src/config/planet-palettes.js). Unlocking follows the level rules in
// src/progress.js: a planet opens when its first level unlocks.
import { SYSTEMS, PLANET_DEFS } from './campaign.js';

export const PLANET_RADIUS_MAX = 0.55; // world units for a size 1 planet
export const SUN_RADIUS = 0.42;
export const ORBIT_GAP = 0.34; // clear space between neighbouring orbits' planets
export const SUN_GAP = 0.3; // clear space between the sun and the first planet

// Seconds for one lap of the orbits. Slow, so taps on planets are easy.
export const ORBIT_PERIOD_S = 120;

// Centre to centre distance between systems on the galaxy map. Large enough
// that a neighbouring system never shows in the frame of a system view.
export const SYSTEM_SPACING = 14.5;

export function planetRadius(def) {
    return (def.size || 1) * PLANET_RADIUS_MAX;
}

function layoutSystem(system, si) {
    const defs = PLANET_DEFS.filter((p) => p.systemId === system.id);
    let edge = SUN_RADIUS + SUN_GAP; // inner edge of the next planet's lane
    const planets = defs.map((def, j) => {
        const radius = planetRadius(def);
        const orbitR = edge + radius;
        edge = orbitR + radius + ORBIT_GAP;
        return {
            def,
            regionId: def.id,
            systemId: system.id,
            name: def.name,
            radius,
            orbitR,
            // Planets in one system turn together, evenly spaced, so they
            // never line up and their labels never stack.
            phase: 0.6 + (j * 2 * Math.PI) / defs.length,
        };
    });
    const last = planets[planets.length - 1];
    const extent = last.orbitR + last.radius;
    // Zig-zag up the screen: screen up is world -z.
    const centre = { x: si % 2 === 0 ? -0.9 : 0.9, y: 0, z: (1 - si) * SYSTEM_SPACING };
    return { system, index: si, planets, extent, centre };
}

export const SYSTEM_LAYOUTS = SYSTEMS.map(layoutSystem);

// Every planet, in campaign order, with its system index.
export const PLANETS = SYSTEM_LAYOUTS.flatMap((s) => s.planets.map((p) => ({ ...p, systemIndex: s.index })));

// Where a planet's 10 levels sit on its surface (lat/lng, degrees), in play
// order. A road that climbs the face of the planet in rows of 3, 2, 3, 2,
// all on the side that faces you (lng -90 is the centre of the face).
export const PLANET_LEVEL_POSITIONS = [
    { lat: -40, lng: -128 },
    { lat: -46, lng: -90 },
    { lat: -40, lng: -52 },
    { lat: -14, lng: -64 },
    { lat: -14, lng: -116 },
    { lat: 12, lng: -130 },
    { lat: 14, lng: -90 },
    { lat: 12, lng: -50 },
    { lat: 38, lng: -68 },
    { lat: 40, lng: -112 },
];
