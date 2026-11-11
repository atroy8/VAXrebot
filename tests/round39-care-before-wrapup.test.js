// Round 39: "Spread stopped!" used to fast-forward to the end at once, even
// when Quarantine could still put the last sick people in a ward where care
// halves their risk. On level 1 that meant stopping the spread on day 2 and
// then watching two people die before Quarantine opened on day 3. Now the
// player keeps the controls while isolation can still help someone sick.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { careStillHelps, spreadIsOver, updateOutcomes, simulateSpread } from '../src/sim/engine.js';
import { applyNodeTool } from '../src/sim/actions.js';
import { initGameState } from '../src/sim/state.js';
import { tools } from '../src/config/tools.js';
import { careNudgeLine, spentToolLine, usedUpNudge } from '../src/ui/game-screen-model.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

const web = (people) => ({
    nodes: people.map(([state, daysInfected = 0], id) => ({ id, state, daysInfected })),
    links: [],
});
const diff = (over = {}) => ({ toolLimitMultiplier: 1, recoveryTime: 5, dailyLimits: { quarantine: 2, vaccinate: 2, severLink: 2 }, ...over });
const state = (over = {}) => ({ ...initGameState(tools, 6), ...over });

describe('careStillHelps', () => {
    it('is null when nobody is sick', () => {
        expect(careStillHelps(state({ day: 3 }), web([['healthy'], ['recovered']]), tools, diff(), 5)).toBeNull();
    });

    it('offers today when Quarantine is open and has uses left', () => {
        const s = state({ day: 3 });
        expect(careStillHelps(s, web([['infected', 1], ['infected', 2], ['healthy']]), tools, diff(), 5)).toEqual({ day: 3, sick: 2 });
    });

    it('waits for the day Quarantine opens if the sick are still ill then (level 1 on day 2)', () => {
        const s = state({ day: 2 });
        expect(careStillHelps(s, web([['infected', 1]]), tools, diff(), 5)).toEqual({ day: 3, sick: 1 });
    });

    it('skips people who will have recovered before Quarantine can reach them', () => {
        const s = state({ day: 1 });
        // Opens on day 3, two days away: sick for 3 of 5 days now means done by then.
        expect(careStillHelps(s, web([['infected', 3]]), tools, diff(), 5)).toBeNull();
        expect(careStillHelps(s, web([['infected', 2]]), tools, diff(), 5)).toEqual({ day: 3, sick: 1 });
    });

    it('rolls to tomorrow when today\'s Quarantine uses are spent', () => {
        const s = state({ day: 4 });
        s.dailyUsage.quarantine = 2;
        expect(careStillHelps(s, web([['infected', 1]]), tools, diff(), 5)).toEqual({ day: 5, sick: 1 });
        expect(careStillHelps(s, web([['infected', 4]]), tools, diff(), 5)).toBeNull();
    });

    it('is null on a world without Quarantine', () => {
        const d = diff({ dailyLimits: { quarantine: 0, vaccinate: 2, severLink: 3 } });
        expect(careStillHelps(state({ day: 3 }), web([['infected', 1]]), tools, d, 5)).toBeNull();
    });

    it('ignores people already in a ward, the dead and the removed', () => {
        const net = web([['quarantined', 1], ['dead', 1], ['infected', 1]]);
        net.nodes[0].sickWhileQuarantined = true;
        net.nodes[2].removed = true;
        expect(careStillHelps(state({ day: 3 }), net, tools, diff(), 5)).toBeNull();
    });

    it('follows a level that brings Quarantine forward', () => {
        const d = diff({ toolDays: { quarantine: 1 } });
        expect(careStillHelps(state({ day: 1 }), web([['infected', 0]]), tools, d, 5)).toEqual({ day: 1, sick: 1 });
    });

    it('changes nothing it reads', () => {
        const s = state({ day: 3 });
        const net = web([['infected', 1]]);
        const before = JSON.stringify({ ...s, usedOnPeople: [...s.usedOnPeople] }) + JSON.stringify(net);
        careStillHelps(s, net, tools, diff(), 5);
        expect(JSON.stringify({ ...s, usedOnPeople: [...s.usedOnPeople] }) + JSON.stringify(net)).toBe(before);
    });

    it('after isolating the last sick person there is nothing left to do, so wrap-up can run', () => {
        const s = state({ day: 3 });
        const net = web([['infected', 1], ['healthy']]);
        expect(spreadIsOver(net)).toBe(true);
        expect(careStillHelps(s, net, tools, diff(), 5)).not.toBeNull();
        applyNodeTool(s, tools, 'quarantine', net.nodes[0]);
        expect(careStillHelps(s, net, tools, diff(), 5)).toBeNull();
    });
});

describe('waiting for care saves lives (the reason for the change)', () => {
    // Seeded rng so the comparison is stable.
    const rngFrom = (seed) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);

    function deathsOver(runs, isolateOnDay) {
        let dead = 0;
        for (let i = 0; i < runs; i++) {
            const rng = rngFrom(i + 1);
            const s = state({ day: 2 });
            const net = web([['infected', 1], ['infected', 1]]);
            for (let day = 2; day < 10; day++) {
                s.day = day;
                if (day === isolateOnDay) for (const n of net.nodes) if (n.state === 'infected') applyNodeTool(s, tools, 'quarantine', n);
                simulateSpread(s, net, 0, rng);
                updateOutcomes(s, net, 5, 0.3, rng);
            }
            dead += s.stats.totalDead;
        }
        return dead;
    }

    it('isolating on day 3 loses fewer people than fast-forwarding untreated', () => {
        const untreated = deathsOver(400, null);
        const treated = deathsOver(400, 3);
        expect(untreated).toBeGreaterThan(0);
        expect(treated).toBeLessThan(untreated * 0.75);
    });
});

describe('the nudge line', () => {
    it('says how many still need care when Quarantine is ready now', () => {
        expect(careNudgeLine({ day: 3, sick: 2 }, 3)).toBe('Spread stopped! 2 sick people still need care. Quarantine them: care halves their risk.');
        expect(careNudgeLine({ day: 3, sick: 1 }, 3)).toContain('1 sick person still needs care.');
    });

    it('names the day Quarantine opens when it is not open yet', () => {
        expect(careNudgeLine({ day: 3, sick: 2 }, 2)).toBe('Spread stopped! Quarantine opens on day 3. Isolate the sick then: care halves their risk.');
    });

    it('is empty with no plan, and never uses a dash', () => {
        expect(careNudgeLine(null, 1)).toBe('');
        for (const line of [careNudgeLine({ day: 3, sick: 1 }, 3), careNudgeLine({ day: 4, sick: 3 }, 2)]) {
            expect(line).not.toMatch(/[–—]/);
            expect(line.length).toBeLessThanOrEqual(100);
        }
    });
});

describe('wiring in game.js', () => {
    const game = read('src/game.js');
    const body = game.slice(game.indexOf('    maybeWrapUp() {'), game.indexOf('    endWrapUp() {'));

    it('checks for care before the fast-forward starts', () => {
        expect(body).toContain('careStillHelps(this.gameState, this.network, this.tools, this.difficulty, this.difficulty.recoveryTime)');
        expect(body.indexOf('careStillHelps(')).toBeLessThan(body.indexOf("card.className = 'wrapup-card'"));
        expect(body.indexOf('careStillHelps(')).toBeLessThan(body.indexOf('this.autoAdvance.cancel()'));
    });

    it('shows the nudge once per level', () => {
        expect(body).toMatch(/if \(!this\.gameState\.careNudgeShown\) \{\s*this\.gameState\.careNudgeShown = true;\s*showNotification\(careNudgeLine\(care, this\.gameState\.day\), 'success'\)/);
    });
});

describe('used-up lines after the spread is over', () => {
    const chips = [
        { id: 'severLink', label: 'Sever', state: 'ready' },
        { id: 'vaccinate', label: 'Vaccinate', state: 'spent' },
        { id: 'quarantine', label: 'Quarantine', state: 'locked', firstDay: 3 },
    ];

    it('no longer sends the player to red lines that are not there', () => {
        expect(spentToolLine('vaccinate', chips, { sickFree: 1 })).toBe('Vaccinate is used up for today. Tap a red line to cut it.');
        expect(spentToolLine('vaccinate', chips, { sickFree: 1, spreadOver: true })).toBe('Vaccinate is used up for today. It is back tomorrow.');
        expect(usedUpNudge('vaccinate', chips, { sickFree: 1, spreadOver: true })).toBeNull();
    });

    it('still points at isolation when Quarantine is ready', () => {
        const open = chips.map((c) => (c.id === 'quarantine' ? { ...c, state: 'ready' } : c));
        expect(spentToolLine('vaccinate', open, { sickFree: 1, spreadOver: true })).toBe('Vaccinate is used up for today. Tap a sick person to isolate them.');
    });

    it('the game passes spreadOver in its tap context', () => {
        expect(read('src/game.js')).toContain('spreadOver: !!this.network && spreadIsOver(this.network)');
    });
});
