// Wide audience: webs you can read. A contact web has structure (households,
// friend groups, a hub and its circle) but the plain force layout drew a ten
// person web as a ball of crossing lines. This module finds the groups in
// the links and helps the layout draw each group together, so groups read as
// groups and the few lines between them (the bridges, which are exactly the
// lines worth cutting) stand out.
//
// LAYOUT ONLY. Nothing here adds, removes or reads the state of a link or a
// person, so the puzzle and its balance are unchanged.
//
// Pure math on plain numbers and { pos, vel } objects: no three.js, no DOM.
// Tested in tests/wide-visual-clusters.test.js, which also measures line
// crossings before and after on seeded webs of every kind and size.
import { layoutStep, nextAlpha, LAYOUT } from './force-layout.js';

// ---- Finding the groups ----------------------------------------------------

function cleanEdges(n, edges) {
    const seen = new Set();
    const out = [];
    for (const [a, b] of edges) {
        if (!(a >= 0 && b >= 0 && a < n && b < n) || a === b) continue;
        const key = a < b ? a * n + b : b * n + a;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push([a, b]);
    }
    return out;
}

// Newman's modularity Q of a split into groups (higher = tighter groups with
// fewer lines between them). comm[i] is the group of person i.
export function modularity(n, edges, comm) {
    const E = cleanEdges(n, edges);
    const m = E.length;
    if (!m) return 0;
    const deg = new Map();
    let inside = 0;
    for (const [a, b] of E) {
        deg.set(comm[a], (deg.get(comm[a]) || 0) + 1);
        deg.set(comm[b], (deg.get(comm[b]) || 0) + 1);
        if (comm[a] === comm[b]) inside++;
    }
    let q = inside / m;
    for (const d of deg.values()) q -= (d / (2 * m)) ** 2;
    return q;
}

// Greedy modularity (Clauset, Newman and Moore): start with everyone alone
// and keep joining the two groups whose union raises modularity most, until
// no join helps. Deterministic, and instant at web sizes (at most 32 people
// in the campaign). Returns an array: comm[i] = group number of person i,
// groups numbered 0..k-1 in order of their first member.
export function detectCommunities(n, edges) {
    const E = cleanEdges(n, edges);
    const m = E.length;
    const label = Array.from({ length: n }, (_, i) => i);
    if (m > 0) {
        // w[i][j] = links between groups i and j; deg[i] = link ends in i.
        const w = Array.from({ length: n }, () => new Map());
        const deg = new Array(n).fill(0);
        for (const [a, b] of E) {
            w[a].set(b, (w[a].get(b) || 0) + 1);
            w[b].set(a, (w[b].get(a) || 0) + 1);
            deg[a]++;
            deg[b]++;
        }
        const alive = new Set(label);
        for (;;) {
            let best = 1e-9;
            let bi = -1;
            let bj = -1;
            for (const i of alive) {
                for (const [j, wij] of w[i]) {
                    if (j <= i) continue;
                    const gain = wij / m - (deg[i] * deg[j]) / (2 * m * m);
                    if (gain > best) {
                        best = gain;
                        bi = i;
                        bj = j;
                    }
                }
            }
            if (bi < 0) break;
            // Join bj into bi.
            for (const [k, v] of w[bj]) {
                if (k === bi) continue;
                w[bi].set(k, (w[bi].get(k) || 0) + v);
                w[k].set(bi, (w[k].get(bi) || 0) + v);
                w[k].delete(bj);
            }
            w[bi].delete(bj);
            w[bj].clear();
            deg[bi] += deg[bj];
            alive.delete(bj);
            for (let x = 0; x < n; x++) if (label[x] === bj) label[x] = bi;
        }
    }
    const renumber = new Map();
    return label.map((l) => {
        if (!renumber.has(l)) renumber.set(l, renumber.size);
        return renumber.get(l);
    });
}

// The lines that join two different groups.
export function bridgeEdges(edges, comm) {
    return edges.filter(([a, b]) => comm[a] !== comm[b]);
}

// ---- Measuring a drawing -----------------------------------------------------

function segmentsCross(p, q, r, s) {
    const o = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    const d1 = o(p, q, r);
    const d2 = o(p, q, s);
    const d3 = o(r, s, p);
    const d4 = o(r, s, q);
    return d1 * d2 < 0 && d3 * d4 < 0;
}

// How many pairs of lines cross each other. points[i] = { x, y }; edges are
// [i, j] index pairs. Lines that share a person never count.
export function countCrossings(points, edges) {
    let c = 0;
    for (let i = 0; i < edges.length; i++) {
        const [a, b] = edges[i];
        for (let j = i + 1; j < edges.length; j++) {
            const [u, v] = edges[j];
            if (a === u || a === v || b === u || b === v) continue;
            if (segmentsCross(points[a], points[b], points[u], points[v])) c++;
        }
    }
    return c;
}

// How many times a line runs under the face of someone it does not belong
// to (closer than `radius` to their centre). Such a line looks like two
// contacts that are not there, so the untangler counts it like a crossing.
export function countFaceHits(points, edges, radius = FACE_HIT_RADIUS) {
    let c = 0;
    const r2 = radius * radius;
    for (const [a, b] of edges) {
        const p = points[a];
        const q = points[b];
        const dx = q.x - p.x;
        const dy = q.y - p.y;
        const len2 = dx * dx + dy * dy || 1e-9;
        for (let i = 0; i < points.length; i++) {
            if (i === a || i === b) continue;
            const t = ((points[i].x - p.x) * dx + (points[i].y - p.y) * dy) / len2;
            if (t <= 0 || t >= 1) continue;
            const ex = p.x + dx * t - points[i].x;
            const ey = p.y + dy * t - points[i].y;
            if (ex * ex + ey * ey < r2) c++;
        }
    }
    return c;
}
// A face is 1.15 units wide at person scale 1; a line this close to its
// centre is hidden under it for most of the face's width.
export const FACE_HIT_RADIUS = 0.5;

// What the untangler lowers: crossings plus lines under faces.
export function tangle(points, edges, radius = FACE_HIT_RADIUS) {
    return countCrossings(points, edges) + countFaceHits(points, edges, radius);
}

export function tangleOf(objs, pairs, radius = FACE_HIT_RADIUS) {
    const index = new Map(objs.map((o, i) => [o, i]));
    return tangle(
        objs.map((o) => o.pos),
        pairs.map(([a, b]) => [index.get(a), index.get(b)]),
        radius
    );
}

// Same count for layout objects and [objA, objB] pairs (what the view holds).
export function crossingsOf(objs, pairs) {
    const index = new Map(objs.map((o, i) => [o, i]));
    return countCrossings(
        objs.map((o) => o.pos),
        pairs.map(([a, b]) => [index.get(a), index.get(b)])
    );
}

// ---- Where each group starts -------------------------------------------------

// Sunflower spiral (the old start for everyone): even spacing, no overlaps.
export function sunflowerPoints(n, radius) {
    const golden = Math.PI * (3 - Math.sqrt(5));
    const out = [];
    for (let i = 0; i < n; i++) {
        const r = radius * Math.sqrt((i + 0.5) / Math.max(1, n));
        out.push({ x: Math.cos(golden * i) * r, y: Math.sin(golden * i) * r });
    }
    return out;
}

// Order k groups round a ring so groups with many lines between them sit
// next to each other (their bridges stay short and cross little).
// weight(i, j) = lines between groups i and j.
export function orderGroups(k, weight) {
    if (k <= 2) return Array.from({ length: k }, (_, i) => i);
    const cost = (order) => {
        let c = 0;
        for (let a = 0; a < k; a++) {
            for (let b = a + 1; b < k; b++) {
                const w = weight(order[a], order[b]);
                if (w) c += w * Math.min(b - a, k - (b - a));
            }
        }
        return c;
    };
    // Start with a chain of best friends, then improve by swapping pairs.
    const order = [0];
    const left = new Set(Array.from({ length: k - 1 }, (_, i) => i + 1));
    while (left.size) {
        const last = order[order.length - 1];
        let pick = -1;
        let bw = -1;
        for (const g of left) {
            const w = weight(last, g);
            if (w > bw) {
                bw = w;
                pick = g;
            }
        }
        order.push(pick);
        left.delete(pick);
    }
    let bestCost = cost(order);
    for (let improved = true, guard = 0; improved && guard < 20; guard++) {
        improved = false;
        for (let a = 0; a < k; a++) {
            for (let b = a + 1; b < k; b++) {
                [order[a], order[b]] = [order[b], order[a]];
                const c = cost(order);
                if (c < bestCost) {
                    bestCost = c;
                    improved = true;
                } else {
                    [order[a], order[b]] = [order[b], order[a]];
                }
            }
        }
    }
    return order;
}

// A starting point for every person: each group on its own small disc, the
// discs set round a ring (a busy middle group goes in the centre once there
// are five or more), shaped to the view by scaleX and scaleY the same way
// the force layout is (see layoutForAspect).
export function clusterSeeds(n, edges, comm, { restLength = LAYOUT.restLength, scaleX = 1, scaleY = 1 } = {}) {
    const k = comm.length ? Math.max(...comm) + 1 : 0;
    const members = Array.from({ length: k }, () => []);
    for (let i = 0; i < n; i++) members[comm[i]].push(i);
    const W = Array.from({ length: k }, () => new Array(k).fill(0));
    for (const [a, b] of edges) {
        if (comm[a] !== comm[b]) {
            W[comm[a]][comm[b]]++;
            W[comm[b]][comm[a]]++;
        }
    }
    const radiusOf = (g) => 0.42 * restLength * Math.sqrt(members[g].length);
    // The group with links to the most other groups can sit in the middle.
    let centre = -1;
    if (k >= 5) {
        let bestSpan = 0;
        for (let g = 0; g < k; g++) {
            const span = W[g].filter((w) => w > 0).length;
            if (span > bestSpan && span >= Math.ceil((k - 1) * 0.6)) {
                bestSpan = span;
                centre = g;
            }
        }
    }
    const ringGroups = [];
    for (let g = 0; g < k; g++) if (g !== centre) ringGroups.push(g);
    const order = orderGroups(ringGroups.length, (i, j) => W[ringGroups[i]][ringGroups[j]]).map((i) => ringGroups[i]);
    const gap = 0.5 * restLength;
    const arc = order.map((g) => 2 * radiusOf(g) + gap);
    const total = arc.reduce((s, v) => s + v, 0);
    let ringR = order.length > 1 ? total / (2 * Math.PI) : 0;
    if (order.length === 2) ringR = (arc[0] + arc[1]) / 4;
    if (centre >= 0) ringR = Math.max(ringR, radiusOf(centre) + gap + Math.max(...order.map(radiusOf)));
    const centres = new Array(k);
    if (centre >= 0) centres[centre] = { x: 0, y: 0 };
    // Start at the top so a tall phone gets groups stacked down the screen.
    let at = -Math.PI / 2 - (order.length ? (arc[0] / total) * Math.PI : 0);
    order.forEach((g, i) => {
        const half = (arc[i] / total) * Math.PI;
        at += half;
        centres[g] = { x: Math.cos(at) * ringR, y: Math.sin(at) * ringR };
        at += half;
    });
    const out = new Array(n);
    for (let g = 0; g < k; g++) {
        const spots = sunflowerPoints(members[g].length, radiusOf(g) * 0.85);
        members[g].forEach((id, i) => {
            out[id] = { x: (centres[g].x + spots[i].x) / scaleX, y: (centres[g].y + spots[i].y) / scaleY };
        });
    }
    return out;
}

// ---- Forces that hold a group together ----------------------------------------

// Extra layout numbers. clusterK pulls each person toward the middle of
// their group; a bridge (a line between two groups) is a longer, softer
// spring, so groups sit apart and the bridge is a clear line on its own;
// groups whose middles get too close push each other away.
export const CLUSTER = Object.freeze({
    clusterK: 0.03,
    bridgeRest: 1.6,
    bridgeK: 0.5,
    groupGap: 0.9,
    groupPushK: 0.05,
});

// Big webs have no room to spare on a phone: every bit of air between groups
// pushes the camera back and shrinks the faces. So the gap between groups
// and the extra length of a bridge ease off as the web grows, from the full
// amounts up to ROOMY people down to the tight ones at CROWDED and above.
export const CLUSTER_ROOMY = 12;
export const CLUSTER_CROWDED = 26;
export const CLUSTER_TIGHT = Object.freeze({ bridgeRest: 1.15, groupGap: 0.1 });

export function clusterParams(P = LAYOUT, people = 0, C = CLUSTER) {
    const t = Math.min(1, Math.max(0, (people - CLUSTER_ROOMY) / (CLUSTER_CROWDED - CLUSTER_ROOMY)));
    return {
        ...P,
        ...C,
        bridgeRest: C.bridgeRest + (CLUSTER_TIGHT.bridgeRest - C.bridgeRest) * t,
        groupGap: C.groupGap + (CLUSTER_TIGHT.groupGap - C.groupGap) * t,
    };
}

// Give every layout object its group number (o.cluster; the view already
// uses o.group for the three.js object). Returns the number
// of groups. Call when a web is first drawn; the groups then stay put for
// the level, so cutting lines never makes people jump about.
export function assignGroups(objs, pairs) {
    const index = new Map(objs.map((o, i) => [o, i]));
    const edges = [];
    for (const [a, b] of pairs) if (index.has(a) && index.has(b)) edges.push([index.get(a), index.get(b)]);
    const comm = detectCommunities(objs.length, edges);
    objs.forEach((o, i) => {
        o.cluster = comm[i];
    });
    return { comm, edges, groups: comm.length ? Math.max(...comm) + 1 : 0 };
}

// Adds the group forces to each object's velocity. Run it just before a
// layout step (2D or 3D: z is used when the objects have one). Does nothing
// when P has no clusterK or the objects have no groups.
export function clusterForces(objs, pairs, alpha = 1, P = LAYOUT) {
    if (!P.clusterK || alpha <= 0) return;
    const sx = P.scaleX ?? 1;
    const sy = P.scaleY ?? 1;
    const groups = new Map();
    for (const o of objs) {
        if (o.cluster === undefined) continue;
        let g = groups.get(o.cluster);
        if (!g) groups.set(o.cluster, (g = { x: 0, y: 0, z: 0, n: 0, list: [] }));
        g.x += o.pos.x;
        g.y += o.pos.y;
        g.z += o.pos.z || 0;
        g.n++;
        g.list.push(o);
    }
    if (groups.size < 2) return;
    for (const g of groups.values()) {
        g.x /= g.n;
        g.y /= g.n;
        g.z /= g.n;
        for (const o of g.list) {
            o.vel.x += (g.x - o.pos.x) * P.clusterK * alpha;
            o.vel.y += (g.y - o.pos.y) * P.clusterK * alpha;
            if (o.vel.z !== undefined) o.vel.z += (g.z - (o.pos.z || 0)) * P.clusterK * alpha;
        }
    }
    // Groups keep clear of each other (measured in the view's stretched space).
    const list = [...groups.values()];
    const rOf = (g) => 0.42 * P.restLength * Math.sqrt(g.n);
    for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
            const a = list[i];
            const b = list[j];
            const dx = (b.x - a.x) * sx;
            const dy = (b.y - a.y) * sy;
            const dz = (b.z - a.z) * sx;
            const d = Math.hypot(dx, dy, dz) || 0.001;
            const want = rOf(a) + rOf(b) + (P.groupGap ?? 0) * P.restLength;
            if (d >= want) continue;
            const f = ((want - d) * (P.groupPushK ?? 0) * alpha) / d;
            for (const o of a.list) {
                o.vel.x -= (dx * f) / sx;
                o.vel.y -= (dy * f) / sy;
                if (o.vel.z !== undefined) o.vel.z -= (dz * f) / sx;
            }
            for (const o of b.list) {
                o.vel.x += (dx * f) / sx;
                o.vel.y += (dy * f) / sy;
                if (o.vel.z !== undefined) o.vel.z += (dz * f) / sx;
            }
        }
    }
    // Bridges: turn the plain spring the layout step is about to apply into
    // a longer, softer one by adding the difference.
    const br = P.bridgeRest ?? 1;
    const bk = P.bridgeK ?? 1;
    if (br === 1 && bk === 1) return;
    for (const [a, b] of pairs) {
        if (a.cluster === undefined || a.cluster === b.cluster) continue;
        const dx = (b.pos.x - a.pos.x) * sx;
        const dy = (b.pos.y - a.pos.y) * sy;
        const dz = ((b.pos.z || 0) - (a.pos.z || 0)) * sx;
        const d = Math.hypot(dx, dy, dz) || 0.001;
        const plain = (d - P.restLength) * P.springK;
        const soft = (d - P.restLength * br) * P.springK * bk;
        const f = ((soft - plain) * alpha) / d;
        a.vel.x += (dx * f) / sx;
        a.vel.y += (dy * f) / sy;
        b.vel.x -= (dx * f) / sx;
        b.vel.y -= (dy * f) / sy;
        if (a.vel.z !== undefined) a.vel.z += (dz * f) / sx;
        if (b.vel.z !== undefined) b.vel.z -= (dz * f) / sx;
    }
}

// settleLayout with the group forces: run until cool. `step` and `next` let
// the 3D web use its own step (layoutStep3d, nextAlpha3d).
export function settleClustered(objs, pairs, { alpha = 1, maxSteps = 400, P = LAYOUT, step = layoutStep, next = nextAlpha } = {}) {
    let steps = 0;
    let speed = 0;
    while (alpha > 0 && steps < maxSteps) {
        clusterForces(objs, pairs, alpha, P);
        speed = step(objs, pairs, alpha, P);
        alpha = next(alpha, P);
        steps++;
    }
    return { steps, alpha, speed };
}

// ---- Fewer crossing lines (flat view) ------------------------------------------

// Cheap untangling for the flat web. Two kinds of move, each kept only when
// it lowers the tangle (crossing lines plus lines that run under a face):
//   1. two people of the same group trade places,
//   2. a whole group is mirrored or turned about its own middle.
// People only ever take spots that were already in use (or turn as a rigid
// group), so spacing is kept. Returns the tangle before and after.
export function untangle(objs, pairs, { sweeps = 4, radius = FACE_HIT_RADIUS } = {}) {
    const index = new Map(objs.map((o, i) => [o, i]));
    const edges = pairs.map(([a, b]) => [index.get(a), index.get(b)]);
    const pts = objs.map((o) => o.pos);
    const before = tangle(pts, edges, radius);
    let now = before;
    const byGroup = new Map();
    objs.forEach((o, i) => {
        const g = o.cluster ?? 0;
        if (!byGroup.has(g)) byGroup.set(g, []);
        byGroup.get(g).push(i);
    });
    const swap = (i, j) => {
        const a = pts[i];
        const b = pts[j];
        const x = a.x;
        const y = a.y;
        a.x = b.x;
        a.y = b.y;
        b.x = x;
        b.y = y;
    };
    for (let s = 0; s < sweeps && now > 0; s++) {
        let improved = false;
        for (const ids of byGroup.values()) {
            for (let u = 0; u < ids.length && now > 0; u++) {
                for (let v = u + 1; v < ids.length && now > 0; v++) {
                    if (objs[ids[u]].pinned || objs[ids[v]].pinned) continue;
                    swap(ids[u], ids[v]);
                    const c = tangle(pts, edges, radius);
                    if (c < now) {
                        now = c;
                        improved = true;
                    } else swap(ids[u], ids[v]);
                }
            }
        }
        if (byGroup.size > 1) {
            for (const ids of byGroup.values()) {
                if (ids.length < 2 || now === 0 || ids.some((i) => objs[i].pinned)) continue;
                let cx = 0;
                let cy = 0;
                for (const i of ids) {
                    cx += pts[i].x;
                    cy += pts[i].y;
                }
                cx /= ids.length;
                cy /= ids.length;
                const saved = ids.map((i) => ({ x: pts[i].x, y: pts[i].y }));
                let bestC = now;
                let bestT = null;
                // Mirror (left to right) and turns in sixths of a circle.
                for (const flip of [1, -1]) {
                    for (let turn = 0; turn < 6; turn++) {
                        if (flip === 1 && turn === 0) continue;
                        const cos = Math.cos((turn * Math.PI) / 3);
                        const sin = Math.sin((turn * Math.PI) / 3);
                        ids.forEach((i, q) => {
                            const dx = (saved[q].x - cx) * flip;
                            const dy = saved[q].y - cy;
                            pts[i].x = cx + dx * cos - dy * sin;
                            pts[i].y = cy + dx * sin + dy * cos;
                        });
                        const c = tangle(pts, edges, radius);
                        if (c < bestC) {
                            bestC = c;
                            bestT = { flip, cos, sin };
                        }
                    }
                }
                ids.forEach((i, q) => {
                    if (!bestT) {
                        pts[i].x = saved[q].x;
                        pts[i].y = saved[q].y;
                        return;
                    }
                    const dx = (saved[q].x - cx) * bestT.flip;
                    const dy = saved[q].y - cy;
                    pts[i].x = cx + dx * bestT.cos - dy * bestT.sin;
                    pts[i].y = cy + dx * bestT.sin + dy * bestT.cos;
                });
                if (bestT) {
                    now = bestC;
                    improved = true;
                }
            }
        }
        if (!improved) break;
    }
    return { before, after: now };
}

// The whole flat layout for a new web: find the groups, start each on its
// own disc, settle with the group forces, untangle, and settle again gently.
// The best drawing seen (least tangle) is the one kept.
export function layoutClustered(objs, pairs, { P = clusterParams(LAYOUT), maxSteps = 400, rounds = 3 } = {}) {
    const { comm, edges, groups } = assignGroups(objs, pairs);
    const seeds = clusterSeeds(objs.length, edges, comm, P);
    const radius = FACE_HIT_RADIUS * (P.collideDist / LAYOUT.collideDist);
    objs.forEach((o, i) => {
        if (o.pinned) return;
        o.pos.x = seeds[i].x;
        o.pos.y = seeds[i].y;
        o.pos.z = 0;
        o.vel.x = 0;
        o.vel.y = 0;
        o.vel.z = 0;
    });
    settleClustered(objs, pairs, { maxSteps, P });
    let best = tangleOf(objs, pairs, radius);
    let snapshot = objs.map((o) => ({ x: o.pos.x, y: o.pos.y }));
    for (let r = 0; r < rounds && best > 0; r++) {
        untangle(objs, pairs, { radius });
        for (const o of objs) {
            o.vel.x = 0;
            o.vel.y = 0;
        }
        settleClustered(objs, pairs, { alpha: 0.35, maxSteps, P });
        const c = tangleOf(objs, pairs, radius);
        if (c < best) {
            best = c;
            snapshot = objs.map((o) => ({ x: o.pos.x, y: o.pos.y }));
        } else break;
    }
    objs.forEach((o, i) => {
        o.pos.x = snapshot[i].x;
        o.pos.y = snapshot[i].y;
        o.vel.x = 0;
        o.vel.y = 0;
    });
    return { groups, tangle: best, crossings: crossingsOf(objs, pairs) };
}

// ---- Filling the screen ----------------------------------------------------------

// Width over height of the box the people take up, with `pad` of room on
// every side for the faces themselves.
export function spreadAspect(objs, pad = 1.2) {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const o of objs) {
        minX = Math.min(minX, o.pos.x);
        maxX = Math.max(maxX, o.pos.x);
        minY = Math.min(minY, o.pos.y);
        maxY = Math.max(maxY, o.pos.y);
    }
    if (!objs.length) return 1;
    return (maxX - minX + 2 * pad) / (maxY - minY + 2 * pad);
}

export const FIT_BIAS_MIN = 0.5;
export const FIT_BIAS_MAX = 2.4;
export const FIT_TRIES = 4;
// Close enough: the web's shape is within about 12% of the room it has.
export const FIT_TOLERANCE = 0.12;

// Groups stacked down a tall phone made a thin column that left half the
// width empty, so the camera sat far back and people were small and crowded.
// The view lays the web out, measures the shape it took (spreadAspect)
// against the room it has, and when the web is thinner (or wider) than the
// room it asks the layout for a wider (or thinner) shape and tries again.
// `bias` multiplies the aspect handed to layoutForAspect; this is the next
// bias to try, given the shape the web took (`got`) and the room (`want`).
export function nextFitBias(bias, got, want) {
    if (!(got > 0) || !(want > 0)) return bias;
    const next = Math.min(FIT_BIAS_MAX, Math.max(FIT_BIAS_MIN, bias * (want / got) ** 0.8));
    return Math.abs(next - bias) < 0.02 ? bias : next;
}
