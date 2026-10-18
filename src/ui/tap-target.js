// Forgiving, tool-aware tap targeting for the network view, in screen
// pixels. Pure: no three.js, no DOM, unit tested in tests/tap-target.test.js.
//
// People on phones are drawn about 40 px wide and links are thin, so exact
// hits are hard with a thumb. The rules:
// - With Sever selected, the tap goes to the nearest link within reach, even
//   if it starts on a person (Sever does nothing to people).
// - With a person tool selected, the tap goes to the nearest person within
//   reach, even if it lands on a link or just beside them.
// - Reach makes every target at least MIN_TARGET_PX wide.

export const MIN_TARGET_PX = 48;
const LINK_REACH_PX = 18;

export function distToSegment(px, py, ax, ay, bx, by) {
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

// In the 3D web, people can sit in front of each other. Each node may carry
// depth (0 nearest the camera, 1 farthest); when two are about equally close
// on screen, the one in front wins.
export const DEPTH_BIAS_PX = 14;

function nearestNode(x, y, nodes) {
    let best = null;
    let bestD = Infinity;
    for (const n of nodes) {
        const reach = Math.max(n.r, MIN_TARGET_PX / 2);
        const d = Math.hypot(x - n.x, y - n.y);
        const score = d + (n.depth != null ? n.depth * DEPTH_BIAS_PX : 0);
        if (d <= reach && score < bestD) {
            best = n;
            bestD = score;
        }
    }
    return best;
}

function nearestLink(x, y, links, reach = LINK_REACH_PX) {
    let best = null;
    let bestD = Infinity;
    for (const l of links) {
        const d = distToSegment(x, y, l.ax, l.ay, l.bx, l.by);
        // Prefer links that can actually spread (one end sick, one healthy)
        // when two are about equally close.
        const score = d - (l.atRisk ? 4 : 0);
        if (d <= reach && score < bestD) {
            best = l;
            bestD = score;
        }
    }
    return best;
}

// mode: 'link' (Sever), 'node' (a person tool), or null (no tool).
// Returns { kind: 'node', node } | { kind: 'link', link } | null.
export function pickTapTarget({ x, y, mode, nodes = [], links = [] }) {
    if (mode === 'link') {
        const l = nearestLink(x, y, links);
        return l ? { kind: 'link', link: l } : null;
    }
    const n = nearestNode(x, y, nodes);
    if (n) return { kind: 'node', node: n };
    if (mode === 'node') return null;
    const l = nearestLink(x, y, links, 10);
    return l ? { kind: 'link', link: l } : null;
}
