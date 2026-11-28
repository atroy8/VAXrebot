// Wide audience round, mechanic 4: R0 that climbs. From the third planet on
// people have more contacts, so the disease is truly more contagious and
// the briefing's "R0 here" says so. The learning planets keep their webs.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { generateSmallWeb, generateNetwork, SMALL_WEB_DEGREE } from '../src/sim/network.js';
import { levelR0Range, webR0, linkChance } from '../src/sim/r0.js';
import { liveR } from '../src/sim/actions.js';
import { buildOutbreak } from '../src/sim/setup.js';
import { mulberry32 } from '../src/sim/balance.js';
import { LEVELS, REGIONS } from '../src/config/levels.js';
import { levelRules } from '../src/config/level-rules.js';
import { rollLevelRules } from '../src/config/difficulty-roll.js';
import { PLANET_WEB_DEGREE, webDegreeFor } from '../src/config/planet-mechanics.js';
import { levelR0, planetR0 } from '../scripts/r0-table.mjs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const TYPES = ['scale-free', 'small-world', 'random'];
const contacts = (n, links) => (2 * links.length) / n;

function meanContacts(type, degree, runs = 120) {
    let sum = 0;
    for (let seed = 1; seed <= runs; seed++) {
        const n = 12 + (seed % 18);
        sum += contacts(n, generateSmallWeb(type, n, mulberry32(seed), degree).links);
    }
    return sum / runs;
}

describe('denser webs', () => {
    it('at the classic degree the same seed builds the same web as before', () => {
        expect(SMALL_WEB_DEGREE).toBe(4);
        for (const type of TYPES) {
            for (let seed = 1; seed <= 25; seed++) {
                const n = 8 + (seed % 20);
                const classic = generateSmallWeb(type, n, mulberry32(seed));
                expect(generateSmallWeb(type, n, mulberry32(seed), 4)).toEqual(classic);
                expect(generateNetwork(type, n, mulberry32(seed), undefined)).toEqual(classic);
                expect(generateNetwork(type, n, mulberry32(seed), null)).toEqual(classic);
            }
        }
    });

    it('a higher degree gives every kind of web more contacts per person', () => {
        for (const type of TYPES) {
            const d4 = meanContacts(type, 4);
            const d5 = meanContacts(type, 5);
            const d6 = meanContacts(type, 5.8);
            expect(d5 - d4, type).toBeGreaterThan(0.6);
            expect(d6 - d5, type).toBeGreaterThan(0.4);
            expect(d6, type).toBeLessThan(6.2);
        }
    });

    it('denser webs are still clean: no double lines, no self links, nobody alone', () => {
        for (const type of TYPES) {
            for (let seed = 1; seed <= 30; seed++) {
                const n = 10 + (seed % 22);
                const { links } = generateSmallWeb(type, n, mulberry32(seed), 5.8);
                const seen = new Set();
                const touched = new Set();
                for (const l of links) {
                    expect(l.source).not.toBe(l.target);
                    const key = [l.source, l.target].sort((a, b) => a - b).join('-');
                    expect(seen.has(key), `${type} ${seed} ${key}`).toBe(false);
                    seen.add(key);
                    touched.add(l.source);
                    touched.add(l.target);
                }
                expect(touched.size).toBe(n);
            }
        }
    });
});

describe('the climb starts on the third planet', () => {
    it('the learning planets keep the classic degree', () => {
        expect(webDegreeFor(0)).toBe(null);
        expect(webDegreeFor(1)).toBe(null);
        expect(PLANET_WEB_DEGREE.slice(0, 2)).toEqual([null, null]);
        for (const level of LEVELS.filter((l) => l.planetIndex < 2)) expect(levelRules(level).scenario.webDegree, level.id).toBeUndefined();
    });

    it('contacts per person rise planet by planet after that', () => {
        const later = PLANET_WEB_DEGREE.slice(2);
        expect(later[0]).toBeGreaterThan(SMALL_WEB_DEGREE);
        for (let i = 1; i < later.length; i++) expect(later[i]).toBeGreaterThan(later[i - 1]);
        expect(later.at(-1)).toBeLessThanOrEqual(6);
        for (const level of LEVELS.filter((l) => l.planetIndex >= 2)) {
            expect(levelRules(level).scenario.webDegree, level.id).toBe(PLANET_WEB_DEGREE[level.planetIndex]);
            // The per-play roll keeps it.
            expect(rollLevelRules(level, () => 0.5).scenario.webDegree).toBe(PLANET_WEB_DEGREE[level.planetIndex]);
        }
    });

    it('the level is built on the denser web', () => {
        const level = LEVELS.find((l) => l.planetIndex >= 6 && !l.variant && !l.mechanics);
        const { scenario } = levelRules(level);
        let dense = 0;
        let classic = 0;
        for (let seed = 1; seed <= 60; seed++) {
            const a = buildOutbreak({ scenario, population: 24, rng: mulberry32(seed) });
            const b = buildOutbreak({ scenario: { ...scenario, webDegree: undefined }, population: 24, rng: mulberry32(seed) });
            dense += contacts(24, a.links);
            classic += contacts(24, b.links);
        }
        // Round 57: the climb is gentler (5.0 contacts on the last planet,
        // was 5.8): with certain spread one more contact is a far bigger step.
        expect(dense / 60 - classic / 60).toBeGreaterThan(0.5);
    });
});

describe('the briefing reports the climb', () => {
    const r0 = REGIONS.map((r) => planetR0(r.id));

    it('R0 here stays where it was on the learning planets', () => {
        expect(r0[0]).toBeGreaterThan(3.2);
        expect(r0[0]).toBeLessThan(3.9);
        expect(r0[1]).toBeGreaterThan(3.2);
        expect(r0[1]).toBeLessThan(3.9);
    });

    it('and rises on every planet from the third to the last', () => {
        expect(r0[2]).toBeGreaterThan(r0[1]);
        for (let i = 3; i < r0.length; i++) expect(r0[i], REGIONS[i].id).toBeGreaterThan(r0[i - 1] + 0.05);
        // A climb a player can see: about 1 from the learning planets to the
        // last (round 57: was 1.2 and up; see PLANET_WEB_DEGREE for why).
        expect(r0.at(-1) - r0[1]).toBeGreaterThan(0.9);
        expect(r0.at(-1)).toBeGreaterThan(4.5);
    });

    it('the HUD on day 1 starts near the R0 the briefing promised, on dense webs too', () => {
        for (const level of LEVELS.filter((l) => l.planetIndex >= 2 && !l.variant && !l.mechanics && l.levelInPlanet % 2 === 0)) {
            const { scenario, difficulty } = rollLevelRules(level, () => 0.5);
            const rate = scenario.baseTransmissionRate * difficulty.transmissionMultiplier;
            const promised = levelR0(level).mid;
            let live = 0;
            const runs = 80;
            for (let seed = 1; seed <= runs; seed++) {
                const [lo, hi] = scenario.populationRange;
                const population = lo + (seed % (hi - lo + 1));
                const out = buildOutbreak({ scenario, population, rng: mulberry32(seed) });
                live += liveR({ nodes: out.nodes, links: out.links }, rate, difficulty.recoveryTime, difficulty);
            }
            expect(Math.abs(live / runs - promised), `${level.id}: live ${live / runs} promised ${promised}`).toBeLessThan(1);
        }
    });

    // Round 57: a hidden carrier level has the same R0 as any other web of
    // its shape: every contact is a certain case, with or without symptoms.
    it('R0 is contacts per person on a hidden carrier level too', () => {
        const inc = { incubation: { count: 2, days: 2 } };
        expect(linkChance(0.2, 3, inc)).toBe(1);
        const ring = { nodes: [0, 1, 2, 3].map((id) => ({ id })), links: [[0, 1], [1, 2], [2, 3], [3, 0]].map(([source, target]) => ({ source, target })) };
        expect(webR0(ring, 0.2, 3, inc)).toBe(2);
        // The sampler passes the degree through.
        const base = { networkType: 'small-world', populationRange: [20, 20], samples: 30 };
        const classic = levelR0Range({ ...base, rng: mulberry32(1) });
        const dense = levelR0Range({ ...base, rng: mulberry32(1), degree: 5.8 });
        expect(dense.lo).toBeGreaterThan(classic.hi);
    });

    it('game.js hands the degree to the briefing R0', () => {
        const game = read('src/game.js');
        expect(game).toContain('degree: this.currentScenario.webDegree,');
        expect(read('src/sim/setup.js')).toContain('population, rng, scenario.webDegree)');
    });
});
