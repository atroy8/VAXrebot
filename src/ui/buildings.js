// Japanese buildings for the level stops on each planet (item 19). Pure data:
// every building is a short list of simple parts (boxes, hipped roofs and
// round posts) that globe-view.js turns into a few merged meshes. Tested in
// tests/buildings.test.js without WebGL.
//
// Which building stands at a stop follows the kind of place the level is:
//   care (healing halls)   temple, a hall on a stone platform with a two tier roof
//   school                 tea house, a small hall under one deep hipped roof
//   urban (markets)        pagoda, three tiers and a spire
//   festival               torii gate, the shrine gate where festivals start
//   global (spaceports)    pagoda
//   boss                   castle, three tiers on sloped stone walls
//
// Units: the planet radius is 1, +y points away from the surface, the stop
// sits at y = 0. Parts: { shape: 'box', size: [w, h, d] } |
// { shape: 'roof', bottom, top, h } (half widths of a four sided hipped roof)
// | { shape: 'post', r, h } | { shape: 'beam', size: [w, h, d], bend } (a bar
// whose ends sweep up by bend, like a torii's top beam), each with pos [x, y, z]
// (centre) and a role.
//
// Round 23: roofs are curved like real Japanese roofs (see roofSurface): the
// slope is steep near the ridge and flattens toward the eaves, and the four
// corners sweep upward (sori). Small details came with it: dark doors and
// windows ('dark'), gold finials ('gold': the pagoda's spire rings, the
// castle's shachihoko), temple steps, a torii's curved kasagi.

export const ROLES = Object.freeze(['stone', 'wall', 'trim', 'roof', 'dark', 'gold']);
export const BUILDING_TYPES = Object.freeze(['temple', 'teahouse', 'pagoda', 'torii', 'castle']);

// Every building fits inside the stop's tap ball (radius 0.15 in
// globe-view.js) seen from above, and stays low enough not to hide its
// neighbours on the road.
export const MAX_HALF_WIDTH = 0.14;
export const MAX_HEIGHT = 0.32;

// Parts below are drawn at this scale (round 22 playtest: 1.0 read too small).
export const BUILDING_SCALE = 1.2;

const box = (w, h, d, y, role, x = 0, z = 0) => ({ shape: 'box', size: [w, h, d], pos: [x, y + h / 2, z], role });
const roof = (bottom, top, h, y, role = 'roof') => ({ shape: 'roof', bottom, top, h, pos: [0, y + h / 2, 0], role });
const post = (r, h, y, x, z, role = 'trim') => ({ shape: 'post', r, h, pos: [x, y + h / 2, z], role });
const beam = (w, h, d, y, bend, role = 'roof') => ({ shape: 'beam', size: [w, h, d], bend, pos: [0, y + h / 2, 0], role });
// A thin dark panel on the front (+z) face of a wall: a door or a window.
const panel = (w, h, y, z, x = 0) => box(w, h, 0.004, y, 'dark', x, z);

function pagoda() {
    const parts = [box(0.12, 0.016, 0.12, 0, 'stone')];
    let y = 0.016;
    for (let k = 0; k < 3; k++) {
        const w = 0.07 - k * 0.012;
        parts.push(box(w, 0.03, w, y, 'wall'));
        // A dark doorway on every tier, so the pagoda reads as a building.
        parts.push(panel(w * 0.36, 0.02, y + 0.004, w / 2 + 0.002));
        y += 0.03;
        parts.push(roof(w / 2 + 0.03, w / 2 - 0.004, 0.018, y));
        y += 0.018;
    }
    // Sorin, the spire on top, with three gold rings.
    parts.push(post(0.005, 0.05, y, 0, 0, 'gold'));
    for (let k = 0; k < 3; k++) parts.push(post(0.011 - k * 0.002, 0.004, y + 0.012 + k * 0.011, 0, 0, 'gold'));
    return parts;
}

function torii() {
    return [
        post(0.012, 0.13, 0, -0.055, 0),
        post(0.012, 0.13, 0, 0.055, 0),
        // Nuki, the lower tie beam.
        box(0.135, 0.012, 0.016, 0.09, 'trim'),
        // Kasagi, the top beam, in the stop's colour, its ends sweeping up.
        beam(0.19, 0.018, 0.028, 0.13, 0.014),
        // Shimaki, the dark beam just under it.
        box(0.17, 0.008, 0.022, 0.122, 'dark'),
        box(0.012, 0.03, 0.012, 0.096, 'trim'),
        // Stone footings.
        box(0.028, 0.012, 0.028, 0, 'stone', -0.055),
        box(0.028, 0.012, 0.028, 0, 'stone', 0.055),
    ];
}

function castle() {
    // Ishigaki, the sloped stone base: a straight frustum, no curved eaves.
    const parts = [{ ...roof(0.11, 0.085, 0.05, 0, 'stone'), straight: true }];
    let y = 0.05;
    const tiers = [0.13, 0.1, 0.07];
    tiers.forEach((w, k) => {
        const h = k === 0 ? 0.04 : 0.032;
        parts.push(box(w, h, w * 0.85, y, 'wall'));
        // A row of dark windows on the front of each tier.
        const n = 3 - k > 1 ? 3 - k : 1;
        for (let i = 0; i < n; i++) {
            const x = n === 1 ? 0 : (i - (n - 1) / 2) * (w / (n + 0.5));
            parts.push(panel(0.012, 0.012, y + h * 0.4, (w * 0.85) / 2 + 0.002, x));
        }
        y += h;
        parts.push(roof(w / 2 + 0.022, w / 4, 0.026, y));
        y += 0.02;
    });
    // Shachihoko, the gold fish on the ridge, as two small posts.
    parts.push(post(0.006, 0.02, y, -0.015, 0, 'gold'), post(0.006, 0.02, y, 0.015, 0, 'gold'));
    return parts;
}

function teahouse() {
    return [
        box(0.13, 0.014, 0.11, 0, 'stone'),
        box(0.1, 0.045, 0.08, 0.014, 'wall'),
        box(0.03, 0.03, 0.004, 0.014, 'trim', 0, 0.041),
        // Nijiriguchi, the small crawl-in door, and a round window.
        panel(0.022, 0.022, 0.018, 0.0425),
        panel(0.016, 0.016, 0.03, 0.0425, -0.032),
        // A stepping stone in front.
        box(0.03, 0.008, 0.02, 0, 'stone', 0, 0.07),
        roof(0.085, 0.012, 0.055, 0.059),
    ];
}

function temple() {
    const parts = [box(0.17, 0.02, 0.14, 0, 'stone')];
    // Steps up to the hall.
    parts.push(box(0.06, 0.01, 0.016, 0, 'stone', 0, 0.075));
    for (const x of [-0.055, -0.018, 0.018, 0.055]) parts.push(post(0.007, 0.05, 0.02, x, 0.047));
    parts.push(box(0.12, 0.05, 0.08, 0.02, 'wall'));
    // Dark doors between the front posts.
    parts.push(panel(0.03, 0.036, 0.02, 0.0415));
    parts.push(roof(0.1, 0.06, 0.02, 0.07));
    parts.push(box(0.09, 0.02, 0.06, 0.09, 'wall'));
    parts.push(roof(0.075, 0.01, 0.045, 0.11));
    return parts;
}

const BUILDERS = { temple, teahouse, pagoda, torii, castle };

// How much a curved roof's corners sweep up, as a share of the roof's height,
// and how far down its slope sags (1 = straight like the old hipped roofs,
// 2 = steep at the ridge and nearly flat at the eaves).
export const ROOF_CURVE = Object.freeze({ cornerLift: 0.45, sag: 1.8, segments: 6, rings: 5 });

// Height (relative to the roof's own centre, from -h/2 to +h/2) of a point on
// a curved roof. t runs 0 at the eaves to 1 at the ridge; c is 0 at the
// middle of a side and 1 at a corner.
export function roofHeight(t, c, h, curve = ROOF_CURVE) {
    const slope = Math.pow(t, curve.sag);
    const lift = curve.cornerLift * c * c * (1 - t) * (1 - t);
    return -h / 2 + h * Math.min(1, slope + lift);
}

// The curved roof as a plain mesh: { positions: [x, y, z, ...], indices }.
// A square of half width `bottom` at the eaves rising to a square of half
// width `top` (a flat cap closes it when top > 0). globe-view.js turns this
// into a BufferGeometry; tests check the shape without WebGL.
export function roofSurface({ bottom, top, h }, curve = ROOF_CURVE) {
    const { segments: S, rings: R } = curve;
    const perRing = 4 * S;
    const positions = [];
    const indices = [];
    const corners = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
    for (let i = 0; i <= R; i++) {
        const t = i / R;
        const w = bottom + (top - bottom) * t;
        for (let side = 0; side < 4; side++) {
            const [ax, az] = corners[side];
            const [bx, bz] = corners[(side + 1) % 4];
            for (let k = 0; k < S; k++) {
                const u = k / S;
                const c = Math.abs(2 * u - 1);
                positions.push((ax + (bx - ax) * u) * w, roofHeight(t, c, h, curve), (az + (bz - az) * u) * w);
            }
        }
    }
    for (let i = 0; i < R; i++) {
        for (let k = 0; k < perRing; k++) {
            const a = i * perRing + k;
            const b = i * perRing + ((k + 1) % perRing);
            const a2 = a + perRing;
            const b2 = b + perRing;
            indices.push(a, a2, b, b, a2, b2);
        }
    }
    if (top > 0) {
        const centre = positions.length / 3;
        positions.push(0, h / 2, 0);
        const ring = R * perRing;
        for (let k = 0; k < perRing; k++) indices.push(ring + k, centre, ring + ((k + 1) % perRing));
    }
    return { positions, indices };
}

// Lift of a beam's centre line at x (a beam of length len): 0 in the middle,
// rising to bend at both ends.
export function beamLift(x, len, bend) {
    const u = (2 * x) / len;
    return bend * u * u * u * u;
}

export function buildingParts(type) {
    const make = BUILDERS[type];
    if (!make) throw new Error(`Unknown building: ${type}`);
    const k = BUILDING_SCALE;
    return make().map((p) => {
        const q = { ...p, pos: p.pos.map((v) => v * k) };
        if (p.shape === 'box') q.size = p.size.map((v) => v * k);
        else if (p.shape === 'beam') Object.assign(q, { size: p.size.map((v) => v * k), bend: p.bend * k });
        else if (p.shape === 'roof') Object.assign(q, { bottom: p.bottom * k, top: p.top * k, h: p.h * k });
        else Object.assign(q, { r: p.r * k, h: p.h * k });
        return q;
    });
}

// How each building stands (item 23, round 25). The planet view now looks
// from a tilted angle, so most buildings stand straight up on the planet and
// the camera sees their walls. Only a building that faces the camera almost
// head on (where you would see just its roof) tips back, just enough that
// the line of sight meets it at least MIN_VIEW_DEG from its up direction.
// Before round 25 every building leaned about 36 degrees toward the viewer.
export const MIN_VIEW_DEG = 54;

const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const len = (a) => Math.hypot(a.x, a.y, a.z);
const add = (a, b, k = 1) => ({ x: a.x + b.x * k, y: a.y + b.y * k, z: a.z + b.z * k });
const scale = (a, k) => ({ x: a.x * k, y: a.y * k, z: a.z * k });
const unit = (a) => scale(a, 1 / (len(a) || 1));
const perpTo = (v, axis) => add(v, axis, -dot(v, axis));

const cross = (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });

// n: surface normal, toCam: direction to the camera, screenUp: the camera's
// up, all unit vectors. Returns the building's up direction (unit).
// A building's top may tip sideways and toward the top of the screen, never
// toward the bottom (that would show its roof and back), and the line of
// sight meets it at least minDeg from its up. A building already seen from
// the side and leaning up the screen (the far rows) keeps its true normal.
export function standingUp(n, toCam, screenUp, minDeg = MIN_VIEW_DEG) {
    const min = (minDeg * Math.PI) / 180;
    const a = Math.acos(Math.max(-1, Math.min(1, dot(n, toCam))));
    const pu = unit(perpTo(screenUp, toCam));
    const pr = unit(cross(pu, toCam));
    const pn = perpTo(n, toCam);
    const aUp = dot(pn, pu);
    const aSide = dot(pn, pr);
    // Sideways tip fades as a building nears head on, so stops on the sides
    // of the road do not look like they are falling over.
    const side = 0.35 + 0.65 * Math.min(1, a / min);
    // Near head on, screen up takes over smoothly (no flip as the normal
    // swings past the line of sight).
    const lift = 0.6 * Math.sin(min) * Math.max(0, 1 - a / min);
    let dir = add(scale(pu, Math.max(aUp, 0.5 * len(pn), lift, 1e-6)), pr, aSide * side);
    dir = unit(dir);
    const t = Math.max(a, min);
    return unit(add(scale(toCam, Math.cos(t)), dir, Math.sin(t)));
}

// Angle in degrees between the line of sight and a building's up, for a stop
// at angle viewDeg from the line of sight (0 = facing the camera head on).
export function viewAngle(viewDeg, minDeg = MIN_VIEW_DEG) {
    const r = (viewDeg * Math.PI) / 180;
    const n = { x: 0, y: Math.sin(r), z: Math.cos(r) };
    const u = standingUp(n, { x: 0, y: 0, z: 1 }, { x: 0, y: 1, z: 0 }, minDeg);
    return (Math.acos(Math.max(-1, Math.min(1, u.z))) * 180) / Math.PI;
}

// Kept for the round 19 test: the angle for a stop facing you head on.
export function leanAngleAtCentre() {
    return viewAngle(0);
}

const BY_SCENARIO = { care: 'temple', school: 'teahouse', urban: 'pagoda', festival: 'torii', global: 'pagoda' };

// Building for a level from src/config/levels.js.
export function buildingFor(level) {
    if (level.variant && level.variant.boss) return 'castle';
    return BY_SCENARIO[level.scenarioId] || 'teahouse';
}

// How far a part reaches from the stop's centre (x, z) and how high it goes.
export function partExtent(p) {
    let hw;
    let hd;
    let h;
    if (p.shape === 'box') [hw, h, hd] = [p.size[0] / 2, p.size[1], p.size[2] / 2];
    else if (p.shape === 'beam') [hw, h, hd] = [p.size[0] / 2, p.size[1] + 2 * p.bend, p.size[2] / 2];
    else if (p.shape === 'roof') [hw, hd, h] = [p.bottom, p.bottom, p.h];
    else [hw, hd, h] = [p.r, p.r, p.h];
    return {
        halfWidth: Math.max(Math.abs(p.pos[0]) + hw, Math.abs(p.pos[2]) + hd),
        top: p.pos[1] + h / 2,
        bottom: p.pos[1] - h / 2,
    };
}

export function buildingExtent(type) {
    const ex = buildingParts(type).map(partExtent);
    return {
        halfWidth: Math.max(...ex.map((e) => e.halfWidth)),
        height: Math.max(...ex.map((e) => e.top)),
        bottom: Math.min(...ex.map((e) => e.bottom)),
    };
}

// Colours per role for a stop's state. roof: the planet's button colour
// while open, gold once beaten; locked stops are grey and dimmed.
// Doors and windows are dark; finials are always gold, so even an open stop
// has a glint of gold.
export function buildingColors({ unlocked, done, current, button, gold, locked, wall, trim, stone, dark = locked, finial = gold }) {
    if (!unlocked) return { stone: locked, wall: locked, trim: locked, roof: locked, dark: locked, gold: locked, dim: true, glow: 0 };
    return { stone, wall, trim, roof: done ? gold : button, dark, gold: finial, dim: false, glow: current ? 0.35 : 0.1 };
}

// Pixels to lift a stop's label so it sits on its building's roof instead of
// covering the building. baseY and roofY are the screen y (CSS px, down is
// positive) of the stop and of its building's ridge; the label is drawn with
// its bottom LABEL_TUCK px below its anchor (translate -125% of a ~32 px
// pill), so lifting by the gap minus that tuck puts the pill's bottom on the
// ridge. Round 23: the old estimate lifted labels only 5 to 9 px, so the
// number pill hid most of the building.
export const LABEL_TUCK = 6;
export function labelLift(baseY, roofY, tuck = LABEL_TUCK) {
    if (!Number.isFinite(baseY) || !Number.isFinite(roofY)) return 0;
    return Math.max(0, baseY - roofY - tuck);
}
