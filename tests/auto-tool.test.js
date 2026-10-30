// Round 27 playtest fix: a tap with no tool chosen used to do nothing.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { autoToolForTap, noToolTapHint, idleTapMode, toolChips } from '../src/ui/game-screen-model.js';
import { LEVELS } from '../src/config/levels.js';
import { levelRules } from '../src/config/level-rules.js';
import { tools } from '../src/config/tools.js';

const chip = (id, state = 'ready', powerUp = false) => ({ id, state, powerUp });
const day1 = [chip('vaccinate', 'locked'), chip('quarantine', 'locked'), chip('severLink'), chip('eureka', 'empty', true)];
const day3 = [chip('vaccinate'), chip('quarantine'), chip('severLink')];

describe('autoToolForTap', () => {
    it('a line tap picks Sever when it is ready', () => {
        expect(autoToolForTap('link', null, day1)).toBe('severLink');
        expect(autoToolForTap('link', null, [chip('severLink', 'spent')])).toBe(null);
    });
    it('a healthy person gets Vaccinate first, then Quarantine', () => {
        expect(autoToolForTap('node', 'healthy', day3)).toBe('vaccinate');
        expect(autoToolForTap('node', 'healthy', [chip('vaccinate', 'spent'), chip('quarantine')])).toBe('quarantine');
    });
    it('a sick person gets Quarantine, never Vaccinate', () => {
        expect(autoToolForTap('node', 'infected', day3)).toBe('quarantine');
        expect(autoToolForTap('node', 'infected', [chip('vaccinate')])).toBe(null);
    });
    it('locked tools, power-ups and settled people are never picked', () => {
        expect(autoToolForTap('node', 'healthy', day1)).toBe(null);
        expect(autoToolForTap('node', 'recovered', day3)).toBe(null);
        expect(autoToolForTap('node', 'healthy', [chip('vaccinate', 'ready', true)])).toBe(null);
    });
});

describe('noToolTapHint and idleTapMode', () => {
    it('points at Sever when a person is tapped on a Sever-only day', () => {
        expect(noToolTapHint('node', day1)).toMatch(/red line/);
        expect(noToolTapHint('link', [chip('severLink', 'spent'), chip('vaccinate')])).toMatch(/person/);
        expect(noToolTapHint('node', [])).toMatch(/Pick a tool/);
    });
    it('reads taps as line taps only when Sever is the one ready tool', () => {
        expect(idleTapMode(day1)).toBe('link');
        expect(idleTapMode(day3)).toBe(null);
        expect(idleTapMode([chip('severLink', 'spent')])).toBe(null);
    });
    it('level 1 day 1 is a Sever-only day, so a first tap on a red line cuts it; by day 3 every tool fits', () => {
        const { difficulty } = levelRules(LEVELS[0]);
        const usage = { vaccinate: 0, quarantine: 0, severLink: 0 };
        const d1 = toolChips(tools, difficulty, 1, usage, {});
        expect(idleTapMode(d1)).toBe('link');
        expect(autoToolForTap('link', null, d1)).toBe('severLink');
        const d3 = toolChips(tools, difficulty, 3, usage, {});
        expect(autoToolForTap('node', 'healthy', d3)).toBe('vaccinate');
        expect(autoToolForTap('node', 'infected', d3)).toBe('quarantine');
    });
    it('every level offers a ready tool for a line or a person tap from day 1', () => {
        for (const level of LEVELS) {
            const { difficulty } = levelRules(level);
            const d1 = toolChips(tools, difficulty, 1, { vaccinate: 0, quarantine: 0, severLink: 0 }, {});
            const any = autoToolForTap('link', null, d1) || autoToolForTap('node', 'healthy', d1) || autoToolForTap('node', 'infected', d1);
            expect(any, level.id).toBeTruthy();
        }
    });
});

describe('wiring', () => {
    const game = readFileSync(new URL('../src/game.js', import.meta.url), 'utf8');
    const view = readFileSync(new URL('../src/ui/network-view-3d.js', import.meta.url), 'utf8');
    it('the game auto-picks a tool on taps with none chosen', () => {
        expect(game).toMatch(/!this\.selectedTool && !this\.autoPickTool\('link'\)/);
        expect(game).toMatch(/!this\.selectedTool && !this\.autoPickTool\('node', node\.state\)/);
        expect(game).toMatch(/idleTapMode: \(\) =>/);
    });
    it('the web asks the game how to read an idle tap', () => {
        expect(view).toMatch(/this\.idleTapMode\?\.\(\) === 'link'/);
    });
});
