import { describe, it, expect } from 'vitest';
import { spreadIsOver, checkGameOver } from '../src/sim/engine.js';

const net = (states, links) => ({
    nodes: states.map((state, id) => ({ id, state, daysInfected: 0, sickWhileQuarantined: state === 'quarantined-sick' ? true : undefined })).map((n) =>
        n.state === 'quarantined-sick' ? { ...n, state: 'quarantined' } : n
    ),
    links: links.map(([source, target]) => ({ source, target })),
});
const gs = (over = {}) => ({ day: 3, stats: { initialPopulation: 10, totalDead: 0, totalInfected: 2, totalProtected: 1, linksSevered: 0 }, ...over });

describe('spreadIsOver', () => {
    it('is false while a sick person touches someone healthy', () => {
        expect(spreadIsOver(net(['infected', 'healthy'], [[0, 1]]))).toBe(false);
        expect(spreadIsOver(net(['healthy', 'infected'], [[0, 1]]))).toBe(false);
    });

    it('is true once every sick person is cut off from the healthy', () => {
        // Sick person only touches vaccinated, recovered and isolated people.
        expect(spreadIsOver(net(['infected', 'vaccinated', 'recovered', 'quarantined', 'healthy'], [[0, 1], [0, 2], [0, 3], [3, 4]]))).toBe(true);
        // Sick people touching each other cannot spread either.
        expect(spreadIsOver(net(['infected', 'infected', 'healthy'], [[0, 1]]))).toBe(true);
    });

    it('treats sick people in isolation as unable to spread', () => {
        expect(spreadIsOver(net(['quarantined-sick', 'healthy'], [[0, 1]]))).toBe(true);
    });

    it('works with object links (d3 style) and ignores removed people', () => {
        const n = net(['infected', 'healthy'], []);
        n.links = [{ source: n.nodes[0], target: n.nodes[1] }];
        expect(spreadIsOver(n)).toBe(false);
        n.nodes[1].removed = true;
        expect(spreadIsOver(n)).toBe(true);
    });

    it('is true with nobody sick', () => {
        expect(spreadIsOver(net(['healthy', 'healthy'], [[0, 1]]))).toBe(true);
    });
});

describe('no timeout once spread is over', () => {
    it('keeps playing past the deadline while the last patients recover', () => {
        const n = net(['quarantined-sick', 'healthy'], [[0, 1]]);
        expect(checkGameOver(gs({ day: 10 }), n, 10)).toBeNull();
    });

    it('still times out if the outbreak could still spread', () => {
        const n = net(['infected', 'healthy'], [[0, 1]]);
        expect(checkGameOver(gs({ day: 10 }), n, 10)).toBe('timeout');
    });

    it('a cut-off outbreak still ends as contained once nobody is sick', () => {
        const n = net(['recovered', 'healthy'], [[0, 1]]);
        expect(checkGameOver(gs({ day: 11 }), n, 10)).toBe('contained');
    });

    it('can still be lost on deaths while the last patients resolve', () => {
        const n = net(['quarantined-sick', 'healthy'], [[0, 1]]);
        expect(checkGameOver(gs({ day: 5, stats: { initialPopulation: 10, totalDead: 5, totalInfected: 6, totalProtected: 1, linksSevered: 0 } }), n, 10)).toBe('overwhelmed');
    });
});
