// Round 37 playtest fixes at 390x844.
// 1. Faces sat off-centre on their bodies: in the flat web each face floated
//    toward the camera along the camera's forward axis, so perspective pushed
//    it outward while the coloured body sphere stayed put. People away from
//    the middle showed a dark crescent of the sphere under or over the face.
//    Now the face floats along its own line of sight (dead centre at any
//    angle), and the 2D web hides the body sphere altogether.
// 2. A lost level has no tally, so the results buttons were not sticky and
//    Try again sat below the fold. The buttons now stay in reach on every
//    results screen, sharing one row on a loss.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { faceParallaxPx, faceLiftDirection, showBodySphere } from '../src/ui/web3d.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

const project = (camera, p) => new THREE.Vector3(p.x, p.y, p.z).project(camera);

describe('faces sit dead centre on their bodies', () => {
    it('the old forward-axis lift drifted several px for people near the edge', () => {
        // A person 150 px from the centre, a 0.63 unit lift, camera 20 units away.
        expect(faceParallaxPx(150, 0.63, 20)).toBeGreaterThan(4);
        expect(faceParallaxPx(0, 0.63, 20)).toBe(0);
        expect(faceParallaxPx(150, 0, 20)).toBe(0);
        expect(faceParallaxPx(150, 5, 4)).toBe(0);
    });

    it('lifting along the line of sight projects onto the body centre (2D camera)', () => {
        const cam = new THREE.PerspectiveCamera(48, 390 / 510, 0.1, 500);
        cam.position.set(0, 0, 20);
        cam.lookAt(0, 0, 0);
        cam.updateMatrixWorld();
        for (const node of [{ x: 6, y: 9, z: 0 }, { x: -7, y: -8, z: 0 }, { x: 0, y: 0, z: 0 }]) {
            const d = faceLiftDirection(node, cam.position);
            const face = { x: node.x + d.x * 0.63, y: node.y + d.y * 0.63, z: node.z + d.z * 0.63 };
            const a = project(cam, node);
            const b = project(cam, face);
            expect(b.x).toBeCloseTo(a.x, 9);
            expect(b.y).toBeCloseTo(a.y, 9);
            // The old lift (straight +z) did not.
            if (node.x !== 0) expect(Math.abs(project(cam, { ...node, z: 0.63 }).x - a.x)).toBeGreaterThan(0.005);
        }
    });

    it('also holds for a turned 3D camera', () => {
        const cam = new THREE.PerspectiveCamera(48, 0.8, 0.1, 500);
        cam.position.set(14, 6, 11);
        cam.lookAt(0, 0, 0);
        cam.updateMatrixWorld();
        const node = { x: -3, y: 4, z: 2 };
        const d = faceLiftDirection(node, cam.position);
        expect(Math.hypot(d.x, d.y, d.z)).toBeCloseTo(1, 12);
        const a = project(cam, node);
        const b = project(cam, { x: node.x + d.x, y: node.y + d.y, z: node.z + d.z });
        expect(b.x).toBeCloseTo(a.x, 9);
        expect(b.y).toBeCloseTo(a.y, 9);
    });

    it('falls back to straight up when the camera sits on the person', () => {
        expect(faceLiftDirection({ x: 1, y: 1, z: 1 }, { x: 1, y: 1, z: 1 })).toEqual({ x: 0, y: 0, z: 1 });
    });

    it('shows the body sphere only in 3D', () => {
        expect(showBodySphere(true)).toBe(true);
        expect(showBodySphere(false)).toBe(false);
    });

    it('is wired into the web view', () => {
        const view = read('src/ui/network-view-3d.js');
        expect(view).toMatch(/faceLiftDirection\(obj\.pos, this\.camera\.position\)/);
        expect(view).toMatch(/showBodySphere\(this\.is3d\)/);
        expect(view).toMatch(/obj\.sphere\.visible = body/);
        expect(view).not.toMatch(/sprite\.position\.copy\(_tmp2\)/);
    });
});

describe('results buttons stay in reach after a loss', () => {
    const css = read('src/ui/game-screen.css');

    it('makes the buttons sticky on every results screen, not only with a tally', () => {
        expect(css).toMatch(/#game-over-screen \.game-over-actions \{[^}]*position:\s*sticky/);
        expect(css).not.toMatch(/#game-over-screen\.has-tally \.game-over-actions \{/);
    });

    it('puts Back to map and Try again side by side on a loss', () => {
        expect(css).toMatch(/\.game-over-actions\.lead-replay \{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*1fr 1fr/);
        expect(css).toMatch(/\.game-over-actions\.lead-replay #play-again \{[^}]*order:\s*2/);
    });
});
