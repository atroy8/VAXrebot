// Wide audience: webs you can read. Groups of people who know each other are
// drawn together, so a web reads as groups joined by a few bridges. Layout
// only: the links themselves are never touched.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { generateNetwork } from '../src/sim/network.js';
import { mulberry32 } from '../src/sim/balance.js';
import { settleLayout, layoutStep, layoutForAspect, minSpacing, LAYOUT } from '../src/ui/force-layout.js';
import { layoutStep3d, nextAlpha3d, layout3dForAspect, minSpacing3d, LAYOUT_3D } from '../src/ui/web3d.js';
import {
    detectCommunities,
    modularity,
    bridgeEdges,
    countCrossings,
    countFaceHits,
    crossingsOf,
    tangleOf,
    sunflowerPoints,
    orderGroups,
    clusterSeeds,
    clusterParams,
    clusterForces,
    assignGroups,
    settleClustered,
    untangle,
    layoutClustered,
    spreadAspect,
    nextFitBias,
    CLUSTER,
    CLUSTER_TIGHT,
    FIT_BIAS_MIN,
    FIT_BIAS_MAX,
} from '../src/ui/web-clusters.js';

const TYPES = ['scale-free', 'small-world', 'random'];
const SIZES = [8, 12, 16, 24, 32];
const PHONE = 0.57; // the web's view on a 390 x 844 phone is about 300 x 525

const objsAt = (pts) => pts.map((p) => ({ pos: { x: p.x, y: p.y, z: 0 }, vel: { x: 0, y: 0, z: 0 } }));
const web = (type, n, seed) => generateNetwork(type, n, mulberry32(seed)).links.map((l) => [l.source, l.target]);

// The old layout: everyone on one sunflower spiral, then the plain forces.
function plainLayout(n, edges) {
    const objs = objsAt(sunflowerPoints(n, 3 + Math.sqrt(n) * 1.2));
    const pairs = edges.map(([a, b]) => [objs[a], objs[b]]);
    settleLayout(objs, pairs, { P: layoutForAspect(PHONE) });
    return { objs, pairs };
}
function clusteredLayout(n, edges) {
    const objs = objsAt(sunflowerPoints(n, 3 + Math.sqrt(n) * 1.2));
    const pairs = edges.map(([a, b]) => [objs[a], objs[b]]);
    // As the view does: the number of people sets how tight the groups sit.
    const P = clusterParams(layoutForAspect(PHONE), n);
    const out = layoutClustered(objs, pairs, { P });
    return { objs, pairs, P, out };
}

describe('finding the groups', () => {
    it('two squads joined by one line are two groups, and that line is the bridge', () => {
        const edges = [[0, 1], [0, 2], [1, 2], [3, 4], [3, 5], [4, 5], [2, 3]];
        const comm = detectCommunities(6, edges);
        expect(comm).toEqual([0, 0, 0, 1, 1, 1]);
        expect(bridgeEdges(edges, comm)).toEqual([[2, 3]]);
        expect(modularity(6, edges, comm)).toBeGreaterThan(0.3);
    });

    it('finds the friend groups a festival web is built from', () => {
        for (let seed = 1; seed <= 10; seed++) {
            const edges = web('random', 16, seed);
            const comm = detectCommunities(16, edges);
            const groups = Math.max(...comm) + 1;
            expect(groups).toBeGreaterThanOrEqual(2);
            expect(groups).toBeLessThanOrEqual(6);
            // Most lines stay inside a group; the rest are the bridges.
            expect(bridgeEdges(edges, comm).length).toBeLessThan(edges.length / 2);
            expect(modularity(16, edges, comm)).toBeGreaterThan(0.25);
        }
    });

    it('beats "everyone in one group" and "everyone alone" on every kind of web', () => {
        for (const type of TYPES) {
            for (const n of SIZES) {
                const edges = web(type, n, 11 + n);
                const comm = detectCommunities(n, edges);
                const q = modularity(n, edges, comm);
                expect(q, `${type} ${n}`).toBeGreaterThan(modularity(n, edges, new Array(n).fill(0)));
                expect(q, `${type} ${n}`).toBeGreaterThan(modularity(n, edges, comm.map((_, i) => i)));
                expect(comm).toHaveLength(n);
                // Numbered 0..k-1 with no gaps.
                expect(new Set(comm).size).toBe(Math.max(...comm) + 1);
            }
        }
    });

    it('is the same every time, ignores doubled lines and copes with no lines', () => {
        const edges = web('small-world', 20, 5);
        expect(detectCommunities(20, edges)).toEqual(detectCommunities(20, edges));
        expect(detectCommunities(20, [...edges, ...edges])).toEqual(detectCommunities(20, edges));
        expect(detectCommunities(3, [])).toEqual([0, 1, 2]);
        expect(detectCommunities(0, [])).toEqual([]);
        expect(modularity(3, [], [0, 1, 2])).toBe(0);
    });
});

describe('measuring a drawing', () => {
    it('counts crossing lines, but not lines that share a person', () => {
        const pts = [{ x: 0, y: 0 }, { x: 2, y: 2 }, { x: 0, y: 2 }, { x: 2, y: 0 }];
        expect(countCrossings(pts, [[0, 1], [2, 3]])).toBe(1);
        expect(countCrossings(pts, [[0, 1], [0, 2]])).toBe(0);
        expect(countCrossings(pts, [[0, 2], [1, 3]])).toBe(0);
    });

    it('counts a line that runs under the face of someone else', () => {
        const pts = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 2, y: 0.1 }, { x: 2, y: 3 }];
        expect(countFaceHits(pts, [[0, 1]])).toBe(1);
        expect(countFaceHits(pts, [[0, 3]])).toBe(0);
    });

    it('puts groups that share many lines next to each other on the ring', () => {
        // 0-1 and 2-3 are close friends; a ring order must keep each pair adjacent.
        const w = [[0, 5, 0, 1], [5, 0, 1, 0], [0, 1, 0, 5], [1, 0, 5, 0]];
        const order = orderGroups(4, (i, j) => w[i][j]);
        expect([...order].sort()).toEqual([0, 1, 2, 3]);
        const at = (g) => order.indexOf(g);
        const ringGap = (a, b) => Math.min(Math.abs(at(a) - at(b)), 4 - Math.abs(at(a) - at(b)));
        expect(ringGap(0, 1)).toBe(1);
        expect(ringGap(2, 3)).toBe(1);
    });
});

describe('the clustered layout untangles the web', () => {
    // Measured on 10 seeded webs of every kind and size.
    const table = {};
    for (const type of TYPES) {
        for (const n of SIZES) {
            let plain = 0;
            let clustered = 0;
            let plainHits = 0;
            let clusteredHits = 0;
            let worse = 0;
            let spacing = Infinity;
            let outside = 0;
            const S = 10;
            for (let seed = 1; seed <= S; seed++) {
                const edges = web(type, n, seed * 7 + n);
                const a = plainLayout(n, edges);
                const b = clusteredLayout(n, edges);
                const ca = crossingsOf(a.objs, a.pairs);
                const cb = crossingsOf(b.objs, b.pairs);
                plain += ca;
                clustered += cb;
                plainHits += tangleOf(a.objs, a.pairs) - ca;
                clusteredHits += tangleOf(b.objs, b.pairs) - cb;
                if (cb > ca) worse++;
                spacing = Math.min(spacing, minSpacing(b.objs));
                const rx = b.P.maxRadius / b.P.scaleX;
                const ry = b.P.maxRadius / b.P.scaleY;
                for (const o of b.objs) if (Math.hypot(o.pos.x / rx, o.pos.y / ry) > 1.0001) outside++;
            }
            table[`${type} ${n}`] = { plain: plain / S, clustered: clustered / S, plainHits: plainHits / S, clusteredHits: clusteredHits / S, worse, spacing, outside };
        }
    }

    it('has fewer crossing lines on average, for every kind of web at every size', () => {
        for (const [key, row] of Object.entries(table)) {
            expect(row.clustered, key).toBeLessThan(row.plain);
        }
    });

    it('cuts crossings by more than half overall, and small webs are nearly clean', () => {
        const rows = Object.values(table);
        const plain = rows.reduce((s, r) => s + r.plain, 0);
        const clustered = rows.reduce((s, r) => s + r.clustered, 0);
        expect(clustered).toBeLessThan(plain * 0.5);
        for (const type of TYPES) {
            expect(table[`${type} 8`].clustered, type).toBeLessThanOrEqual(4);
            expect(table[`${type} 8`].clustered, type).toBeLessThan(table[`${type} 8`].plain * 0.5);
        }
    });

    it('is almost never worse than the old layout on a single web', () => {
        const worse = Object.values(table).reduce((s, r) => s + r.worse, 0);
        expect(worse).toBeLessThanOrEqual(3); // of 150 webs
    });

    it('also has fewer lines running under faces', () => {
        const rows = Object.values(table);
        expect(rows.reduce((s, r) => s + r.clusteredHits, 0)).toBeLessThan(rows.reduce((s, r) => s + r.plainHits, 0));
    });

    it('nobody overlaps and everybody stays inside the layout bounds', () => {
        for (const [key, row] of Object.entries(table)) {
            // collideDist is 1.6: faces are 1.15 wide, so 1.5 leaves clear air.
            expect(row.spacing, key).toBeGreaterThan(1.5);
            expect(row.outside, key).toBe(0);
        }
    });

    it('people of one group end up nearer each other than people of different groups', () => {
        for (const type of TYPES) {
            const n = 16;
            const edges = web(type, n, 31);
            const { objs } = clusteredLayout(n, edges);
            let same = 0;
            let sameN = 0;
            let other = 0;
            let otherN = 0;
            for (let i = 0; i < n; i++) {
                for (let j = i + 1; j < n; j++) {
                    const d = Math.hypot(objs[i].pos.x - objs[j].pos.x, objs[i].pos.y - objs[j].pos.y);
                    if (objs[i].cluster === objs[j].cluster) {
                        same += d;
                        sameN++;
                    } else {
                        other += d;
                        otherN++;
                    }
                }
            }
            expect(same / sameN, type).toBeLessThan((other / otherN) * 0.75);
        }
    });

    it('bridges are drawn longer than the lines inside a group', () => {
        const n = 16;
        const edges = web('random', n, 31);
        const { objs, pairs } = clusteredLayout(n, edges);
        const len = ([a, b]) => Math.hypot(a.pos.x - b.pos.x, a.pos.y - b.pos.y);
        const inside = pairs.filter(([a, b]) => a.cluster === b.cluster).map(len);
        const bridges = pairs.filter(([a, b]) => a.cluster !== b.cluster).map(len);
        const mean = (xs) => xs.reduce((s, v) => s + v, 0) / xs.length;
        expect(bridges.length).toBeGreaterThan(0);
        expect(mean(bridges)).toBeGreaterThan(mean(inside) * 1.2);
    });

    it('is the same drawing every time for the same web', () => {
        const edges = web('small-world', 12, 3);
        const a = clusteredLayout(12, edges).objs.map((o) => [o.pos.x, o.pos.y]);
        const b = clusteredLayout(12, edges).objs.map((o) => [o.pos.x, o.pos.y]);
        expect(a).toEqual(b);
    });
});

describe('the pieces', () => {
    it('seeds start each group on its own patch with nobody on top of anybody', () => {
        const n = 16;
        const edges = web('random', n, 9);
        const comm = detectCommunities(n, edges);
        const seeds = clusterSeeds(n, edges, comm, layoutForAspect(PHONE));
        expect(seeds).toHaveLength(n);
        for (const s of seeds) {
            expect(Number.isFinite(s.x)).toBe(true);
            expect(Number.isFinite(s.y)).toBe(true);
        }
        expect(minSpacing(objsAt(seeds))).toBeGreaterThan(0.3);
    });

    it('untangle only makes things better, and only moves people within their group', () => {
        const n = 16;
        const edges = web('small-world', n, 4);
        const objs = objsAt(sunflowerPoints(n, 8));
        const pairs = edges.map(([a, b]) => [objs[a], objs[b]]);
        assignGroups(objs, pairs);
        const spots = new Set(objs.map((o) => `${o.pos.x.toFixed(6)},${o.pos.y.toFixed(6)}`));
        const before = tangleOf(objs, pairs);
        const out = untangle(objs, pairs, { sweeps: 1 });
        expect(out.before).toBe(before);
        expect(out.after).toBeLessThanOrEqual(out.before);
        expect(tangleOf(objs, pairs)).toBe(out.after);
        // One sweep of swaps alone keeps the set of spots when no group turned.
        expect(objs).toHaveLength(spots.size);
    });

    it('a person held under a finger is never moved by the untangler', () => {
        const edges = web('random', 10, 2);
        const objs = objsAt(sunflowerPoints(10, 6));
        const pairs = edges.map(([a, b]) => [objs[a], objs[b]]);
        assignGroups(objs, pairs);
        for (const o of objs) o.pinned = true;
        const at = objs.map((o) => [o.pos.x, o.pos.y]);
        untangle(objs, pairs);
        expect(objs.map((o) => [o.pos.x, o.pos.y])).toEqual(at);
    });

    it('the group forces do nothing without the cluster numbers, so old layouts are unchanged', () => {
        const edges = web('random', 10, 2);
        const objs = objsAt(sunflowerPoints(10, 6));
        const pairs = edges.map(([a, b]) => [objs[a], objs[b]]);
        assignGroups(objs, pairs);
        clusterForces(objs, pairs, 1, LAYOUT);
        for (const o of objs) expect(o.vel).toEqual({ x: 0, y: 0, z: 0 });
        clusterForces(objs, pairs, 0, clusterParams(LAYOUT));
        for (const o of objs) expect(o.vel).toEqual({ x: 0, y: 0, z: 0 });
        clusterForces(objs, pairs, 1, clusterParams(LAYOUT));
        expect(objs.some((o) => o.vel.x !== 0 || o.vel.y !== 0)).toBe(true);
        expect(clusterParams(LAYOUT)).toMatchObject({ ...LAYOUT, ...CLUSTER });
    });

    it('big webs keep their groups tighter, so faces stay big on a phone', () => {
        const small = clusterParams(LAYOUT, 8);
        const mid = clusterParams(LAYOUT, 19);
        const big = clusterParams(LAYOUT, 32);
        expect(small.groupGap).toBe(CLUSTER.groupGap);
        expect(small.bridgeRest).toBe(CLUSTER.bridgeRest);
        expect(big.groupGap).toBeCloseTo(CLUSTER_TIGHT.groupGap, 9);
        expect(big.bridgeRest).toBeCloseTo(CLUSTER_TIGHT.bridgeRest, 9);
        expect(mid.groupGap).toBeLessThan(small.groupGap);
        expect(mid.groupGap).toBeGreaterThan(big.groupGap);
        // A bridge is still longer than a line inside a group, at any size.
        expect(big.bridgeRest).toBeGreaterThan(1);
        // And the 32 person web takes up clearly less room than with the roomy numbers.
        const edges = web('random', 32, 5);
        const extent = (P) => {
            const objs = objsAt(sunflowerPoints(32, 9));
            const pairs = edges.map(([a, b]) => [objs[a], objs[b]]);
            layoutClustered(objs, pairs, { P });
            const xs = objs.map((o) => o.pos.x);
            const ys = objs.map((o) => o.pos.y);
            return (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
        };
        expect(extent(clusterParams(layoutForAspect(PHONE), 32))).toBeLessThan(extent(clusterParams(layoutForAspect(PHONE), 8)) * 0.9);
    });

    it('the layout still cools to rest with the group forces on', () => {
        const edges = web('scale-free', 20, 6);
        const objs = objsAt(sunflowerPoints(20, 8));
        const pairs = edges.map(([a, b]) => [objs[a], objs[b]]);
        assignGroups(objs, pairs);
        const P = clusterParams(layoutForAspect(PHONE));
        const out = settleClustered(objs, pairs, { P });
        expect(out.alpha).toBe(0);
        expect(out.speed).toBeLessThan(0.02);
        // Cooled: one more step at alpha 0 moves nobody.
        const at = objs.map((o) => [o.pos.x, o.pos.y]);
        clusterForces(objs, pairs, 0, P);
        layoutStep(objs, pairs, 0, P);
        objs.forEach((o, i) => {
            expect(Math.hypot(o.pos.x - at[i][0], o.pos.y - at[i][1])).toBeLessThan(0.05);
        });
    });

    it('works in the 3D web too: groups pull together and nobody overlaps', () => {
        const n = 20;
        const edges = web('random', n, 8);
        const objs = sunflowerPoints(n, 6).map((p, i) => ({ pos: { x: p.x, y: p.y, z: (i % 5) - 2 }, vel: { x: 0, y: 0, z: 0 } }));
        const pairs = edges.map(([a, b]) => [objs[a], objs[b]]);
        assignGroups(objs, pairs);
        const P = clusterParams(layout3dForAspect(PHONE, LAYOUT_3D));
        settleClustered(objs, pairs, { P, step: layoutStep3d, next: nextAlpha3d });
        expect(minSpacing3d(objs)).toBeGreaterThan(1.7);
        expect(objs.some((o) => Math.abs(o.pos.z) > 0.5)).toBe(true);
    });

    it('measures the shape a web took and steers the next try toward the room it has', () => {
        const tall = objsAt([{ x: 0, y: 0 }, { x: 1, y: 10 }]);
        expect(spreadAspect(tall, 0)).toBeCloseTo(0.1, 5);
        expect(spreadAspect(tall, 1)).toBeCloseTo(3 / 12, 5);
        // Too thin for the room: ask for wider. Too wide: ask for thinner.
        expect(nextFitBias(1, 0.4, 0.7)).toBeGreaterThan(1);
        expect(nextFitBias(1, 1.2, 0.7)).toBeLessThan(1);
        expect(nextFitBias(1, 0.7, 0.7)).toBe(1);
        expect(nextFitBias(1, 0.001, 0.7)).toBe(FIT_BIAS_MAX);
        expect(nextFitBias(1, 50, 0.7)).toBe(FIT_BIAS_MIN);
        expect(nextFitBias(1.3, 0, 0.7)).toBe(1.3);
    });
});

describe('wiring: layout only', () => {
    const view = readFileSync(new URL('../src/ui/network-view-3d.js', import.meta.url), 'utf8');
    const clusters = readFileSync(new URL('../src/ui/web-clusters.js', import.meta.url), 'utf8');

    it('the play view lays a new flat web out in groups and keeps the group forces on', () => {
        expect(view).toContain("from './web-clusters.js'");
        expect(view).toContain('layoutClustered(this.layoutObjs(), this.layoutPairs()');
        expect(view).toContain('clusterForces(this.layoutObjs(), this.layoutPairs(), this.alpha');
        expect(view).toMatch(/_layoutParams = clusterParams\(/);
        expect(view).toMatch(/_layout3d = clusterParams\(/);
        // A web laid out before the screen had its real size is laid out again.
        expect(view).toContain('REARRANGE_WINDOW_MS');
    });

    it('the cluster code never reads a state or changes a link, and the sim is not involved', () => {
        expect(clusters).not.toMatch(/\.state\b/);
        expect(clusters).not.toMatch(/links\.(push|splice|pop|shift)/);
        expect(clusters).not.toMatch(/from '\.\.\/sim/);
        expect(clusters).not.toMatch(/Math\.random/);
    });
});
