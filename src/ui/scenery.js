// Item 29 (a), round 44: scenery between the level stops. Small, quiet shapes
// that make a planet feel lived in without looking like something to tap:
// a cluster of houses, a grove of pines, a stone lantern, a few people out
// for a walk. Same part format as src/ui/buildings.js (boxes, roofs, posts)
// plus 'ball' for heads and tree crowns. globe-view.js merges every piece of
// a planet into a handful of meshes, so the scenery costs a few draw calls.
//
// Every piece is much smaller than a level building, so the levels still
// stand out. Tested in tests/round44-planet-journey.test.js.

export const SCENERY_ROLES = Object.freeze(['wall', 'roof', 'stone', 'dark', 'leaf', 'trunk', 'cloth', 'skin']);
// Half width and height limits, in planet radii (a level building is up to
// 0.14 wide and 0.32 tall).
export const SCENERY_MAX_HALF_WIDTH = 0.085;
export const SCENERY_MAX_HEIGHT = 0.11;

const box = (w, h, d, y, role, x = 0, z = 0) => ({ shape: 'box', size: [w, h, d], pos: [x, y + h / 2, z], role });
const roof = (bottom, top, h, y, x = 0, z = 0, role = 'roof') => ({ shape: 'roof', straight: true, bottom, top, h, pos: [x, y + h / 2, z], role });
const post = (r, h, y, x, z, role) => ({ shape: 'post', r, h, pos: [x, y + h / 2, z], role });
const ball = (r, y, x, z, role) => ({ shape: 'ball', r, pos: [x, y, z], role });

function house(x, z, w) {
    return [
        box(w, w * 0.62, w * 0.8, 0, 'wall', x, z),
        box(w * 0.26, w * 0.36, 0.003, 0, 'dark', x, z + w * 0.4 + 0.0015),
        roof(w * 0.66, w * 0.08, w * 0.42, w * 0.62, x, z),
    ];
}

function village() {
    return [...house(-0.035, 0.012, 0.04), ...house(0.03, -0.018, 0.034), ...house(0.012, 0.042, 0.03)];
}

function pine(x, z, s) {
    return [
        post(0.005 * s, 0.03 * s, 0, x, z, 'trunk'),
        roof(0.026 * s, 0.012 * s, 0.03 * s, 0.022 * s, x, z, 'leaf'),
        roof(0.019 * s, 0.002, 0.032 * s, 0.046 * s, x, z, 'leaf'),
    ];
}

function grove() {
    return [...pine(-0.03, 0.01, 1.1), ...pine(0.02, -0.025, 1), ...pine(0.028, 0.03, 0.85), ball(0.016, 0.012, -0.004, 0.04, 'leaf')];
}

// A stone lantern on a little plinth.
function lantern() {
    return [
        box(0.04, 0.008, 0.04, 0, 'stone'),
        post(0.007, 0.04, 0.008, 0, 0, 'stone'),
        box(0.026, 0.02, 0.026, 0.048, 'stone'),
        box(0.012, 0.01, 0.003, 0.053, 'dark', 0, 0.0145),
        roof(0.026, 0.004, 0.018, 0.068, 0, 0, 'stone'),
    ];
}

function person(x, z, s = 1) {
    return [post(0.009 * s, 0.03 * s, 0, x, z, 'cloth'), ball(0.009 * s, 0.038 * s, x, z, 'skin')];
}

// A few people out for a walk: the folk of the planet you are saving.
function folk() {
    return [...person(-0.026, 0.006), ...person(0, -0.014, 1.08), ...person(0.024, 0.012, 0.9), ...person(0.006, 0.03, 0.75)];
}

const BUILDERS = { village, grove, lantern, folk };

export function sceneryParts(kind) {
    const make = BUILDERS[kind];
    if (!make) throw new Error(`Unknown scenery: ${kind}`);
    return make();
}

export function sceneryExtent(kind) {
    let half = 0;
    let height = 0;
    for (const p of sceneryParts(kind)) {
        const [x, y, z] = p.pos;
        let hw;
        let top;
        if (p.shape === 'box') {
            hw = Math.max(Math.abs(x) + p.size[0] / 2, Math.abs(z) + p.size[2] / 2);
            top = y + p.size[1] / 2;
        } else if (p.shape === 'roof') {
            hw = Math.max(Math.abs(x), Math.abs(z)) + p.bottom;
            top = y + p.h / 2;
        } else if (p.shape === 'post') {
            hw = Math.max(Math.abs(x), Math.abs(z)) + p.r;
            top = y + p.h / 2;
        } else {
            hw = Math.max(Math.abs(x), Math.abs(z)) + p.r;
            top = y + p.r;
        }
        half = Math.max(half, hw);
        height = Math.max(height, top);
    }
    return { halfWidth: half, height };
}

// Colours for scenery: quiet, so the level buildings stay the brightest
// things on the planet. `land` is the planet's land colours (planet-palettes.js).
export function sceneryColors({ wall, stone, dark, land = [], cloth = [] }) {
    const pick = (arr, i, fallback) => (arr.length ? arr[i % arr.length] : fallback);
    return {
        wall,
        roof: pick(land, 0, stone),
        stone,
        dark,
        leaf: 0x3f6b4a,
        trunk: 0x6b4a32,
        cloth: pick(cloth, 0, 0x5a6fa8),
        skin: 0xe9c9a8,
    };
}
