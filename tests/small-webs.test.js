// Item 14 (round 20): smaller webs, 10 to 12 people on the first planet
// growing to 21 to 25 on the last, clean small networks, and a carrier who
// knows about half the web.
import { describe, it, expect } from 'vitest';
import { LEVELS, REGIONS } from '../src/config/levels.js';
import { PLANET_POPULATION, populationFor } from '../src/config/campaign.js';
import { levelRules } from '../src/config/level-rules.js';
import { buildRun, mulberry32 } from '../src/sim/balance.js';
import { generateSmallWeb, cleanLinks, generateNetwork, SMALL_WEB_MAX } from '../src/sim/network.js';
import { adjacency } from '../src/sim/variants.js';

const pairKey = (l) => {
    const a = typeof l.source === 'object' ? l.source.id : l.source;
    const b = typeof l.target === 'object' ? l.target.id : l.target;
    return a < b ? `${a}-${b}` : `${b}-${a}`;
};

function connected(n, links) {
    const adj = adjacency(Array.from({ length: n }, (_, id) => ({ id })), links);
    const seen = new Set([0]);
    const q = [0];
    while (q.length) for (const nb of adj.get(q.pop())) if (!seen.has(nb)) seen.add(nb), q.push(nb);
    return seen.size === n;
}

describe('web size per planet (item 14)', () => {
    it('runs from 10 to 12 people on the first planet to 21 to 25 on the last', () => {
        expect(PLANET_POPULATION).toHaveLength(REGIONS.length);
        expect(PLANET_POPULATION[0]).toEqual([10, 12]);
        expect(PLANET_POPULATION.at(-1)).toEqual([21, 25]);
    });

    it('never shrinks from one planet to the next', () => {
        for (let i = 1; i < PLANET_POPULATION.length; i++) {
            expect(PLANET_POPULATION[i][0]).toBeGreaterThanOrEqual(PLANET_POPULATION[i - 1][0]);
            expect(PLANET_POPULATION[i][1]).toBeGreaterThanOrEqual(PLANET_POPULATION[i - 1][1]);
        }
    });

    it("every level's population sits in its planet's range, bosses at the top", () => {
        for (const level of LEVELS) {
            const [lo, hi] = PLANET_POPULATION[level.planetIndex];
            const { scenario } = levelRules(level);
            expect(scenario.populationRange[0], level.id).toBeGreaterThanOrEqual(lo);
            expect(scenario.populationRange[1], level.id).toBeLessThanOrEqual(hi);
            if (level.variant?.boss) expect(scenario.populationRange, level.id).toEqual([hi, hi]);
        }
        expect(populationFor(7, { boss: true })).toEqual([25, 25]);
    });

    it('the game and the bots build webs of that size', () => {
        for (const level of [LEVELS[0], LEVELS[9], LEVELS[44], LEVELS.at(-1)]) {
            const [lo, hi] = PLANET_POPULATION[level.planetIndex];
            for (let seed = 1; seed <= 8; seed++) {
                const n = buildRun(level, mulberry32(seed)).network.nodes.length;
                expect(n).toBeGreaterThanOrEqual(lo);
                expect(n).toBeLessThanOrEqual(hi);
            }
        }
    });
});

describe('clean small webs (item 14)', () => {
    for (const type of ['scale-free', 'small-world', 'random']) {
        it(`${type}: no self links, no double lines, nobody alone, about 4 contacts each`, () => {
            const degrees = [];
            for (let seed = 1; seed <= 30; seed++) {
                const n = 10 + (seed % 16);
                const { links } = generateSmallWeb(type, n, mulberry32(seed));
                expect(links.every((l) => l.source !== l.target)).toBe(true);
                expect(new Set(links.map(pairKey)).size).toBe(links.length);
                expect(connected(n, links)).toBe(true);
                degrees.push((2 * links.length) / n);
            }
            const mean = degrees.reduce((a, b) => a + b, 0) / degrees.length;
            expect(mean).toBeGreaterThanOrEqual(3);
            expect(mean).toBeLessThanOrEqual(5);
        });
    }

    it('cleanLinks joins separate groups and drops repeats', () => {
        const { links } = cleanLinks(6, [{ source: 0, target: 1 }, { source: 1, target: 0 }, { source: 2, target: 2 }, { source: 3, target: 4 }], mulberry32(1));
        expect(new Set(links.map(pairKey)).size).toBe(links.length);
        expect(connected(6, links)).toBe(true);
        expect(links.some((l) => l.source === l.target)).toBe(false);
    });

    it('webs up to the small web limit use the small shapes', () => {
        const { links } = generateNetwork('scale-free', SMALL_WEB_MAX, mulberry32(2));
        expect(new Set(links.map(pairKey)).size).toBe(links.length);
    });

    it('every campaign web has no doubles and nobody left alone (carrier links included)', () => {
        for (const level of LEVELS.filter((_, i) => i % 7 === 0 || i % 10 === 9)) {
            for (let seed = 1; seed <= 4; seed++) {
                const { network } = buildRun(level, mulberry32(seed * 31));
                const n = network.nodes.length;
                expect(new Set(network.links.map(pairKey)).size, level.id).toBe(network.links.length);
                const adj = adjacency(network.nodes, network.links);
                for (const node of network.nodes) expect(adj.get(node.id).size, level.id).toBeGreaterThan(0);
                expect(n).toBeLessThanOrEqual(25);
            }
        }
    });

    it('the super-spreader knows at least about half the web (more if the web already had a big hub)', () => {
        for (const level of LEVELS.filter((l) => l.variant?.type === 'superSpreader')) {
            const { network, state } = buildRun(level, mulberry32(5));
            const adj = adjacency(network.nodes, network.links);
            const share = adj.get(state.superSpreaderId).size / network.nodes.length;
            expect(share, level.id).toBeGreaterThanOrEqual(0.45);
        }
    });
});
