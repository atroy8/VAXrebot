// Wide audience round, mechanic 2: masks weaken a line without cutting it.
// Round 57 rewrote the rule and with it the tests of the rule: a mask no
// longer halves a chance (there are no chances). A line with a masked
// person on it takes two nights to cross instead of one.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { simulateSpread, canUseTool, checkGameOver } from '../src/sim/engine.js';
import { applyNodeTool, liveR } from '../src/sim/actions.js';
import { webR0 } from '../src/sim/r0.js';
import { initGameState } from '../src/sim/state.js';
import { tools } from '../src/config/tools.js';
import { LEVELS } from '../src/config/levels.js';
import { levelRules } from '../src/config/level-rules.js';
import { lessonFor } from '../src/config/lessons.js';
import { maskedLink, crossesTonight, MASK_NIGHTS } from '../src/sim/mechanics.js';
import { dealLevelCached } from '../src/sim/dealer.js';
import { solveDeal } from '../src/sim/solver.js';
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

// Nights until the healthy end of a pair catches it (null: never in 5 nights).
function nightsToCross(a, b) {
    const net = pair(a, b);
    const state = initGameState(tools, 2);
    for (let night = 1; night <= 5; night++) {
        simulateSpread(state, net);
        if (net.nodes[1].state === 'infected') return night;
    }
    return null;
}

describe('a masked line takes two nights to cross', () => {
    it('a mask on either end, or on both, slows the line by one night', () => {
        expect(MASK_NIGHTS).toBe(2);
        expect(maskedLink({}, {})).toBe(false);
        expect(maskedLink({ masked: true }, {})).toBe(true);
        expect(maskedLink({}, { masked: true })).toBe(true);
        expect(crossesTonight({}, {}, {})).toBe(true);
        expect(crossesTonight({}, { masked: true }, {})).toBe(false);
        expect(crossesTonight({ charged: true }, { masked: true }, {})).toBe(true);
    });

    it('with no dice: one night on a plain line, two with one mask or with two', () => {
        expect(nightsToCross({}, {})).toBe(1);
        expect(nightsToCross({ masked: true }, {})).toBe(2);
        expect(nightsToCross({}, { masked: true })).toBe(2);
        expect(nightsToCross({ masked: true }, { masked: true })).toBe(2);
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
        expect(mechanicToolFeedback('mask', res, net.nodes[1]).toast).toMatch(/two nights to cross instead of one/);
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

describe('R and masked lines', () => {
    // Round 57: R counts who is in danger, and a masked person still is (the
    // mask buys a night, it does not stop the case), so R does not move.
    it('live R still counts a masked contact: a mask delays, it does not protect', () => {
        const net = { nodes: [person(0, 'infected'), person(1), person(2)], links: [{ source: 0, target: 1 }, { source: 0, target: 2 }] };
        expect(liveR(net)).toBe(2);
        net.nodes[1].masked = true;
        expect(liveR(net)).toBe(2);
        net.nodes[0].masked = true;
        expect(liveR(net)).toBe(2);
    });

    it('web R0 is contacts per person, masks or not', () => {
        const ring = { nodes: [0, 1, 2, 3].map((id) => ({ id })), links: [[0, 1], [1, 2], [2, 3], [3, 0]].map(([source, target]) => ({ source, target })) };
        expect(webR0(ring)).toBe(2);
        ring.nodes[0].masked = true;
        expect(webR0(ring)).toBe(2);
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
        // Round 57: once the line has charged it crosses tonight, and is
        // drawn at full strength again.
        expect(maskedEnds({ source: a, target: b, charged: true })).toBe(0);
    });

    it('is wired into the view, the tray and the game', () => {
        const view = read('src/ui/network-view-3d.js');
        expect(view).toContain('maskedLine(linkStyle(kind, severing), masks)');
        expect(view).toContain('const pale = masks ? MASKED_LINE.pale : 0;');
        expect(view).toContain("mask: ['healthy', 'infected', 'exposed']");
        expect(read('src/ui/panels.js')).toMatch(/mask:\s*\n\s*'<svg/);
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
            // Round 57: how many masks a day is the tuner's to choose.
            expect(difficulty.dailyLimits.mask).toBeGreaterThanOrEqual(1);
        }
    });

    it('teaches the lesson and names the tool in the briefing', () => {
        const l = maskLevels.find((x) => !x.variant);
        expect(l.lessonId).toBe('masks');
        expect(lessonFor(l.id).brief).toMatch(/two nights to cross instead of one/);
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

    it('the bots use masks', () => {
        let used = 0;
        for (const bot of ['smart', 'beginner']) {
            for (let seed = 1; seed <= 6; seed++) {
                const run = buildRun(maskLevels[0], seed);
                for (let day = 0; day < 3; day++) BOTS[bot](run, mulberry32(seed));
                used += run.state.stats.masksGiven || 0;
            }
        }
        expect(used).toBeGreaterThan(0);
        for (const level of maskLevels) expect(summarize(level, 'passive', 15, 3).counts.contained || 0, level.id).toBe(0);
    });

    // Round 57: measured with the solver on the very same web, with and
    // without masks (the old test compared bot win rates between two
    // differently tuned levels, which the dealer no longer makes comparable).
    it('masks are worth using: the best play with them is never worse and often better', () => {
        let better = 0;
        let total = 0;
        for (const level of maskLevels) {
            for (let seed = 1; seed <= 5; seed++) {
                const deal = dealLevelCached(level, seed);
                const bare = { ...deal, difficulty: { ...deal.difficulty, dailyLimits: { ...deal.difficulty.dailyLimits, mask: 0 } } };
                const without = solveDeal(bare);
                expect(deal.par.cases, `${level.id} seed ${seed}`).toBeLessThanOrEqual(without.cases);
                if (deal.par.cases < without.cases) better++;
                total++;
            }
        }
        expect(better / total).toBeGreaterThan(0.25);
    });
});
