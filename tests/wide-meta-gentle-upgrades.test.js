// Wide audience round, meta stream: Gentle mode, permanent upgrades and the
// save fields behind them.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { LEVELS, REGIONS } from '../src/config/levels.js';
import { tools } from '../src/config/tools.js';
import { rollLevelRules } from '../src/config/difficulty-roll.js';
import { applyGentle, GENTLE, shouldOfferGentle, nextLossStreak } from '../src/config/gentle.js';
import { UPGRADES, UPGRADE_IDS, applyUpgradeRules, applyUpgradeState, buyUpgrade, freeHints, EXTRA_WARD_CAP } from '../src/config/upgrades.js';
import { applyMetaRules, metaModifier } from '../src/config/meta-rules.js';
import { metaSummary } from '../src/sim/meta-run.js';
import { mulberry32, buildRun } from '../src/sim/balance.js';
import { initGameState } from '../src/sim/state.js';
import { toolDailyLimit, toolAvailableDay, canUseTool } from '../src/sim/engine.js';
import { actionsRemaining, advanceDay } from '../src/sim/actions.js';
import { freshSave, loadSave, writeSave, createMemoryBackend, SAVE_KEY, SAVE_VERSION } from '../src/save.js';
import { recordCompletion } from '../src/progress.js';
import { gentleOn, setGentle, markClear, clearBadge, noteResult, spendFunding } from '../src/meta.js';
import { settingsMarkup } from '../src/ui/settings.js';
import { gentleOfferMarkup, upgradesMarkup, briefingGoalsMarkup, levelMetaLine } from '../src/ui/meta-panels.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const lastPlanet = LEVELS.filter((l) => l.regionId === REGIONS.at(-1).id);
// Round 57: every run deals and solves a web first, so fewer runs (was 100).
const RUNS = 40;
const gentle = { modify: metaModifier({ gentle: true }) };
const kitted = { modify: metaModifier({ upgrades: UPGRADE_IDS }), upgrades: UPGRADE_IDS };
const planetRate = (levels, options) => mean(levels.map((l) => metaSummary(l, options, RUNS, 21).winRate));

describe('gentle mode is a pure modifier on the rolled rules', () => {
    const level = LEVELS.at(-1);
    const rolled = rollLevelRules(level, mulberry32(3));
    const out = applyGentle(rolled);

    // Round 57: there is no spread rate to slow. Gentle mode is one more use
    // of each tool a day and one more spare case under the cap.
    it('each offered tool gets one more use a day and the cap one more spare case', () => {
        expect(GENTLE).toEqual({ extraUses: 1, extraCap: 1 });
        expect(out.difficulty.transmissionMultiplier).toBe(rolled.difficulty.transmissionMultiplier);
        expect(out.scenario.capSlack).toBe(rolled.scenario.capSlack + 1);
        for (const id of level.toolkit.tools) expect(out.difficulty.dailyLimits[id]).toBe(rolled.difficulty.dailyLimits[id] + 1);
        expect(out.difficulty.gentle).toBe(true);
    });

    it('a tool the level does not have stays missing', () => {
        const noVax = LEVELS.find((l) => l.variant && l.variant.type === 'noVaccines');
        const g = applyGentle(rollLevelRules(noVax, mulberry32(1)));
        expect(g.difficulty.dailyLimits.vaccinate).toBe(0);
        expect(toolDailyLimit(tools.vaccinate, g.difficulty, 'vaccinate')).toBe(0);
    });

    it('never changes the rules it was given, the fallback cap share or the level length', () => {
        const before = JSON.stringify(rolled);
        applyGentle(rolled);
        expect(JSON.stringify(rolled)).toBe(before);
        expect(out.scenario.caseCapFraction).toBe(rolled.scenario.caseCapFraction);
        expect(out.scenario.duration).toBe(rolled.scenario.duration);
        expect(out.threat).toBe(rolled.threat);
        expect(out.pips).toBe(rolled.pips);
    });

    it('with nothing switched on the rules pass through untouched', () => {
        expect(applyMetaRules(rolled, {})).toBe(rolled);
        expect(applyMetaRules(rolled, { gentle: false, upgrades: [] })).toBe(rolled);
    });
});

describe('gentle mode with the balance bots', () => {
    const standard = planetRate(lastPlanet, { bot: 'beginner' });
    const eased = planetRate(lastPlanet, { ...gentle, bot: 'beginner' });

    it('lifts the beginner bot on the last planet by at least 15 points', () => {
        expect(standard).toBeLessThan(0.5); // the problem: most casual players lose here
        expect(eased - standard).toBeGreaterThanOrEqual(0.15);
    });

    it('still leaves the last planet short of a walkover for a beginner', () => {
        expect(eased).toBeLessThanOrEqual(0.9);
    });

    it('doing nothing still never wins, on any level', () => {
        for (const level of LEVELS) {
            const s = metaSummary(level, { ...gentle, bot: 'passive' }, 8, 3);
            expect(s.runs.filter((r) => r.outcome === 'contained').length, level.id).toBe(0);
        }
    }, 120000);

    it('random tapping still does not beat the last planet', () => {
        expect(planetRate(lastPlanet, { ...gentle, bot: 'random' })).toBeLessThanOrEqual(0.15);
    });
});

describe('the gentle offer after two losses in a row', () => {
    it('counts losses on the same level and resets on a win or another level', () => {
        let s = nextLossStreak(null, 'a', false);
        expect(s).toEqual({ levelId: 'a', count: 1 });
        s = nextLossStreak(s, 'a', false);
        expect(s).toEqual({ levelId: 'a', count: 2 });
        expect(nextLossStreak(s, 'b', false)).toEqual({ levelId: 'b', count: 1 });
        expect(nextLossStreak(s, 'a', true)).toEqual({ levelId: null, count: 0 });
    });

    it('offers only at two losses on this level, and never when Gentle is already on', () => {
        expect(shouldOfferGentle({ lossStreak: { levelId: 'a', count: 1 }, levelId: 'a' })).toBe(false);
        expect(shouldOfferGentle({ lossStreak: { levelId: 'a', count: 2 }, levelId: 'a' })).toBe(true);
        expect(shouldOfferGentle({ lossStreak: { levelId: 'a', count: 3 }, levelId: 'b' })).toBe(false);
        expect(shouldOfferGentle({ gentleOn: true, lossStreak: { levelId: 'a', count: 5 }, levelId: 'a' })).toBe(false);
        expect(gentleOfferMarkup()).toContain('Want a gentler outbreak?');
        expect(gentleOfferMarkup()).toContain('data-meta="gentle-on"');
    });

    it('the save carries the streak, the switch and the kind of clear', () => {
        let save = freshSave();
        expect(gentleOn(save)).toBe(false);
        save = setGentle(save, true);
        expect(gentleOn(save)).toBe(true);
        save = noteResult(save, 'mizuho-1', false);
        save = noteResult(save, 'mizuho-1', false);
        expect(save.lossStreak).toEqual({ levelId: 'mizuho-1', count: 2 });
        const stats = { initialPopulation: 10, totalDead: 0, totalRecovered: 2, daysUsed: 4 };
        save = recordCompletion(save, 'mizuho-1', 'contained', stats);
        expect(save.settings.gentle).toBe(true); // new fields survive a recorded win
        save = markClear(save, 'mizuho-1', { gentle: true });
        expect(save.levels['mizuho-1'].stars).toBeGreaterThan(0); // stars earned in Gentle mode count
        expect(clearBadge(save.levels['mizuho-1'])).toBe('gentle');
        save = recordCompletion(save, 'mizuho-1', 'contained', stats);
        expect(save.levels['mizuho-1'].gentleClear).toBe(true); // kept by a later win
        save = markClear(save, 'mizuho-1', { gentle: false });
        expect(clearBadge(save.levels['mizuho-1'])).toBe('standard');
        expect(levelMetaLine(LEVELS[0], save)).toContain('Standard clear');
        expect(markClear(freshSave(), 'mizuho-1', {}).levels).toEqual({}); // nothing to mark before a win
    });

    it('Settings has the switch, and the briefing shows a Gentle tag', () => {
        const on = settingsMarkup({ adsRemoved: false, gentle: { enabled: true } });
        expect(on).toMatch(/Gentle mode<\/span>\s*<input type="checkbox" data-act="gentle" checked>/);
        expect(settingsMarkup({ adsRemoved: false, gentle: { enabled: false } })).toMatch(/data-act="gentle" >/);
        expect(settingsMarkup({ adsRemoved: false })).not.toContain('data-act="gentle"');
        expect(briefingGoalsMarkup([], [], { gentle: true })).toContain('Gentle');
        expect(read('src/ui/settings.js')).toContain("gentle?.setEnabled(e.target.checked)");
        expect(read('src/game.js')).toContain('gentle: this.gentleSetting(),');
        expect(read('src/game.js')).toContain('const rules = this.rollMetaRules();');
    });
});

describe('permanent upgrades', () => {
    it('three to five upgrades, each bought once, at rising prices a player can reach', () => {
        expect(UPGRADES.length).toBeGreaterThanOrEqual(3);
        expect(UPGRADES.length).toBeLessThanOrEqual(5);
        const costs = UPGRADES.map((u) => u.cost);
        expect([...costs].sort((a, b) => a - b)).toEqual(costs);
        expect(new Set(costs).size).toBe(costs.length);
        // A win banks about 126 funding (stars plus the care bonus).
        const typicalWin = mean(LEVELS.filter((l) => l.levelInPlanet % 3 === 0).map((l) => metaSummary(l, {}, 30, 2).meanFundingPerWin));
        expect(typicalWin).toBeGreaterThan(100);
        expect(typicalWin).toBeLessThan(160);
        expect(costs[0] / typicalWin).toBeLessThanOrEqual(1.5); // the first one comes quickly
        expect(costs.at(-1) / typicalWin).toBeLessThanOrEqual(4); // the last is a few wins, not a grind
        for (const u of UPGRADES) expect(u.effect.length).toBeGreaterThan(10);
    }, 60000);

    it('buying spends funding once and refuses a second copy or an empty purse', () => {
        const save = { ...freshSave(), funding: 130 };
        const bought = buyUpgrade(save, 'fieldTraining');
        expect(bought.ok).toBe(true);
        expect(bought.save.funding).toBe(10);
        expect(bought.save.upgrades).toEqual(['fieldTraining']);
        expect(save.upgrades).toEqual([]); // pure
        expect(buyUpgrade(bought.save, 'fieldTraining').ok).toBe(false);
        expect(buyUpgrade(bought.save, 'extraWard').reason).toMatch(/Not enough gold/);
        expect(buyUpgrade(save, 'nope').ok).toBe(false);
    });

    it('Field training: one more Sever on day 1 only', () => {
        const level = LEVELS[30];
        const run = buildRun(level, mulberry32(4));
        const base = actionsRemaining(run.state, tools, run.difficulty);
        applyUpgradeState(run.state, run, ['fieldTraining']);
        expect(actionsRemaining(run.state, tools, run.difficulty)).toBe(base + 1);
        const limit = toolDailyLimit(tools.severLink, run.difficulty, 'severLink');
        run.state.dailyUsage.severLink += limit;
        expect(canUseTool(run.state, tools, 'severLink', run.difficulty).allowed).toBe(true);
        run.state.dailyUsage.severLink += 1;
        expect(canUseTool(run.state, tools, 'severLink', run.difficulty).allowed).toBe(false);
        advanceDay(run.state, run.network, { scenario: run.scenario, difficulty: run.difficulty, rng: mulberry32(1) });
        expect(run.state.dailyUsage.severLink).toBe(0); // day 2 is back to normal
        const untouched = initGameState(tools, 10);
        applyUpgradeState(untouched, run, []);
        expect(untouched.dailyUsage.severLink).toBe(0);
    });

    it('Cold chain: Vaccinate opens a day earlier where it is delayed, and nowhere else', () => {
        const delayed = LEVELS.find((l) => l.toolkit.id === 'full');
        const day1 = LEVELS.find((l) => l.toolkit.id === 'rollout');
        const none = LEVELS.find((l) => l.toolkit.id === 'festival');
        const dayOf = (level, owned) => {
            const r = applyUpgradeRules(rollLevelRules(level, mulberry32(1)), owned);
            return { day: toolAvailableDay(tools.vaccinate, r.difficulty, 'vaccinate'), limit: toolDailyLimit(tools.vaccinate, r.difficulty, 'vaccinate') };
        };
        expect(dayOf(delayed, []).day).toBe(2);
        expect(dayOf(delayed, ['coldChain']).day).toBe(1);
        expect(dayOf(day1, ['coldChain']).day).toBe(1);
        expect(dayOf(none, ['coldChain']).limit).toBe(0); // still no vaccine there
        expect(applyUpgradeRules(rollLevelRules(none, mulberry32(1)), ['coldChain']).difficulty.toolDays?.vaccinate).toBeUndefined();
    });

    it('Extra ward: the case cap is a little higher', () => {
        const rolled = rollLevelRules(LEVELS[40], mulberry32(1));
        const out = applyUpgradeRules(rolled, ['extraWard']);
        // Round 57: the cap is par plus a few spare cases, so the ward adds one case.
        expect(out.scenario.capSlack).toBe(rolled.scenario.capSlack + EXTRA_WARD_CAP);
        expect(EXTRA_WARD_CAP).toBe(1);
        expect(JSON.stringify(rollLevelRules(LEVELS[40], mulberry32(1)))).toBe(JSON.stringify(rolled)); // input untouched
    });

    // Round 57: Early warning (the person most likely to fall ill next) is
    // gone: every red line is a certainty now. Rapid response replaces it.
    it('Mentor on call: two free hints. Rapid response: Quarantine a day earlier', () => {
        expect(freeHints([])).toBe(1);
        expect(freeHints(['mentor'])).toBe(2);
        expect(UPGRADE_IDS).not.toContain('earlyWarning');
        const delayed = LEVELS.find((l) => l.toolkit.id === 'full');
        const dayOf = (owned) => toolAvailableDay(tools.quarantine, applyUpgradeRules(rollLevelRules(delayed), owned).difficulty, 'quarantine');
        expect(dayOf([])).toBe(3);
        expect(dayOf(['rapidResponse'])).toBe(2);
        const none = LEVELS.find((l) => l.toolkit.id === 'festival');
        expect(applyUpgradeRules(rollLevelRules(none), ['rapidResponse']).difficulty.toolDays?.quarantine).toBeUndefined();
    });

    it('owning everything helps the smart bot on the last planet without making it a walkover', () => {
        const base = planetRate(lastPlanet, { bot: 'smart' });
        const all = planetRate(lastPlanet, { ...kitted, bot: 'smart' });
        expect(all).toBeGreaterThan(base);
        // Round 57: this was "about 85% at most". With certain spread one more
        // cut on day 1 (Field training) is worth far more than it was with
        // dice: on the same web a sensible player now wins about 19 times in
        // 20 with the whole kit. Par is worked out again with the kit, so 3
        // stars still have to be played for (measured: about 3 wins in 4).
        expect(all).toBeLessThanOrEqual(0.98);
        const stars3 = mean(lastPlanet.map((l) => metaSummary(l, { ...kitted, bot: 'smart' }, RUNS, 21).runs.filter((r) => r.stars === 3).length / RUNS));
        expect(stars3).toBeLessThan(0.9); // easier with the kit (about 3 in 4), never automatic
        const passive = lastPlanet.map((l) => metaSummary(l, { ...kitted, bot: 'passive' }, 25, 3).winRate);
        expect(Math.max(...passive)).toBe(0);
    }, 60000);

    it('the balance guardrails are measured without upgrades or Gentle mode', () => {
        const guard = read('tests/balance.test.js');
        expect(guard).not.toMatch(/meta-rules|upgrades|gentle/i);
        const balance = read('src/sim/balance.js');
        // Round 57: a run is a deal; playRun deals with no meta options.
        expect(balance).toContain('export function buildRun(level, seed, meta = null)');
        expect(balance).toMatch(/export function playRun\(level, bot, seed\) \{\s*return playDeal\(dealLevelCached\(level, seed >>> 0\), bot, seed, level\);/);
    });

    it('the shop lists them under the power-ups, with a price or Owned', () => {
        const html = upgradesMarkup({ funding: 150, owned: ['fieldTraining'] });
        expect(html).toContain('Owned');
        expect(html).toMatch(/data-upgrade="mentor" >150 gold/);
        expect(html).toMatch(/data-upgrade="extraWard" disabled>400 gold/);
        expect(html).not.toContain('data-upgrade="fieldTraining"');
        expect(read('src/game.js')).toContain('this.refreshMetaShop();');
        // Round 57: upgrades that act on the fresh state are applied where the deal is opened.
        expect(read('src/sim/dealer.js')).toContain('applyMetaState(run.state, run, { upgrades: deal.upgrades })');
        expect(read('src/ui/meta.css')).toMatch(/\.upgrade-buy \{[^}]*min-height: 48px;/s);
    });
});

describe('saved progress stays backward compatible', () => {
    it('an old version 2 save loads with every new field at its default', () => {
        const storage = createMemoryBackend();
        storage.setItem(SAVE_KEY, JSON.stringify({ version: 2, funding: 240, livesSaved: 31, levels: { 'mizuho-1': { stars: 3, completed: true, bestDeaths: 0 } }, powerups: { eureka: 1, blitz: 0, pay: 2 }, openedChests: ['chest-1a'] }));
        const save = loadSave(storage);
        expect(save.funding).toBe(240);
        expect(save.levels['mizuho-1'].stars).toBe(3);
        expect(save.powerups.pay).toBe(2);
        expect(save.openedChests).toEqual(['chest-1a']);
        expect(save.settings).toEqual({ gentle: false });
        expect(save.upgrades).toEqual([]);
        expect(save.goals).toEqual({});
        expect(save.daily).toEqual({ lastDate: null, streak: 0, best: 0, last: null });
        expect(save.lossStreak).toEqual({ levelId: null, count: 0 });
        expect(save.version).toBe(SAVE_VERSION);
    });

    it('a version 1 save still upgrades, and junk in the new fields is replaced', () => {
        const storage = createMemoryBackend();
        storage.setItem(SAVE_KEY, JSON.stringify({ version: 1, funding: 5, livesSaved: 0, levels: {}, upgrades: 'all', settings: 7, daily: [], goals: null }));
        const save = loadSave(storage);
        expect(save.funding).toBe(5);
        expect(save.upgrades).toEqual([]);
        expect(save.settings).toEqual({ gentle: false });
        expect(save.daily.streak).toBe(0);
        expect(save.goals).toEqual({});
    });

    it('new fields round-trip through storage and through a recorded win', () => {
        const storage = createMemoryBackend();
        let save = { ...freshSave(), funding: 500 };
        save = buyUpgrade(save, 'coldChain').save;
        save = setGentle(save, true);
        save = { ...save, goals: { 'mizuho-1': ['noDeaths'] }, daily: { lastDate: '2026-11-25', streak: 4, best: 6, last: null } };
        save = recordCompletion(save, 'mizuho-2', 'contained', { initialPopulation: 10, totalDead: 0, totalRecovered: 1, daysUsed: 5 });
        writeSave(storage, save);
        const back = loadSave(storage);
        expect(back.upgrades).toEqual(['coldChain']);
        expect(back.settings.gentle).toBe(true);
        expect(back.goals).toEqual({ 'mizuho-1': ['noDeaths'] });
        expect(back.daily.streak).toBe(4);
        expect(back.levels['mizuho-2'].completed).toBe(true);
    });

    it('funding is never spent below zero', () => {
        const save = { ...freshSave(), funding: 10 };
        expect(spendFunding(save, 0)).toBe(save);
        expect(spendFunding(save, 15)).toBe(null);
        expect(spendFunding(save, 10).funding).toBe(0);
    });
});
