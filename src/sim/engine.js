// Pure-ish simulation logic: functions of (state, network, config).
// No DOM, no D3, no audio here. These mutate the passed state/network objects
// (node states, stats counters, node/link removal) and return event lists so
// the caller (game.js) can perform side effects: sounds, animations, log lines,
// and visualization updates. `rng` is injectable for deterministic tests.

const nodeId = (ref) => (ref && typeof ref === 'object' ? ref.id : ref);
import { envoyLost } from './variants.js';
import { diesTonight, careDaysLeft } from './fatality.js';
import { crossesTonight, isCarrier, isInfectious, isSusceptible, travelCanSpread } from './mechanics.js';

// One night of spread. Returns { events: [{ source, target }], count }.
//
// Round 57: predictable spread. Every person who can catch it and is
// joined by a live line to someone who can spread it becomes sick tonight.
// No dice. A red line on screen therefore means exactly "this person is
// sick tomorrow unless you act". The 3rd and 4th arguments (the old
// per-contact chance and the dice) are kept so callers need not change;
// both are ignored.
//
// Protected-node rules (nodes stay visible, never removed):
// - Quarantined nodes neither infect others nor become infected. Quarantining
//   an infected node keeps it sick: it ticks daysInfected and resolves via
//   updateOutcomes while isolated, and counts as active infected for the
//   win check until it resolves. Isolation is not a cure.
// - Vaccinated nodes remain immune: targets must be 'healthy'.
// Later planets (src/sim/mechanics.js):
// - Masks: a line with a masked end charges for one night (link.charged)
//   and crosses the next. `charging` lists the lines that charged tonight.
// - Hidden carriers (dealt with the level) spread like the sick. `onsets`
//   lists the carriers who showed symptoms tonight. `count` is always the
//   number of NEW KNOWN cases, which is what the day banner reports.
// People who caught it tonight do not pass it on until tomorrow night.
export function simulateSpread(state, network, _transmissionRate, _rng, _rules = null) {
    const events = [];
    const charging = [];
    const byId = new Map(network.nodes.map((n) => [n.id, n]));
    const spreaders = new Set(network.nodes.filter(isInfectious));
    const carriersBefore = network.nodes.filter(isCarrier);
    const caught = new Set();

    for (const link of network.links) {
        const a = byId.get(nodeId(link.source));
        const b = byId.get(nodeId(link.target));
        if (!a || !b) continue;
        let from = null;
        let to = null;
        if (spreaders.has(a) && (isSusceptible(b) || caught.has(b))) [from, to] = [a, b];
        else if (spreaders.has(b) && (isSusceptible(a) || caught.has(a))) [from, to] = [b, a];
        if (!from) continue;
        if (!crossesTonight(link, a, b)) {
            charging.push(link);
            continue;
        }
        if (caught.has(to)) continue; // already caught it tonight on another line
        caught.add(to);
        to.state = 'infected';
        state.stats.totalInfected++;
        if (from.state !== 'infected') state.stats.silentSpread = (state.stats.silentSpread || 0) + 1;
        events.push({ source: from, target: to });
    }
    for (const link of charging) link.charged = true;

    for (const n of network.nodes) {
        if (n.state === 'infected' || (n.state === 'quarantined' && n.sickWhileQuarantined)) n.daysInfected++;
    }

    // Carriers move one night closer to symptoms.
    const onsets = [];
    for (const n of carriersBefore) {
        n.incubating -= 1;
        if (n.incubating > 0) continue;
        onsets.push(showSymptoms(state, n));
    }
    const newKnown = onsets.filter((o) => o.newCase).length;

    return { events, count: events.length + newKnown, hidden: [], onsets, charging };
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

// Resolve deaths and recoveries for one night. Round 57: no dice
// (src/sim/fatality.js). A frail person who is sick and not in a ward on the
// third night of their illness is lost; everyone else who reaches
// recoveryTime nights recovers, and a frail person in a ward always does.
// The 4th and 5th arguments (the old death rate and dice) are ignored.
// Returns an ordered list of { node, outcome: 'died' | 'recovered' }.
// Dead nodes are removed from the network (nodes and their links).
export function updateOutcomes(state, network, recoveryTime, _fatalityRate, _rng) {
    const outcomes = [];

    for (const node of network.nodes) {
        // Quarantined nodes that were sick when isolated keep resolving:
        // they tick daysInfected (see simulateSpread) and recover here.
        const stillSick =
            node.state === 'infected' || (node.state === 'quarantined' && node.sickWhileQuarantined);
        if (!stillSick || node.daysInfected < 1) continue;
        if (diesTonight(node, recoveryTime)) {
            node.state = 'dead';
            node.removed = true;
            state.stats.totalDead++;
            outcomes.push({ node, outcome: 'died', inWard: false });
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

// When a level is lost with people still sick, their illness does not stop
// with the level. Each one's remaining days are settled at once (no more
// spread) by the same rule as during play: a frail person who is sick
// outside a ward is lost, everyone else recovers. Only the stats change: the
// web stays as it was when the level ended. Runs once per level
// (state.aftermathDone). Deaths count in totalDead and stats.aftermathDead.
// Returns [{ node, outcome }] like updateOutcomes.
export function resolveAftermath(state, network, _recoveryTime, _fatalityRate, _rng) {
    if (state.aftermathDone) return [];
    state.aftermathDone = true;
    const outcomes = [];
    for (const node of network.nodes) {
        const stillSick =
            node.state === 'infected' || (node.state === 'quarantined' && node.sickWhileQuarantined);
        if (!stillSick) continue;
        if (node.frail && node.state === 'infected') {
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

// Once the spread is over, care can still save lives: a frail person who
// is sick is lost on the third night of their illness unless they are in a
// ward (see fatality.js), so the game should not fast-forward past a
// Quarantine the player could still use on them. Returns the plan for the
// next useful isolation, or null when no move can help the sick any more:
//   { day, sick } - the first day Quarantine can reach a frail person in
//   time, and how many of them it could still reach then.
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
    const used = state.usedOnPeople;
    let sick = 0;
    for (const n of network.nodes) {
        if (n.removed || n.state !== 'infected' || !n.frail) continue;
        if (tool.oncePerPerson && used && used.has && used.has(`quarantine-${n.id}`)) continue;
        // Still alive (and so still worth a ward) on the day isolation can reach them.
        if (careDaysLeft(n, recoveryTime) > wait) sick++;
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
