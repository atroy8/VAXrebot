// Items 14 and 15 (round 20): people at least 44 px on a 390 px phone, more
// room between people, thicker lines, red lines drawn over faces in 3D.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
    LAYOUT_3D,
    MIN_PERSON_PX,
    MAX_PERSON_SCALE,
    personPx,
    personScaleFor,
    backDepth,
    layoutForPersonScale,
} from '../src/ui/web3d.js';
import { linkStyle, LINK_WIDTHS } from '../src/ui/link-style.js';

const view = readFileSync(new URL('../src/ui/network-view-3d.js', import.meta.url), 'utf8');

describe('people size on a phone (item 14)', () => {
    it('asks for at least 46 px so every person clears the 44 px touch target', () => {
        expect(MIN_PERSON_PX).toBeGreaterThanOrEqual(44);
    });

    it('projects world size to CSS pixels like a perspective camera', () => {
        // 1 unit at depth d with a 90 degree fov fills 1 / (2 d) of the height.
        expect(personPx(1, 5, 500, 90)).toBeCloseTo(50, 5);
        expect(personPx(1, 10, 500, 90)).toBeCloseTo(25, 5);
    });

    it('grows people until the farthest one is MIN_PERSON_PX wide', () => {
        const s = personScaleFor({ faceWorld: 1.15, depth: 30, heightPx: 510, fovDeg: 48 });
        expect(s).toBeGreaterThan(1);
        expect(personPx(1.15 * s, 30, 510, 48)).toBeCloseTo(MIN_PERSON_PX, 3);
    });

    it('never shrinks people and stops at the cap', () => {
        expect(personScaleFor({ faceWorld: 1.15, depth: 2, heightPx: 510, fovDeg: 48 })).toBe(1);
        expect(personScaleFor({ faceWorld: 1.15, depth: 500, heightPx: 510, fovDeg: 48 })).toBe(MAX_PERSON_SCALE);
        expect(personScaleFor({ faceWorld: 1.15, depth: 30, heightPx: 0, fovDeg: 48 })).toBe(1);
    });

    it('measures the back of the web from any angle (camera distance plus radius)', () => {
        const pts = [{ x: 3, y: 0, z: 0 }, { x: -1, y: 0, z: 0 }, { x: 0, y: 4, z: 0 }];
        expect(backDepth(pts, { distance: 20, tx: 0, ty: 0, tz: 0 })).toBe(24);
    });

    it('bigger people get more room, but spacing grows slower than faces', () => {
        const P = layoutForPersonScale(LAYOUT_3D, 2);
        expect(P.collideDist).toBeGreaterThan(LAYOUT_3D.collideDist);
        expect(P.collideDist / LAYOUT_3D.collideDist).toBeLessThan(2);
        expect(P.restLength).toBeGreaterThan(LAYOUT_3D.restLength);
        expect(layoutForPersonScale(LAYOUT_3D, 1)).toEqual({ ...LAYOUT_3D });
    });

    it('the 3D view scales whole people and widens its tap radius with them', () => {
        expect(view).toContain('obj.group.scale.setScalar(this.personScale)');
        expect(view).toContain('NODE_RADIUS * this.personScale');
        expect(view).toContain('this.updatePersonScale()');
    });
});

describe('lines easy to see and cut (item 15)', () => {
    it('leaves more room between people than before round 20', () => {
        expect(LAYOUT_3D.restLength).toBeGreaterThanOrEqual(3.8);
        expect(LAYOUT_3D.repelDist).toBeGreaterThanOrEqual(4);
        expect(LAYOUT_3D.collideDist).toBeGreaterThanOrEqual(1.9);
    });

    it('every line is about 1.5x thicker than before (normal 0.09, risk 0.15)', () => {
        expect(LINK_WIDTHS.normal).toBeGreaterThanOrEqual(0.135);
        expect(LINK_WIDTHS.risk).toBeGreaterThanOrEqual(0.22);
        expect(linkStyle('risk', true).width).toBeGreaterThan(linkStyle('normal', true).width * 2);
    });

    it('in 3D the red at-risk lines are drawn again on top of everyone', () => {
        expect(view).toMatch(/riskMesh = new THREE\.Mesh\([\s\S]*?depthTest: false/);
        expect(view).toContain('this.riskMesh.renderOrder = RISK_OVERLAY_RENDER_ORDER');
        expect(view).toContain("const onTop = overlay && kind === 'risk' && !hidden");
        // Only in 3D: in the flat view lines already sit under the faces.
        expect(view).toContain('const overlay = this.is3d && !!this.riskMesh');
    });
});
