import { describe, it, expect } from 'vitest';
import { pickTapTarget, distToSegment, MIN_TARGET_PX } from '../src/ui/tap-target.js';

const A = { x: 100, y: 100, r: 20, node: 'A' };
const B = { x: 200, y: 100, r: 20, node: 'B' };
const C = { x: 100, y: 200, r: 20, node: 'C' };
const AB = { ax: 100, ay: 100, bx: 200, by: 100, link: 'AB' };
const AC = { ax: 100, ay: 100, bx: 100, by: 200, link: 'AC', atRisk: true };

describe('distToSegment', () => {
    it('measures to the closest point on the segment', () => {
        expect(distToSegment(150, 110, 100, 100, 200, 100)).toBeCloseTo(10);
        expect(distToSegment(90, 100, 100, 100, 200, 100)).toBeCloseTo(10);
    });
});

describe('pickTapTarget', () => {
    it('Sever goes to a link even when the tap starts on a person', () => {
        const hit = pickTapTarget({ x: 112, y: 104, mode: 'link', nodes: [A, B, C], links: [AB, AC] });
        expect(hit.kind).toBe('link');
    });

    it('Sever prefers an at-risk link when two are about equally close', () => {
        const hit = pickTapTarget({ x: 106, y: 108, mode: 'link', nodes: [A, B, C], links: [AB, AC] });
        expect(hit.link.link).toBe('AC');
    });

    it('Sever ignores taps far from every link', () => {
        expect(pickTapTarget({ x: 170, y: 170, mode: 'link', nodes: [A, B, C], links: [AB, AC] })).toBeNull();
    });

    it('a person tool snaps to the nearest person when the tap lands on a link', () => {
        const hit = pickTapTarget({ x: 180, y: 102, mode: 'node', nodes: [A, B, C], links: [AB] });
        expect(hit).toEqual({ kind: 'node', node: B });
    });

    it('every person is at least the minimum touch size', () => {
        const tiny = { x: 300, y: 300, r: 6, node: 'T' };
        const hit = pickTapTarget({ x: 300 + MIN_TARGET_PX / 2 - 1, y: 300, mode: 'node', nodes: [tiny] });
        expect(hit.node.node).toBe('T');
        expect(pickTapTarget({ x: 300 + MIN_TARGET_PX / 2 + 2, y: 300, mode: 'node', nodes: [tiny] })).toBeNull();
    });

    it('picks the closer of two neighbours', () => {
        const hit = pickTapTarget({ x: 160, y: 100, mode: 'node', nodes: [A, B] });
        expect(hit).toBeNull();
        const hit2 = pickTapTarget({ x: 182, y: 100, mode: 'node', nodes: [A, B] });
        expect(hit2.node.node).toBe('B');
    });

    it('a person tool never returns a link', () => {
        expect(pickTapTarget({ x: 150, y: 100, mode: 'node', nodes: [A, B], links: [AB] })).toBeNull();
    });
});
