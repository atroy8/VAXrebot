import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { linkChance, webR0, levelR0Range, formatR0 } from '../src/sim/r0.js';
import { liveR } from '../src/sim/actions.js';
import { buildOutbreak } from '../src/sim/setup.js';
import { LEVELS } from '../src/config/levels.js';
import { rollLevelRules } from '../src/config/difficulty-roll.js';
import { r0High, rExplainer } from '../src/ui/game-screen-model.js';

function seeded(seed) {
    let s = seed >>> 0;
    return () => {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 4294967296;
    };
}

const rulesAt = (level, t = 0.5) => rollLevelRules(level, () => t);
const rateOf = ({ scenario, difficulty }) => scenario.baseTransmissionRate * difficulty.transmissionMultiplier;

describe('R0 here is worked out from the level (round 52)', () => {
    it('uses the per-link chance over a whole sick spell, like live R', () => {
        expect(linkChance(1, 5)).toBe(1);
        expect(linkChance(0, 5)).toBe(0);
        expect(linkChance(0.5, 2)).toBeCloseTo(0.75, 5);
        // A ring of 4: everyone has 2 contacts.
        const ring = { nodes: [0, 1, 2, 3].map((id) => ({ id })), links: [[0, 1], [1, 2], [2, 3], [3, 0]].map(([source, target]) => ({ source, target })) };
        expect(webR0(ring, 0.5, 2)).toBeCloseTo(1.5, 5);
        // On a fully healthy web with one case, live R for that case is its
        // own contacts times the same chance.
        const one = { nodes: ring.nodes.map((n) => ({ ...n, state: n.id === 0 ? 'infected' : 'healthy', daysInfected: 0 })), links: ring.links };
        expect(liveR(one, 0.5, 2)).toBeCloseTo(webR0(ring, 0.5, 2), 5);
        // Removed people do not count.
        const gone = { nodes: ring.nodes.map((n) => ({ ...n, removed: n.id === 3 })), links: ring.links };
        expect(webR0(gone, 1, 1)).toBeCloseTo(4 / 3, 5);
    });

    it('formats in halves, as one number or a short range', () => {
        expect(formatR0(3.9)).toBe('about 4');
        expect(formatR0(3.3, 3.4)).toBe('about 3.5');
        expect(formatR0(2.9, 4.1)).toBe('3 to 4');
        expect(formatR0(NaN)).toBe('');
        expect(r0High(formatR0(2.9, 4.1))).toBe(4);
        expect(r0High(formatR0(3.9))).toBe(4);
    });

    it('level 1 promises the R the player sees on day 1, not the old 1.5 to 2 label', () => {
        const rules = rulesAt(LEVELS[0]);
        const { lo, hi } = levelR0Range({ networkType: rules.scenario.networkType, populationRange: rules.scenario.populationRange, transmissionRate: rateOf(rules), recoveryTime: rules.difficulty.recoveryTime, rng: seeded(7) });
        expect(lo).toBeGreaterThan(2.5);
        expect(formatR0(lo, hi)).not.toBe('1.5 - 2.0');
    });

    it('every level gets a readable R0, and the built webs land inside or near the briefing range', () => {
        let inside = 0;
        let total = 0;
        for (const [i, level] of LEVELS.entries()) {
            const rules = rulesAt(level);
            const rate = rateOf(rules);
            const rt = rules.difficulty.recoveryTime;
            const { lo, hi } = levelR0Range({ networkType: rules.scenario.networkType, populationRange: rules.scenario.populationRange, transmissionRate: rate, recoveryTime: rt, rng: seeded(100 + i), degree: rules.scenario.webDegree, rules: rules.difficulty }); // wide audience round: later planets have denser webs
            const text = formatR0(lo, hi);
            expect(text, level.id).toMatch(/^(about \d+(\.5)?|\d+(\.5)? to \d+(\.5)?)$/);
            expect(r0High(text), level.id).toBeGreaterThan(0);
            expect(text).not.toContain('—');
            const rng = seeded(500 + i);
            const [a, b] = rules.scenario.populationRange;
            for (let k = 0; k < 10; k++) {
                const population = a + Math.floor(rng() * (b - a + 1));
                const out = buildOutbreak({ scenario: rules.scenario, population, variant: level.variant || null, rng });
                const r = webR0({ nodes: out.nodes, links: out.links }, rate, rt, rules.difficulty);
                total++;
                if (r >= lo - 0.5 && r <= hi + 0.5) inside++;
            }
        }
        expect(inside / total).toBeGreaterThanOrEqual(0.85);
    });

    it('the R card explains R above R0 by busy sick people, not a crowded town', () => {
        const all = (e) => [e.headline, ...e.lines].join(' ');
        expect(all(rExplainer({ r: 5.5, r0: 'about 4' }))).toMatch(/R₀ is about 4/);
        expect(all(rExplainer({ r: 5.5, r0: 'about 4' }))).toMatch(/more contacts than most/);
        expect(all(rExplainer({ r: 4.2, r0: 'about 4' }))).not.toMatch(/more contacts/);
    });

    it('game.js no longer shows the fixed difficulty label as R0 here', () => {
        const src = readFileSync(new URL('../src/game.js', import.meta.url), 'utf8');
        expect(src).not.toContain('this.difficulties[level.difficultyId]?.R0');
        expect(src).toContain('this.currentR0 = formatR0(r0.lo, r0.hi);');
        expect(src).toContain('this.currentR0 = formatR0(webR);');
    });
});

describe('tap toasts fade when the day turns (round 52)', () => {
    const saved = globalThis.document;
    afterEach(() => {
        globalThis.document = saved;
    });

    it('fades info and error toasts but keeps good news', async () => {
        globalThis.Image ||= class {};
        const { dismissTapToasts } = await import('../src/ui/panels.js');
        const mk = (className, textContent) => ({ className, textContent, dataset: {}, style: {}, remove() {} });
        const children = [mk('notification info', 'Sever Link is used up for today. It is back tomorrow.'), mk('notification error', 'Not there'), mk('notification success', 'R is below 1!')];
        globalThis.document = { getElementById: (id) => (id === 'notification-container' ? { children } : null) };
        dismissTapToasts();
        expect(children[0].dataset.leaving).toBe('1');
        expect(children[1].dataset.leaving).toBe('1');
        expect(children[2].dataset.leaving).toBeUndefined();
    });

    it('nextDay clears them before the new day is drawn', () => {
        const src = readFileSync(new URL('../src/game.js', import.meta.url), 'utf8');
        const body = src.slice(src.indexOf('    nextDay() {'), src.indexOf('advanceDay(this.gameState'));
        expect(body).toContain('dismissTapToasts();');
    });
});
