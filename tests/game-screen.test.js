import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { tools } from '../src/config/tools.js';
import { difficulties } from '../src/config/difficulties.js';
import { plainName, toolHint, toolChips, dayBanner, fitCamera, lossReason } from '../src/ui/game-screen-model.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const EMOJI = /\p{Extended_Pictographic}/u;

describe('game screen model (item 7)', () => {
    it('strips emoji from tool names', () => {
        expect(plainName('💉 Vaccinate')).toBe('Vaccinate');
        expect(plainName('🔗 Sever Link')).toBe('Sever Link');
        expect(plainName('⚡ Vax Blitz')).toBe('Vax Blitz');
        expect(plainName('Plain')).toBe('Plain');
        for (const t of Object.values(tools)) expect(plainName(t.name)).not.toMatch(EMOJI);
    });

    it('has a plain one-line hint for each classic tool', () => {
        for (const id of ['vaccinate', 'quarantine', 'severLink']) {
            const h = toolHint(id, tools);
            expect(h.length).toBeGreaterThan(10);
            expect(h.length).toBeLessThan(90);
            expect(h).not.toMatch(EMOJI);
            expect(h).not.toContain('\u2014');
        }
    });

    it('builds tray chips with locked, spent, ready and empty states', () => {
        const d = difficulties.easy;
        const usage = Object.fromEntries(Object.keys(tools).map((k) => [k, 0]));
        const day1 = toolChips(tools, d, 1, usage, {});
        const byId = Object.fromEntries(day1.map((c) => [c.id, c]));
        expect(byId.vaccinate.state).toBe('locked');
        expect(byId.vaccinate.usage).toBe('Day 2');
        expect(byId.severLink.state).toBe('ready');
        expect(byId.eureka.state).toBe('empty');
        expect(byId.eureka.powerUp).toBe(true);

        const spent = { ...usage, severLink: 99 };
        const day3 = Object.fromEntries(toolChips(tools, d, 3, spent, { eureka: 2 }).map((c) => [c.id, c]));
        expect(day3.severLink.state).toBe('spent');
        expect(day3.severLink.usage).toBe('0 left');
        expect(day3.eureka.state).toBe('ready');
        expect(day3.eureka.usage).toBe('x2');
        for (const c of Object.values(day3)) expect(c.label).not.toMatch(EMOJI);
    });

    it('summarises a day in one line with a tone', () => {
        expect(dayBanner({ day: 4, newCases: 3, recovered: 1 })).toEqual({ text: 'Day 4: 3 new cases, 1 recovered', tone: 'bad' });
        expect(dayBanner({ day: 5, newCases: 1, recovered: 2 }).tone).toBe('calm');
        expect(dayBanner({ day: 6 })).toEqual({ text: 'Day 6: no new cases', tone: 'good' });
        expect(dayBanner({ day: 7, newCases: 1 }).text).toBe('Day 7: 1 new case');
    });

    it('fits every node on a tall phone screen and centres a lopsided layout', () => {
        const pts = [];
        for (let i = 0; i < 40; i++) pts.push({ x: 4 + Math.cos(i) * 10, y: -2 + Math.sin(i) * 6 });
        const aspect = 374 / 560; // network area on a 390x844 phone
        const { cx, cy, distance } = fitCamera(pts, { fovDeg: 48, aspect, pad: 1.4 });
        expect(cx).toBeCloseTo(4, 0);
        expect(cy).toBeCloseTo(-2, 0);
        const t = Math.tan((48 * Math.PI) / 360);
        for (const p of pts) {
            // Projected into normalised screen space, every point is inside.
            expect(Math.abs(p.x - cx) / (distance * t * aspect)).toBeLessThanOrEqual(1);
            expect(Math.abs(p.y - cy) / (distance * t)).toBeLessThanOrEqual(1);
        }
        expect(fitCamera([], {}).distance).toBeGreaterThan(0);
    });

    it('explains which rule ended a lost level', () => {
        expect(lossReason({ totalInfected: 18, caseCap: 18 })).toContain('cap of 18');
        expect(lossReason({ totalInfected: 3, caseCap: 18 })).toContain('Deaths');
        expect(lossReason({ totalInfected: 18, caseCap: 18 })).not.toContain('\u2014');
    });
});

describe('game screen markup (item 7)', () => {
    const html = read('index.html');
    const game = html.slice(html.indexOf('id="game-screen"'), html.indexOf('<!-- Game Over Screen -->'));

    it('has no text log and no emoji on the game screen', () => {
        expect(game).not.toContain('log-entries');
        expect(game).not.toContain('Action Log');
        expect(game).not.toMatch(EMOJI);
    });

    it('puts the tool tray and Next day after the network, in thumb reach', () => {
        const net = game.indexOf('network-container');
        expect(net).toBeGreaterThan(0);
        expect(game.indexOf('id="tool-tray"')).toBeGreaterThan(net);
        expect(game.indexOf('id="next-day"')).toBeGreaterThan(game.indexOf('id="tools-list"'));
    });

    it('sizes phone controls at 44 px or more', () => {
        const css = read('src/ui/game-screen.css');
        expect(css).toMatch(/\.icon-btn\s*\{[^}]*width:\s*44px;[^}]*height:\s*44px;/);
        expect(css).toMatch(/\.legend-toggle\s*\{[^}]*height:\s*44px;/);
        const phone = css.slice(css.indexOf('@media (max-width: 768px)'));
        expect(phone).toMatch(/\.tool-item\s*\{[^}]*min-height:\s*72px;/);
    });
});
