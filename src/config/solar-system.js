// The candy solar system on the home screen: one planet per region, each
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
        ocean: ['#4fd1ff', '#2bb3f3'],
        land: ['#7ae582', '#ff9ad5', '#ffe66d', '#c3a6ff', '#ffb38a', '#8be9fd'],
        glow: 0xffc6ec,
        button: 0x2ee59d,
        seed: 20261015,
    },
    {
        regionId: 'national',
        name: 'Marshmallow',
        orbit: { a: 1.9, b: 3.8, phase: 0.5 + (2 * Math.PI) / 3 },
        ocean: ['#8ff0d0', '#3fd6a6'],
        land: ['#ff9ad5', '#ffe66d', '#ffffff', '#ffb38a', '#c3a6ff', '#ff7aa8'],
        glow: 0xb9fff0,
        button: 0x3ab0ff,
        seed: 777,
    },
    {
        regionId: 'global',
        name: 'Jawbreaker',
        orbit: { a: 2.5, b: 5.3, phase: 0.5 + (4 * Math.PI) / 3 },
        ocean: ['#c3a0ff', '#8a5cf5'],
        land: ['#ffd60a', '#ff6b9a', '#7ae582', '#8be9fd', '#ffb38a', '#ffffff'],
        glow: 0xffb3c7,
        button: 0xff4f9a,
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
