import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { POINTS_PER_GOLD, goldForScore, goldAward, calculateScore, recordCompletion } from '../src/progress.js';
import { POWER_UP_FIRST_DAY, powerUpsOpen, powerUpLockedLine } from '../src/config/power-up-rules.js';
import { POWER_UPS, usePowerUp, setEconomyStorage } from '../src/economy.js';
import { createMemoryBackend, freshSave as defaultSave, writeSave } from '../src/save.js';
import { toolChips } from '../src/ui/game-screen-model.js';
import { nextStepTarget, markNextStep, NEXT_STEP_CLASS } from '../src/ui/next-step.js';
import { shouldSkipToCare, CARE_SKIP_MS } from '../src/ui/care-skip.js';
import { tools as gameTools } from '../src/config/tools.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const win = (extra = {}) => ({ initialPopulation: 100, totalDead: 0, totalRecovered: 10, powerUpsUsed: 0, ...extra });

describe('points turn into gold (round 55)', () => {
    it('10 points is 1 gold, rounded down, never negative', () => {
        expect(POINTS_PER_GOLD).toBe(10);
        expect(goldForScore(1000)).toBe(100);
        expect(goldForScore(1009)).toBe(100);
        expect(goldForScore(9)).toBe(0);
        expect(goldForScore(-50)).toBe(0);
        expect(goldForScore(undefined)).toBe(0);
    });

    it('a better run pays more, and a loss pays nothing', () => {
        const clean = goldAward('contained', win(), 'mizuho-1');
        const rough = goldAward('contained', win({ totalDead: 20 }), 'mizuho-1');
        expect(clean).toBe(goldForScore(calculateScore('contained', win(), 'mizuho-1')));
        expect(clean).toBeGreaterThan(rough);
        expect(rough).toBeGreaterThan(0);
        expect(goldAward('overwhelmed', win(), 'mizuho-1')).toBe(0);
    });

    it('the save banks exactly that gold, and one good win buys a power-up', () => {
        const save = recordCompletion(defaultSave(), 'mizuho-1', 'contained', win());
        const gold = goldAward('contained', win(), 'mizuho-1');
        expect(save.funding).toBe(gold);
        expect(gold).toBeGreaterThanOrEqual(Math.min(...Object.values(POWER_UPS).map((p) => p.cost)));
    });

    it('players read gold, not funding', () => {
        const shown = ['../src/ui/shop.js', '../src/ui/panels.js', '../src/ui/results-tally.js', '../src/ui/meta-panels.js', '../src/ui/globe-view.js', '../src/ui/hint.js', '../src/sim/hint.js', '../src/config/tools.js'].map(read).join('\n');
        const strings = shown.match(/[`'"][^`'"\n]*[`'"]/g) || [];
        for (const s of strings) {
            if (/^['"`][\w#. -]*funding[\w-]*['"`]$/.test(s) && !/ funding['"`]$/.test(s.replace(/[\w-]+-funding/, ''))) continue; // ids and class names
            const words = s.replace(/\$\{[^}]*\}/g, ''); // template variables are not words
            expect(words, s).not.toMatch(/\bfunding\b|\bfunds\b/);
        }
        expect(read('../src/ui/shop.js')).toContain('Every 10 points you score is 1 gold');
        expect(read('../src/game.js')).toContain('points = 1 gold');
    });
});

describe('power-ups open after two turns (round 55)', () => {
    it('opens on day 3', () => {
        expect(POWER_UP_FIRST_DAY).toBe(3);
        expect(powerUpsOpen(1)).toBe(false);
        expect(powerUpsOpen(2)).toBe(false);
        expect(powerUpsOpen(3)).toBe(true);
        expect(powerUpLockedLine()).toMatch(/day 3/);
    });

    it('a charge cannot be spent on day 1 or 2, and is not lost', () => {
        const storage = createMemoryBackend();
        writeSave(storage, { ...defaultSave(), powerups: { eureka: 1, pay: 0, blitz: 0 } });
        setEconomyStorage(storage);
        const said = [];
        const api = (day) => ({ network: { nodes: [{ id: 0, state: 'infected' }], links: [] }, gameState: { day, stats: { totalRecovered: 0 } }, notify: (m) => said.push(m) });
        for (const day of [1, 2]) {
            const r = usePowerUp('eureka', api(day));
            expect(r.ok).toBe(false);
            expect(r.save.powerups.eureka).toBe(1);
        }
        expect(said.join(' ')).toMatch(/day 3/);
        const r = usePowerUp('eureka', api(3));
        expect(r.ok).toBe(true);
        expect(r.save.powerups.eureka).toBe(0);
        setEconomyStorage(null);
    });

    it('the tray shows a held power-up as locked until day 3', () => {
        const tools = gameTools;
        const chip = (day) => toolChips(tools, { toolLimitMultiplier: 1 }, day, {}, { eureka: 1 }).find((c) => c.powerUp && c.state !== 'empty');
        expect(chip(1).state).toBe('locked');
        expect(chip(1).usage).toBe('Day 3');
        expect(chip(2).state).toBe('locked');
        expect(chip(3).state).toBe('ready');
        expect(read('../src/game.js')).toContain('showNotification(powerUpLockedLine(), \'info\');');
    });
});

describe('the days roll on when only Quarantine is left (round 55)', () => {
    it('skips only while Quarantine cannot be used today', () => {
        expect(shouldSkipToCare({ day: 3, sick: 1 }, { day: 1 })).toBe(true);
        expect(shouldSkipToCare({ day: 3, sick: 1 }, { day: 2 })).toBe(true);
        expect(shouldSkipToCare({ day: 3, sick: 1 }, { day: 3 })).toBe(false);
        expect(shouldSkipToCare(null, { day: 1 })).toBe(false);
        expect(shouldSkipToCare({ day: 3, sick: 1 }, { day: 1, paused: true })).toBe(false);
        expect(shouldSkipToCare({ day: 3, sick: 1 }, { day: 1, gameOver: true })).toBe(false);
        expect(CARE_SKIP_MS).toBeGreaterThanOrEqual(600);
        expect(CARE_SKIP_MS).toBeLessThanOrEqual(2000);
    });

    it('game.js starts the skip from the care branch and guards the timer', () => {
        const src = read('../src/game.js');
        expect(src).toMatch(/this\.skipToCareDay\(care\);\s*return;/);
        expect(src).toContain('state.day !== day');
        expect(src).toContain("this.currentScreen !== 'game'");
    });
});

describe('the next step glows (round 55)', () => {
    it('points at the tool the smart bot would use, then at Next day', () => {
        expect(nextStepTarget({ move: { toolId: 'severLink' } })).toBe('tool:severLink');
        expect(nextStepTarget({ move: { toolId: 'quarantine' } })).toBe('tool:quarantine');
        expect(nextStepTarget({ move: null })).toBe('next-day');
        expect(nextStepTarget({ move: null, counting: true })).toBeNull();
    });

    it('stays quiet with a tool in hand, when paused, wrapping up or over', () => {
        const move = { toolId: 'severLink' };
        expect(nextStepTarget({ move, selectedTool: 'severLink' })).toBeNull();
        expect(nextStepTarget({ move, paused: true })).toBeNull();
        expect(nextStepTarget({ move, wrapUp: true })).toBeNull();
        expect(nextStepTarget({ move, gameOver: true })).toBeNull();
    });

    it('marks one button and clears the last one', () => {
        const mk = (disabled = false) => {
            const set = new Set(disabled ? ['disabled'] : []);
            return { classList: { add: (c) => set.add(c), remove: (c) => set.delete(c), contains: (c) => set.has(c) }, set };
        };
        const old = mk();
        old.set.add(NEXT_STEP_CLASS);
        const sever = mk();
        const locked = mk(true);
        const nextDay = mk();
        const doc = {
            querySelectorAll: () => [old],
            querySelector: (sel) => (sel.includes('severLink') ? sever : sel.includes('vaccinate') ? locked : null),
            getElementById: (id) => (id === 'next-day' ? nextDay : null),
        };
        markNextStep('tool:severLink', doc);
        expect(old.set.has(NEXT_STEP_CLASS)).toBe(false);
        expect(sever.set.has(NEXT_STEP_CLASS)).toBe(true);
        markNextStep('tool:vaccinate', doc);
        expect(locked.set.has(NEXT_STEP_CLASS)).toBe(false);
        markNextStep('next-day', doc);
        expect(nextDay.set.has(NEXT_STEP_CLASS)).toBe(true);
        expect(() => markNextStep(null, doc)).not.toThrow();
    });

    it('the glow pulses, the main button of each screen glows, and reduced motion is respected', () => {
        const css = read('../src/ui/buttons.css');
        expect(css).toContain('@keyframes next-step-pulse');
        for (const sel of ['#game-screen .next-step', '#start-play', '#globe-play', '#start-simulation', '.game-over-actions .btn--primary']) expect(css).toContain(sel);
        expect(css).toMatch(/prefers-reduced-motion: reduce[\s\S]*animation: none/);
        expect(css).not.toContain('—');
        const game = read('../src/game.js');
        expect(game).toContain("import './ui/buttons.css';");
        expect(game).toMatch(/this\.refreshMetaHud\(\);[^\n]*\n\s*this\.refreshNextStep\(\);/);
    });
});
