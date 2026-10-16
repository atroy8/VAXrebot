// Pure math and progress helpers for the candy solar system home screen.
// No three.js and no DOM, unit tested in tests/solar-system.test.js.

import { PLANETS, PLANET_RADIUS, ORBIT_PERIOD_S, SYSTEM_ELEVATION_DEG } from '../config/solar-system.js';
import { isLevelUnlocked, lockReason, levelRecord } from '../progress.js';

const D2R = Math.PI / 180;

// Orbit angle at time t (seconds).
export function orbitAngle(t, period = ORBIT_PERIOD_S) {
    return ((t / period) * 2 * Math.PI) % (2 * Math.PI);
}

// Planet centre on its orbit (orbit plane is y = 0, the sun at the origin).
export function orbitPosition(planet, angle) {
    const th = angle + planet.orbit.phase;
    return { x: planet.orbit.a * Math.cos(th), y: 0, z: planet.orbit.b * Math.sin(th) };
}

// Approximate screen position (in world units, before perspective) of a
// point seen from the system camera: x stays x, depth tilts into height.
export function systemScreenXY(p, elevationDeg = SYSTEM_ELEVATION_DEG) {
    const e = elevationDeg * D2R;
    return { x: p.x, y: -p.z * Math.sin(e) + p.y * Math.cos(e) };
}

// Camera placement for the system view: looking at the sun from above and
// in front, far enough back that every orbit fits both screen directions.
export function systemCamera({ fovDeg, aspect, elevationDeg = SYSTEM_ELEVATION_DEG, planets = PLANETS, radius = PLANET_RADIUS, margin = 1.06 }) {
    const e = elevationDeg * D2R;
    let halfW = 0;
    let halfH = 0;
    for (const p of planets) {
        halfW = Math.max(halfW, p.orbit.a + radius);
        halfH = Math.max(halfH, p.orbit.b * Math.sin(e) + radius);
    }
    const v = Math.tan((fovDeg * D2R) / 2);
    const h = v * aspect;
    const distance = Math.max((halfW * margin) / h, (halfH * margin) / v);
    return {
        distance,
        position: { x: 0, y: distance * Math.sin(e), z: distance * Math.cos(e) },
        target: { x: 0, y: 0, z: 0 },
    };
}

// Smallest on-screen gap between any two planets over a full lap, in units
// of planet diameters. Used to check orbits never overlap on screen.
export function minPlanetSeparation({ planets = PLANETS, steps = 360, elevationDeg = SYSTEM_ELEVATION_DEG } = {}) {
    let min = Infinity;
    for (let s = 0; s < steps; s++) {
        const ang = (s / steps) * 2 * Math.PI;
        const pts = planets.map((p) => systemScreenXY(orbitPosition(p, ang), elevationDeg));
        for (let i = 0; i < pts.length; i++) {
            for (let j = i + 1; j < pts.length; j++) {
                min = Math.min(min, Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y));
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
