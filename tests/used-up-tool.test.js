// Round 31 playtest fix: a tool that hit its daily limit stayed chosen, so
// more taps on red lines drew the same red limit error while another tool
// sat ready. The game now lets go of a used-up tool and says what is ready.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { usedUpNudge, noToolTapHint, autoToolForTap, toolChips } from '../src/ui/game-screen-model.js';
import { LEVELS } from '../src/config/levels.js';
import { levelRules } from '../src/config/level-rules.js';
import { tools } from '../src/config/tools.js';

const chip = (id, state = 'ready', label = id, powerUp = false) => ({ id, state, label, powerUp });

describe('usedUpNudge', () => {
    it('names the used-up tool and the next ready one', () => {
        const chips = [chip('severLink', 'spent', 'Sever Link'), chip('vaccinate'), chip('quarantine', 'locked')];
        expect(usedUpNudge('severLink', chips)).toBe('Sever Link is used up for today. Tap a healthy person to vaccinate them.');
    });
    it('follows tray order and skips locked, spent and power-up chips', () => {
        const chips = [chip('severLink', 'spent', 'Sever Link'), chip('vaccinate', 'spent'), chip('eureka', 'ready', 'Eureka!', true), chip('quarantine')];
        expect(usedUpNudge('severLink', chips)).toMatch(/Tap a sick person to isolate them\.$/);
        expect(usedUpNudge('vaccinate', [chip('vaccinate', 'spent', 'Vaccinate'), chip('severLink')])).toBe('Vaccinate is used up for today. Tap a red line to cut it.');
    });
    it('says nothing when the tool still has uses or nothing else is ready', () => {
        expect(usedUpNudge('severLink', [chip('severLink'), chip('vaccinate')])).toBe(null);
        expect(usedUpNudge('severLink', [chip('severLink', 'spent'), chip('vaccinate', 'locked')])).toBe(null);
        expect(usedUpNudge('eureka', [chip('eureka', 'spent', 'Eureka!', true), chip('vaccinate')])).toBe(null);
    });
    it('level 1 day 2: after the last Sever, the nudge points at Vaccinate and a person tap picks it', () => {
        const { difficulty } = levelRules(LEVELS[0]);
        const sever = toolChips(tools, difficulty, 2, { vaccinate: 0, quarantine: 0, severLink: 0 }, {}).find((c) => c.id === 'severLink');
        const limit = parseInt(sever.usage, 10);
        const chips = toolChips(tools, difficulty, 2, { vaccinate: 0, quarantine: 0, severLink: limit }, {});
        expect(usedUpNudge('severLink', chips)).toMatch(/^Sever Link is used up for today\. Tap a healthy person/);
        expect(autoToolForTap('node', 'healthy', chips)).toBe('vaccinate');
        expect(noToolTapHint('link', chips)).toMatch(/^Sever is used up for today\. Tap a healthy person/);
    });
});

describe('wiring', () => {
    const game = readFileSync(new URL('../src/game.js', import.meta.url), 'utf8');
    it('every action checks for a used-up tool before the countdown starts', () => {
        const after = game.slice(game.indexOf('    afterAction() {'), game.indexOf('    releaseUsedUpTool() {'));
        expect(after.indexOf('this.releaseUsedUpTool()')).toBeGreaterThan(-1);
        expect(after.indexOf('this.releaseUsedUpTool()')).toBeLessThan(after.indexOf('this.autoAdvance.start()'));
    });
    it('releasing deselects the tool and shows the nudge as info, not an error', () => {
        const body = game.slice(game.indexOf('    releaseUsedUpTool() {'), game.indexOf('    releaseUsedUpTool() {') + 700);
        expect(body).toMatch(/this\.selectTool\(toolId\); \/\/ deselect/);
        expect(body).toMatch(/showNotification\(nudge, 'info'\)/);
        expect(body).toMatch(/isPowerUp\(toolId\)/);
    });
});
