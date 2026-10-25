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
// | { shape: 'post', r, h }, each with pos [x, y, z] (centre) and a role.

export const ROLES = Object.freeze(['stone', 'wall', 'trim', 'roof']);
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

function pagoda() {
    const parts = [box(0.12, 0.016, 0.12, 0, 'stone')];
    let y = 0.016;
    for (let k = 0; k < 3; k++) {
        const w = 0.07 - k * 0.012;
        parts.push(box(w, 0.03, w, y, 'wall'));
        y += 0.03;
        parts.push(roof(w / 2 + 0.03, w / 2 - 0.004, 0.018, y));
        y += 0.018;
    }
    // Sorin, the spire on top.
    parts.push(post(0.006, 0.05, y, 0, 0));
    return parts;
}

function torii() {
    return [
        post(0.012, 0.13, 0, -0.055, 0),
        post(0.012, 0.13, 0, 0.055, 0),
        // Nuki, the lower tie beam.
        box(0.135, 0.012, 0.016, 0.09, 'trim'),
        // Kasagi, the curved top beam, in the stop's colour.
        box(0.19, 0.018, 0.028, 0.13, 'roof'),
        box(0.012, 0.03, 0.012, 0.102, 'trim'),
    ];
}

function castle() {
    const parts = [roof(0.11, 0.085, 0.05, 0, 'stone')];
    let y = 0.05;
    const tiers = [0.13, 0.1, 0.07];
    tiers.forEach((w, k) => {
        const h = k === 0 ? 0.04 : 0.032;
        parts.push(box(w, h, w * 0.85, y, 'wall'));
        y += h;
        parts.push(roof(w / 2 + 0.022, w / 4, 0.026, y));
        y += 0.02;
    });
    // Shachihoko, the gold fish on the ridge, as two small posts.
    parts.push(post(0.006, 0.02, y, -0.015, 0), post(0.006, 0.02, y, 0.015, 0));
    return parts;
}

function teahouse() {
    return [
        box(0.13, 0.014, 0.11, 0, 'stone'),
        box(0.1, 0.045, 0.08, 0.014, 'wall'),
        box(0.03, 0.03, 0.004, 0.014, 'trim', 0, 0.041),
        roof(0.085, 0.012, 0.055, 0.059),
    ];
}

function temple() {
    const parts = [box(0.17, 0.02, 0.14, 0, 'stone')];
    for (const x of [-0.055, -0.018, 0.018, 0.055]) parts.push(post(0.007, 0.05, 0.02, x, 0.047));
    parts.push(box(0.12, 0.05, 0.08, 0.02, 'wall'));
    parts.push(roof(0.1, 0.06, 0.02, 0.07));
    parts.push(box(0.09, 0.02, 0.06, 0.09, 'wall'));
    parts.push(roof(0.075, 0.01, 0.045, 0.11));
    return parts;
}

const BUILDERS = { temple, teahouse, pagoda, torii, castle };

export function buildingParts(type) {
    const make = BUILDERS[type];
    if (!make) throw new Error(`Unknown building: ${type}`);
    const k = BUILDING_SCALE;
    return make().map((p) => {
        const q = { ...p, pos: p.pos.map((v) => v * k) };
        if (p.shape === 'box') q.size = p.size.map((v) => v * k);
        else if (p.shape === 'roof') Object.assign(q, { bottom: p.bottom * k, top: p.top * k, h: p.h * k });
        else Object.assign(q, { r: p.r * k, h: p.h * k });
        return q;
    });
}

// How each building leans toward the viewer: its up direction is a blend of
// the planet surface normal, the direction to the camera and screen up. The
// blend tips buildings about 36 degrees from the line of sight, so the front
// shows under the roof.
export function leanWeights() {
    return { normal: 0.5, camera: 0.35, screenUp: 0.62 };
}

// Angle in degrees between a building's up and the line of sight for a stop
// facing the camera head on (normal = camera direction, screen up at 90 deg).
export function leanAngleAtCentre(w = leanWeights()) {
    const a = w.normal + w.camera;
    return (Math.atan2(w.screenUp, a) * 180) / Math.PI;
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
export function buildingColors({ unlocked, done, current, button, gold, locked, wall, trim, stone }) {
    if (!unlocked) return { stone: locked, wall: locked, trim: locked, roof: locked, dim: true, glow: 0 };
    return { stone, wall, trim, roof: done ? gold : button, dim: false, glow: current ? 0.35 : 0.1 };
}

// Pixels to lift a stop's label so it clears the building: the building's
// on-screen height (world height times pixels per unit) foreshortened by the
// lean, times 0.25 so the label tucks against the roof instead of floating.
export function labelLift(heightPx, w = leanWeights()) {
    return Math.max(0, heightPx * Math.sin((leanAngleAtCentre(w) * Math.PI) / 180) * 0.25);
}
