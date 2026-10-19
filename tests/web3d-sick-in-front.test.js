import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { yawToward, viewDirection, orbitPosition, fitOrbit, settleLayout3d } from '../src/ui/web3d.js';
import { generateNetwork } from '../src/sim/network.js';

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

function cloud(n = 45, seed = 1) {
    const objs = [];
    for (let i = 0; i < n; i++) {
        const t = (i + seed) / n;
        objs.push({ pos: { x: Math.cos(i * seed) * 3 * t, y: Math.sin(i * 1.3) * 3 * t, z: Math.cos(i * 0.7 + seed) * 3 * t }, vel: { x: 0, y: 0, z: 0 } });
    }
    const { links } = generateNetwork('small-world', n);
    settleLayout3d(objs, links.map((l) => [objs[l.source], objs[l.target]]), { maxSteps: 400 });
    return objs.map((o) => o.pos);
}

// Rank of a point by distance to the camera: 0 = nearest person.
function rankFromCamera(points, p, view) {
    const cam = orbitPosition(view);
    const d = dist(p, cam);
    return points.filter((q) => dist(q, cam) < d).length;
}

describe('3D web opens with the sick people in front (round 16)', () => {
    it('turns the camera to the side of the cloud where the sick person is', () => {
        const all = [{ x: 0, y: 0, z: 0 }, { x: 5, y: 0, z: 0 }, { x: -5, y: 0, z: 0 }, { x: 0, y: 0, z: -5 }];
        const sick = [{ x: 5, y: 0, z: 0 }];
        const yaw = yawToward(sick, all);
        const dir = viewDirection({ yaw, pitch: 0 });
        expect(dir.x).toBeGreaterThan(0.9);
    });

    it('puts patient zero among the nearest people across many real layouts', () => {
        for (let seed = 1; seed <= 12; seed++) {
            const pts = cloud(45, seed);
            // The person farthest from the camera at the default yaw: the worst case.
            const start = fitOrbit(pts, { yaw: 0.5, pitch: 0.28, aspect: 0.6 });
            const sick = pts.reduce((a, b) => (dist(b, orbitPosition(start)) > dist(a, orbitPosition(start)) ? b : a));
            expect(rankFromCamera(pts, sick, start)).toBeGreaterThan(30);
            const yaw = yawToward([sick], pts, 0.5);
            const view = fitOrbit(pts, { yaw, pitch: 0.28, aspect: 0.6 });
            // Now in the front half of the crowd (usually the front few).
            expect(rankFromCamera(pts, sick, view)).toBeLessThan(pts.length / 2);
        }
    });

    it('keeps the current yaw when nobody is sick or the sick sit on the axis', () => {
        const all = [{ x: 1, y: 0, z: 0 }, { x: -1, y: 0, z: 0 }];
        expect(yawToward([], all, 0.7)).toBe(0.7);
        expect(yawToward([{ x: 0, y: 3, z: 0 }], all, 0.7)).toBe(0.7);
    });

    it('the 3D view uses it on level start and on switching to 3D, and the pulse ring shows through the crowd', () => {
        const src = readFileSync(new URL('../src/ui/network-view-3d.js', import.meta.url), 'utf8');
        expect(src).toContain('if (isInitial && this.is3d) this.faceTheSick();');
        expect(src).toContain('if (this.is3d) this.faceTheSick();');
        expect(src).toMatch(/pulseMaterial = new THREE\.MeshBasicMaterial\(\{[^}]*depthTest: false[^}]*fog: false/);
        expect(src).toContain('sphereMaterials.infected.fog = false');
    });
});
