import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { binFor, isBoxed, careCounts, BINS } from '../src/ui/care-box-model.js';

describe('care box on the right of the game screen', () => {
    it('sorts people into treatment, isolated and cured', () => {
        expect(binFor({ state: 'quarantined', sickWhileQuarantined: true })).toBe('treatment');
        expect(binFor({ state: 'quarantined', sickWhileQuarantined: false })).toBe('isolated');
        expect(binFor({ state: 'recovered' })).toBe('cured');
        for (const state of ['healthy', 'infected', 'vaccinated', 'dead']) expect(binFor({ state })).toBeNull();
        expect(binFor({ state: 'recovered', removed: true })).toBeNull();
    });

    it('people in the box leave the network; vaccinated people stay as a barrier', () => {
        expect(isBoxed({ state: 'recovered' })).toBe(true);
        expect(isBoxed({ state: 'vaccinated' })).toBe(false);
        expect(isBoxed({ state: 'infected' })).toBe(false);
    });

    it('counts each bin', () => {
        const nodes = [
            { state: 'quarantined', sickWhileQuarantined: true },
            { state: 'quarantined', sickWhileQuarantined: true },
            { state: 'quarantined' },
            { state: 'recovered' },
            { state: 'healthy' },
        ];
        expect(careCounts(nodes)).toEqual({ treatment: 2, isolated: 1, cured: 1 });
    });

    it('a treated person who recovers moves from Treating to Cured', () => {
        const n = { state: 'quarantined', sickWhileQuarantined: true };
        expect(binFor(n)).toBe('treatment');
        n.state = 'recovered';
        n.sickWhileQuarantined = false;
        expect(binFor(n)).toBe('cured');
    });

    it('has three labeled bins with short labels that fit a 64 px column', () => {
        expect(BINS.map((b) => b.id)).toEqual(['treatment', 'isolated', 'cured']);
        for (const b of BINS) expect(b.label.length).toBeLessThanOrEqual(9);
    });

    it('sits to the right of the network in the markup', () => {
        const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
        expect(html.indexOf('id="care-box"')).toBeGreaterThan(html.indexOf('network-container'));
    });
});
