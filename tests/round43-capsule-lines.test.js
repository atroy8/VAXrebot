// Item 27 (round 43): cleaner 3D connection lines. Lines are camera-facing
// capsules with round ends that stop at each person's rim and draw under the
// faces, so a line never hides a character.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
    trimToRims,
    writeCapsule,
    capsuleIndex,
    LINE_VERTS,
    LINE_CAP_SEGMENTS,
    TOKEN_RIM,
} from '../src/ui/web3d.js';
import { LINK_WIDTHS, linkStyle } from '../src/ui/link-style.js';

const v = (x, y, z) => ({ x, y, z });
const view = readFileSync(new URL('../src/ui/network-view-3d.js', import.meta.url), 'utf8');

// Simple pinhole projection looking down -z from cam (camera at z = cz).
const project = (p, cam) => {
    const d = cam.z - p.z;
    return { x: (p.x - cam.x) / d, y: (p.y - cam.y) / d };
};

describe('lines stop at the rim of each token', () => {
    it('side-on line: the ends move in by exactly the rim', () => {
        const cut = trimToRims(v(0, 0, 0), v(4, 0, 0), v(2, 0, 50), 0.6, 0.6);
        expect(cut.a.x).toBeCloseTo(0.6, 2);
        expect(cut.b.x).toBeCloseTo(3.4, 2);
    });

    it('a slanted line ends on the rim as seen on screen, from many angles', () => {
        const rim = 0.7;
        const a = v(0, 0, 0);
        for (let i = 0; i < 12; i++) {
            const ang = (i / 12) * Math.PI;
            // Tilt the line toward and away from the camera.
            const b = v(4 * Math.cos(ang) + 0.5, 0.8, 4 * Math.sin(ang) - 2);
            const cam = v(0.3, 0.2, 40);
            const cut = trimToRims(a, b, cam, rim, rim);
            if (!cut) continue;
            const pa = project(a, cam);
            const pe = project(cut.a, cam);
            // Screen distance at the person's depth, scaled back to world units.
            const onScreen = Math.hypot(pe.x - pa.x, pe.y - pa.y) * (cam.z - a.z);
            expect(onScreen).toBeGreaterThan(rim * 0.9);
            expect(onScreen).toBeLessThan(rim * 1.15);
        }
    });

    it('a line pointing at the camera, or too short, is hidden behind its people', () => {
        expect(trimToRims(v(0, 0, 0), v(0, 0, 5), v(0, 0, 30), 0.6, 0.6)).toBeNull();
        expect(trimToRims(v(0, 0, 0), v(1, 0, 0), v(0.5, 0, 30), 0.6, 0.6)).toBeNull();
    });
});

describe('capsules keep the item 15 width and have round ends', () => {
    it('every point lies within half the width of the line, and the widest points are exactly that', () => {
        const a = v(0, 0, 0);
        const b = v(3, 1, -1);
        const cam = v(1, 0, 20);
        const w = LINK_WIDTHS.risk / 2;
        const out = new Float32Array(LINE_VERTS * 3);
        expect(writeCapsule(out, 0, a, b, cam, w)).toBe(LINE_VERTS * 3);
        const pt = (i) => v(out[i * 3], out[i * 3 + 1], out[i * 3 + 2]);
        // Distance from each outline point to the segment a-b.
        const segDist = (p) => {
            const d = v(b.x - a.x, b.y - a.y, b.z - a.z);
            const L = d.x * d.x + d.y * d.y + d.z * d.z;
            let t = ((p.x - a.x) * d.x + (p.y - a.y) * d.y + (p.z - a.z) * d.z) / L;
            t = Math.max(0, Math.min(1, t));
            return Math.hypot(p.x - a.x - d.x * t, p.y - a.y - d.y * t, p.z - a.z - d.z * t);
        };
        for (let i = 0; i < LINE_VERTS; i++) expect(segDist(pt(i))).toBeCloseTo(w, 5);
        // The tip of each round end sticks out past the end point along the line.
        const tipA = pt(LINE_CAP_SEGMENTS / 2);
        const tipB = pt(LINE_CAP_SEGMENTS + 1 + LINE_CAP_SEGMENTS / 2);
        const along = (p) => ((p.x - a.x) * 3 + (p.y - a.y) * 1 + (p.z - a.z) * -1) / Math.hypot(3, 1, 1);
        expect(along(tipA)).toBeLessThan(0);
        expect(along(tipB)).toBeGreaterThan(Math.hypot(3, 1, 1));
    });

    it('the capsule outline is convex so one fan fills it', () => {
        const out = new Float32Array(LINE_VERTS * 3);
        writeCapsule(out, 0, v(0, 0, 0), v(4, 0, 0), v(2, 0, 30), 0.2);
        // Viewed from +z: every turn goes the same way.
        let sign = 0;
        for (let i = 0; i < LINE_VERTS; i++) {
            const p0 = [out[i * 3], out[i * 3 + 1]];
            const j = (i + 1) % LINE_VERTS;
            const l = (i + 2) % LINE_VERTS;
            const p1 = [out[j * 3], out[j * 3 + 1]];
            const p2 = [out[l * 3], out[l * 3 + 1]];
            const cross = (p1[0] - p0[0]) * (p2[1] - p1[1]) - (p1[1] - p0[1]) * (p2[0] - p1[0]);
            if (Math.abs(cross) < 1e-9) continue;
            if (!sign) sign = Math.sign(cross);
            expect(Math.sign(cross)).toBe(sign);
        }
        const idx = capsuleIndex(2);
        expect(idx.length).toBe(2 * (LINE_VERTS - 2) * 3);
        expect(Math.max(...idx)).toBe(2 * LINE_VERTS - 1);
    });

    it('widths still come from link-style (item 15 untouched)', () => {
        expect(linkStyle('risk', true).width).toBe(LINK_WIDTHS.severRisk);
        expect(view).toContain('const w = hidden ? 0 : (style.width * Math.sqrt(this.personScale)) / 2;');
    });
});

describe('the 3D view draws capsules under the faces', () => {
    it('trims to the token rim plus the round end and writes capsules', () => {
        expect(TOKEN_RIM).toBeCloseTo(1.15 / 2);
        expect(view).toContain('const rim = TOKEN_RIM * this.personScale + w;');
        expect(view).toContain('trimToRims(pa, pb, this.camera.position, rim, rim)');
        expect(view).toContain('capsuleIndex(count)');
        expect(view).not.toContain('index.push(o, o + 1, o + 2, o + 2, o + 1, o + 3)');
    });

    it('red lines draw after plain lines but before faces, so they pass behind every face', () => {
        const order = (name) => Number(view.match(new RegExp(`export const ${name} = (-?[0-9.]+);`))[1]);
        const risk = order('RISK_OVERLAY_RENDER_ORDER');
        const face = order('FACE_RENDER_ORDER');
        expect(view).toContain('this.linkMesh.renderOrder = -1;');
        expect(risk).toBeGreaterThan(-1);
        expect(risk).toBeLessThan(face);
        expect(view).toContain('sprite.renderOrder = FACE_RENDER_ORDER;');
        // Still visible through bodies from any angle.
        expect(view).toMatch(/riskMesh = new THREE\.Mesh\([\s\S]*?depthTest: false/);
    });

    it('no em dashes in the new code', () => {
        expect(view).not.toContain('\u2014');
        expect(readFileSync(new URL('../src/ui/web3d.js', import.meta.url), 'utf8')).not.toContain('\u2014');
    });
});
