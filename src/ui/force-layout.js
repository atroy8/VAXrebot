// Force layout for the in-level network, as pure math on { pos, vel }
// objects with x, y, z fields (three.js Vector3 works, so do plain objects).
// No three.js import, no DOM, so it is unit tested in tests/force-layout.test.js.
//
// Why this exists: the old per-frame layout used a repulsion constant so
// stiff that dense networks never settled. Every node vibrated at the speed
// cap forever (about 20 px per frame on a phone), so taps often landed on
// the wrong person or on empty space. This version keeps the same look
// (similar spacing) but is stable, and it cools down like d3-force: forces
// are scaled by an alpha that decays each step, so the layout always comes
// to rest. Topology changes (a severed link) reheat it gently.

export const LAYOUT = Object.freeze({
    restLength: 3.0,
    springK: 0.05,
    repelDist: 3.0,
    repelK: 0.22,
    gravity: 0.012,
    damping: 0.72,
    maxSpeed: 0.6,
    alphaDecay: 0.985,
    alphaMin: 0.01,
    reheatAlpha: 0.3,
    maxRadius: 15,
    // Nodes are 1.1 units wide; keep centres at least this far apart so no
    // two people overlap and every one stays tappable.
    collideDist: 1.6,
    collideStrength: 0.7,
});

// One integration step. `pairs` is an array of [a, b] objects (the two ends
// of each active link). Returns the fastest node speed after the step.
export function layoutStep(objs, pairs, alpha = 1, P = LAYOUT) {
    const n = objs.length;
    const rd2 = P.repelDist * P.repelDist;
    // Springs and repulsion measure distance in a stretched space (see
    // layoutForAspect), so the network settles into the screen's shape.
    const sx = P.scaleX ?? 1;
    const sy = P.scaleY ?? 1;
    for (let i = 0; i < n; i++) {
        const a = objs[i];
        for (let j = i + 1; j < n; j++) {
            const b = objs[j];
            let dx = (a.pos.x - b.pos.x) * sx;
            let dy = (a.pos.y - b.pos.y) * sy;
            let d2 = dx * dx + dy * dy;
            if (d2 >= rd2) continue;
            if (d2 < 1e-6) {
                // Exactly on top of each other: nudge apart deterministically.
                dx = ((i * 7 + j * 13) % 11) / 11 - 0.5 || 0.3;
                dy = ((i * 5 + j * 3) % 7) / 7 - 0.5 || -0.3;
                d2 = dx * dx + dy * dy;
            }
            const d = Math.sqrt(d2);
            const f = ((P.repelDist - d) * P.repelK * alpha) / d;
            a.vel.x += (dx * f) / sx;
            a.vel.y += (dy * f) / sy;
            b.vel.x -= (dx * f) / sx;
            b.vel.y -= (dy * f) / sy;
        }
    }
    for (const [a, b] of pairs) {
        const dx = (b.pos.x - a.pos.x) * sx;
        const dy = (b.pos.y - a.pos.y) * sy;
        const d = Math.sqrt(dx * dx + dy * dy) || 0.001;
        const f = ((d - P.restLength) * P.springK * alpha) / d;
        a.vel.x += (dx * f) / sx;
        a.vel.y += (dy * f) / sy;
        b.vel.x -= (dx * f) / sx;
        b.vel.y -= (dy * f) / sy;
    }
    let maxSpeed = 0;
    // Collision: a direct position correction (like d3.forceCollide), which
    // stays stable however crowded a hub gets. Runs even at alpha 0 only if
    // something overlaps, so a cooled layout never drifts.
    resolveOverlaps(objs, P);
    const rx = P.maxRadius / sx;
    const ry = P.maxRadius / sy;
    for (const o of objs) {
        // A person held under the player's finger stays exactly there; the
        // springs pull their contacts along, so the network stretches.
        if (o.pinned) {
            o.vel.x = 0;
            o.vel.y = 0;
            o.vel.z = 0;
            o.pos.z = 0;
            continue;
        }
        o.vel.x -= o.pos.x * P.gravity * alpha;
        o.vel.y -= o.pos.y * P.gravity * alpha;
        o.vel.z = 0;
        o.pos.z = 0;
        let sp = Math.hypot(o.vel.x, o.vel.y);
        if (sp > P.maxSpeed) {
            o.vel.x *= P.maxSpeed / sp;
            o.vel.y *= P.maxSpeed / sp;
        }
        o.vel.x *= P.damping;
        o.vel.y *= P.damping;
        o.pos.x += o.vel.x;
        o.pos.y += o.vel.y;
        // Keep everyone inside an ellipse shaped like the screen.
        const r = Math.hypot(o.pos.x / rx, o.pos.y / ry);
        if (r > 1) {
            o.pos.x /= r;
            o.pos.y /= r;
            o.vel.x = 0;
            o.vel.y = 0;
        }
        sp = Math.hypot(o.vel.x, o.vel.y);
        if (sp > maxSpeed) maxSpeed = sp;
    }
    return maxSpeed;
}

// Shape the layout to the screen. Left alone the network settles into a
// circle, so on a tall phone it was only as big as the screen is wide, with
// empty space above and below and small, crowded people. Measuring distance
// in a stretched space makes it settle into an ellipse shaped like the view,
// so the camera zooms in and every person is bigger and easier to tap.
// Collisions still use real distance, so people never overlap.
// aspect = view width / view height (about 0.6 on a portrait phone).
export const ASPECT_STRETCH = 0.5;

export function layoutForAspect(aspect, P = LAYOUT) {
    const a = Math.min(2.2, Math.max(0.45, Number.isFinite(aspect) && aspect > 0 ? aspect : 1));
    return { ...P, scaleX: a ** -ASPECT_STRETCH, scaleY: a ** ASPECT_STRETCH };
}

export function resolveOverlaps(objs, P = LAYOUT) {
    const n = objs.length;
    const c = P.collideDist;
    let moved = 0;
    for (let i = 0; i < n; i++) {
        const a = objs[i];
        for (let j = i + 1; j < n; j++) {
            const b = objs[j];
            let dx = b.pos.x - a.pos.x;
            let dy = b.pos.y - a.pos.y;
            let d = Math.sqrt(dx * dx + dy * dy);
            if (d >= c) continue;
            if (d < 1e-6) {
                dx = 0.5;
                dy = ((i + j) % 2 ? 0.3 : -0.3);
                d = Math.hypot(dx, dy);
            }
            if (a.pinned && b.pinned) continue;
            const push = ((c - d) / d) * 0.5 * P.collideStrength;
            // A held person does not get pushed; the other one moves twice as far.
            const ka = a.pinned ? 0 : b.pinned ? 2 : 1;
            const kb = b.pinned ? 0 : a.pinned ? 2 : 1;
            a.pos.x -= dx * push * ka;
            a.pos.y -= dy * push * ka;
            b.pos.x += dx * push * kb;
            b.pos.y += dy * push * kb;
            moved++;
        }
    }
    return moved;
}

// Smallest centre-to-centre distance between any two nodes.
export function minSpacing(objs) {
    let md = Infinity;
    for (let i = 0; i < objs.length; i++) {
        for (let j = i + 1; j < objs.length; j++) {
            md = Math.min(md, Math.hypot(objs[i].pos.x - objs[j].pos.x, objs[i].pos.y - objs[j].pos.y));
        }
    }
    return md;
}

export function nextAlpha(alpha, P = LAYOUT) {
    const a = alpha * P.alphaDecay;
    return a < P.alphaMin ? 0 : a;
}

// Runs the layout until it cools (alpha reaches 0) or maxSteps. Used for the
// warm-up before the first frame so the network appears already arranged.
export function settleLayout(objs, pairs, { alpha = 1, maxSteps = 400, P = LAYOUT } = {}) {
    let steps = 0;
    let speed = 0;
    while (alpha > 0 && steps < maxSteps) {
        speed = layoutStep(objs, pairs, alpha, P);
        alpha = nextAlpha(alpha, P);
        steps++;
    }
    return { steps, alpha, speed };
}
