// Pure math for the candy planet home screen (src/ui/globe-view.js).
// No three.js here so it can be unit tested (tests/globe-math.test.js).

const D2R = Math.PI / 180;

// Same convention as the original globe: lng -90 faces the camera (+z).
export function latLngToXYZ(lat, lng, r = 1) {
    const phi = (90 - lat) * D2R;
    const theta = (lng + 180) * D2R;
    return {
        x: -r * Math.sin(phi) * Math.cos(theta),
        y: r * Math.cos(phi),
        z: r * Math.sin(phi) * Math.sin(theta),
    };
}

const norm = (v) => {
    const l = Math.hypot(v.x, v.y, v.z) || 1;
    return { x: v.x / l, y: v.y / l, z: v.z / l };
};
const cross = (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });

// Spherical interpolation between two unit vectors.
export function slerp(a, b, t) {
    const dot = Math.min(1, Math.max(-1, a.x * b.x + a.y * b.y + a.z * b.z));
    const om = Math.acos(dot);
    if (om < 1e-6) return { ...a };
    const s = Math.sin(om);
    const ka = Math.sin((1 - t) * om) / s;
    const kb = Math.sin(t * om) / s;
    return norm({ x: a.x * ka + b.x * kb, y: a.y * ka + b.y * kb, z: a.z * ka + b.z * kb });
}

// A winding candy path through the stops (unit vectors), lifted to
// `radius`. Each leg bends sideways in a gentle S so it reads as a road,
// not a straight line. Returns an array of {x,y,z}.
export function windingPath(stops, { perLeg = 24, wiggle = 0.06, radius = 1.012 } = {}) {
    const out = [];
    for (let i = 0; i < stops.length - 1; i++) {
        const a = norm(stops[i]);
        const b = norm(stops[i + 1]);
        const side = norm(cross(a, b));
        const dir = i % 2 === 0 ? 1 : -1;
        for (let k = 0; k < perLeg; k++) {
            const t = k / perLeg;
            const p = slerp(a, b, t);
            const off = Math.sin(t * Math.PI) * wiggle * dir;
            const q = norm({ x: p.x + side.x * off, y: p.y + side.y * off, z: p.z + side.z * off });
            out.push({ x: q.x * radius, y: q.y * radius, z: q.z * radius });
        }
    }
    const last = norm(stops[stops.length - 1]);
    out.push({ x: last.x * radius, y: last.y * radius, z: last.z * radius });
    return out;
}

// Prize boxes sit on the path between the level that unlocks them and the
// next level, so the road visibly leads to each box.
export function chestStop(levelStops, afterIndex) {
    const a = norm(levelStops[afterIndex]);
    const b = levelStops[afterIndex + 1] ? norm(levelStops[afterIndex + 1]) : a;
    return slerp(a, b, 0.5);
}

// Camera distance that shows a sphere of `radius` inside both the vertical
// and horizontal field of view (portrait phones need the horizontal one).
export function globeFitDistance({ radius = 1, fovDeg = 42, aspect = 1, margin = 1.08 } = {}) {
    const v = (fovDeg * D2R) / 2;
    const h = Math.atan(Math.tan(v) * aspect);
    return (radius * margin) / Math.sin(Math.min(v, h));
}

// World rotation (Euler XYZ) that turns a surface point toward the camera
// on +z. Tilt is softened so the poles never flip into view.
export function faceRotation(p, tiltFactor = 0.75) {
    const yaw = -Math.atan2(p.x, p.z);
    // After the yaw the point is at (0, y, r'); tilt it toward the center.
    const rp = Math.hypot(p.x, p.z);
    const pitch = Math.atan2(p.y, rp) * tiltFactor;
    return { x: pitch, y: yaw };
}

// Shortest signed angle from a to b, in (-PI, PI].
export function angleDelta(a, b) {
    let d = (b - a) % (2 * Math.PI);
    if (d > Math.PI) d -= 2 * Math.PI;
    if (d <= -Math.PI) d += 2 * Math.PI;
    return d;
}
