// Round 50: the tool tray fits a phone.
// - Empty power-ups (x0) no longer sit in the tray; the Shop chip is where
//   they are bought, and power-ups the player holds still show.
// - On every level, a player with no power-ups sees the level's tools and the
//   Shop chip without scrolling at 390 px (and at 360 px).
// - The Shop chip glows when the player can afford a power-up.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { tools } from '../src/config/tools.js';
import { LEVELS } from '../src/config/levels.js';
import { POWER_UPS } from '../src/economy.js';
import { toolChips, trayChips, shopCanBuy } from '../src/ui/game-screen-model.js';
import { levelRules } from '../src/config/level-rules.js';

// panels.js preloads sprites with new Image(); tests run in node.
globalThis.Image ??= class { };
const { renderTools } = await import('../src/ui/panels.js');
const levelDifficulty = (level) => levelRules(level).difficulty;

const D1 = levelRules(LEVELS[0]).difficulty;
const usage0 = () => Object.fromEntries(Object.keys(tools).map((k) => [k, 0]));
const COSTS = Object.values(POWER_UPS).map((p) => p.cost);

// Phone tray geometry from src/ui/game-screen.css, measured in Playwright:
// the tray is 18 px narrower than the screen, chips are at least 72 px wide,
// 8 px apart, with 8 px padding at each end.
const CHIP = 72;
const GAP = 8;
const fits = (n, screen) => n * CHIP + (n - 1) * GAP + 2 * 8 <= screen - 18;

describe('round 50: tray chips', () => {
    it('drops empty power-ups but keeps held ones and every tool', () => {
        const all = toolChips(tools, D1, 1, usage0(), { eureka: 0, pay: 2, blitz: 0 });
        const shown = trayChips(all);
        const ids = shown.map((c) => c.id);
        expect(ids).not.toContain('eureka');
        expect(ids).not.toContain('blitz');
        expect(ids).toContain('pay');
        for (const c of all.filter((c) => !c.powerUp)) expect(ids).toContain(c.id);
        // Order is kept (tools first, then power-ups).
        expect(shown).toEqual(all.filter((c) => ids.includes(c.id)));
    });

    it('keeps locked, spent and off tools so they can still explain themselves', () => {
        const spent = { ...usage0(), severLink: 99 };
        const shown = trayChips(toolChips(tools, D1, 1, spent, {}));
        const states = Object.fromEntries(shown.map((c) => [c.id, c.state]));
        expect(states.severLink).toBe('spent');
        expect(states.vaccinate).toBe('locked');
    });

    it('fits every level tray plus Shop on a 390 px and a 360 px phone with no power-ups', () => {
        let checked = 0;
        for (const level of LEVELS) {
            const d = levelDifficulty(level);
            const n = trayChips(toolChips(tools, d, 1, usage0(), {})).length + 1; // + Shop
            expect(fits(n, 390), `${level.id}: ${n} chips`).toBe(true);
            expect(fits(n, 360), `${level.id}: ${n} chips at 360`).toBe(true);
            checked++;
        }
        expect(checked).toBe(LEVELS.length);
    });
});

describe('round 50: shop glow', () => {
    it('glows only when funds cover the cheapest power-up', () => {
        const cheapest = Math.min(...COSTS);
        expect(shopCanBuy(0, COSTS)).toBe(false);
        expect(shopCanBuy(cheapest - 1, COSTS)).toBe(false);
        expect(shopCanBuy(cheapest, COSTS)).toBe(true);
        expect(shopCanBuy(null, COSTS)).toBe(false);
        expect(shopCanBuy(500, [])).toBe(false);
    });
});

describe('round 50: renderTools output', () => {
    let list;
    beforeEach(() => {
        list = {
            innerHTML: '',
            scrollLeft: 0,
            clientWidth: 358,
            scrollWidth: 358,
            classes: new Set(),
            classList: { toggle(c, on) { on ? list.classes.add(c) : list.classes.delete(c); } },
        };
        globalThis.document = { getElementById: (id) => (id === 'tools-list' ? list : null) };
    });
    afterEach(() => {
        delete globalThis.document;
    });

    it('renders tools, held power-ups and Shop, and no x0 chips', () => {
        renderTools(tools, D1, 1, usage0(), { charges: { blitz: 1 }, funding: 0 });
        expect(list.innerHTML).toContain('data-tool="severLink"');
        expect(list.innerHTML).toContain('data-tool="blitz"');
        expect(list.innerHTML).not.toContain('data-tool="eureka"');
        expect(list.innerHTML).not.toContain('x0');
        expect(list.innerHTML).toContain('data-tool="shop"');
        expect(list.innerHTML).not.toContain('can-buy');
    });

    it('marks the Shop chip when a power-up is affordable', () => {
        renderTools(tools, D1, 1, usage0(), { charges: {}, funding: Math.min(...COSTS) });
        expect(list.innerHTML).toMatch(/shop-chip can-buy/);
    });

    it('pins the Shop chip only when the tray overflows', () => {
        renderTools(tools, D1, 1, usage0(), { charges: {}, funding: 0 });
        expect(list.classes.has('scrolls')).toBe(false);
        list.scrollWidth = 600;
        renderTools(tools, D1, 1, usage0(), { charges: { eureka: 1, pay: 1, blitz: 1 }, funding: 0 });
        expect(list.classes.has('scrolls')).toBe(true);
        const css = readFileSync(new URL('../src/ui/game-screen.css', import.meta.url), 'utf8');
        expect(css).toMatch(/\.tools-list\.scrolls \.shop-chip \{[^}]*position: sticky;[^}]*right: 0;/);
        expect(css).not.toMatch(/tools-list[^{]*\{[^}]*mask-image/);
    });

    it('lets a short tray share the full width on phones', () => {
        const css = readFileSync(new URL('../src/ui/game-screen.css', import.meta.url), 'utf8');
        expect(css).toMatch(/flex:\s*1 0 72px/);
        expect(css).toMatch(/shop-chip\.can-buy/);
    });
});
