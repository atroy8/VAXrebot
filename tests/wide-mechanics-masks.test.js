// Wide audience round, mechanic 2: masks weaken a line without cutting it.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { simulateSpread, canUseTool, checkGameOver } from '../src/sim/engine.js';
import { applyNodeTool, liveR } from '../src/sim/actions.js';
import { webR0, linkChance } from '../src/sim/r0.js';
import { initGameState } from '../src/sim/state.js';
import { tools } from '../src/config/tools.js';
import { LEVELS } from '../src/config/levels.js';
import { levelRules } from '../src/config/level-rules.js';
import { lessonFor } from '../src/config/lessons.js';
import { linkFactor, MASK_FACTOR } from '../src/sim/mechanics.js';
import { BOTS, buildRun, mulberry32, summarize } from '../src/sim/balance.js';
import { nodeMarks, maskedEnds, maskedLine, MASKED_LINE } from '../src/ui/node-marks.js';
import { linkStyle } from '../src/ui/link-style.js';
import { toolChips, autoToolForTap, idleTapMode, toolHint, HINT_MAX_CHARS } from '../src/ui/game-screen-model.js';
import { mechanicToolFeedback } from '../src/ui/mechanics-text.js';
import { variantCallout } from '../src/sim/variants.js';
import { toolkitCard } from '../src/config/toolkits.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

function seeded(seed) {
    let s = seed >>> 0;
    return () => {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 4294967296;
    };
}

const person = (id, state = 'healthy', extra = {}) => ({ id, state, daysInfected: 0, removed: false, ...extra });
const pair = (a = {}, b = {}) => ({ nodes: [person(0, 'infected', a), person(1, 'healthy', b)], links: [{ source: 0, target: 1 }] });
const maskLevels = LEVELS.filter((l) => l.mechanics?.id === 'masks');

// Share of 4000 seeded nights on which the healthy end caught it.
function catchRate(a, b, rate = 0.8, rules = null) {
    const rng = seeded(17);
    let hits = 0;
    const N = 4000;
    for (let i = 0; i < N; i++) {
        const net = pair(a, b);
        simulateSpread(initGameState(tools, 2), net, rate, rng, rules);
        if (net.nodes[1].state === 'infected') hits++;
    }
    return hits / N;
}

describe('a mask halves the chance on its wearer\'s lines', () => {
    it('one masked end halves it, both ends quarter it, in both directions', () => {
        expect(MASK_FACTOR).toBe(0.5);
        expect(linkFactor({}, {})).toBe(1);
        expect(linkFactor({ masked: true }, {})).toBe(0.5);
        expect(linkFactor({}, { masked: true })).toBe(0.5);
        expect(linkFactor({ masked: true }, { masked: true })).toBe(0.25);
        expect(linkFactor({ masked: true }, {}, 0.3)).toBeCloseTo(0.3, 9);
    });

    it('the dice agree: 0.8 becomes about 0.4 with one mask and 0.2 with two', () => {
        expect(catchRate({}, {})).toBeGreaterThan(0.77);
        const sickMasked = catchRate({ masked: true }, {});
        const healthyMasked = catchRate({}, { masked: true });
        expect(sickMasked).toBeGreaterThan(0.37);
        expect(sickMasked).toBeLessThan(0.43);
        expect(healthyMasked).toBeGreaterThan(0.37);
        expect(healthyMasked).toBeLessThan(0.43);
        const both = catchRate({ masked: true }, { masked: true });
        expect(both).toBeGreaterThan(0.17);
        expect(both).toBeLessThan(0.23);
        // A level can set its own strength.
        expect(catchRate({ masked: true }, {}, 0.8, { maskFactor: 0.25 })).toBeLessThan(0.23);
    });

    it('the line stays: a mask weakens, it does not cut', () => {
        const net = pair();
        const state = initGameState(tools, 2);
        const res = applyNodeTool(state, tools, 'mask', net.nodes[1]);
        expect(res).toEqual({ masked: true });
        expect(net.links).toHaveLength(1);
        expect(net.nodes[1].masked).toBe(true);
        expect(net.nodes[1].state).toBe('healthy');
        expect(state.stats.masksGiven).toBe(1);
        expect(state.stats.linksSevered).toBe(0);
        expect(state.dailyUsage.mask).toBe(1);
        expect(mechanicToolFeedback('mask', res, net.nodes[1]).toast).toMatch(/half as easily/);
    });

    it('lasts the whole level and is given once per person', () => {
        const { difficulty } = levelRules(maskLevels[0]);
        const state = initGameState(tools, 4);
        const node = person(1);
        expect(canUseTool(state, tools, 'mask', difficulty, node).allowed).toBe(true); // open on day 1
        applyNodeTool(state, tools, 'mask', node);
        expect(canUseTool(state, tools, 'mask', difficulty, node).allowed).toBe(false);
        state.day = 9;
        state.dailyUsage.mask = 0;
        expect(node.masked).toBe(true);
        expect(canUseTool(state, tools, 'mask', difficulty, node).allowed).toBe(false);
        // The sick can be masked too (source control); the cured need none.
        expect(canUseTool(state, tools, 'mask', difficulty, person(2, 'infected')).allowed).toBe(true);
        expect(canUseTool(state, tools, 'mask', difficulty, person(3, 'recovered')).allowed).toBe(false);
    });

    it('a win by masks alone is a real win, not a burnout', () => {
        const net = { nodes: [person(0, 'recovered'), person(1)], links: [] };
        const state = initGameState(tools, 2);
        expect(checkGameOver(state, net, 30)).toBe('burnout');
        state.stats.masksGiven = 1;
        expect(checkGameOver(state, net, 30)).toBe('contained');
    });
});

describe('R accounts for masked lines', () => {
    it('live R drops the moment someone is masked', () => {
        // One sick person with two healthy contacts.
        const net = { nodes: [person(0, 'infected'), person(1), person(2)], links: [{ source: 0, target: 1 }, { source: 0, target: 2 }] };
        const before = liveR(net, 0.3, 3);
        expect(before).toBeCloseTo(2 * (1 - 0.7 ** 3), 9);
        net.nodes[1].masked = true;
        const one = liveR(net, 0.3, 3);
        expect(one).toBeCloseTo(1 - 0.7 ** 3 + (1 - 0.85 ** 3), 9);
        expect(one).toBeLessThan(before);
        // Masking the sick person covers every line at once.
        net.nodes[1].masked = false;
        net.nodes[0].masked = true;
        expect(liveR(net, 0.3, 3)).toBeCloseTo(2 * (1 - 0.85 ** 3), 9);
        expect(liveR(net, 0.3, 3, { maskFactor: 0 })).toBe(0);
    });

    it('web R0 counts a masked line at its lower chance', () => {
        const ring = { nodes: [0, 1, 2, 3].map((id) => ({ id })), links: [[0, 1], [1, 2], [2, 3], [3, 0]].map(([source, target]) => ({ source, target })) };
        const open = webR0(ring, 0.5, 2);
        expect(open).toBeCloseTo(1.5, 9);
        ring.nodes[0].masked = true;
        const half = linkChance(0.5, 2, null, 0.5);
        expect(half).toBeCloseTo(1 - 0.75 ** 2, 9);
        // Two of the four lines touch the masked person.
        expect(webR0(ring, 0.5, 2)).toBeCloseTo((2 * 2 * 0.75 + 2 * 2 * half) / 4, 9);
        expect(webR0(ring, 0.5, 2)).toBeLessThan(open);
    });
});

describe('the view shows a mask and a lighter line', () => {
    it('marks a masked person and thins their lines', () => {
        expect(nodeMarks(person(1, 'healthy', { masked: true }))).toEqual(['mask']);
        expect(nodeMarks(person(1))).toEqual([]);
        const a = person(0, 'infected', { masked: true });
        const b = person(1);
        expect(maskedEnds({ source: a, target: b })).toBe(1);
        expect(maskedEnds({ source: b, target: b })).toBe(0);
        const risk = linkStyle('risk', false);
        expect(maskedLine(risk, 1).width).toBeCloseTo(risk.width * MASKED_LINE.width, 9);
        expect(maskedLine(risk, 1).color).toBe('risk'); // still a red line: it can still spread
        expect(maskedLine(risk, 0)).toBe(risk);
    });

    it('is wired into the view, the tray and the game', () => {
        const view = read('src/ui/network-view-3d.js');
        expect(view).toContain('maskedLine(linkStyle(kind, severing), masks)');
        expect(view).toContain('const pale = masks ? MASKED_LINE.pale : 0;');
        expect(view).toContain("mask: ['healthy', 'infected', 'exposed']");
        expect(read('src/ui/panels.js')).toMatch(/mask:\s*\n\s*'<svg/);
        const game = read('src/game.js');
        expect(game).toContain('difficulty.recoveryTime, difficulty);');
        expect(game).toContain('this.difficulty.recoveryTime, this.difficulty);');
        expect(tools.mask.validTargets).toEqual(['healthy', 'infected', 'exposed']);
    });
});

describe('mask levels', () => {
    it('Kumoji introduces masks and later planets bring them back', () => {
        expect(maskLevels.filter((l) => l.regionId === 'kumoji').length).toBeGreaterThanOrEqual(3);
        expect(new Set(maskLevels.map((l) => l.regionId)).size).toBeGreaterThanOrEqual(3);
        for (const l of maskLevels) {
            expect(l.planetIndex).toBeGreaterThanOrEqual(2);
            expect(l.toolkit.tools).toContain('mask');
            expect(l.toolkit.tools).toContain('severLink');
            expect(l.toolkit.tools.length).toBeLessThanOrEqual(3);
            const { difficulty } = levelRules(l);
            expect(difficulty.maskFactor).toBe(0.5);
            // Cheaper and more plentiful than Sever.
            expect(difficulty.dailyLimits.mask).toBeGreaterThanOrEqual(difficulty.dailyLimits.severLink);
        }
    });

    it('teaches the lesson and names the tool in the briefing', () => {
        const l = maskLevels.find((x) => !x.variant);
        expect(l.lessonId).toBe('masks');
        expect(lessonFor(l.id).brief).toMatch(/A cut is certain/);
        expect(variantCallout(l.variant, l.mechanics).title).toBe('New: masks');
        const card = toolkitCard(l.toolkit, l.variant?.toolDays);
        expect(card.tools).toContain('Mask');
        expect(card.firstDay).toContain('Mask');
        expect(card.why).toMatch(/Masks arrived too/);
    });

    it('the Mask chip is ready on day 1 and a tap on a person picks it', () => {
        const l = maskLevels.find((x) => x.toolkit.tools.length === 2); // festival: Sever and Mask
        const { difficulty } = levelRules(l);
        const chips = toolChips(tools, difficulty, 1, initGameState(tools, 10).dailyUsage, {});
        expect(chips.filter((c) => !c.powerUp).map((c) => c.id).sort()).toEqual(['mask', 'severLink']);
        expect(chips.find((c) => c.id === 'mask').state).toBe('ready');
        expect(autoToolForTap('node', 'healthy', chips)).toBe('mask');
        expect(autoToolForTap('node', 'infected', chips)).toBe('mask');
        expect(autoToolForTap('link', null, chips)).toBe('severLink');
        // People can be tapped, so taps are not all sent to lines.
        expect(idleTapMode(chips)).toBe(null);
        expect(toolHint('mask').length).toBeLessThanOrEqual(HINT_MAX_CHARS);
    });

    it('the bots use masks, and masks are worth using', () => {
        for (const bot of ['smart', 'beginner']) {
            const rng = mulberry32(5);
            const run = buildRun(maskLevels[0], rng);
            BOTS[bot](run, rng);
            expect(run.state.stats.masksGiven, bot).toBeGreaterThan(0);
        }
        // The smart bot masks the sick first: one mask covers all their lines.
        const rng = mulberry32(8);
        const run = buildRun(maskLevels.find((x) => x.toolkit.tools.length === 2), rng);
        BOTS.smart(run, rng);
        expect(run.network.nodes.filter((n) => n.state === 'infected').every((n) => n.masked)).toBe(true);
        for (const level of maskLevels) {
            expect(summarize(level, 'passive', 25, 3).counts.contained || 0, level.id).toBe(0);
            const smart = summarize(level, 'smart', 150, 21).winRate;
            const bare = { ...level, tuning: { ...level.tuning, dailyLimits: { ...level.tuning.dailyLimits, mask: 0 } } };
            expect(smart - summarize(bare, 'smart', 150, 21).winRate, level.id).toBeGreaterThan(0.05);
        }
    });
});
