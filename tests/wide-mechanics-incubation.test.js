// Wide audience round, mechanic 1: hidden carriers (incubation) and the
// Test tool. Pure sim rules, the no-leak guarantee, the bots, and the wiring.
// Round 57 rewrote the rule and the tests of it: hidden carriers are now
// dealt with the level (two contacts of the first case, sick after two
// nights) instead of every new infection rolling a hidden spell at half
// rate. The no-leak tests are unchanged.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { simulateSpread, showSymptoms, checkGameOver, spreadIsOver, canUseTool } from '../src/sim/engine.js';
import { applyNodeTool, advanceDay, liveR } from '../src/sim/actions.js';
import { initGameState } from '../src/sim/state.js';
import { tools } from '../src/config/tools.js';
import { LEVELS } from '../src/config/levels.js';
import { levelRules } from '../src/config/level-rules.js';
import { lessonFor, LESSONS } from '../src/config/lessons.js';
import { viewNode, visibleState, trueState, isCarrier, isHiddenCarrier, isInfectious, isSusceptible, hiddenCarrierCount, placeCarriers, HIDDEN_NODE_FIELDS, INCUBATION_DEFAULT } from '../src/sim/mechanics.js';
import { BOTS, buildRun, mulberry32, tracingTargets, summarize } from '../src/sim/balance.js';
import { binFor, careCounts } from '../src/ui/care-box-model.js';
import { nodeMarks } from '../src/ui/node-marks.js';
import { toolChips, autoToolForTap, toolHint, HINT_MAX_CHARS } from '../src/ui/game-screen-model.js';
import { mechanicToolFeedback, onsetToast, hiddenChainsLine } from '../src/ui/mechanics-text.js';
import { variantCallout } from '../src/sim/variants.js';
import { toolkitCard } from '../src/config/toolkits.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

function seeded(seed) {
    let s = seed >>> 0;
    return () => {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 4294967296;
    };
}

const INC = { incubation: { count: 2, days: 2 } };
const person = (id, state = 'healthy', extra = {}) => ({ id, state, daysInfected: 0, removed: false, ...extra });
// A line of people: 0 - 1 - 2 - 3 ...
function line(states) {
    const nodes = states.map((s, i) => person(i, s));
    const links = nodes.slice(1).map((n, i) => ({ source: i, target: n.id }));
    return { nodes, links };
}
const always = () => 0; // every roll succeeds, incubation rolls its minimum
const never = () => 0.999;

describe('hidden carriers are dealt with the level', () => {
    it('a new infection is never hidden: it shows the next morning', () => {
        const net = line(['infected', 'healthy', 'healthy']);
        const state = initGameState(tools, 3);
        state.stats.totalInfected = 1;
        const out = simulateSpread(state, net, 1, always, INC);
        expect(net.nodes[1].state).toBe('infected');
        expect(net.nodes[1].incubating).toBeUndefined();
        expect(out.events).toHaveLength(1);
        expect(out.count).toBe(1);
        expect(out.hidden).toEqual([]);
        expect(state.stats.totalInfected).toBe(2);
        expect(hiddenCarrierCount(net)).toBe(0);
    });

    it('the dealt carriers incubate for the stated days, the same for all', () => {
        expect(INCUBATION_DEFAULT).toEqual({ days: 2, count: 2 });
        const nodes = [person(0, 'infected'), person(1), person(2), person(3), person(4)];
        const links = [[0, 1], [0, 2], [0, 3], [3, 4]].map(([source, target]) => ({ source, target }));
        const picked = placeCarriers(nodes, links, INC.incubation, seeded(4));
        expect(picked).toHaveLength(2);
        for (const n of picked) {
            expect(n.incubating).toBe(2);
            expect(n.state).toBe('healthy');
            expect([1, 2, 3]).toContain(n.id); // always a contact of the first case
        }
    });

    it('a carrier shows symptoms after their incubation and becomes a counted case', () => {
        const net = { nodes: [person(0), person(1, 'vaccinated')], links: [{ source: 0, target: 1 }] };
        net.nodes[0].incubating = 2;
        const state = initGameState(tools, 2);
        let out = simulateSpread(state, net, 0, never, INC);
        expect(net.nodes[0].state).toBe('healthy');
        expect(net.nodes[0].incubating).toBe(1);
        expect(out.count).toBe(0);
        out = simulateSpread(state, net, 0, never, INC);
        expect(net.nodes[0].state).toBe('infected');
        expect(net.nodes[0].incubating).toBeUndefined();
        expect(net.nodes[0].daysInfected).toBe(1);
        expect(out.onsets).toHaveLength(1);
        expect(out.onsets[0].from).toBe('healthy');
        expect(out.count).toBe(1);
        expect(state.stats.totalInfected).toBe(1);
    });

    it('someone infected tonight does not spread the same night', () => {
        const net = line(['infected', 'healthy', 'healthy']);
        const state = initGameState(tools, 3);
        simulateSpread(state, net, 1, always, INC);
        expect(net.nodes[1].state).toBe('infected');
        expect(net.nodes[2].state).toBe('healthy'); // not reached through the new case yet
    });

    it('carriers spread before symptoms, exactly as the sick do', () => {
        const net = line(['healthy', 'healthy', 'healthy']);
        net.nodes[0].incubating = 5;
        const state = initGameState(tools, 3);
        const out = simulateSpread(state, net, 0, never, INC);
        expect(net.nodes[1].state).toBe('infected');
        expect(out.events).toHaveLength(1);
        expect(net.nodes[0].state).toBe('healthy'); // and still looks healthy
    });

    it('silent spread is counted for the results', () => {
        const net = line(['healthy', 'healthy']);
        net.nodes[0].incubating = 3;
        const state = initGameState(tools, 2);
        simulateSpread(state, net, 1, always, INC);
        expect(state.stats.silentSpread).toBe(1);
        state.stats.hiddenInfections = 2;
        expect(hiddenChainsLine(state.stats)).toMatch(/1 infection was passed on by people with no symptoms yet/);
        expect(hiddenChainsLine({})).toBe('');
    });

    it('a carrier cannot catch it twice, and an isolated carrier does not spread', () => {
        const net = line(['infected', 'healthy']);
        net.nodes[1].incubating = 2;
        expect(isSusceptible(net.nodes[1])).toBe(false);
        const state = initGameState(tools, 2);
        simulateSpread(state, net, 1, always, INC);
        expect(net.nodes[1].state).toBe('healthy');
        expect(net.nodes[1].incubating).toBe(1);
        const q = person(7, 'quarantined', { incubating: 2 });
        expect(isInfectious(q)).toBe(false);
        expect(isInfectious(person(8, 'healthy', { incubating: 1 }))).toBe(true);
    });

    it('without the rule the dice and the result are the classic ones', () => {
        const a = line(['infected', 'healthy', 'healthy']);
        const b = line(['infected', 'healthy', 'healthy']);
        const sa = initGameState(tools, 3);
        const sb = initGameState(tools, 3);
        const ra = simulateSpread(sa, a, 0.5, seeded(3));
        const rb = simulateSpread(sb, b, 0.5, seeded(3), {});
        expect(a.nodes.map((n) => n.state)).toEqual(b.nodes.map((n) => n.state));
        expect(ra.count).toBe(rb.count);
        expect(ra.events.length).toBe(ra.count);
        expect(a.nodes.every((n) => n.incubating === undefined)).toBe(true);
    });
});

describe('the view never learns who is a hidden carrier', () => {
    it('a hidden carrier projects to exactly what a healthy person does', () => {
        const healthy = person(4);
        const carrier = person(4, 'healthy', { incubating: 2 });
        expect(viewNode(carrier)).toEqual(viewNode(healthy));
        expect(JSON.stringify(viewNode(carrier))).toBe(JSON.stringify(healthy));
        expect(visibleState(carrier)).toBe('healthy');
        expect(trueState(carrier)).toBe('carrier');
        expect(HIDDEN_NODE_FIELDS).toContain('incubating');
    });

    it('after a real night of spread, hidden carriers still project as healthy people', () => {
        const level = LEVELS.find((l) => l.mechanics?.incubation);
        let carriers = 0;
        for (let seed = 1; seed <= 30; seed++) {
            const rng = mulberry32(seed);
            const run = buildRun(level, rng);
            // Round 57: the carriers are there from the deal, and still
            // hidden after a real night of spread.
            advanceDay(run.state, run.network, { scenario: run.scenario, difficulty: run.difficulty, rng });
            for (const n of run.network.nodes) {
                if (!isHiddenCarrier(n) || n.state !== 'healthy') continue;
                carriers++;
                const twin = { ...n };
                delete twin.incubating;
                expect(viewNode(n)).toEqual(twin);
                expect(Object.keys(viewNode(n)).sort()).toEqual(Object.keys(twin).sort());
                // What the UI derives from a person is the same as for a healthy one.
                expect(binFor(n)).toBe(binFor(twin));
                expect(nodeMarks(n)).toEqual(nodeMarks(twin));
                expect(autoToolForTap('node', n.state, [])).toBe(autoToolForTap('node', twin.state, []));
            }
        }
        expect(carriers).toBeGreaterThan(5);
    });

    it('nothing in the UI reads the hidden field', () => {
        const ui = ['src/ui/network-view-3d.js', 'src/ui/care-box.js', 'src/ui/care-box-model.js', 'src/ui/game-screen-model.js', 'src/ui/panels.js', 'src/ui/node-marks.js', 'src/ui/mechanics-text.js', 'src/ui/people.js', 'src/ui/face-token.js'];
        for (const file of ui) {
            const code = read(file)
                .split('\n')
                .filter((l) => !l.trim().startsWith('//'))
                .join('\n');
            for (const field of HIDDEN_NODE_FIELDS) expect(code, file).not.toContain(field);
            expect(code, file).not.toMatch(/isCarrier|isHiddenCarrier|trueState|hiddenCarrierCount/);
        }
        // game.js orchestrates: it may not look either.
        const game = read('src/game.js');
        expect(game).not.toMatch(/\.incubating|isCarrier|isHiddenCarrier|trueState/);
        // The virus only flies for events, and hidden infections are not events.
        expect(game).toContain('for (const { source, target } of events)');
    });

    it('the bots decide from what the player sees: hiding or revealing a carrier in the data changes nothing', () => {
        const level = LEVELS.find((l) => l.mechanics?.incubation);
        for (const bot of ['smart', 'beginner']) {
            for (let seed = 1; seed <= 12; seed++) {
                const play = (strip) => {
                    const rng = mulberry32(seed);
                    const run = buildRun(level, rng);
                    for (let d = 0; d < 2; d++) advanceDay(run.state, run.network, { scenario: run.scenario, difficulty: run.difficulty, rng });
                    // Remove the Test tool so no action can depend on the truth,
                    // then optionally wipe the hidden truth itself.
                    run.difficulty.toolkit = run.difficulty.toolkit.filter((t) => t !== 'test');
                    if (strip) for (const n of run.network.nodes) delete n.incubating;
                    BOTS[bot](run, mulberry32(99));
                    return JSON.stringify({ nodes: run.network.nodes.map((n) => n.state), links: run.network.links.length, used: run.state.dailyUsage });
                };
                expect(play(true), `${bot} seed ${seed}`).toBe(play(false));
            }
        }
        const src = read('src/sim/balance.js');
        expect(src).not.toMatch(/\.incubating|isCarrier|isHiddenCarrier|trueState/);
    });
});

describe('the Test tool', () => {
    const { difficulty } = levelRules(LEVELS.find((l) => l.mechanics?.incubation));
    const fresh = () => {
        const state = initGameState(tools, 6);
        state.day = 2;
        return state;
    };

    // Round 57: the carriers are dealt, so there is someone to find from the
    // first morning and Test opens on day 1 (it used to open on day 2).
    it('opens on day 1, when the dealt carriers can be found', () => {
        const state = initGameState(tools, 6);
        expect(canUseTool(state, tools, 'test', difficulty, person(1)).allowed).toBe(true);
    });

    it('a positive test reveals the carrier as a known case', () => {
        const state = fresh();
        const node = person(1, 'healthy', { incubating: 2 });
        const res = applyNodeTool(state, tools, 'test', node);
        expect(res.positive).toBe(true);
        expect(node.state).toBe('exposed');
        expect(isHiddenCarrier(node)).toBe(false);
        expect(state.stats.totalInfected).toBe(1);
        expect(state.stats.testsPositive).toBe(1);
        expect(state.dailyUsage.test).toBe(1);
        // A test finds out; it does not protect anyone.
        expect(state.stats.totalProtected).toBe(0);
        expect(mechanicToolFeedback('test', res, node).toast).toMatch(/^Positive!/);
    });

    it('a known carrier is not counted twice when symptoms show', () => {
        const state = fresh();
        const net = line(['healthy', 'healthy']);
        net.nodes[0].incubating = 1;
        net.nodes[1].state = 'vaccinated'; // nobody to pass it on to
        applyNodeTool(state, tools, 'test', net.nodes[0]);
        const out = simulateSpread(state, net, 0, never, INC);
        expect(net.nodes[0].state).toBe('infected');
        expect(out.count).toBe(0);
        expect(state.stats.totalInfected).toBe(1);
        expect(onsetToast(out)).toMatch(/carrier you found now shows symptoms/);
    });

    it('a negative test leaves a mark for the rest of the day only', () => {
        const state = fresh();
        const net = line(['healthy', 'healthy']);
        const res = applyNodeTool(state, tools, 'test', net.nodes[0]);
        expect(res.positive).toBe(false);
        expect(net.nodes[0].state).toBe('healthy');
        expect(net.nodes[0].testedClear).toBe(true);
        expect(nodeMarks(net.nodes[0])).toEqual(['clear']);
        expect(canUseTool(state, tools, 'test', difficulty, net.nodes[0]).reason).toMatch(/tested clear today/);
        advanceDay(state, net, { scenario: { baseTransmissionRate: 0, duration: 20 }, difficulty, rng: never });
        expect(net.nodes[0].testedClear).toBeUndefined();
        expect(nodeMarks(net.nodes[0])).toEqual([]);
    });

    it('is limited per day and only works on people who look healthy', () => {
        const state = fresh();
        expect(difficulty.dailyLimits.test).toBeGreaterThan(0);
        expect(canUseTool(state, tools, 'test', difficulty, person(1, 'infected')).allowed).toBe(false);
        expect(canUseTool(state, tools, 'test', difficulty, person(1, 'exposed')).reason).toMatch(/Isolate/);
        state.dailyUsage.test = difficulty.dailyLimits.test;
        expect(canUseTool(state, tools, 'test', difficulty, person(1)).reason).toMatch(/Daily limit/);
    });

    it('quarantine works on a revealed carrier, and on a hidden one by luck', () => {
        const state = fresh();
        state.day = 3;
        const known = person(1, 'exposed', { incubating: 1, knownCase: true });
        expect(canUseTool(state, tools, 'quarantine', difficulty, known).allowed).toBe(true);
        applyNodeTool(state, tools, 'quarantine', known);
        expect(known.state).toBe('quarantined');
        expect(isInfectious(known)).toBe(false);
        expect(binFor(known)).toBe('isolated');
        // Symptoms show in the ward: now a patient, still not spreading.
        const net = { nodes: [known, person(2)], links: [{ source: 1, target: 2 }] };
        const out = simulateSpread(state, net, 1, always, INC);
        expect(known.state).toBe('quarantined');
        expect(known.sickWhileQuarantined).toBe(true);
        expect(binFor(known)).toBe('treatment');
        expect(careCounts(net.nodes).treatment).toBe(1);
        expect(net.nodes[1].incubating).toBeUndefined();
        expect(state.stats.treated).toBe(1);
        expect(state.stats.isolated).toBe(0);
        expect(onsetToast(out)).toMatch(/fell ill in the ward/);
    });

    it('a vaccine given to a hidden carrier comes too late', () => {
        const state = fresh();
        const node = person(1, 'healthy', { incubating: 1 });
        const { difficulty: full } = levelRules(LEVELS[0]);
        expect(canUseTool(state, tools, 'vaccinate', full, node).allowed).toBe(true); // it looks healthy
        node.state = 'vaccinated';
        const out = showSymptoms(state, node);
        expect(node.state).toBe('infected');
        expect(out.from).toBe('vaccinated');
        expect(state.stats.lateVaccines).toBe(1);
        expect(onsetToast({ onsets: [out] })).toMatch(/vaccine came too late/);
    });
});

describe('cases, R and winning with hidden carriers', () => {
    it('the case cap counts known cases only', () => {
        const net = line(['infected', 'healthy', 'healthy', 'healthy']);
        net.links = []; // nobody passes it on in this test
        net.nodes[1].incubating = 2;
        net.nodes[2].incubating = 2;
        const state = initGameState(tools, 4);
        state.stats.totalInfected = 1;
        // True infections are 3 of 4, known cases 1: a cap of 2 is not reached yet.
        expect(checkGameOver(state, net, 30, 2)).toBe(null);
        simulateSpread(state, net, 0, never, INC);
        simulateSpread(state, net, 0, never, INC);
        expect(state.stats.totalInfected).toBe(3);
        expect(checkGameOver(state, net, 30, 2)).toBe('overwhelmed');
    });

    it('nobody wins while someone is still incubating', () => {
        const net = line(['recovered', 'healthy']);
        net.nodes[1].incubating = 1;
        const state = initGameState(tools, 2);
        state.stats.totalProtected = 1;
        expect(checkGameOver(state, net, 30)).toBe(null);
        delete net.nodes[1].incubating;
        expect(checkGameOver(state, net, 30)).toBe('contained');
    });

    it('the game does not fast forward while a hidden carrier can still pass it on', () => {
        const net = line(['healthy', 'healthy']);
        expect(spreadIsOver(net)).toBe(true);
        net.nodes[0].incubating = 1;
        expect(spreadIsOver(net)).toBe(false);
        net.nodes[0].state = 'quarantined';
        expect(spreadIsOver(net)).toBe(true);
    });

    it('live R is read from known cases and is blind to hidden chains', () => {
        const net = line(['infected', 'healthy', 'healthy']);
        const before = liveR(net);
        net.nodes[2].incubating = 2; // a hidden carrier changes nothing the HUD shows
        expect(liveR(net)).toBe(before);
        // Once a test finds them, R counts them as a spreader.
        net.nodes[2].state = 'exposed';
        expect(liveR(net)).not.toBe(before);
        // No known case, no R, even with a carrier on the web.
        const quiet = line(['healthy', 'healthy']);
        quiet.nodes[0].incubating = 1;
        expect(liveR(quiet)).toBe(0);
    });

    // Round 57: "tests are worth using" used to compare bot win rates with
    // and without tests on two differently tuned levels. It is now exact: a
    // player who tests knows who to isolate; the solver, which may only act
    // on a carrier that a test has found, opens every hidden level with tests.
    it('doing nothing never wins a hidden carrier level, and the best play starts with tests', () => {
        for (const level of LEVELS.filter((l) => l.mechanics?.incubation)) {
            expect(summarize(level, 'passive', 15, 3).counts.contained || 0, level.id).toBe(0);
            for (let seed = 1; seed <= 3; seed++) {
                const run = buildRun(level, seed);
                const first = run.deal.par.moves[0];
                expect(first, `${level.id} seed ${seed}`).toMatchObject({ day: 1, toolId: 'test' });
            }
        }
    });
});

describe('contact tracing by the bots', () => {
    it('tests the contacts of known cases, most exposed first', () => {
        // 0 sick, 1 and 2 its contacts, 3 a contact of both 0 and another sick person 4, 5 far away.
        const nodes = [person(0, 'infected'), person(1), person(2), person(3), person(4, 'infected'), person(5)];
        const links = [[0, 1], [0, 2], [0, 3], [4, 3], [2, 5]].map(([source, target]) => ({ source, target }));
        const order = tracingTargets({ nodes, links }).map((n) => n.id);
        expect(order[0]).toBe(3);
        expect(order.slice().sort()).toEqual([1, 2, 3]);
        nodes[3].testedClear = true;
        expect(tracingTargets({ nodes, links }).map((n) => n.id)).not.toContain(3);
    });

    it('the smart bot uses its tests and isolates the carriers it finds', () => {
        const level = LEVELS.find((l) => l.mechanics?.incubation);
        let tests = 0;
        let positives = 0;
        for (let seed = 1; seed <= 40; seed++) {
            const rng = mulberry32(seed);
            const run = buildRun(level, rng);
            for (let d = 0; d < 6; d++) {
                BOTS.smart(run, rng);
                if (advanceDay(run.state, run.network, { scenario: run.scenario, difficulty: run.difficulty, rng }).result) break;
            }
            tests += run.state.stats.tests || 0;
            positives += run.state.stats.testsPositive || 0;
        }
        expect(tests).toBeGreaterThan(40);
        expect(positives).toBeGreaterThan(5);
    });
});

describe('levels, briefing and tray', () => {
    const inc = LEVELS.filter((l) => l.mechanics?.incubation);

    it('Tsukimi introduces hidden carriers and later planets bring them back', () => {
        expect(inc.filter((l) => l.regionId === 'tsukimi').length).toBeGreaterThanOrEqual(3);
        expect(new Set(inc.map((l) => l.regionId)).size).toBeGreaterThanOrEqual(3);
        for (const l of inc) {
            expect(l.planetIndex).toBeGreaterThanOrEqual(2);
            expect(l.toolkit.tools).toContain('test');
            expect(l.toolkit.tools).toContain('quarantine');
            expect(l.toolkit.tools.length).toBeLessThanOrEqual(3);
            const { difficulty } = levelRules(l);
            expect(difficulty.incubation).toEqual({ count: 2, days: 2 });
            expect(difficulty.dailyLimits.test).toBeGreaterThan(0);
            for (const t of l.toolkit.tools) expect(difficulty.dailyLimits[t], `${l.id} ${t}`).toBeGreaterThan(0);
        }
    });

    it('teaches the lesson by name, briefing and tool card', () => {
        const l = inc.find((x) => !x.variant);
        expect(l.lessonId).toBe('hidden-carriers');
        expect(lessonFor(l.id).brief).toMatch(/You fight what you cannot see: test the contacts of the sick person\./);
        expect(LESSONS['hidden-carriers'].title.split(' ').length).toBeLessThanOrEqual(4);
        const call = variantCallout(l.variant, l.mechanics);
        expect(call.title).toBe('New: 2 hidden carriers');
        expect(call.text).toMatch(/Test/);
        const card = toolkitCard(l.toolkit, l.variant?.toolDays);
        expect(card.tools).toContain('Test');
        expect(card.why).toMatch(/Test the contacts of the sick person/);
        // A no-vaccines level with hidden carriers keeps contact tracing, with the testing brief.
        const nv = inc.find((x) => x.variant?.type === 'noVaccines');
        expect(nv.lessonId).toBe('contact-tracing');
        expect(lessonFor(nv.id).brief).toMatch(/Test the contacts/);
        expect(variantCallout(nv.variant, nv.mechanics).text).toMatch(/hidden carriers/);
        // Classic levels keep the plain callout.
        expect(variantCallout({ type: 'envoy' })).toEqual(variantCallout({ type: 'envoy' }, null));
    });

    it('shows a Test chip that is ready on day 1 and picks itself for a tap on a healthy person', () => {
        const { difficulty } = levelRules(inc[0]);
        const usage = initGameState(tools, 10).dailyUsage;
        const day1 = toolChips(tools, difficulty, 1, usage, {});
        const chip = day1.find((c) => c.id === 'test');
        expect(chip.state).toBe('ready');
        expect(chip.label).toBe('Test');
        expect(autoToolForTap('node', 'healthy', day1)).toBe('test');
        // Quarantine is open at once too: isolating a carrier is the point.
        expect(autoToolForTap('node', 'exposed', day1)).toBe('quarantine');
        expect(toolHint('test').length).toBeLessThanOrEqual(HINT_MAX_CHARS);
    });

    it('is wired into the game, the view and the tray', () => {
        const game = read('src/game.js');
        expect(game).toContain("toolId === 'test' || toolId === 'mask'");
        expect(game).toContain('mechanicToolFeedback(toolId, result, node)');
        expect(game).toContain('onsetToast(spread)');
        expect(game).toContain('mechanicsResultsLine(stats, this.currentScenario)');
        expect(game).toContain('variantCallout(level.variant, level.mechanics)');
        const view = read('src/ui/network-view-3d.js');
        expect(view).toContain("test: ['healthy']");
        expect(view).toContain("quarantine: ['healthy', 'infected', 'recovered', 'exposed']");
        expect(view).toContain('this.syncMarks(obj, node)');
        expect(view).toContain("const hot = (x) => x === 'infected' || x === 'exposed';");
        const panels = read('src/ui/panels.js');
        expect(panels).toMatch(/test:\s*\n\s*'<svg/);
    });
});
