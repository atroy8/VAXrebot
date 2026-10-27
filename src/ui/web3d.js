// 3D web mode for the in-level network (round 15): people float in space as
// a 3D cloud you can orbit, zoom and tilt. Pure math, no three.js and no DOM,
// unit tested in tests/web3d.test.js. network-view-3d.js wires it up.
//
// Layout: the same idea as force-layout.js (springs on links, repulsion,
// collisions, a pull to the centre, alpha cooling so it always comes to
// rest) but in three dimensions, bounded by a sphere instead of a
// screen-shaped ellipse.
//
// Camera: an orbit view described by a small object:
//   view3d = { yaw, pitch, distance, tx, ty, tz }
// yaw turns around the vertical axis, pitch tilts up or down (clamped so
// the camera never flips), distance is how far the camera sits from the
// target point (tx, ty, tz).

// Item 15 (round 20): more room between people (rest length 3.2 -> 3.8,
// repel 3.4 -> 4.0, collide 1.6 -> 1.9) so lines are easier to see and cut.
export const LAYOUT_3D = Object.freeze({
    restLength: 3.8,
    springK: 0.05,
    repelDist: 4.0,
    repelK: 0.2,
    gravity: 0.014,
    damping: 0.72,
    maxSpeed: 0.6,
    alphaDecay: 0.985,
    alphaMin: 0.01,
    reheatAlpha: 0.3,
    maxRadius: 13,
    collideDist: 1.9,
    collideStrength: 0.7,
});

export const ORBIT = Object.freeze({
    // Radians of turn per pixel of finger travel.
    radPerPx: 0.008,
    maxPitch: (80 * Math.PI) / 180,
    minZoom: 0.35,
    maxZoom: 1.8,
    // Slow drift while the player is not touching and no tool is chosen,
    // so the depth of the web reads at a glance (radians per second).
    driftRadPerS: 0.07,
    // How long after a touch before the drift resumes (ms).
    driftPauseMs: 6000,
});

function nudge(i, j) {
    return {
        x: ((i * 7 + j * 13) % 11) / 11 - 0.5 || 0.3,
        y: ((i * 5 + j * 3) % 7) / 7 - 0.5 || -0.3,
        z: ((i * 3 + j * 11) % 5) / 5 - 0.5 || 0.2,
    };
}

export function resolveOverlaps3d(objs, P = LAYOUT_3D) {
    const n = objs.length;
    const c = P.collideDist;
    let moved = 0;
    for (let i = 0; i < n; i++) {
        const a = objs[i];
        for (let j = i + 1; j < n; j++) {
            const b = objs[j];
            let dx = b.pos.x - a.pos.x;
            let dy = b.pos.y - a.pos.y;
            let dz = b.pos.z - a.pos.z;
            let d = Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (d >= c) continue;
            if (d < 1e-6) {
                ({ x: dx, y: dy, z: dz } = nudge(i, j));
                d = Math.hypot(dx, dy, dz);
            }
            if (a.pinned && b.pinned) continue;
            const push = ((c - d) / d) * 0.5 * P.collideStrength;
            const ka = a.pinned ? 0 : b.pinned ? 2 : 1;
            const kb = b.pinned ? 0 : a.pinned ? 2 : 1;
            a.pos.x -= dx * push * ka;
            a.pos.y -= dy * push * ka;
            a.pos.z -= dz * push * ka;
            b.pos.x += dx * push * kb;
            b.pos.y += dy * push * kb;
            b.pos.z += dz * push * kb;
            moved++;
        }
    }
    return moved;
}

// One integration step in 3D. Returns the fastest node speed after the step.
// Shape the cloud to the view like the flat layout does (layoutForAspect in
// force-layout.js): distances are measured in a stretched space, so on a
// tall phone the web settles into a tall egg that fills the screen instead
// of a small ball. x and z share one scale so turning the web looks the same
// from every side.
export const ASPECT_STRETCH_3D = 0.3;

export function layout3dForAspect(aspect, P = LAYOUT_3D) {
    const a = Math.min(2.2, Math.max(0.45, Number.isFinite(aspect) && aspect > 0 ? aspect : 1));
    return { ...P, scaleX: a ** -ASPECT_STRETCH_3D, scaleY: a ** ASPECT_STRETCH_3D };
}

export function layoutStep3d(objs, pairs, alpha = 1, P = LAYOUT_3D) {
    const n = objs.length;
    const rd2 = P.repelDist * P.repelDist;
    const sx = P.scaleX ?? 1;
    const sy = P.scaleY ?? 1;
    for (let i = 0; i < n; i++) {
        const a = objs[i];
        for (let j = i + 1; j < n; j++) {
            const b = objs[j];
            let dx = (a.pos.x - b.pos.x) * sx;
            let dy = (a.pos.y - b.pos.y) * sy;
            let dz = (a.pos.z - b.pos.z) * sx;
            let d2 = dx * dx + dy * dy + dz * dz;
            if (d2 >= rd2) continue;
            if (d2 < 1e-6) {
                ({ x: dx, y: dy, z: dz } = nudge(i, j));
                d2 = dx * dx + dy * dy + dz * dz;
            }
            const d = Math.sqrt(d2);
            const f = ((P.repelDist - d) * P.repelK * alpha) / d;
            a.vel.x += (dx * f) / sx;
            a.vel.y += (dy * f) / sy;
            a.vel.z += (dz * f) / sx;
            b.vel.x -= (dx * f) / sx;
            b.vel.y -= (dy * f) / sy;
            b.vel.z -= (dz * f) / sx;
        }
    }
    for (const [a, b] of pairs) {
        const dx = (b.pos.x - a.pos.x) * sx;
        const dy = (b.pos.y - a.pos.y) * sy;
        const dz = (b.pos.z - a.pos.z) * sx;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 0.001;
        const f = ((d - P.restLength) * P.springK * alpha) / d;
        a.vel.x += (dx * f) / sx;
        a.vel.y += (dy * f) / sy;
        a.vel.z += (dz * f) / sx;
        b.vel.x -= (dx * f) / sx;
        b.vel.y -= (dy * f) / sy;
        b.vel.z -= (dz * f) / sx;
    }
    resolveOverlaps3d(objs, P);
    let maxSpeed = 0;
    for (const o of objs) {
        if (o.pinned) {
            o.vel.x = 0;
            o.vel.y = 0;
            o.vel.z = 0;
            continue;
        }
        o.vel.x -= o.pos.x * P.gravity * alpha;
        o.vel.y -= o.pos.y * P.gravity * alpha;
        o.vel.z -= o.pos.z * P.gravity * alpha;
        let sp = Math.hypot(o.vel.x, o.vel.y, o.vel.z);
        if (sp > P.maxSpeed) {
            const k = P.maxSpeed / sp;
            o.vel.x *= k;
            o.vel.y *= k;
            o.vel.z *= k;
        }
        o.vel.x *= P.damping;
        o.vel.y *= P.damping;
        o.vel.z *= P.damping;
        o.pos.x += o.vel.x;
        o.pos.y += o.vel.y;
        o.pos.z += o.vel.z;
        // Bounded by an egg shaped like the view (a sphere when unstretched).
        const r = Math.hypot(o.pos.x * sx, o.pos.y * sy, o.pos.z * sx) / P.maxRadius;
        if (r > 1) {
            o.pos.x /= r;
            o.pos.y /= r;
            o.pos.z /= r;
            o.vel.x = 0;
            o.vel.y = 0;
            o.vel.z = 0;
        }
        sp = Math.hypot(o.vel.x, o.vel.y, o.vel.z);
        if (sp > maxSpeed) maxSpeed = sp;
    }
    return maxSpeed;
}

export function nextAlpha3d(alpha, P = LAYOUT_3D) {
    const a = alpha * P.alphaDecay;
    return a < P.alphaMin ? 0 : a;
}

export function settleLayout3d(objs, pairs, { alpha = 1, maxSteps = 400, P = LAYOUT_3D } = {}) {
    let steps = 0;
    let speed = 0;
    while (alpha > 0 && steps < maxSteps) {
        speed = layoutStep3d(objs, pairs, alpha, P);
        alpha = nextAlpha3d(alpha, P);
        steps++;
    }
    return { steps, alpha, speed };
}

// Smallest centre-to-centre distance between any two nodes, in 3D.
export function minSpacing3d(objs) {
    let md = Infinity;
    for (let i = 0; i < objs.length; i++) {
        for (let j = i + 1; j < objs.length; j++) {
            const a = objs[i].pos;
            const b = objs[j].pos;
            md = Math.min(md, Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z));
        }
    }
    return md;
}

// Lift a flat layout into 3D: keep x and y, give each person a depth so the
// web starts as a thick disc and relaxes into a cloud. Deterministic.
export function liftTo3d(objs, depth = 4) {
    objs.forEach((o, i) => {
        const t = Math.sin(i * 12.9898) * 43758.5453;
        o.pos.z = ((t - Math.floor(t)) - 0.5) * 2 * depth;
    });
}

export function flattenTo2d(objs) {
    for (const o of objs) {
        o.pos.z = 0;
        o.vel.z = 0;
    }
}

// ---- Orbit camera ----------------------------------------------------------

// Camera position for an orbit view.
export function orbitPosition(view) {
    const cp = Math.cos(view.pitch);
    return {
        x: view.tx + view.distance * cp * Math.sin(view.yaw),
        y: view.ty + view.distance * Math.sin(view.pitch),
        z: view.tz + view.distance * cp * Math.cos(view.yaw),
    };
}

// Unit vector from the target toward the camera.
export function viewDirection(view) {
    const cp = Math.cos(view.pitch);
    return { x: cp * Math.sin(view.yaw), y: Math.sin(view.pitch), z: cp * Math.cos(view.yaw) };
}

export function clampPitch(p) {
    return Math.max(-ORBIT.maxPitch, Math.min(ORBIT.maxPitch, p));
}

// One finger drag on empty space orbits: drag right turns the web right,
// drag down tilts it toward you.
export function orbitDrag(view, dxPx, dyPx) {
    return { ...view, yaw: view.yaw - dxPx * ORBIT.radPerPx, pitch: clampPitch(view.pitch + dyPx * ORBIT.radPerPx) };
}

// Zoom by a factor (>1 zooms in), clamped around the fitted distance.
export function zoom3d(view, factor, fitDistance) {
    let d = view.distance / factor;
    if (fitDistance) d = Math.max(fitDistance * ORBIT.minZoom, Math.min(fitDistance * ORBIT.maxZoom, d));
    return { ...view, distance: d };
}

// Fitted view: centre on the cloud and back off until its bounding sphere
// fits the narrower screen direction. Keeps the current yaw and pitch.
// Fitted view: centre on the cloud and back off just far enough that every
// person (plus pad) is on screen, seen from the current yaw and pitch.
export function fitOrbit(points, { fovDeg = 48, aspect = 1, pad = 1.2, yaw = 0, pitch = 0.25 } = {}) {
    if (!points.length) return { yaw, pitch, distance: 20, tx: 0, ty: 0, tz: 0 };
    let tx = 0;
    let ty = 0;
    let tz = 0;
    for (const p of points) {
        tx += p.x;
        ty += p.y;
        tz += p.z;
    }
    tx /= points.length;
    ty /= points.length;
    tz /= points.length;
    // Camera basis: f points from the target toward the camera.
    const f = viewDirection({ yaw, pitch });
    const right = { x: Math.cos(yaw), y: 0, z: -Math.sin(yaw) };
    const up = { x: f.y * right.z - f.z * right.y, y: f.z * right.x - f.x * right.z, z: f.x * right.y - f.y * right.x };
    const tanV = Math.tan((fovDeg * Math.PI) / 360);
    const tanH = tanV * Math.max(0.2, aspect);
    let distance = 0;
    for (const p of points) {
        const dx = p.x - tx;
        const dy = p.y - ty;
        const dz = p.z - tz;
        const fw = dx * f.x + dy * f.y + dz * f.z;
        const rr = Math.abs(dx * right.x + dy * right.y + dz * right.z) + pad;
        const uu = Math.abs(dx * up.x + dy * up.y + dz * up.z) + pad;
        distance = Math.max(distance, fw + Math.max(rr / tanH, uu / tanV));
    }
    return { yaw, pitch, distance: Math.max(distance, 4), tx, ty, tz };
}

// Rotation-free fallback: the bounding sphere fits the narrower direction.
export function fitOrbitSphere(points, { fovDeg = 48, aspect = 1, pad = 1.2, yaw = 0, pitch = 0.25 } = {}) {
    if (!points.length) return { yaw, pitch, distance: 20, tx: 0, ty: 0, tz: 0 };
    let tx = 0;
    let ty = 0;
    let tz = 0;
    for (const p of points) {
        tx += p.x;
        ty += p.y;
        tz += p.z;
    }
    tx /= points.length;
    ty /= points.length;
    tz /= points.length;
    let r = 0;
    for (const p of points) r = Math.max(r, Math.hypot(p.x - tx, p.y - ty, p.z - tz));
    r += pad;
    const vHalf = (fovDeg * Math.PI) / 360;
    const hHalf = Math.atan(Math.tan(vHalf) * Math.max(0.2, aspect));
    const half = Math.min(vHalf, hHalf);
    return { yaw, pitch, distance: r / Math.sin(half), tx, ty, tz };
}

// Ease one orbit view toward another (target and distance; angles stay).
export function easeOrbit(view, goal, rate = 0.15) {
    return {
        ...view,
        tx: view.tx + (goal.tx - view.tx) * rate,
        ty: view.ty + (goal.ty - view.ty) * rate,
        tz: view.tz + (goal.tz - view.tz) * rate,
        distance: view.distance + (goal.distance - view.distance) * rate,
    };
}

// Half width offset for a link ribbon that always faces the camera: the
// cross product of the link direction and the direction to the camera.
export function ribbonOffset(a, b, camPos, halfWidth) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dz = b.z - a.z;
    const mx = (a.x + b.x) / 2 - camPos.x;
    const my = (a.y + b.y) / 2 - camPos.y;
    const mz = (a.z + b.z) / 2 - camPos.z;
    let ox = dy * mz - dz * my;
    let oy = dz * mx - dx * mz;
    let oz = dx * my - dy * mx;
    const len = Math.hypot(ox, oy, oz);
    if (len < 1e-9) return { x: halfWidth, y: 0, z: 0 };
    const k = halfWidth / len;
    return { x: ox * k, y: oy * k, z: oz * k };
}

// Depth from 0 (nearest person) to 1 (farthest), for tap tie-breaks and fog.
export function normalizedDepths(distances) {
    let lo = Infinity;
    let hi = -Infinity;
    for (const d of distances) {
        if (d < lo) lo = d;
        if (d > hi) hi = d;
    }
    const span = hi - lo || 1;
    return distances.map((d) => (d - lo) / span);
}

// Saved choice of view, per device. Item 21 (round 24): the flat 2D web is
// the default, because it is easier to read and tap on a phone. 3D stays one
// tap away on the 2D/3D switch, and a saved 3D choice is kept.
export const VIEW_MODE_KEY = 'galactic-outbreak.view-3d.v1';
export const DEFAULT_VIEW_MODE = '2d';

export function loadViewMode(storage) {
    try {
        const v = storage?.getItem(VIEW_MODE_KEY);
        return v === '3d' || v === '2d' ? v : DEFAULT_VIEW_MODE;
    } catch {
        return DEFAULT_VIEW_MODE;
    }
}

export function saveViewMode(storage, mode) {
    try {
        storage?.setItem(VIEW_MODE_KEY, mode === '2d' ? '2d' : '3d');
    } catch {
        /* storage blocked: the choice lasts for this session only */
    }
}

// ---- Opening view (round 16) ------------------------------------------------

// Yaw that turns the web so the given people (usually the sick ones) face
// the camera: the orbit camera sits on the side of the cloud where they are,
// so they are in front of everyone else instead of hidden at the back.
// focus: [{x, y, z}] the people to show; all: [{x, y, z}] the whole cloud.
// Returns the current yaw when there is nothing to turn toward.
export function yawToward(focus, all, fallbackYaw = 0) {
    if (!focus.length || !all.length) return fallbackYaw;
    let cx = 0;
    let cz = 0;
    for (const p of all) {
        cx += p.x;
        cz += p.z;
    }
    cx /= all.length;
    cz /= all.length;
    let fx = 0;
    let fz = 0;
    for (const p of focus) {
        fx += p.x - cx;
        fz += p.z - cz;
    }
    // Sick people right on the vertical axis: any yaw shows them equally.
    if (Math.hypot(fx, fz) < 1e-6) return fallbackYaw;
    // viewDirection(yaw) = (sin yaw, ., cos yaw) points from the centre
    // toward the camera, so match it to the focus direction.
    return Math.atan2(fx, fz);
}

// ---- Person size on a phone (item 14, round 20) ---------------------------
// Every person must be at least 44 px wide on a 390 px phone, even the one
// at the back of the web. People grow (faces, spheres, rings, badges) until
// the farthest one is MIN_PERSON_PX wide on screen; the layout keeps them
// from overlapping by growing the collision distance with them.
export const MIN_PERSON_PX = 46;
export const MAX_PERSON_SCALE = 4;

// On-screen width in CSS px of something `worldSize` wide at `depth` in
// front of a perspective camera with vertical field of view fovDeg.
export function personPx(worldSize, depth, heightPx, fovDeg) {
    const tanV = Math.tan((fovDeg * Math.PI) / 360);
    return (worldSize * heightPx) / (2 * Math.max(1e-6, depth) * tanV);
}

// Depth of the farthest point the web can turn to, from the orbit camera:
// the camera distance plus the web's radius around the target. Turning the
// web never puts anyone farther back than this.
export function backDepth(points, view) {
    let r = 0;
    for (const p of points) r = Math.max(r, Math.hypot(p.x - view.tx, p.y - view.ty, (p.z || 0) - (view.tz || 0)));
    return view.distance + r;
}

// Scale factor for people so that one `faceWorld` wide at `depth` is at
// least minPx on screen. Never shrinks people (minimum 1).
export function personScaleFor({ faceWorld, depth, heightPx, fovDeg, minPx = MIN_PERSON_PX, max = MAX_PERSON_SCALE }) {
    if (!(heightPx > 0) || !(depth > 0)) return 1;
    const px = personPx(faceWorld, depth, heightPx, fovDeg);
    return Math.min(max, Math.max(1, minPx / px));
}

// Layout parameters for people drawn `scale` times their base size: the
// collision distance grows with them (so faces rarely overlap), springs and
// repulsion grow a little so lines between big faces stay visible. Growing
// spacing as fast as people would only push the camera back and shrink
// everyone again, so spacing grows slower than faces.
export function layoutForPersonScale(P, scale = 1) {
    const s = Math.max(1, scale);
    return {
        ...P,
        collideDist: P.collideDist * (1 + 0.6 * (s - 1)),
        restLength: P.restLength * (1 + 0.25 * (s - 1)),
        repelDist: P.repelDist * (1 + 0.25 * (s - 1)),
        maxRadius: P.maxRadius * s,
    };
}
