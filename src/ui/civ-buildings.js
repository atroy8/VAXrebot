// Item 29 (b), round 45: a building set for each civilization along the
// journey (src/config/civilizations.js). Same part format as buildings.js,
// which merges these builders into its own, plus three additions:
//   { shape: 'dome', r, h, onion }   a dome (onion = a Mughal onion dome)
//   post with rTop                   a cone or tapered tower (rTop < r)
//   roof with zScale                 a rectangular roof (depth = zScale x width)
//   any part with rot [rx, ry, rz]   turned before it is placed
// Units are the same as buildings.js before BUILDING_SCALE: the stop sits at
// y = 0, +z is the front. Each set stays inside the stop's tap ball and under
// the Japanese castle's limits (tests/round45-civilizations.test.js).
//
// Drawn simply and with respect: real architecture, no caricature, no
// people. Each building names the real form it is based on.

const box = (w, h, d, y, role, x = 0, z = 0) => ({ shape: 'box', size: [w, h, d], pos: [x, y + h / 2, z], role });
// A straight (not curved) hipped roof or frustum; zScale makes it oblong.
const hip = (bottom, top, h, y, role = 'roof', x = 0, z = 0, zScale = 1) => ({ shape: 'roof', straight: true, bottom, top, h, zScale, pos: [x, y + h / 2, z], role });
const post = (r, h, y, x = 0, z = 0, role = 'trim', rTop = r) => ({ shape: 'post', r, rTop, h, pos: [x, y + h / 2, z], role });
const cone = (r, h, y, x = 0, z = 0, role = 'roof') => post(r, h, y, x, z, role, 0.0005);
const dome = (r, h, y, x = 0, z = 0, role = 'roof', onion = false) => ({ shape: 'dome', r, h, onion, pos: [x, y + h / 2, z], role });
// A thin dark panel on the front (+z) face of a wall: a door or a window.
const panel = (w, h, y, z, x = 0) => box(w, h, 0.004, y, 'dark', x, z);
// A round plaque facing the front (a sun disc, a shield).
const disc = (r, y, x, z, role) => ({ shape: 'post', r, rTop: r, h: 0.004, pos: [x, y, z], rot: [Math.PI / 2, 0, 0], role });

// ---- The West African Sahel: Sudano-Sahelian earth architecture ----------

// A mud-brick house with a flat roof, a parapet and toron (the palm wood
// beams that stick out of the walls and serve as scaffolding for replastering).
function sahelHouse() {
    const parts = [
        box(0.15, 0.01, 0.12, 0, 'stone'),
        box(0.13, 0.07, 0.1, 0.01, 'wall'),
        box(0.136, 0.012, 0.106, 0.08, 'roof'),
        panel(0.026, 0.04, 0.01, 0.0505),
        panel(0.014, 0.014, 0.05, 0.0505, -0.04),
        panel(0.014, 0.014, 0.05, 0.0505, 0.04),
    ];
    for (const x of [-0.065, 0, 0.065]) parts.push(cone(0.011, 0.034, 0.092, x, 0.05));
    for (const x of [-0.045, -0.015, 0.015, 0.045]) parts.push(box(0.005, 0.005, 0.024, 0.062, 'trim', x, 0.05));
    return parts;
}

// Round earth granaries with conical thatch roofs.
function granary() {
    const parts = [box(0.2, 0.01, 0.13, 0, 'stone')];
    const bins = [
        [0, 0.012, 0.04, 0.062],
        [-0.068, -0.02, 0.028, 0.05],
        [0.066, -0.024, 0.03, 0.052],
    ];
    for (const [x, z, r, h] of bins) {
        parts.push(post(r, h, 0.01, x, z, 'wall', r * 0.92));
        parts.push(cone(r + 0.012, 0.05, 0.01 + h - 0.004, x, z));
    }
    // A small hatch on the big granary, and a ladder of toron.
    parts.push(panel(0.018, 0.02, 0.034, 0.053));
    parts.push(box(0.004, 0.004, 0.02, 0.05, 'trim', 0.02, 0.046));
    return parts;
}

// A tower of sun-dried brick, tapering as it rises, bristling with toron
// and crowned with pinnacles, in the style of the great mosques of Djenne
// and Timbuktu.
function mudTower() {
    const parts = [
        box(0.16, 0.014, 0.13, 0, 'stone'),
        box(0.13, 0.05, 0.09, 0.014, 'wall'),
        box(0.134, 0.01, 0.094, 0.064, 'roof'),
        hip(0.032, 0.022, 0.11, 0.064, 'wall'),
        box(0.05, 0.01, 0.05, 0.174, 'roof'),
        cone(0.012, 0.03, 0.184, 0, 0),
        panel(0.024, 0.034, 0.014, 0.0455),
    ];
    for (const x of [-0.055, 0.055]) parts.push(cone(0.012, 0.04, 0.074, x, 0.04));
    // Toron in rows up the tower front and along the hall.
    for (const y of [0.09, 0.12, 0.15]) for (const x of [-0.012, 0.012]) parts.push(box(0.004, 0.004, 0.022, y, 'trim', x, 0.03));
    for (const x of [-0.04, -0.02, 0.02, 0.04]) parts.push(box(0.004, 0.004, 0.02, 0.05, 'trim', x, 0.046));
    // An ostrich egg on the top pinnacle, as on the real towers.
    parts.push(post(0.006, 0.01, 0.212, 0, 0, 'gold'));
    return parts;
}

// A toguna: the Dogon meeting shelter, a deep roof of stacked millet
// stalks on short carved pillars, low enough that everyone sits.
function toguna() {
    const parts = [box(0.17, 0.008, 0.12, 0, 'stone'), box(0.12, 0.002, 0.07, 0.008, 'dark')];
    for (const x of [-0.06, 0, 0.06]) for (const z of [-0.035, 0.035]) parts.push(post(0.008, 0.06, 0.008, x, z, 'trim'));
    parts.push(box(0.17, 0.02, 0.12, 0.068, 'roof'));
    parts.push(box(0.15, 0.018, 0.104, 0.088, 'roof'));
    parts.push(box(0.12, 0.014, 0.084, 0.106, 'roof'));
    // Carved marks on the front pillars.
    for (const x of [-0.06, 0, 0.06]) parts.push(box(0.01, 0.012, 0.003, 0.03, 'dark', x, 0.043));
    return parts;
}

// A palace of earth: a wide hall with rows of buttress pinnacles and three
// towers, the tallest building in the Sahel lands.
function mudPalace() {
    const parts = [
        hip(0.11, 0.1, 0.02, 0, 'stone', 0, 0, 0.8),
        box(0.18, 0.08, 0.13, 0.02, 'wall'),
        box(0.184, 0.01, 0.134, 0.1, 'roof'),
        box(0.06, 0.08, 0.06, 0.11, 'wall'),
        box(0.064, 0.012, 0.064, 0.19, 'roof'),
        cone(0.014, 0.036, 0.202, 0, 0),
        post(0.006, 0.01, 0.236, 0, 0, 'gold'),
        panel(0.03, 0.045, 0.02, 0.0655),
        panel(0.016, 0.016, 0.135, 0.0305),
    ];
    for (const x of [-0.065, 0.065]) {
        parts.push(box(0.036, 0.05, 0.036, 0.11, 'wall', x, 0.02));
        parts.push(box(0.04, 0.01, 0.04, 0.16, 'roof', x, 0.02));
        parts.push(cone(0.01, 0.028, 0.17, x, 0.02));
    }
    for (const x of [-0.085, -0.045, 0.045, 0.085]) parts.push(cone(0.01, 0.04, 0.11, x, 0.064));
    for (const x of [-0.07, -0.025, 0.025, 0.07]) parts.push(panel(0.012, 0.014, 0.07, 0.0655, x));
    for (const x of [-0.06, -0.035, 0.035, 0.06]) parts.push(box(0.004, 0.004, 0.022, 0.09, 'trim', x, 0.066));
    return parts;
}

// ---- The Andes: Inca stonework ------------------------------------------

// A fitted-stone house with a steep thatch roof and a narrow doorway.
function incaHouse() {
    return [
        box(0.14, 0.01, 0.11, 0, 'stone'),
        box(0.11, 0.055, 0.08, 0.01, 'wall'),
        // Inca doorways are trapezoids, narrower at the top: a stepped panel.
        panel(0.024, 0.02, 0.01, 0.0405),
        panel(0.018, 0.02, 0.03, 0.0405),
        panel(0.012, 0.012, 0.042, 0.0405, -0.035),
        box(0.112, 0.006, 0.082, 0.04, 'trim'),
        hip(0.078, 0.006, 0.065, 0.065, 'roof', 0, 0, 0.78),
    ];
}

// A kallanka: the long Inca hall, with a row of doorways under one long
// thatch roof.
function kallanka() {
    const parts = [
        box(0.21, 0.012, 0.1, 0, 'stone'),
        box(0.19, 0.055, 0.07, 0.012, 'wall'),
        hip(0.106, 0.012, 0.055, 0.067, 'roof', 0, 0, 0.44),
    ];
    for (const x of [-0.066, -0.022, 0.022, 0.066]) {
        parts.push(panel(0.018, 0.018, 0.012, 0.0355, x));
        parts.push(panel(0.013, 0.014, 0.03, 0.0355, x));
    }
    return parts;
}

// Farming terraces climbing a slope, with a little storehouse on top.
function terraces() {
    const parts = [
        box(0.2, 0.03, 0.16, 0, 'stone'),
        box(0.196, 0.006, 0.156, 0.03, 'wall'),
        box(0.16, 0.03, 0.12, 0.03, 'stone', 0, -0.012),
        box(0.156, 0.006, 0.116, 0.06, 'wall', 0, -0.012),
        box(0.12, 0.03, 0.08, 0.06, 'stone', 0, -0.024),
        box(0.116, 0.006, 0.076, 0.09, 'wall', 0, -0.024),
        box(0.05, 0.036, 0.04, 0.09, 'wall', 0, -0.03),
        panel(0.014, 0.022, 0.09, -0.0098),
        hip(0.036, 0.004, 0.04, 0.126, 'roof', 0, -0.03, 0.8),
    ];
    // Stone steps up the middle of the terraces.
    for (let k = 0; k < 3; k++) parts.push(box(0.022, 0.012, 0.012, 0.018 + k * 0.03, 'trim', 0, 0.074 - k * 0.02));
    return parts;
}

// A stone gateway with a trapezoid opening, like the Inti Punku (Sun Gate),
// with a gold sun disc for Inti above it.
function sunGate() {
    return [
        box(0.17, 0.012, 0.07, 0, 'stone'),
        box(0.04, 0.1, 0.05, 0.012, 'wall', -0.05),
        box(0.04, 0.1, 0.05, 0.012, 'wall', 0.05),
        box(0.012, 0.09, 0.004, 0.012, 'dark', -0.024, 0.0),
        box(0.012, 0.09, 0.004, 0.012, 'dark', 0.024, 0.0),
        box(0.04, 0.1, 0.004, 0.012, 'dark', 0, -0.004),
        box(0.15, 0.024, 0.056, 0.112, 'roof'),
        box(0.07, 0.016, 0.04, 0.136, 'wall'),
        disc(0.026, 0.178, 0, 0, 'gold'),
    ];
}

// A hilltop fortress of zigzag stone terraces (like Sacsayhuaman) with a
// round tower and a thatch cone on top.
function incaFortress() {
    const parts = [
        hip(0.115, 0.105, 0.035, 0, 'stone', 0, 0, 0.85),
        hip(0.095, 0.085, 0.035, 0.035, 'stone', 0, 0, 0.85),
        hip(0.075, 0.066, 0.035, 0.07, 'stone', 0, 0, 0.85),
        post(0.032, 0.07, 0.105, 0, 0, 'wall'),
        cone(0.046, 0.06, 0.175),
        panel(0.014, 0.024, 0.105, 0.0325),
        panel(0.01, 0.01, 0.145, 0.0325),
        panel(0.02, 0.026, 0, 0.098),
    ];
    // The zigzag: salients jutting out of each terrace.
    for (const [y, z, xs] of [[0, 0.096, [-0.075, -0.035, 0.035, 0.075]], [0.035, 0.079, [-0.055, 0, 0.055]], [0.07, 0.062, [-0.04, 0.04]]]) {
        for (const x of xs) parts.push(box(0.018, 0.033, 0.014, y, 'wall', x, z));
    }
    return parts;
}

// ---- Mughal India -------------------------------------------------------

// A chhatri: an open domed pavilion on four pillars.
function chhatri() {
    const parts = [box(0.14, 0.02, 0.14, 0, 'stone'), box(0.08, 0.003, 0.08, 0.02, 'dark')];
    for (const x of [-0.045, 0.045]) for (const z of [-0.045, 0.045]) parts.push(post(0.007, 0.06, 0.02, x, z, 'trim'));
    parts.push(box(0.122, 0.014, 0.122, 0.08, 'wall'));
    parts.push(box(0.132, 0.004, 0.132, 0.094, 'trim'));
    parts.push(dome(0.05, 0.055, 0.098, 0, 0, 'roof', true));
    parts.push(post(0.004, 0.022, 0.153, 0, 0, 'gold'));
    return parts;
}

// A haveli: a town mansion with carved jharokha balconies and little domed
// kiosks on the roof.
function haveli() {
    const parts = [
        box(0.16, 0.01, 0.12, 0, 'stone'),
        box(0.15, 0.075, 0.1, 0.01, 'wall'),
        box(0.154, 0.01, 0.104, 0.085, 'roof'),
        panel(0.024, 0.036, 0.01, 0.0505),
    ];
    for (const x of [-0.045, 0.045]) {
        // Jharokha: a projecting window with its own little roof.
        parts.push(box(0.03, 0.022, 0.012, 0.045, 'trim', x, 0.056));
        parts.push(panel(0.02, 0.014, 0.049, 0.0625, x));
        parts.push(dome(0.017, 0.014, 0.067, x, 0.056, 'roof'));
    }
    for (const x of [-0.055, 0.055]) {
        for (const dx of [-0.012, 0.012]) parts.push(post(0.003, 0.022, 0.095, x + dx, 0, 'trim'));
        parts.push(dome(0.017, 0.022, 0.117, x, 0, 'roof', true));
    }
    return parts;
}

// A minaret: a tapering tower ringed with balconies, a small cupola on top.
function minaret() {
    return [
        box(0.08, 0.016, 0.08, 0, 'stone'),
        post(0.03, 0.14, 0.016, 0, 0, 'wall', 0.021),
        post(0.037, 0.008, 0.07, 0, 0, 'trim'),
        post(0.031, 0.008, 0.126, 0, 0, 'trim'),
        panel(0.014, 0.026, 0.016, 0.031),
        panel(0.008, 0.012, 0.09, 0.027),
        post(0.004, 0.02, 0.156, 0.012, 0.012, 'trim'),
        post(0.004, 0.02, 0.156, -0.012, -0.012, 'trim'),
        post(0.004, 0.02, 0.156, 0.012, -0.012, 'trim'),
        post(0.004, 0.02, 0.156, -0.012, 0.012, 'trim'),
        dome(0.024, 0.026, 0.176, 0, 0, 'roof', true),
        post(0.003, 0.014, 0.202, 0, 0, 'gold'),
    ];
}

// A darwaza: a great gateway with a tall pointed arch and domed corner kiosks.
function darwaza() {
    const parts = [
        box(0.18, 0.012, 0.08, 0, 'stone'),
        box(0.16, 0.1, 0.06, 0.012, 'wall'),
        box(0.05, 0.075, 0.004, 0.012, 'dark', 0, 0.031),
        box(0.03, 0.012, 0.004, 0.087, 'dark', 0, 0.031),
        box(0.064, 0.096, 0.006, 0.012, 'trim', 0, 0.0295),
        box(0.164, 0.01, 0.064, 0.112, 'roof'),
    ];
    for (const x of [-0.072, 0.072]) {
        parts.push(post(0.013, 0.122, 0.012, x, 0.024, 'wall'));
        parts.push(dome(0.016, 0.024, 0.134, x, 0.024, 'roof', true));
        parts.push(post(0.003, 0.01, 0.158, x, 0.024, 'gold'));
    }
    for (const x of [-0.03, 0, 0.03]) parts.push(dome(0.011, 0.012, 0.122, x, 0, 'roof'));
    return parts;
}

// A garden tomb: a white hall on a broad plinth under a great onion dome,
// four minarets at the corners. The tallest building in the Mughal lands.
function mughalTomb() {
    const parts = [
        box(0.2, 0.025, 0.2, 0, 'stone'),
        box(0.12, 0.08, 0.12, 0.025, 'wall'),
        box(0.034, 0.056, 0.004, 0.025, 'dark', 0, 0.061),
        box(0.046, 0.068, 0.004, 0.025, 'trim', 0, 0.0605),
        panel(0.014, 0.02, 0.04, 0.061, -0.04),
        panel(0.014, 0.02, 0.04, 0.061, 0.04),
        panel(0.014, 0.016, 0.075, 0.061, -0.04),
        panel(0.014, 0.016, 0.075, 0.061, 0.04),
        post(0.04, 0.02, 0.105, 0, 0, 'wall'),
        dome(0.054, 0.085, 0.125, 0, 0, 'roof', true),
        post(0.004, 0.028, 0.208, 0, 0, 'gold'),
    ];
    for (const x of [-0.045, 0.045]) for (const z of [-0.045, 0.045]) parts.push(dome(0.014, 0.016, 0.105, x, z, 'roof', true));
    for (const x of [-0.088, 0.088]) {
        for (const z of [-0.088, 0.088]) {
            parts.push(post(0.009, 0.13, 0.025, x, z, 'wall', 0.007));
            parts.push(dome(0.011, 0.016, 0.155, x, z, 'roof', true));
        }
    }
    return parts;
}

// ---- The Nordic lands ---------------------------------------------------

// A longhouse with a turf roof, the farm hall of the Norse.
function longhouse() {
    return [
        box(0.2, 0.01, 0.1, 0, 'stone'),
        box(0.18, 0.05, 0.08, 0.01, 'wall'),
        panel(0.022, 0.034, 0.01, 0.0405),
        panel(0.012, 0.01, 0.04, 0.0405, -0.055),
        panel(0.012, 0.01, 0.04, 0.0405, 0.055),
        box(0.004, 0.05, 0.004, 0.01, 'trim', -0.02, 0.041),
        box(0.004, 0.05, 0.004, 0.01, 'trim', 0.02, 0.041),
        hip(0.102, 0.014, 0.065, 0.058, 'roof', 0, 0, 0.5),
    ];
}

// A log cabin with a steep roof and a stone chimney.
function logCabin() {
    const parts = [
        box(0.13, 0.01, 0.11, 0, 'stone'),
        box(0.1, 0.055, 0.08, 0.01, 'wall'),
        panel(0.02, 0.034, 0.01, 0.0405),
        panel(0.014, 0.012, 0.035, 0.0405, 0.03),
        hip(0.066, 0.006, 0.066, 0.063, 'roof', 0, 0, 0.88),
        box(0.016, 0.07, 0.016, 0.063, 'stone', -0.03, -0.018),
    ];
    // The ends of the logs at the corners.
    for (const y of [0.02, 0.034, 0.048]) for (const x of [-0.05, 0.05]) parts.push(box(0.008, 0.006, 0.084, y, 'trim', x, 0));
    return parts;
}

// A stave church: tier on tier of steep shingle roofs, like Borgund, with
// carved dragon heads on the gables.
function staveChurch() {
    const parts = [
        box(0.13, 0.01, 0.13, 0, 'stone'),
        box(0.1, 0.04, 0.1, 0.01, 'wall'),
        panel(0.02, 0.03, 0.01, 0.0505),
        hip(0.075, 0.05, 0.026, 0.05, 'roof'),
        box(0.07, 0.03, 0.07, 0.076, 'wall'),
        hip(0.054, 0.034, 0.024, 0.106, 'roof'),
        box(0.044, 0.024, 0.044, 0.13, 'wall'),
        panel(0.01, 0.01, 0.137, 0.0225),
        hip(0.034, 0.002, 0.044, 0.154, 'roof'),
        post(0.002, 0.012, 0.196, 0, 0, 'gold'),
    ];
    // Dragon heads: little beams curling out of the middle roof's gables.
    for (const s of [-1, 1]) parts.push({ ...box(0.004, 0.026, 0.004, 0, 'trim', s * 0.032, 0), pos: [s * 0.032, 0.133, 0], rot: [0, 0, -s * 0.6] });
    return parts;
}

// A midsummer pole, dressed in leaves with two rings, for the festival.
function midsummerPole() {
    const parts = [
        box(0.06, 0.01, 0.06, 0, 'stone'),
        post(0.008, 0.16, 0.01, 0, 0, 'trim'),
        box(0.1, 0.008, 0.008, 0.13, 'trim'),
        cone(0.012, 0.02, 0.17, 0, 0),
        { ...disc(0.024, 0.1, -0.046, 0, 'roof'), h: 0.006 },
        { ...disc(0.024, 0.1, 0.046, 0, 'roof'), h: 0.006 },
        { ...disc(0.016, 0.1, -0.046, 0.001, 'dark'), h: 0.004 },
        { ...disc(0.016, 0.1, 0.046, 0.001, 'dark'), h: 0.004 },
    ];
    // Leafy garland bands up the pole, and ribbons at the foot.
    for (const y of [0.04, 0.07, 0.1]) parts.push(post(0.012, 0.008, y, 0, 0, 'roof'));
    for (const a of [0, 2.1, 4.2]) parts.push(box(0.004, 0.03, 0.004, 0.01, 'dark', Math.cos(a) * 0.022, Math.sin(a) * 0.022));
    return parts;
}

// A great mead hall: long walls hung with shields under a tall roof, with
// crossed, carved gable ends. The tallest building in the Nordic lands.
function meadHall() {
    const parts = [
        box(0.21, 0.014, 0.12, 0, 'stone'),
        box(0.19, 0.055, 0.1, 0.014, 'wall'),
        panel(0.03, 0.042, 0.014, 0.0505),
        hip(0.108, 0.006, 0.12, 0.069, 'roof', 0, 0, 0.56),
    ];
    for (const x of [-0.07, -0.042, 0.042, 0.07]) parts.push(disc(0.01, 0.045, x, 0.052, 'gold'));
    // Crossed gable boards rising past the ridge at both ends.
    for (const x of [-0.074, 0.074]) {
        for (const s of [-1, 1]) parts.push({ ...box(0.006, 0.05, 0.006, 0, 'trim'), pos: [x + s * 0.008, 0.19, 0], rot: [0, 0, s * 0.45] });
    }
    return parts;
}

// ---- The Maya ------------------------------------------------------------

// A Maya house: round-ended white plastered walls under a steep palm thatch.
function mayaHut() {
    return [
        box(0.13, 0.01, 0.11, 0, 'stone'),
        post(0.046, 0.05, 0.01, 0, 0, 'wall'),
        box(0.06, 0.006, 0.006, 0.03, 'trim', 0, 0.046),
        panel(0.022, 0.034, 0.01, 0.047),
        cone(0.066, 0.075, 0.056),
    ];
}

// A palace range: long and low on a platform, with a row of doorways and a
// stone frieze along the top.
function mayaPalace() {
    const parts = [
        box(0.22, 0.016, 0.12, 0, 'stone'),
        box(0.2, 0.016, 0.1, 0.016, 'stone'),
        box(0.19, 0.05, 0.075, 0.032, 'wall'),
        hip(0.1, 0.088, 0.03, 0.082, 'roof', 0, 0, 0.42),
        box(0.18, 0.016, 0.01, 0.112, 'trim', 0, 0),
    ];
    for (const x of [-0.06, 0, 0.06]) parts.push(panel(0.022, 0.034, 0.032, 0.0385, x));
    for (const x of [-0.07, -0.035, 0.035, 0.07]) parts.push(box(0.012, 0.012, 0.004, 0.092, 'trim', x, 0.04));
    parts.push(box(0.04, 0.016, 0.03, 0, 'stone', 0, 0.07));
    return parts;
}

function steps(levels, y0, z0, w, h, dz, role = 'trim') {
    const out = [];
    for (let k = 0; k < levels; k++) out.push(box(w, h, 0.016, y0 + k * h, role, 0, z0 - k * dz));
    return out;
}

// A temple on a stepped pyramid, with a roof comb on top.
function mayaTemple() {
    return [
        hip(0.1, 0.086, 0.03, 0, 'stone'),
        hip(0.08, 0.066, 0.03, 0.03, 'stone'),
        hip(0.06, 0.046, 0.03, 0.06, 'stone'),
        ...steps(3, 0, 0.09, 0.034, 0.03, 0.02),
        box(0.06, 0.035, 0.05, 0.09, 'wall'),
        panel(0.016, 0.024, 0.09, 0.0255),
        box(0.066, 0.01, 0.056, 0.125, 'roof'),
        box(0.034, 0.03, 0.01, 0.135, 'roof'),
        box(0.008, 0.01, 0.004, 0.148, 'dark', 0, 0.006),
    ];
}

// A ball court: two sloping walls facing across a narrow alley, a stone ring
// high on each wall, a small shrine on top of each.
function ballCourt() {
    const parts = [box(0.2, 0.006, 0.14, 0, 'stone'), box(0.04, 0.002, 0.13, 0.006, 'dark')];
    for (const s of [-1, 1]) {
        const x = s * 0.06;
        parts.push(hip(0.04, 0.026, 0.035, 0.006, 'stone', x, 0, 1.6));
        parts.push(box(0.05, 0.035, 0.12, 0.041, 'wall', x + s * 0.008));
        parts.push(box(0.056, 0.008, 0.126, 0.076, 'roof', x + s * 0.008));
        // The stone ring the ball had to pass through, facing the alley.
        parts.push({ shape: 'post', r: 0.012, rTop: 0.012, h: 0.006, pos: [x - s * 0.018, 0.064, 0], rot: [0, 0, Math.PI / 2], role: 'gold' });
        parts.push(box(0.032, 0.028, 0.03, 0.084, 'wall', x + s * 0.008));
        parts.push(panel(0.012, 0.016, 0.084, 0.0152, x + s * 0.008));
        parts.push(hip(0.022, 0.004, 0.02, 0.112, 'roof', x + s * 0.008));
    }
    return parts;
}

// A great pyramid of five terraces with a stairway up the front and a temple
// under a tall roof comb. The tallest building in the Maya lands.
function mayaPyramid() {
    const parts = [];
    for (let k = 0; k < 5; k++) parts.push(hip(0.11 - k * 0.016, 0.1 - k * 0.016, 0.03, k * 0.03, 'stone'));
    parts.push(...steps(5, 0, 0.1, 0.03, 0.03, 0.016));
    parts.push(box(0.05, 0.036, 0.045, 0.15, 'wall'));
    parts.push(panel(0.016, 0.024, 0.15, 0.023));
    parts.push(box(0.056, 0.01, 0.05, 0.186, 'roof'));
    parts.push(box(0.04, 0.04, 0.012, 0.196, 'roof'));
    for (const x of [-0.01, 0.01]) parts.push(box(0.008, 0.012, 0.004, 0.21, 'dark', x, 0.007));
    return parts;
}

// ---- Persia ----------------------------------------------------------------

// A caravanserai: a walled inn for travellers around a courtyard, with a
// tall iwan (arched portal) at its gate and round corner towers.
function caravanserai() {
    const parts = [
        box(0.17, 0.008, 0.17, 0, 'stone'),
        box(0.15, 0.05, 0.016, 0.008, 'wall', 0, 0.067),
        box(0.15, 0.05, 0.016, 0.008, 'wall', 0, -0.067),
        box(0.016, 0.05, 0.12, 0.008, 'wall', 0.067),
        box(0.016, 0.05, 0.12, 0.008, 'wall', -0.067),
        box(0.06, 0.11, 0.024, 0.008, 'wall', 0, 0.07),
        box(0.064, 0.012, 0.028, 0.118, 'roof', 0, 0.07),
        box(0.03, 0.07, 0.004, 0.008, 'dark', 0, 0.0825),
        box(0.042, 0.082, 0.004, 0.008, 'trim', 0, 0.082),
    ];
    for (const x of [-0.067, 0.067]) {
        for (const z of [-0.067, 0.067]) {
            parts.push(post(0.014, 0.062, 0.008, x, z, 'wall'));
            parts.push(dome(0.014, 0.012, 0.07, x, z, 'roof'));
        }
    }
    return parts;
}

// A house with a badgir: the windcatcher tower that pulls cool air down into
// the rooms, under a low dome.
function badgir() {
    const parts = [
        box(0.14, 0.01, 0.11, 0, 'stone'),
        box(0.12, 0.05, 0.09, 0.01, 'wall'),
        panel(0.02, 0.032, 0.01, 0.0455),
        panel(0.014, 0.014, 0.034, 0.0455, 0.035),
        dome(0.034, 0.022, 0.06, 0.02, 0.01, 'roof'),
        box(0.036, 0.11, 0.036, 0.01, 'wall', -0.04, -0.022),
        box(0.04, 0.01, 0.04, 0.12, 'roof', -0.04, -0.022),
    ];
    // Vent slits high on the windcatcher.
    for (const x of [-0.05, -0.04, -0.03]) parts.push(box(0.005, 0.026, 0.004, 0.088, 'dark', x, -0.0035));
    return parts;
}

// A madrasa hall under a tiled dome, with an iwan portal and two slim towers.
function domeHall() {
    return [
        box(0.15, 0.012, 0.13, 0, 'stone'),
        box(0.13, 0.06, 0.11, 0.012, 'wall'),
        post(0.045, 0.02, 0.072, 0, -0.008, 'trim'),
        dome(0.05, 0.05, 0.092, 0, -0.008, 'roof'),
        post(0.003, 0.016, 0.142, 0, -0.008, 'gold'),
        box(0.06, 0.09, 0.02, 0.012, 'wall', 0, 0.06),
        box(0.064, 0.008, 0.024, 0.102, 'roof', 0, 0.06),
        box(0.03, 0.06, 0.004, 0.012, 'dark', 0, 0.0705),
        box(0.042, 0.072, 0.004, 0.012, 'trim', 0, 0.07),
        post(0.008, 0.112, 0.012, -0.04, 0.062, 'wall'),
        post(0.008, 0.112, 0.012, 0.04, 0.062, 'wall'),
        post(0.01, 0.008, 0.124, -0.04, 0.062, 'roof'),
        post(0.01, 0.008, 0.124, 0.04, 0.062, 'roof'),
    ];
}

// A garden pavilion (talar): a flat roof on slender columns, over a long
// pool, as in the Persian gardens.
function gardenPavilion() {
    const parts = [
        box(0.16, 0.014, 0.12, 0, 'stone'),
        box(0.04, 0.003, 0.05, 0.014, 'dark', 0, 0.034),
    ];
    for (const x of [-0.06, 0, 0.06]) for (const z of [-0.04, 0.04]) parts.push(post(0.006, 0.07, 0.014, x, z, 'trim'));
    parts.push(box(0.15, 0.012, 0.11, 0.084, 'roof'));
    parts.push(box(0.07, 0.03, 0.05, 0.096, 'wall', 0, -0.02));
    parts.push(panel(0.016, 0.02, 0.096, 0.0052));
    parts.push(dome(0.026, 0.022, 0.126, 0, -0.02, 'roof'));
    return parts;
}

// A mud-brick citadel on its hill, like the Arg-e Bam: walls with round
// towers and a tall keep. The tallest building in the Persian lands.
function citadel() {
    const parts = [
        box(0.2, 0.01, 0.2, 0, 'stone'),
        box(0.17, 0.045, 0.012, 0.01, 'wall', 0, 0.08),
        box(0.17, 0.045, 0.012, 0.01, 'wall', 0, -0.08),
        box(0.012, 0.045, 0.16, 0.01, 'wall', 0.08),
        box(0.012, 0.045, 0.16, 0.01, 'wall', -0.08),
        box(0.026, 0.036, 0.004, 0.01, 'dark', 0, 0.0865),
        hip(0.06, 0.045, 0.04, 0.01, 'stone', 0, -0.01),
        box(0.07, 0.12, 0.06, 0.05, 'wall', 0, -0.01),
        box(0.074, 0.012, 0.064, 0.17, 'roof', 0, -0.01),
        box(0.032, 0.04, 0.032, 0.182, 'wall', 0, -0.01),
        box(0.036, 0.01, 0.036, 0.222, 'roof', 0, -0.01),
        panel(0.014, 0.02, 0.08, 0.0205),
        panel(0.014, 0.02, 0.12, 0.0205),
        panel(0.01, 0.012, 0.194, 0.0065),
    ];
    for (const x of [-0.08, 0.08]) {
        for (const z of [-0.08, 0.08]) {
            parts.push(post(0.017, 0.058, 0.01, x, z, 'wall', 0.014));
            parts.push(post(0.017, 0.008, 0.068, x, z, 'roof'));
        }
    }
    return parts;
}

export const CIV_BUILDERS = Object.freeze({
    'sahel-house': sahelHouse,
    granary,
    'mud-tower': mudTower,
    toguna,
    'mud-palace': mudPalace,
    'inca-house': incaHouse,
    kallanka,
    terraces,
    'sun-gate': sunGate,
    'inca-fortress': incaFortress,
    chhatri,
    haveli,
    minaret,
    darwaza,
    'mughal-tomb': mughalTomb,
    longhouse,
    'log-cabin': logCabin,
    'stave-church': staveChurch,
    'midsummer-pole': midsummerPole,
    'mead-hall': meadHall,
    'maya-hut': mayaHut,
    'maya-palace': mayaPalace,
    'maya-temple': mayaTemple,
    'ball-court': ballCourt,
    'maya-pyramid': mayaPyramid,
    caravanserai,
    badgir,
    'dome-hall': domeHall,
    'garden-pavilion': gardenPavilion,
    citadel,
});

// Dome profiles as [radius share, height share] from the rim (0) to the top
// (1). A round dome is a quarter circle; an onion dome swells past its base,
// then draws in to a point.
export function domeProfile(onion = false, steps = 8) {
    if (onion) {
        return [[0.8, 0], [0.95, 0.1], [1, 0.24], [0.94, 0.42], [0.74, 0.6], [0.46, 0.76], [0.22, 0.88], [0.07, 0.96], [0, 1]];
    }
    const out = [];
    for (let i = 0; i <= steps; i++) {
        const t = (i / steps) * (Math.PI / 2);
        out.push([Math.cos(t), Math.sin(t)]);
    }
    out[steps][0] = 0;
    return out;
}
