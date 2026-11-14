// Round 38 playtest fix at 390x844: tapping a used-up Sever chip showed
// 'Daily limit for Sever Link reached.' and the next red line tap showed
// 'Sever is used up for today. Tap a healthy person to vaccinate them.', so
// two toasts said the same thing in different words, and the advice skipped
// the sick person who was still spreading. Every used-up message now comes
// from spentToolLine, word for word, and points at isolating a free sick
// person first when Quarantine is ready.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { spentToolLine, usedUpNudge, noToolTapHint, toolChips } from '../src/ui/game-screen-model.js';
import { LEVELS } from '../src/config/levels.js';
import { levelRules } from '../src/config/level-rules.js';
import { tools } from '../src/config/tools.js';

const chip = (id, state = 'ready', label = id, powerUp = false) => ({ id, state, label, powerUp });

describe('spentToolLine', () => {
    const chips = [chip('severLink', 'spent', 'Sever Link'), chip('vaccinate', 'ready', 'Vaccinate'), chip('quarantine', 'ready', 'Quarantine')];

    it('the tray tap, the line tap and the release nudge say the same words', () => {
        const ctx = { sickFree: 1 };
        const line = spentToolLine('severLink', chips, ctx);
        expect(noToolTapHint('link', chips, ctx)).toBe(line);
        expect(usedUpNudge('severLink', chips, ctx)).toBe(line);
    });

    it('a sick person still free comes first when Quarantine is ready', () => {
        expect(spentToolLine('severLink', chips, { sickFree: 2 })).toBe('Sever Link is used up for today. Tap a sick person to isolate them.');
        expect(spentToolLine('severLink', chips, { sickFree: 0 })).toBe('Sever Link is used up for today. Tap a healthy person to vaccinate them.');
        expect(spentToolLine('severLink', chips)).toMatch(/vaccinate them\.$/);
    });

    it('never points at the used-up tool itself or a tool that is not ready', () => {
        const qSpent = [chip('quarantine', 'spent', 'Quarantine'), chip('vaccinate'), chip('severLink')];
        expect(spentToolLine('quarantine', qSpent, { sickFree: 3 })).toBe('Quarantine is used up for today. Tap a healthy person to vaccinate them.');
        const qLocked = [chip('severLink', 'spent', 'Sever Link'), chip('vaccinate'), chip('quarantine', 'locked')];
        expect(spentToolLine('severLink', qLocked, { sickFree: 3 })).toMatch(/vaccinate them\.$/);
    });

    it('with nothing else ready it says when the tool is back', () => {
        const all = [chip('severLink', 'spent', 'Sever Link'), chip('vaccinate', 'locked'), chip('eureka', 'ready', 'Eureka!', true)];
        expect(spentToolLine('severLink', all)).toBe('Sever Link is used up for today. It is back tomorrow.');
        expect(noToolTapHint('link', all)).toBe('Sever Link is used up for today. It is back tomorrow.');
        expect(usedUpNudge('severLink', all)).toBe(null); // the Next day countdown says the rest
    });

    it('level 1 day 3: Sever spent with a sick person free points at Quarantine', () => {
        const { difficulty } = levelRules(LEVELS[0]);
        const fresh = toolChips(tools, difficulty, 3, {}, {});
        const limit = parseInt(fresh.find((c) => c.id === 'severLink').usage, 10);
        const chips = toolChips(tools, difficulty, 3, { severLink: limit }, {});
        expect(spentToolLine('severLink', chips, { sickFree: 1 })).toBe('Sever Link is used up for today. Tap a sick person to isolate them.');
    });

    it('no em dashes in the new lines', () => {
        const all = [chip('severLink', 'spent', 'Sever Link')];
        expect(spentToolLine('severLink', all)).not.toMatch(/—/);
    });
});

describe('wiring', () => {
    const game = readFileSync(new URL('../src/game.js', import.meta.url), 'utf8');
    it('a tap on a spent chip uses spentToolLine, not the engine limit error', () => {
        const at = game.indexOf("toolItem.classList.contains('disabled')");
        const body = game.slice(at, at + 700);
        expect(body).toMatch(/chip\.state === 'spent'/);
        expect(body).toMatch(/spentToolLine\(toolId, chips, this\.tapContext\(\)\)/);
        expect(body.indexOf('spentToolLine')).toBeLessThan(body.indexOf('canUseTool'));
    });
    it('the line tap and the release nudge get the same web context', () => {
        expect(game).toMatch(/noToolTapHint\(kind, chips, \{ \.\.\.this\.tapContext\(\), nodeState \}\)/);
        expect(game).toMatch(/usedUpNudge\(toolId, chips, this\.tapContext\(\)\)/);
        expect(game).toMatch(/sickFree: nodes\.filter\(\(n\) => !n\.removed && n\.state === 'infected'\)\.length/);
    });
});

describe('a sick person tapped with no tool that helps them', () => {
    const lockedQ = [chip('severLink', 'spent', 'Sever Link'), chip('vaccinate', 'ready', 'Vaccinate'), { ...chip('quarantine', 'locked', 'Quarantine'), firstDay: 3 }];
    it('says vaccines are for the healthy and when isolation opens', () => {
        expect(noToolTapHint('node', lockedQ, { nodeState: 'infected' })).toBe('Vaccines protect healthy people, not the sick. Isolation opens on day 3.');
        expect(noToolTapHint('node', lockedQ, { nodeState: 'exposed' })).toMatch(/^Vaccines protect healthy people/);
    });
    it('says isolation is used up when it is', () => {
        const spentQ = [chip('vaccinate'), chip('quarantine', 'spent', 'Quarantine')];
        expect(noToolTapHint('node', spentQ, { nodeState: 'infected' })).toBe('Vaccines protect healthy people, not the sick. Isolation is used up for today.');
        expect(noToolTapHint('node', [chip('vaccinate', 'spent'), chip('quarantine', 'spent')], { nodeState: 'infected' })).toBe('Isolation is used up for today.');
    });
    it('healthy and recovered taps keep the old lines', () => {
        expect(noToolTapHint('node', lockedQ, { nodeState: 'recovered' })).toBe('Pick a tool from the tray first.');
        expect(noToolTapHint('node', [chip('severLink')], { nodeState: 'infected' })).toMatch(/red line/);
    });
    it('level 1 day 2: a sick tap names day 3', () => {
        const { difficulty } = levelRules(LEVELS[0]);
        const chips = toolChips(tools, difficulty, 2, { severLink: 99 }, {});
        expect(noToolTapHint('node', chips, { nodeState: 'infected' })).toMatch(/Isolation opens on day \d\.$/);
    });
});
