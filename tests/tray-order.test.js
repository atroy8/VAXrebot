// Round 28 playtest fixes: the tray shows tools in the order they open (the
// briefing order), the briefing title uses that order too, and a win where
// nobody died no longer says "nearly everyone made it".
import { describe, it, expect } from 'vitest';
import { LEVELS } from '../src/config/levels.js';
import { levelRules } from '../src/config/level-rules.js';
import { toolkitCard } from '../src/config/toolkits.js';
import { tools } from '../src/config/tools.js';
import { toolChips } from '../src/ui/game-screen-model.js';
import { starProgress, starHint } from '../src/ui/star-meter.js';

const usage = Object.fromEntries(Object.keys(tools).map((k) => [k, 0]));
const classicLabels = (chips) => chips.filter((c) => !c.powerUp && c.state !== 'off').map((c) => c.label);

describe('tray order matches the order tools open (round 28)', () => {
    it('level 1 day 1: Sever, the only ready tool, is the first chip', () => {
        const { difficulty } = levelRules(LEVELS[0]);
        const chips = toolChips(tools, difficulty, 1, usage, {});
        expect(chips[0].id).toBe('severLink');
        expect(chips[0].state).toBe('ready');
        expect(classicLabels(chips)).toEqual(['Sever Link', 'Vaccinate', 'Quarantine']);
    });

    it('every level: tray chips run in the briefing order and power-ups follow the tools', () => {
        for (const level of LEVELS) {
            const { difficulty } = levelRules(level);
            const card = toolkitCard(level.toolkit, level.variant?.toolDays);
            const chips = toolChips(tools, difficulty, 1, usage, {});
            const classic = chips.filter((c) => !c.powerUp);
            const days = classic.map((c) => (c.state === 'off' ? Infinity : c.firstDay));
            expect(days, level.id).toEqual([...days].sort((a, b) => a - b));
            expect(classic.map((c) => c.firstDay).filter((d) => d != null), level.id).toEqual(card.days.map((d) => d.day));
            const firstPower = chips.findIndex((c) => c.powerUp);
            expect(chips.slice(firstPower).every((c) => c.powerUp), level.id).toBe(true);
        }
    });

    it('the order never changes from day to day, so chips do not jump', () => {
        for (const level of LEVELS.slice(0, 20)) {
            const { difficulty } = levelRules(level);
            const ids = (day) => toolChips(tools, difficulty, day, usage, { eureka: day % 2 }).map((c) => c.id);
            expect(ids(2), level.id).toEqual(ids(1));
            expect(ids(5), level.id).toEqual(ids(1));
        }
    });

    it('the briefing title lists tools in opening order', () => {
        const card = toolkitCard(LEVELS[0].toolkit, LEVELS[0].variant?.toolDays);
        expect(card.title).toBe(`Your tools: ${card.days.map((d) => d.label).join(', ')}`);
        expect(card.title.indexOf('Sever')).toBeLessThan(card.title.indexOf('Vaccinate'));
    });
});

describe('top marks copy (round 28)', () => {
    const level = { target: 100 };
    const stats = (dead) => ({ initialPopulation: 11, totalDead: dead, totalRecovered: 3, daysUsed: 1, powerUpsUsed: 0 });
    it('says everyone made it when nobody died', () => {
        const p = starProgress('contained', stats(0), level);
        expect(p.next).toBeNull();
        expect(starHint(p)).toBe('Top marks! Fast, and everyone made it.');
    });
    it('keeps "nearly everyone" when someone died', () => {
        const p = starProgress('contained', stats(1), level);
        if (!p.next) expect(starHint(p)).toContain('nearly everyone');
        expect(starHint({ next: null, facts: { pop: 11, survivors: 10 } })).toContain('nearly everyone');
    });
});
