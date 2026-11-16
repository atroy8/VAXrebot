// Item 29 (a), round 44: a journey around each planet. Before this round all
// ten levels sat on the front face of a planet (longitudes -130 to -50), so
// the far side was empty enamel. Now the levels are spread all the way round
// the globe, and the gaps between them fill with villages, groves, lanterns
// and little groups of people you cannot play (scenery). The planet view
// turns the planet so the chosen level faces you, and you can spin it to
// look ahead along the road.
//
// Pure data and math, no three.js, so it can be unit tested
// (tests/round44-planet-journey.test.js).

import { latLngToXYZ, slerp } from '../ui/globe-math.js';

// lng -90 faces the camera (globe-math.js), so level 1 starts there.
export const JOURNEY_START_LNG = -90;
// The road waves gently north and south so it reads as a road, not a belt,
// but stays well clear of the poles (the planet view looks from a tilt).
export const JOURNEY_LAT_WAVE = 16;
export const JOURNEY_LAT_TILT = -6;

// Scenery keeps clear of every tap ball (0.15 of the planet radius in
// globe-view.js) with room for its own footprint.
export const SCENERY_CLEARANCE = 0.3; // radians, about 17 degrees
// And off the road itself.
export const SCENERY_ROAD_CLEARANCE = 0.09;
// Each piece is drawn at a random scale in this range.
export const SCENERY_SIZE = Object.freeze([1.1, 1.35]);
export const SCENERY_KINDS = Object.freeze(['village', 'grove', 'lantern', 'folk']);

const D2R = Math.PI / 180;

// Level stops for a planet with `count` levels: even steps of longitude all
// the way round, so no gap is wider than 360 / count degrees.
export function journeyPositions(count = 10) {
    const step = 360 / Math.max(1, count);
    const out = [];
    for (let k = 0; k < count; k++) {
        let lng = JOURNEY_START_LNG + k * step;
        if (lng > 180) lng -= 360;
        // A soft wave: two crests per lap, so neighbours never line up.
        const lat = JOURNEY_LAT_TILT + JOURNEY_LAT_WAVE * Math.sin((k / Math.max(1, count)) * Math.PI * 4 + 0.6);
        out.push({ lat: Math.round(lat * 10) / 10, lng: Math.round(lng * 10) / 10 });
    }
    return out;
}

export function journeyStops(count = 10) {
    return journeyPositions(count).map((p) => latLngToXYZ(p.lat, p.lng, 1));
}

// Widest empty stretch of longitude between neighbouring stops, in degrees.
export function maxLongitudeGap(positions) {
    const lngs = positions.map((p) => ((p.lng % 360) + 360) % 360).sort((a, b) => a - b);
    let gap = 0;
    for (let i = 0; i < lngs.length; i++) {
        const next = i + 1 < lngs.length ? lngs[i + 1] : lngs[0] + 360;
        gap = Math.max(gap, next - lngs[i]);
    }
    return gap;
}

const norm = (v) => {
    const l = Math.hypot(v.x, v.y, v.z) || 1;
    return { x: v.x / l, y: v.y / l, z: v.z / l };
};
const cross = (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
export function arc(a, b) {
    return Math.acos(Math.min(1, Math.max(-1, dot(norm(a), norm(b)))));
}

function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// Push a point sideways off the great circle a to b by `off` radians.
function sideways(p, a, b, off) {
    const side = norm(cross(norm(a), norm(b)));
    const q = norm({ x: p.x + side.x * Math.tan(off), y: p.y + side.y * Math.tan(off), z: p.z + side.z * Math.tan(off) });
    return q;
}

// Scenery between the stops. `keepClear` lists every point a player taps
// (levels and prize boxes); `road` is the sampled road. Every candidate that
// would crowd a tap target, the road or another piece of scenery is dropped.
// Returns [{ kind, pos: {x,y,z} unit vector, yaw, size, leg }].
export function scenerySites(stops, { keepClear = stops, road = [], seed = 1 } = {}) {
    const rand = mulberry32(seed);
    const n = stops.length;
    const candidates = [];
    for (let i = 0; i < n; i++) {
        const a = stops[i];
        const b = stops[(i + 1) % n];
        // Two pieces beside the road on alternate sides, then one farther out
        // on each side so the planet looks lived in north and south too.
        const plan = [
            { t: 0.3, off: 0.24 * (i % 2 ? 1 : -1) },
            { t: 0.7, off: 0.24 * (i % 2 ? -1 : 1) },
            { t: 0.5, off: 0.55 },
            { t: 0.5, off: -0.55 },
            { t: 0.15, off: 0.8 * (i % 2 ? -1 : 1) },
        ];
        for (const s of plan) {
            const mid = slerp(norm(a), norm(b), s.t);
            candidates.push({ pos: sideways(mid, a, b, s.off), leg: i });
        }
    }
    const out = [];
    const minSelf = 0.16;
    for (const c of candidates) {
        if (keepClear.some((k) => arc(c.pos, k) < SCENERY_CLEARANCE)) continue;
        if (road.some((r) => arc(c.pos, r) < SCENERY_ROAD_CLEARANCE)) continue;
        if (out.some((o) => arc(c.pos, o.pos) < minSelf)) continue;
        // Keep away from the poles, where the planet view never looks.
        if (Math.abs(c.pos.y) > Math.sin(62 * D2R)) continue;
        const r = rand();
        // Villages most often, then people, groves and lanterns.
        const kind = r < 0.36 ? 'village' : r < 0.62 ? 'folk' : r < 0.84 ? 'grove' : 'lantern';
        out.push({ kind, pos: c.pos, yaw: rand() * Math.PI * 2, size: SCENERY_SIZE[0] + rand() * (SCENERY_SIZE[1] - SCENERY_SIZE[0]), leg: c.leg });
    }
    return out;
}
