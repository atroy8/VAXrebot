// Pure math and progress helpers for the galaxy home screen.
// No three.js and no DOM, unit tested in tests/solar-system.test.js.
//
// The map is viewed from straight above: world x is screen right, world -z
// is screen up, so circles in the orbit plane (y = 0) are circles on screen.

import { PLANETS, SYSTEM_LAYOUTS, ORBIT_PERIOD_S } from '../config/solar-system.js';
import { isLevelUnlocked, lockReason, levelRecord, totalStars } from '../progress.js';

const D2R = Math.PI / 180;

// Orbit angle at time t (seconds).
export function orbitAngle(t, period = ORBIT_PERIOD_S) {
    return ((t / period) * 2 * Math.PI) % (2 * Math.PI);
}

// Planet centre on its circular orbit, in world space (the system's sun at
// layout.centre). Pass the system centre or it defaults to the origin.
export function orbitPosition(planet, angle, centre = { x: 0, y: 0, z: 0 }) {
    const th = angle + planet.phase;
    return { x: centre.x + planet.orbitR * Math.cos(th), y: 0, z: centre.z + planet.orbitR * Math.sin(th) };
}

// Screen position (world units, before perspective) of a point seen from
// above: x stays x, and -z is up.
export function topDownXY(p) {
    return { x: p.x, y: -p.z };
}

// Camera height above a point that fits a circle of `extent` (plus margins)
// on screen. `reserveTop` and `reserveBottom` are screen shares kept clear
// for the HUD and the Play button.
export function fitHeight({ fovDeg, aspect, halfW, halfH, margin = 1.08, reserveTop = 0, reserveBottom = 0 }) {
    const v = Math.tan((fovDeg * D2R) / 2);
    const h = v * aspect;
    const usable = Math.max(0.2, 1 - reserveTop - reserveBottom);
    const byW = (halfW * margin) / h;
    const byH = (halfH * margin) / (v * usable);
    return Math.max(byW, byH);
}

// Camera for one system: straight above the sun, shifted so the system sits
// in the space between the HUD and the Play button.
export function systemCamera({ fovDeg, aspect, layout = SYSTEM_LAYOUTS[0], reserveTop = 0.16, reserveBottom = 0.12 }) {
    const halfW = layout.extent;
    const halfH = layout.extent;
    const distance = fitHeight({ fovDeg, aspect, halfW, halfH, reserveTop, reserveBottom });
    // Shift the view so the system centre lands in the middle of the usable band.
    const visibleHalfH = distance * Math.tan((fovDeg * D2R) / 2);
    const shift = (reserveTop - reserveBottom) * visibleHalfH; // screen up is -z
    const target = { x: layout.centre.x, y: 0, z: layout.centre.z - shift };
    return { distance, target, position: { x: target.x, y: distance, z: target.z } };
}

// Camera that shows the whole galaxy: every system and its orbits.
export function galaxyCamera({ fovDeg, aspect, layouts = SYSTEM_LAYOUTS, reserveTop = 0.24, reserveBottom = 0.12 }) {
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const l of layouts) {
        minX = Math.min(minX, l.centre.x - l.extent);
        maxX = Math.max(maxX, l.centre.x + l.extent);
        minZ = Math.min(minZ, l.centre.z - l.extent);
        maxZ = Math.max(maxZ, l.centre.z + l.extent);
    }
    const cx = (minX + maxX) / 2;
    const cz = (minZ + maxZ) / 2;
    const distance = fitHeight({ fovDeg, aspect, halfW: (maxX - minX) / 2, halfH: (maxZ - minZ) / 2, reserveTop, reserveBottom, margin: 1.04 });
    const visibleHalfH = distance * Math.tan((fovDeg * D2R) / 2);
    const shift = (reserveTop - reserveBottom) * visibleHalfH;
    const target = { x: cx, y: 0, z: cz - shift };
    return { distance, target, position: { x: target.x, y: distance, z: target.z } };
}

// Smallest gap between the surfaces of any two planets of one system over a
// full lap (world units). Positive means they never touch.
export function minPlanetGap(layout, steps = 360) {
    let min = Infinity;
    for (let s = 0; s < steps; s++) {
        const ang = (s / steps) * 2 * Math.PI;
        const pts = layout.planets.map((p) => orbitPosition(p, ang, layout.centre));
        for (let i = 0; i < pts.length; i++) {
            for (let j = i + 1; j < pts.length; j++) {
                const d = Math.hypot(pts[i].x - pts[j].x, pts[i].z - pts[j].z);
                min = Math.min(min, d - layout.planets[i].radius - layout.planets[j].radius);
            }
        }
    }
    return min;
}

export function planetIndexForLevel(levels, levelId, planets = PLANETS) {
    const level = levels.find((l) => l.id === levelId);
    if (!level) return -1;
    return planets.findIndex((p) => p.regionId === level.regionId);
}

export function planetLevels(levels, planet) {
    return levels.filter((l) => l.regionId === planet.regionId);
}

// Planet status for labels and taps: unlocked when its first level is.
export function planetStatus(save, levels, regions, planet) {
    const inPlanet = planetLevels(levels, planet);
    const first = inPlanet[0];
    const unlocked = first ? isLevelUnlocked(save, levels, regions, first.id) : false;
    const stars = inPlanet.reduce((s, l) => s + (levelRecord(save, l.id).stars || 0), 0);
    const completed = inPlanet.filter((l) => levelRecord(save, l.id).completed).length;
    return {
        unlocked,
        stars,
        maxStars: inPlanet.length * 3,
        completed,
        total: inPlanet.length,
        done: inPlanet.length > 0 && completed === inPlanet.length,
        reason: unlocked || !first ? null : lockReason(save, levels, regions, first.id),
    };
}

// System status for the galaxy view: open when its first planet is open.
// When locked, `need` is the star requirement of its first planet and
// `reason` says what is missing.
export function systemStatus(save, levels, regions, layout) {
    const planets = layout.planets.map((p) => planetStatus(save, levels, regions, p));
    const firstRegion = regions.find((r) => r.id === layout.planets[0].regionId);
    const stars = planets.reduce((s, p) => s + p.stars, 0);
    const maxStars = planets.reduce((s, p) => s + p.maxStars, 0);
    const unlocked = planets[0].unlocked;
    const need = firstRegion ? firstRegion.starRequirement : 0;
    const have = totalStars(save);
    let reason = null;
    if (!unlocked) {
        reason = have < need ? `Earn ${need} stars to reach ${layout.system.name} (you have ${have}).` : planets[0].reason;
    }
    return { unlocked, stars, maxStars, need, have, reason, done: planets.every((p) => p.done), planets };
}

// Which system holds a planet index.
export function systemIndexOfPlanet(pi, planets = PLANETS) {
    return planets[pi] ? planets[pi].systemIndex : -1;
}
