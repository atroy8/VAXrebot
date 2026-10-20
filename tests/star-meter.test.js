import { describe, it, expect } from 'vitest';
import { starProgress, starHint, starMeterHtml } from '../src/ui/star-meter.js';
import { calculateStars, SCORING } from '../src/progress.js';
import { LEVELS } from '../src/config/levels.js';
import { STAR_TARGETS } from '../src/config/star-targets.js';
import { readFileSync } from 'node:fs';

const level = { id: 't', target: 700, tuning: { parDays: 12 } };
const stats = (o = {}) => ({ initialPopulation: 30, totalDead: 2, totalRecovered: 10, daysUsed: 10, powerUpsUsed: 0, ...o });

describe('star meter model (round 17)', () => {
    it('agrees with calculateStars on every combination it is given', () => {
        for (const dead of [0, 2, 5]) {
            for (const days of [6, 10, 12, 14]) {
                for (const pu of [0, 2]) {
                    const s = stats({ totalDead: dead, daysUsed: days, powerUpsUsed: pu });
                    expect(starProgress('contained', s, level).stars).toBe(calculateStars('contained', s, level));
                }
            }
        }
    });

    it('star lines sit at the target, 1.3x and 1.6x', () => {
        expect(starProgress('contained', stats(), level).lines).toEqual([700, Math.round(700 * SCORING.twoStarRatio), Math.round(700 * SCORING.threeStarRatio)]);
    });

    it('no meter on a loss or without a target', () => {
        expect(starProgress('overwhelmed', stats(), level)).toBeNull();
        expect(starProgress('contained', stats(), { id: 'x', target: 0 })).toBeNull();
        expect(starMeterHtml(null)).toBe('');
    });

    it('below 3 stars, says how many points are missing and a way to get them', () => {
        const p = starProgress('contained', stats({ daysUsed: 12 }), level);
        expect(p.stars).toBeLessThan(3);
        expect(p.next.gap).toBe(p.lines[p.stars] - p.score);
        const hint = starHint(p);
        expect(hint).toMatch(/^\d+ more points? for \d stars?/);
        expect(hint).toMatch(/sooner|fewer/);
    });

    it('a suggested fix is enough to reach the next star', () => {
        const s = stats({ daysUsed: 12, totalDead: 3 });
        const p = starProgress('contained', s, level);
        const m = p.next.ways.join(' ').match(/finish (\d+) days? sooner/);
        expect(m).toBeTruthy();
        const better = starProgress('contained', { ...s, daysUsed: s.daysUsed - Number(m[1]) }, level);
        expect(better.stars).toBeGreaterThanOrEqual(p.next.star);
    });

    it('never suggests losing fewer people than died or skipping power-ups not used', () => {
        const p = starProgress('contained', stats({ totalDead: 0, powerUpsUsed: 0, daysUsed: 2 }), { ...level, target: 2000 });
        expect(p.next.ways.join(' ')).not.toMatch(/fewer/);
        expect(starHint(p)).toMatch(/Act on day 1/);
    });

    it('3 stars gets the top marks line, and the markup carries no em dash', () => {
        const p = starProgress('contained', stats({ totalDead: 0, totalRecovered: 30, daysUsed: 6 }), level);
        expect(p.stars).toBe(3);
        expect(starHint(p)).toMatch(/Top marks/);
        const html = starMeterHtml(p);
        expect(html).toContain('data-star-meter');
        expect(html).not.toContain('—');
        expect((html.match(/star-meter-tick/g) || []).length).toBe(3);
    });

    it('the results tally and the game wire the meter in', () => {
        const tally = readFileSync(new URL('../src/ui/results-tally.js', import.meta.url), 'utf8');
        expect(tally).toContain('starMeterHtml(meter)');
        const game = readFileSync(new URL('../src/game.js', import.meta.url), 'utf8');
        expect(game).toContain('meter: starProgress(outcome, stats, this.currentLevel)');
        const p = starProgress('contained', stats(), level);
        expect(starMeterHtml(p)).toContain(`data-star-score>${p.score}<`);
    });
});

describe('per-level star targets (round 17)', () => {
    it('every level has a tuned target no higher than the old 800', () => {
        for (const l of LEVELS) {
            expect(STAR_TARGETS[l.id], l.id).toBeGreaterThan(0);
            expect(l.target).toBe(STAR_TARGETS[l.id]);
            expect(l.target).toBeLessThanOrEqual(800);
        }
    });
});

describe('briefing star goal (round 17)', async () => {
    const { starGoalLine } = await import('../src/ui/briefing.js');
    it('names par and the best so far', () => {
        const line = starGoalLine({ parDays: 11, best: 2 });
        expect(line).toContain('day 11');
        expect(line).toContain('★★☆');
        expect(line).not.toContain('—');
    });
    it('a first try shows no empty best', () => {
        expect(starGoalLine({ parDays: 11, best: 0 })).not.toContain('best');
    });
    it('celebrates a 3 star best', () => {
        expect(starGoalLine({ parDays: 11, best: 3 })).toMatch(/★★★.*perfect/i);
    });
    it('the briefing has a slot for it and the game fills it', () => {
        expect(readFileSync(new URL('../index.html', import.meta.url), 'utf8')).toContain('id="star-goal"');
        expect(readFileSync(new URL('../src/game.js', import.meta.url), 'utf8')).toContain('showStarGoal({ parDays: parDaysFor(level)');
    });
});
