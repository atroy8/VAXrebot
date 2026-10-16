// Touch and mouse gestures for the in-level network: pure math, no three.js
// and no DOM, so it is unit tested in tests/network-gestures.test.js.
//
// The network is a flat diagram seen by a camera looking straight down, so
// the view is a 2D similarity transform described by a small object:
//   view = { cx, cy, distance, roll }
// cx, cy: the world point at the centre of the screen.
// distance: camera height (bigger = zoomed out).
// roll: how far the network is turned, in radians (positive = clockwise on
// screen).
//
// Gestures (see network-view-3d.js for the wiring):
// - One finger on a person, then move: drag that person. Their contacts are
//   pulled along by the layout springs, so the network stretches.
// - One finger on empty space: pan.
// - Two fingers: pinch to zoom, twist to rotate, move together to pan.
// - Mouse: drag a person or pan, wheel to zoom, right-drag or shift-drag to
//   rotate.
// - A quick tap without moving still uses the selected tool.

export const GESTURE = Object.freeze({
    // Finger travel before a press counts as a drag rather than a tap.
    dragStartPx: 10,
    // How close to a person a press must start to grab them.
    grabReachPx: 26,
    // Zoom limits relative to the distance that fits the whole network.
    minZoom: 0.3,
    maxZoom: 1.8,
});

// Pixels per world unit at the screen centre for a straight-down camera.
export function pixelsPerUnit(view, { heightPx, fovDeg }) {
    const t = Math.tan((fovDeg * Math.PI) / 360);
    return heightPx / 2 / (view.distance * t);
}

// World point (x, y on the z = 0 plane) to screen pixels inside the view box.
export function worldToScreen(p, view, box) {
    const k = pixelsPerUnit(view, box);
    const dx = p.x - view.cx;
    const dy = p.y - view.cy;
    const c = Math.cos(view.roll);
    const s = Math.sin(view.roll);
    // Rotate the world by -roll in world space (y up), which reads as a
    // clockwise turn on screen (y down) for positive roll.
    const rx = dx * c + dy * s;
    const ry = -dx * s + dy * c;
    return { x: box.widthPx / 2 + rx * k, y: box.heightPx / 2 - ry * k };
}

export function screenToWorld(pt, view, box) {
    const k = pixelsPerUnit(view, box);
    const rx = (pt.x - box.widthPx / 2) / k;
    const ry = -(pt.y - box.heightPx / 2) / k;
    const c = Math.cos(view.roll);
    const s = Math.sin(view.roll);
    return { x: view.cx + rx * c - ry * s, y: view.cy + rx * s + ry * c };
}

// Camera up vector for a given roll, to match worldToScreen.
export function cameraUp(roll) {
    return { x: -Math.sin(roll), y: Math.cos(roll) };
}

// Shift the view so the world point that was under `before` (screen px)
// ends up under `after`. This is what makes a pan stick to the finger.
export function panView(view, before, after, box) {
    const a = screenToWorld(before, view, box);
    const b = screenToWorld(after, view, box);
    return { ...view, cx: view.cx + (a.x - b.x), cy: view.cy + (a.y - b.y) };
}

// Two-finger gesture from finger positions on the previous and current
// frame: zoom by the change in spread, rotate by the change in angle, and
// pan with the midpoint, all anchored so the content stays under the fingers.
export function twoFingerView(view, prevA, prevB, curA, curB, box, limits = {}) {
    const spread0 = Math.hypot(prevB.x - prevA.x, prevB.y - prevA.y);
    const spread1 = Math.hypot(curB.x - curA.x, curB.y - curA.y);
    const ang0 = Math.atan2(prevB.y - prevA.y, prevB.x - prevA.x);
    const ang1 = Math.atan2(curB.y - curA.y, curB.x - curA.x);
    const mid0 = { x: (prevA.x + prevB.x) / 2, y: (prevA.y + prevB.y) / 2 };
    const mid1 = { x: (curA.x + curB.x) / 2, y: (curA.y + curB.y) / 2 };
    const anchor = screenToWorld(mid0, view, box);

    let dAng = ang1 - ang0;
    if (dAng > Math.PI) dAng -= 2 * Math.PI;
    if (dAng < -Math.PI) dAng += 2 * Math.PI;
    const scale = spread0 > 1 && spread1 > 1 ? spread1 / spread0 : 1;

    let next = { ...view, distance: clampDistance(view.distance / scale, limits), roll: wrapAngle(view.roll + dAng) };
    // Put the anchor back under the new midpoint.
    const now = screenToWorld(mid1, next, box);
    next = { ...next, cx: next.cx + (anchor.x - now.x), cy: next.cy + (anchor.y - now.y) };
    return next;
}

// Zoom (wheel or trackpad) by a factor around a screen point.
export function zoomAt(view, pt, factor, box, limits = {}) {
    const anchor = screenToWorld(pt, view, box);
    let next = { ...view, distance: clampDistance(view.distance / factor, limits) };
    const now = screenToWorld(pt, next, box);
    next = { ...next, cx: next.cx + (anchor.x - now.x), cy: next.cy + (anchor.y - now.y) };
    return next;
}

// Rotate around a screen point (mouse right-drag) by an angle in radians.
export function rotateAt(view, pt, dAng, box) {
    const anchor = screenToWorld(pt, view, box);
    let next = { ...view, roll: wrapAngle(view.roll + dAng) };
    const now = screenToWorld(pt, next, box);
    next = { ...next, cx: next.cx + (anchor.x - now.x), cy: next.cy + (anchor.y - now.y) };
    return next;
}

export function clampDistance(d, { fitDistance, minZoom = GESTURE.minZoom, maxZoom = GESTURE.maxZoom } = {}) {
    if (!Number.isFinite(fitDistance) || fitDistance <= 0) return d;
    return Math.min(fitDistance * maxZoom, Math.max(fitDistance * minZoom, d));
}

export function wrapAngle(a) {
    let r = a % (2 * Math.PI);
    if (r > Math.PI) r -= 2 * Math.PI;
    if (r < -Math.PI) r += 2 * Math.PI;
    return r;
}

// Which person (if any) a press grabs: the nearest one whose centre is
// within reach. nodes: [{ x, y, r, id }] in screen px.
export function pickGrab(pt, nodes, reach = GESTURE.grabReachPx) {
    let best = null;
    let bestD = Infinity;
    for (const n of nodes) {
        const d = Math.hypot(pt.x - n.x, pt.y - n.y);
        if (d <= Math.max(reach, n.r || 0) && d < bestD) {
            best = n;
            bestD = d;
        }
    }
    return best;
}

// True once a press has moved far enough to count as a drag.
export function isDrag(start, pt, threshold = GESTURE.dragStartPx) {
    return Math.hypot(pt.x - start.x, pt.y - start.y) > threshold;
}

// True when the view has been moved away from the fitted view, so the
// "Fit" button is worth showing.
export function isOffFit(view, fit) {
    if (!fit) return false;
    const off = Math.hypot(view.cx - fit.cx, view.cy - fit.cy) > 0.5;
    const zoomed = Math.abs(view.distance / fit.distance - 1) > 0.08;
    const turned = Math.abs(wrapAngle(view.roll)) > 0.05;
    return off || zoomed || turned;
}
