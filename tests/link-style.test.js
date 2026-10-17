import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { linkStyle, LINK_WIDTHS } from '../src/ui/link-style.js';

const KINDS = ['risk', 'normal', 'blocked'];

describe('link style (round 11 playtest fix)', () => {
    it('with Sever selected, at-risk links are the boldest lines on screen', () => {
        const risk = linkStyle('risk', true);
        for (const kind of ['normal', 'blocked']) {
            expect(risk.width).toBeGreaterThan(linkStyle(kind, true).width * 2);
        }
    });

    it('with Sever selected, only at-risk links are red or pulsing', () => {
        for (const kind of KINDS) {
            const s = linkStyle(kind, true);
            expect(s.color === 'risk').toBe(kind === 'risk');
            expect(s.pulse).toBe(kind === 'risk');
        }
    });

    it('selecting Sever makes at-risk links bolder, never thinner', () => {
        expect(linkStyle('risk', true).width).toBeGreaterThan(linkStyle('risk', false).width);
    });

    it('plain links still show they can be cut, protected links fade back', () => {
        expect(linkStyle('normal', true).color).toBe('cuttable');
        expect(linkStyle('normal', true).width).toBeGreaterThan(linkStyle('normal', false).width);
        expect(linkStyle('blocked', true).width).toBeLessThan(linkStyle('blocked', false).width);
    });

    it('without a tool, at-risk links are still wider than the rest', () => {
        expect(linkStyle('risk').width).toBeGreaterThan(linkStyle('normal').width);
        expect(LINK_WIDTHS.normal).toBe(linkStyle('normal').width);
    });

    it('the 3D view uses linkStyle and has no orange flood colour left', () => {
        const src = readFileSync(new URL('../src/ui/network-view-3d.js', import.meta.url), 'utf8');
        expect(src).toContain('linkStyle(kind, severing)');
        expect(src).not.toContain('LINK_COLORS.sever');
    });
});
