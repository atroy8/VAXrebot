// The solar system on the home screen (candy gloss, indigo and gold colours): one planet per region, each
// holding that region's three levels. Pure data, shared by the 3D view
// (src/ui/globe-view.js) and its tests.
//
// Unlocking follows the existing level rules (src/progress.js): a planet
// opens when its first level unlocks, which needs the last level of the
// previous planet beaten plus the region's star requirement.
//
// Orbits are ellipses around the sun, longer front to back than side to
// side, so the whole system fits a tall phone screen. All planets turn
// together a third of a lap apart, so they never pass in front of each
// other.

export const PLANET_RADIUS = 0.65; // world units; each planet is a unit sphere scaled by this

export const PLANETS = [
    {
        regionId: 'hometown',
        name: 'Gumdrop',
        orbit: { a: 1.3, b: 2.3, phase: 0.5 },
        // Ai and kin theme (round 12): deep indigo seas, gold leaf and washi land.
        ocean: ['#234c9c', '#13265a'],
        land: ['#d4ab3a', '#ecd27e', '#f7f2e4', '#c9a227', '#e2bf5a', '#f3e3b3'],
        glow: 0xf3d27a,
        button: 0x2f6fd6,
        seed: 20261015,
    },
    {
        regionId: 'national',
        name: 'Marshmallow',
        orbit: { a: 1.9, b: 3.8, phase: 0.5 + (2 * Math.PI) / 3 },
        ocean: ['#3565b8', '#1b3a7a'],
        land: ['#f7f2e4', '#ddb94a', '#f3e3b3', '#c9a227', '#ecd27e', '#ffffff'],
        glow: 0x9cc4ff,
        button: 0x3f8fe0,
        seed: 777,
    },
    {
        regionId: 'global',
        name: 'Jawbreaker',
        orbit: { a: 2.5, b: 5.3, phase: 0.5 + (4 * Math.PI) / 3 },
        ocean: ['#1b3a7a', '#0b1838'],
        land: ['#c9a227', '#f7f2e4', '#ecd27e', '#a9801f', '#ddb94a', '#f3e3b3'],
        glow: 0xe8c45f,
        button: 0x5b6fd8,
        seed: 4242,
    },
];

// Where a planet's three levels sit on its surface (lat/lng, degrees). All
// on the side that faces you, so a planet's levels show at once without
// spinning it. lng -90 faces the camera.
export const PLANET_LEVEL_POSITIONS = [
    { lat: 6, lng: -128 },
    { lat: 26, lng: -90 },
    { lat: 2, lng: -52 },
];

// Seconds for one lap of the orbits. Slow, so taps on planets are easy.
export const ORBIT_PERIOD_S = 120;

// Camera height above the orbit plane, as an angle (degrees). Higher looks
// down on the orbits; lower shows them edge on.
export const SYSTEM_ELEVATION_DEG = 48;
export const SUN_RADIUS = 0.45;
