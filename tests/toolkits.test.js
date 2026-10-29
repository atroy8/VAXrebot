// Item 16: a toolkit per level. Every level has one, the briefing lists it,
// and the game tray and the balance bots only offer those tools.
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { LEVELS } from '../src/config/levels.js';
import { levelRules } from '../src/config/level-rules.js';
import { TOOLKITS, CLASSIC_TOOLS, SLOT_TOOLKITS, toolkitCard, toolsOf, toolOpenDays, DEFAULT_TOOL_DAYS } from '../src/config/toolkits.js';
import { lessonFits } from '../src/config/campaign.js';
import { tools } from '../src/config/tools.js';
import { toolChips } from '../src/ui/game-screen-model.js';
import { toolkitMarkup } from '../src/ui/briefing.js';
import { buildRun, mulberry32, BOTS, offeredTools } from '../src/sim/balance.js';
import { advanceDay } from '../src/sim/actions.js';
import { toolAvailableDay } from '../src/sim/engine.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const byKit = (id) => LEVELS.filter((l) => l.toolkit.id === id);

describe('every level has a toolkit (item 16)', () => {
    it('each of the 80 levels names 1 to 3 classic tools and a reason', () => {
        expect(LEVELS).toHaveLength(80);
        for (const level of LEVELS) {
            expect(level.toolkit, level.id).toBeTruthy();
            expect(level.toolkit.tools.length).toBeGreaterThanOrEqual(1);
            expect(level.toolkit.tools.length).toBeLessThanOrEqual(3);
            for (const t of level.toolkit.tools) expect(CLASSIC_TOOLS).toContain(t);
            expect(level.toolkit.why.length).toBeGreaterThan(20);
        }
    });

    it('fits the scenario: school is Quarantine and Sever, the rollout vaccinates from day 1', () => {
        for (const l of LEVELS.filter((x) => x.scenarioId === 'school')) expect(l.toolkit.tools.sort()).toEqual(['quarantine', 'severLink']);
        for (const l of byKit('rollout')) {
            expect(l.toolkit.tools).toContain('vaccinate');
            const { difficulty } = levelRules(l);
            expect(toolAvailableDay(tools.vaccinate, difficulty, 'vaccinate')).toBe(1);
        }
        for (const l of byKit('festival')) expect(l.toolkit.tools).toEqual(['severLink']);
    });

    it('twist levels never offer the missing tool', () => {
        for (const l of LEVELS.filter((x) => x.variant?.type === 'noVaccines')) expect(l.toolkit.tools).not.toContain('vaccinate');
        for (const l of LEVELS.filter((x) => x.variant?.type === 'noQuarantine')) expect(l.toolkit.tools).not.toContain('quarantine');
    });

    it('puzzle levels keep the tools their callout tells you to use', () => {
        for (const l of LEVELS.filter((x) => x.variant?.type === 'superSpreader')) {
            expect(l.toolkit.tools).toEqual(expect.arrayContaining(['quarantine', 'severLink']));
        }
    });

    it('the first level of every planet and the boss keep the full kit; every kit has Sever', () => {
        for (const l of LEVELS.filter((x) => x.levelInPlanet === 0 || x.variant?.boss)) expect(l.toolkit.tools).toHaveLength(3);
        for (const id of SLOT_TOOLKITS) expect(TOOLKITS[id].tools).toContain('severLink');
    });

    it('levels are not all the same: at least 4 different tool sets across a planet', () => {
        const sets = new Set(LEVELS.filter((l) => l.regionId === 'mizuho').map((l) => [...l.toolkit.tools].sort().join('+')));
        expect(sets.size).toBeGreaterThanOrEqual(4);
    });

    it('no lesson teaches a tool the level does not have', () => {
        for (const l of LEVELS) expect(lessonFits(l.lessonId, l.toolkit.tools), `${l.id} ${l.lessonId}`).toBe(true);
    });

    it('copy has no em dashes', () => {
        for (const kit of Object.values(TOOLKITS)) expect(kit.why).not.toMatch(/—/);
    });
});

describe('rules and tray follow the toolkit', () => {
    it('tools outside the kit have a daily limit of 0 and no tray chip', () => {
        for (const level of LEVELS) {
            const { difficulty } = levelRules(level);
            for (const id of CLASSIC_TOOLS) {
                if (!level.toolkit.tools.includes(id)) expect(difficulty.dailyLimits[id], `${level.id} ${id}`).toBe(0);
            }
            const chips = toolChips(tools, difficulty, 5, { vaccinate: 0, quarantine: 0, severLink: 0 }, {});
            const classic = chips.filter((c) => !c.powerUp).map((c) => c.id);
            expect(classic.sort()).toEqual([...level.toolkit.tools].sort());
            // Power-ups are bought with funding and stay on every level.
            expect(chips.some((c) => c.powerUp)).toBe(true);
        }
    });

    it('toolsOf falls back to all three tools for a level without a kit', () => {
        expect(toolsOf({})).toEqual(CLASSIC_TOOLS);
        expect(toolsOf(byKit('festival')[0])).toEqual(['severLink']);
    });
});

describe('balance bots only use the toolkit', () => {
    for (const bot of ['smart', 'beginner', 'random']) {
        it(`${bot} bot never spends a tool outside the kit`, () => {
            for (const id of ['festival', 'school', 'rollout', 'envoy', 'festivalNoWards']) {
                const level = byKit(id)[0];
                for (let seed = 1; seed <= 6; seed++) {
                    const rng = mulberry32(seed * 31 + level.levelInPlanet);
                    const run = buildRun(level, rng);
                    expect(offeredTools(run).sort()).toEqual([...level.toolkit.tools].sort());
                    let used = { vaccinate: 0, quarantine: 0, severLink: 0 };
                    for (let day = 0; day < 12; day++) {
                        BOTS[bot](run, rng);
                        for (const t of CLASSIC_TOOLS) used[t] += run.state.dailyUsage[t] || 0;
                        if (advanceDay(run.state, run.network, { scenario: run.scenario, difficulty: run.difficulty, rng }).result) break;
                    }
                    for (const t of CLASSIC_TOOLS) if (!level.toolkit.tools.includes(t)) expect(used[t], `${level.id} ${bot} ${t}`).toBe(0);
                }
            }
        });
    }

    it('the tuner only searches limits for kit tools', () => {
        const src = read('scripts/tune-campaign.mjs');
        expect(src).toContain('presetsFor(kit)');
    });
});

describe('briefing toolkit card', () => {
    it('names the tools and why, marks a day 1 vaccine, and escapes text', () => {
        const kit = byKit('rollout')[0].toolkit;
        const card = toolkitCard(kit);
        expect(card.title).toBe('Your tools: Vaccinate, Sever');
        expect(card.firstDay).toEqual(['Vaccinate', 'Sever']);
        const html = toolkitMarkup(kit);
        expect(html).toContain('Vaccinate<small>day 1</small>');
        expect(html).toContain('Ebola');
        expect(toolkitCard(byKit('festival')[0].toolkit).title).toBe('Your tool: Sever');
        expect(toolkitMarkup(null)).toBe('');
        expect(toolkitMarkup({ tools: ['severLink'], why: '<b>x</b>' })).toContain('&lt;b&gt;');
    });

    it('the briefing has a toolkit slot and game.js fills it on every level', () => {
        expect(read('index.html')).toContain('id="briefing-toolkit"');
        expect(read('src/game.js')).toContain('showToolkit(level.toolkit, level.variant?.toolDays)');
    });
});

describe('briefing says when each tool opens (round 26)', () => {
    it('every level: each chip day matches the day the engine opens that tool', () => {
        for (const level of LEVELS) {
            const { difficulty } = levelRules(level);
            const open = toolOpenDays(level.toolkit, level.variant?.toolDays);
            for (const id of level.toolkit.tools) {
                expect(open[id], `${level.id} ${id}`).toBe(toolAvailableDay(tools[id], difficulty, id));
            }
            const html = toolkitMarkup(level.toolkit, level.variant?.toolDays);
            for (const { label, day } of toolkitCard(level.toolkit, level.variant?.toolDays).days) {
                expect(html).toContain(`${label}<small>day ${day}</small>`);
            }
        }
    });

    it('default tool days mirror the tool definitions', () => {
        for (const id of CLASSIC_TOOLS) expect(DEFAULT_TOOL_DAYS[id]).toBe(tools[id].availableDay);
    });

    it('level 1 shows Sever on day 1, Vaccinate on day 2 and Quarantine on day 3', () => {
        const html = toolkitMarkup(LEVELS[0].toolkit, LEVELS[0].variant?.toolDays);
        expect(html).toContain('Sever<small>day 1</small>');
        expect(html).toContain('Vaccinate<small>day 2</small>');
        expect(html).toContain('Quarantine<small>day 3</small>');
        expect(html.indexOf('Sever<small>')).toBeLessThan(html.indexOf('Vaccinate<small>'));
        expect(html.indexOf('Vaccinate<small>')).toBeLessThan(html.indexOf('Quarantine<small>'));
        expect(LEVELS[0].toolkit.why).not.toMatch(/on hand/);
    });

    it('a super-spreader level brings Quarantine forward to day 2', () => {
        const level = LEVELS.find((l) => l.variant?.type === 'superSpreader' && l.toolkit.tools.includes('quarantine'));
        expect(level).toBeTruthy();
        expect(toolkitMarkup(level.toolkit, level.variant.toolDays)).toContain('Quarantine<small>day 2</small>');
    });
});
