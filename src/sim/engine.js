// Pure-ish simulation logic: functions of (state, network, config).
// No DOM, no D3, no audio here. These mutate the passed state/network objects
// (node states, stats counters, node/link removal) and return event lists so
// the caller (game.js) can perform side effects: sounds, animations, log lines,
// and visualization updates. `rng` is injectable for deterministic tests.

const nodeId = (ref) => (ref && typeof ref === 'object' ? ref.id : ref);
import { envoyLost } from './variants.js';
import { canDieOnDay, dailyRisk, riskDaysLeft } from './fatality.js';
import { incubationOf, maskFactorOf, linkFactor, rollIncubation, isCarrier, isInfectious, isSusceptible, travelCanSpread } from './mechanics.js';

// One day of spread. Returns { events: [{ source, target }], count }.
// `transmissionRate` is the fully computed per-contact probability
// (scenario.baseTransmissionRate * difficulty.transmissionMultiplier).
//
// Protected-node rules (nodes stay visible, never removed):
// - Quarantined nodes neither infect others nor become infected. Quarantining
//   an infected node keeps it sick: it ticks daysInfected and resolves via
//   updateOutcomes (recover/die) while isolated, and counts as active infected
//   for the win check until it resolves. Isolation is not a cure.
// - Vaccinated nodes remain immune: targets must be 'healthy'.
// Later planets (src/sim/mechanics.js) pass their rules as the 5th argument:
// - rules.incubation: a new infection starts hidden (node.incubating days,
//   state unchanged) and spreads at a reduced rate until symptoms show.
//   `events` then stays empty (nothing the player may watch happens at the
//   moment of infection); `hidden` lists the true infections and `onsets`
//   the people who showed symptoms tonight. `count` is always the number of
//   NEW KNOWN cases, which is what the day banner and the case count report.
// - masks (node.masked): the chance on a line is scaled by linkFactor.
// Without rules, and with nobody masked, the dice are rolled exactly as
// they always were, so the learning planets play the same games per seed.
export function simulateSpread(state, network, transmissionRate, rng = Math.random, rules = null) {
    const events = [];
    const hidden = [];
    const inc = incubationOf(rules);
    const maskFactor = maskFactorOf(rules);
    const byId = new Map(network.nodes.map((n) => [n.id, n]));
    const spreaders = network.nodes.filter(isInfectious);
    const carriersBefore = network.nodes.filter(isCarrier);

    for (const infected of spreaders) {
        const base = infected.state === 'infected' ? transmissionRate : transmissionRate * (inc ? inc.factor : 1);
        for (const link of network.links) {
            const s = nodeId(link.source);
            const t = nodeId(link.target);
            if (s !== infected.id && t !== infected.id) continue;
            const targetNode = byId.get(s === infected.id ? t : s);
            if (!isSusceptible(targetNode)) continue;
            if (rng() < base * linkFactor(infected, targetNode, maskFactor)) {
                if (inc) {
                    targetNode.incubating = rollIncubation(inc, rng);
                    state.stats.hiddenInfections = (state.stats.hiddenInfections || 0) + 1;
                    if (infected.state !== 'infected') state.stats.silentSpread = (state.stats.silentSpread || 0) + 1;
                    hidden.push({ source: infected, target: targetNode });
                } else {
                    targetNode.state = 'infected';
                    state.stats.totalInfected++;
                    events.push({ source: infected, target: targetNode });
                }
            }
        }
    }

    for (const n of network.nodes) {
        if (n.state === 'infected' || (n.state === 'quarantined' && n.sickWhileQuarantined)) n.daysInfected++;
    }

    // Carriers from before tonight move one day closer to symptoms.
    const onsets = [];
    for (const n of carriersBefore) {
        n.incubating -= 1;
        if (n.incubating > 0) continue;
        onsets.push(showSymptoms(state, n));
    }
    const newKnown = onsets.filter((o) => o.newCase).length;

    return { events, count: events.length + newKnown, hidden, onsets };
}

// A carrier's incubation is over: they are now plainly sick. Someone already
// in isolation stays there and is now a patient. A known carrier (tested
// positive) was counted as a case already. Returns { node, from, newCase }.
export function showSymptoms(state, node) {
    const from = node.state;
    delete node.incubating;
    node.daysInfected = 1;
    if (from === 'quarantined') {
        node.sickWhileQuarantined = true;
        if (state.stats.isolated > 0) state.stats.isolated--;
        state.stats.treated = (state.stats.treated || 0) + 1;
    } else {
        node.state = 'infected';
        if (from === 'vaccinated') state.stats.lateVaccines = (state.stats.lateVaccines || 0) + 1;
    }
    const newCase = !node.knownCase;
    if (newCase) {
        node.knownCase = true;
        state.stats.totalInfected++;
    }
    return { node, from, newCase };
}

// Resolve deaths and recoveries for one day. Item 20 (round 24): a sick
// person may die on any day of their illness after the first two (round 36,
// deaths lag cases: daysInfected 3 up to recoveryTime), at a daily chance that adds up to `fatalityRate` over the
// whole illness; sick people in a ward get care and face half that
// (src/sim/fatality.js). Anyone who reaches recoveryTime alive recovers.
// Returns an ordered list of { node, outcome: 'died' | 'recovered' }.
// Dead nodes are removed from the network (nodes and their links).
export function updateOutcomes(state, network, recoveryTime, fatalityRate, rng = Math.random) {
    const outcomes = [];

    for (const node of network.nodes) {
        // Quarantined nodes that were sick when isolated keep resolving:
        // they tick daysInfected (see simulateSpread) and recover or die here.
        const stillSick =
            node.state === 'infected' || (node.state === 'quarantined' && node.sickWhileQuarantined);
        if (!stillSick || node.daysInfected < 1) continue;
        // Round 36: deaths lag cases, so nobody dies in their first days sick.
        const daily = canDieOnDay(node.daysInfected, recoveryTime) ? dailyRisk(node, fatalityRate, recoveryTime) : 0;
        if (daily > 0 && rng() < daily) {
            const inWard = node.state === 'quarantined';
            if (inWard) state.stats.diedInWard = (state.stats.diedInWard || 0) + 1;
            node.state = 'dead';
            node.removed = true;
            state.stats.totalDead++;
            outcomes.push({ node, outcome: 'died', inWard });
        } else if (node.daysInfected >= recoveryTime) {
            node.state = 'recovered';
            node.sickWhileQuarantined = false; // isolation served its purpose
            state.stats.totalRecovered++;
            outcomes.push({ node, outcome: 'recovered' });
        }
    }

    removeDead(network, outcomes);
    return outcomes;
}

function removeDead(network, outcomes) {
    if (!outcomes.some((o) => o.outcome === 'died')) return;
    const deadIds = new Set(outcomes.filter((o) => o.outcome === 'died').map((o) => o.node.id));
    network.nodes = network.nodes.filter((n) => !n.removed);
    network.links = network.links.filter(
        (l) => !deadIds.has(nodeId(l.source)) && !deadIds.has(nodeId(l.target))
    );
}

// Outcomes that end with people still sick: the outbreak got away.
export const LOSS_RESULTS = ['overwhelmed', 'envoy-lost', 'timeout'];

// Item 20: when a level is lost with people still sick, their illness does
// not stop with the level. Each one's remaining days are rolled at once (no
// more spread), so the results show what the outbreak really cost. Only the
// stats change: the web stays as it was when the level ended, so nobody is
// seen flying to the Cured box on a loss. Runs once per level
// (state.aftermathDone). Deaths count in totalDead and stats.aftermathDead.
// Returns [{ node, outcome }] like updateOutcomes.
export function resolveAftermath(state, network, recoveryTime, fatalityRate, rng = Math.random) {
    if (state.aftermathDone) return [];
    state.aftermathDone = true;
    const outcomes = [];
    for (const node of network.nodes) {
        const stillSick =
            node.state === 'infected' || (node.state === 'quarantined' && node.sickWhileQuarantined);
        if (!stillSick) continue;
        const daysLeft = riskDaysLeft(node.daysInfected, recoveryTime);
        const daily = dailyRisk(node, fatalityRate, recoveryTime);
        if (rng() < 1 - Math.pow(1 - daily, daysLeft)) {
            state.stats.totalDead++;
            state.stats.aftermathDead = (state.stats.aftermathDead || 0) + 1;
            outcomes.push({ node, outcome: 'died' });
        } else {
            state.stats.totalRecovered++;
            outcomes.push({ node, outcome: 'recovered' });
        }
    }
    return outcomes;
}

// True when the outbreak can no longer grow: no infectious person (sick and
// not isolated) shares a link with anyone who can still catch it (healthy).
// The outbreak cannot grow after this point. The game fast-forwards to the
// end once isolation can no longer help the sick either (careStillHelps).
// People never become healthy again and links only ever disappear, so once
// this is true it stays true for the rest of the run.
// Sick and able to spread, now or once a Stay Home Pay break ends.
function infectiousSoon(n) {
    return n.state === 'infected' || (n.state === 'quarantined' && n.sickWhileQuarantined && n.homeUntilDay != null) || (isCarrier(n) && n.state !== 'quarantined');
}

export function spreadIsOver(network) {
    // Travellers (later planets) redraw a line each night, so no sick or
    // healthy pair is safely apart while one of them can still roam.
    if (network.nodes.some((n) => n.traveller) && travelCanSpread(network)) return false;
    const byId = new Map(network.nodes.map((n) => [n.id, n]));
    for (const link of network.links) {
        const a = byId.get(nodeId(link.source));
        const b = byId.get(nodeId(link.target));
        if (!a || !b || a.removed || b.removed) continue;
        // Hidden carriers count here (the truth), or the game would fast
        // forward while someone was still passing it on unseen.
        if ((infectiousSoon(a) && isSusceptible(b)) || (infectiousSoon(b) && isSusceptible(a))) {
            return false;
        }
    }
    return true;
}

// Loss threshold: deaths at or above 8% of the initial population, with a
// floor of 5 deaths so small populations do not swing on a single case.
export const OVERWHELMED_DEATH_FRACTION = 0.08;
export const OVERWHELMED_DEATH_FLOOR = 5;

// End-of-day check. Returns 'contained' (win), 'overwhelmed' or
// 'envoy-lost' (losses),
// 'timeout' or 'burnout' (neutral), or null.
// Precedence: contained > overwhelmed > timeout. No timeout once spread is
// over (see spreadIsOver): the remaining sick resolve in a few days.
// Quarantined nodes that were sick when isolated still count as active
// infected until they resolve (recover/die), so quarantining the sick is
// isolation, not a cure.
// Passivity rule: if the virus dies out with zero player intervention
// (no vaccinations, quarantines, or severed links), the verdict is
// 'burnout', not 'contained'. Doing nothing is not a victory.
// Case cap (optional 4th arg): when total cases reach `caseCap` the outbreak
// is out of control and the verdict is 'overwhelmed'. Without it, a fast
// epidemic that infected nearly everyone and then burned out would score
// as a containment win. Callers pass Infinity (the default) to disable it.
// Goal (optional 5th arg, later planets, see src/sim/mechanics.js): on a
// 'holdLine' level the dawn after goal.days is a win if neither loss line
// was reached and the player acted at all: the vaccine shipment has landed.
export function checkGameOver(state, network, durationDays, caseCap = Infinity, goal = null) {
    // Envoy levels: if the Envoy falls ill the mission is lost, whatever else.
    if (state.envoyId != null && envoyLost(network, state.envoyId)) return 'envoy-lost';
    // Carriers who have not shown symptoms yet (src/sim/mechanics.js) are
    // still part of the outbreak: no all clear while anyone is incubating.
    const activeInfected = network.nodes.filter(
        (n) => n.state === 'infected' || (n.state === 'quarantined' && n.sickWhileQuarantined) || isCarrier(n)
    ).length;
    if (activeInfected === 0) {
        // Masks (later planets) are a response too.
        const intervened = state.stats.totalProtected + state.stats.linksSevered + (state.stats.masksGiven || 0) > 0;
        return intervened ? 'contained' : 'burnout';
    }
    const initial = state.stats.initialPopulation;
    const deathLine = Math.max(initial * OVERWHELMED_DEATH_FRACTION, OVERWHELMED_DEATH_FLOOR);
    if (initial > 0 && state.stats.totalDead >= deathLine) return 'overwhelmed';
    if (state.stats.totalInfected >= caseCap) return 'overwhelmed';
    if (goal && goal.type === 'holdLine' && state.day > goal.days) {
        const acted = state.stats.totalProtected + state.stats.linksSevered + (state.stats.masksGiven || 0) > 0;
        if (acted) {
            state.stats.heldLine = true;
            return 'contained';
        }
    }
    // Out of time, unless the outbreak can no longer grow: then the last sick
    // people are just recovering, and the run plays on until they do.
    if (state.day >= durationDays && !spreadIsOver(network)) return 'timeout';
    return null;
}

const NONE_HERE = { vaccinate: 'vaccines', quarantine: 'isolation wards', severLink: 'link cutting', test: 'test kits', mask: 'masks' };

function plain(name) {
    return String(name).replace(/^[^A-Za-z]+/, '').toLowerCase();
}

// Round 39: once the spread is over, care can still save lives. Sick people
// in an isolation ward get supportive care, which halves their death risk
// (see fatality.js), so the game should not fast-forward past a Quarantine
// the player could still use on them. Returns the plan for the next useful
// isolation, or null when no move can help the sick any more:
//   { day, sick } - the first day Quarantine can reach someone still sick,
//   and how many untreated sick people it could still reach then.
// Pure: reads state, tools, difficulty and the web; changes nothing.
export function careStillHelps(state, network, tools, difficulty, recoveryTime) {
    const tool = tools && tools.quarantine;
    if (!tool) return null;
    const limit = toolDailyLimit(tool, difficulty, 'quarantine');
    if (limit <= 0) return null;
    const firstDay = toolAvailableDay(tool, difficulty, 'quarantine');
    const usedToday = (state.dailyUsage && state.dailyUsage.quarantine) || 0;
    let day = Math.max(state.day, firstDay);
    if (day === state.day && usedToday >= limit) day = state.day + 1;
    const wait = day - state.day;
    const rt = recoveryTime || 1;
    const used = state.usedOnPeople;
    let sick = 0;
    for (const n of network.nodes) {
        if (n.removed || n.state !== 'infected') continue;
        if (tool.oncePerPerson && used && used.has && used.has(`quarantine-${n.id}`)) continue;
        // Still ill (and so still at risk) on the day isolation can reach them.
        if ((n.daysInfected || 0) + wait < rt) sick++;
    }
    return sick > 0 ? { day, sick } : null;
}

// Turn-advance gate for the real pause. nextDay() may run only when the game
// is neither over nor paused. Pure so it is unit-testable without a DOM.
export function canAdvanceDay(state) {
    return !state.gameOver && !state.paused;
}

// Daily usage cap for a tool under a difficulty. A level can pin exact caps
// through difficulty.dailyLimits[toolId] (see src/config/level-rules.js);
// otherwise the cap is floor(base * multiplier).
export function toolDailyLimit(tool, difficulty, toolId = null) {
    const pinned = toolId && difficulty.dailyLimits ? difficulty.dailyLimits[toolId] : undefined;
    if (pinned != null) return pinned;
    return Math.floor(tool.baseDailyLimit * difficulty.toolLimitMultiplier);
}

// First day a tool can be used. Puzzle levels can bring a tool forward
// through difficulty.toolDays (src/config/level-rules.js).
export function toolAvailableDay(tool, difficulty, toolId = null) {
    const pinned = toolId && difficulty && difficulty.toolDays ? difficulty.toolDays[toolId] : undefined;
    return pinned != null ? pinned : tool.availableDay;
}

// Single validation path for tool use (node clicks and link clicks alike).
// Returns { allowed: true } or { allowed: false, reason }.
export function canUseTool(state, tools, toolId, difficulty, target = null) {
    const tool = tools[toolId];
    const limit = toolDailyLimit(tool, difficulty, toolId);

    if (!tool.consumable && limit <= 0) {
        return { allowed: false, reason: `No ${NONE_HERE[toolId] || plain(tool.name)} on this world.` };
    }
    const firstDay = toolAvailableDay(tool, difficulty, toolId);
    if (state.day < firstDay) {
        return { allowed: false, reason: `${tool.name} available on Day ${firstDay}.` };
    }
    if (state.dailyUsage[toolId] >= limit) {
        return { allowed: false, reason: `Daily limit for ${tool.name} reached.` };
    }

    if (target && target.id !== undefined) {
        // It's a node
        if (tool.oncePerPerson && state.usedOnPeople.has(`${toolId}-${target.id}`)) {
            return { allowed: false, reason: `${tool.name} already used on this person.` };
        }
        if (target.state === 'vaccinated' || target.state === 'quarantined') {
            return { allowed: false, reason: `Person is already protected.` };
        }
        if (toolId === 'test') {
            if (target.state === 'exposed') return { allowed: false, reason: 'Already tested positive. Isolate them.' };
            if (target.state !== 'healthy') return { allowed: false, reason: 'Test people who look healthy. The sick are already known.' };
            if (target.testedClear) return { allowed: false, reason: 'Already tested clear today.' };
        }
        if (toolId === 'quarantine' && target.hub && target.state === 'healthy') {
            return { allowed: false, reason: 'This place must stay open. Protect it instead.' };
        }
        if (toolId === 'mask' && target.masked) {
            return { allowed: false, reason: 'This person already wears a mask.' };
        }
        if (toolId === 'vaccinate' && target.state !== 'healthy') {
            return { allowed: false, reason: 'Vaccine only works on healthy individuals.' };
        }
        if (!tool.validTargets.includes(target.state) && !tool.validTargets.includes('any')) {
            return { allowed: false, reason: `Cannot use ${tool.name} on a ${target.state} person.` };
        }
    }

    return { allowed: true };
}
