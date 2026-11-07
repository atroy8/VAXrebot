// Round 35: R right now. The HUD R is read off the web as it stands, so a
// cut or an isolation moves it at once instead of a day later, and one
// unlucky day on a small web no longer shows R 5+.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { liveR, severLink, applyNodeTool } from '../src/sim/actions.js';
import { rExplainer } from '../src/ui/game-screen-model.js';
import { initGameState } from '../src/sim/state.js';

const TOOLS = { vaccinate: {}, quarantine: {}, severLink: {} };
const createGameState = () => initGameState(TOOLS, 6);

const person = (id, state = 'healthy', daysInfected = 0) => ({ id, state, daysInfected });
const link = (a, b) => ({ source: a, target: b });

// One sick person with three healthy contacts, plus a quiet pair.
function star() {
    return {
        nodes: [person(0, 'infected'), person(1), person(2), person(3), person(4), person(5)],
        links: [link(0, 1), link(0, 2), link(0, 3), link(4, 5)],
    };
}

describe('liveR', () => {
    it('counts the healthy contacts each spreader can still reach', () => {
        // Rate 1: every open contact is certain, so R is the number of red links.
        expect(liveR(star(), 1, 5)).toBe(3);
    });

    it('weights each contact by the chance of passing it on before recovery', () => {
        const r = liveR(star(), 0.2, 3);
        expect(r).toBeCloseTo(3 * (1 - 0.8 ** 3), 6);
        // Fewer days left means less chance.
        const late = star();
        late.nodes[0].daysInfected = 2;
        expect(liveR(late, 0.2, 3)).toBeCloseTo(3 * 0.2, 6);
    });

    it('drops the moment a red link is cut', () => {
        const net = star();
        const state = createGameState();
        expect(liveR(net, 1, 5)).toBe(3);
        severLink(state, net, net.links[0]);
        expect(liveR(net, 1, 5)).toBe(2);
        severLink(state, net, net.links[0]);
        expect(liveR(net, 1, 5)).toBe(1);
    });

    it('drops to 0 when the only spreader is isolated', () => {
        const net = star();
        const state = createGameState();
        applyNodeTool(state, TOOLS, 'quarantine', net.nodes[0]);
        expect(liveR(net, 1, 5)).toBe(0);
    });

    it('vaccinating a contact closes that link', () => {
        const net = star();
        const state = createGameState();
        applyNodeTool(state, TOOLS, 'vaccinate', net.nodes[1]);
        expect(liveR(net, 1, 5)).toBe(2);
    });

    it('averages over every spreader and ignores sick contacts and the isolated', () => {
        const net = {
            nodes: [person(0, 'infected'), person(1, 'infected'), person(2), person(3, 'quarantined'), person(4, 'recovered')],
            links: [link(0, 1), link(0, 2), link(1, 3), link(1, 4)],
        };
        // Person 0 reaches 2, person 1 reaches nobody: (1 + 0) / 2.
        expect(liveR(net, 1, 5)).toBe(0.5);
    });

    it('is 0 when nobody can spread, never null', () => {
        expect(liveR({ nodes: [person(0), person(1)], links: [link(0, 1)] }, 0.5, 5)).toBe(0);
        expect(liveR({ nodes: [], links: [] }, 0.5, 5)).toBe(0);
    });

    it('reads links that point at node objects (the view resolves them)', () => {
        const net = star();
        net.links = net.links.map((l) => ({ source: net.nodes[l.source], target: net.nodes[l.target] }));
        expect(liveR(net, 1, 5)).toBe(3);
    });

    it('clamps odd rates', () => {
        expect(liveR(star(), 4.5, 5)).toBe(3);
        expect(liveR(star(), -1, 5)).toBe(0);
    });
});

describe('R card says R moves with your moves', () => {
    it('growing text points at red links and says it drops at once', () => {
        const all = (e) => [e.headline, ...e.lines].join(' ');
        expect(all(rExplainer({ r: 2 }))).toMatch(/can still reach about 2 others through red links/);
        expect(all(rExplainer({ r: 2 }))).toMatch(/drops the moment you act/);
        expect(all(rExplainer({ r: 0 }))).toMatch(/No sick person can reach a healthy one/);
        for (const r of [0, 0.5, 2, 7]) expect(all(rExplainer({ r }))).not.toContain('—');
    });
});

describe('game.js wiring', () => {
    const src = readFileSync(new URL('../src/game.js', import.meta.url), 'utf8');
    it('recomputes R on every UI refresh, so taps move it', () => {
        expect(src).toMatch(/updateUI\(\) \{\s*this\.refreshR\(\);/);
        expect(src).toContain('this.lastR = liveR(this.network,');
    });
    it('no longer blends yesterday into R', () => {
        expect(src).not.toContain('effectiveR(');
        expect(src).not.toContain('0.5 * rToday');
    });
    it('celebrates R under 1 once per level, not after the level ends or when spread already stopped', () => {
        expect(src).toContain('!this.gameState.stats.rBelowOneDay && rFellBelowOne(prevR, this.lastR)');
        expect(src).toMatch(/!this\.gameState\.gameOver && !this\.wrapUp && .*this\.lastR < 0\.95 && !spreadIsOver\(this\.network\)/);
    });
});

describe('R nudge in the HUD', () => {
    it('says which way R moved, ignoring tiny moves and moves inside 5+', async () => {
        const { rTick } = await import('../src/ui/game-screen-model.js');
        expect(rTick(3, 2)).toBe('down');
        expect(rTick(1, 1.8)).toBe('up');
        expect(rTick(2, 2.02)).toBeNull();
        expect(rTick(6, 8)).toBeNull();
        expect(rTick(null, 1)).toBeNull();
    });
    it('is wired to the R stat with a short animation and a reduced motion fallback', () => {
        const src = readFileSync(new URL('../src/game.js', import.meta.url), 'utf8');
        expect(src).toContain('el.classList.add(`r-tick-${tick}`)');
        const theme = readFileSync(new URL('../src/ui/theme-ai-gold.css', import.meta.url), 'utf8');
        expect(theme).toContain('.stat--r.r-tick-down { animation: r-tick-down');
        const css = readFileSync(new URL('../src/ui/game-screen.css', import.meta.url), 'utf8');
        expect(css).toMatch(/@keyframes r-tick-down/);
        expect(css).toMatch(/prefers-reduced-motion: reduce\) \{\s*html \.stat--r\.r-tick-down/);
    });
});
