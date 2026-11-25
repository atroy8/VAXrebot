// Rules that later planets add on top of the classic game (wide audience
// round). Pure helpers, shared by the engine, the actions, the bots, the
// view and the tests. Nothing here runs on the two learning planets: a level
// only gets these rules through level.mechanics (src/config/planet-mechanics.js),
// which src/config/level-rules.js copies onto the difficulty it plays by.
//
// 1. HIDDEN CARRIERS (difficulty.incubation = { minDays, maxDays, factor })
//
// On a level with the incubation rule a newly infected person does not fall
// visibly sick at once. They carry the infection for minDays to maxDays days
// first, look healthy, and pass it on at `factor` times the usual chance
// (presymptomatic spread). Then they show symptoms and become an ordinary
// sick person.
//
// What the player can see is always node.state. A hidden carrier keeps
// state 'healthy' (or 'vaccinated' or 'quarantined' if the player acted on
// them without knowing), and the truth lives in one extra plain field:
//
//     node.incubating   days left before symptoms (absent when not a carrier)
//
// So every piece of code that reads node.state (the 3D view, the care box,
// the hints, the red lines, the bots) sees exactly what the player sees and
// cannot leak who is carrying it. Only the engine reads node.incubating.
// viewNode() below is the projection handed to anything that draws a
// person: it drops the hidden fields, and tests check a hidden carrier
// projects to the same object as a healthy person.
//
// A positive Test turns a hidden carrier into a KNOWN carrier: state
// 'exposed' (the art has had exposed frames since the first face set).
// Known carriers still spread at the reduced rate until they are isolated.
//
// How the counters treat hidden carriers (decisions, kept in one place):
//   cases and the case cap   count KNOWN cases only: a person is counted
//                            when they show symptoms or test positive. That
//                            is what a real case count is, and it is why the
//                            count lags the truth by an incubation period.
//                            stats.hiddenInfections counts every true
//                            infection for the results.
//   R in the HUD (liveR)     is worked out from known cases (sick and known
//                            carriers) over the contacts that look healthy.
//                            It is honest about what the player can see and
//                            blind to hidden chains, like a real R estimate.
//   winning                  needs nobody sick AND nobody incubating, so a
//                            quiet day is not yet the end, as in real
//                            outbreaks (the all clear waits out two
//                            incubation periods).
//   results                  stats.silentSpread counts infections passed on
//                            by people who were not showing symptoms yet,
//                            and the lesson line reveals it.
//
// 2. MASKS (node.masked = true, difficulty.maskFactor)
//
// A masked person passes on and catches the infection at maskFactor times
// the usual chance on every one of their lines, for the rest of the level.
// Two masked people on one line multiply. linkFactor() is the one place
// that says so; simulateSpread, liveR and webR0 all use it.

//
// 3. NEW WAYS TO WIN (scenario.goal, set from level.mechanics.goal)
//
//   { type: 'holdLine', days }  Help is on the way. The level is won at the
//       dawn after `days` days if the case cap and the death line were never
//       reached: the vaccine shipment lands and mass vaccination ends the
//       outbreak (stats.heldLine). Stopping it sooner still wins. Doing
//       nothing never counts, as everywhere else.
//   { type: 'keepOpen', degreeShare }  One well connected person is the
//       place that must stay open (node.hub: a school, a market). Their
//       lines cannot be cut and they cannot be isolated while healthy, so
//       the outbreak has to be stopped before it gets there, or worked
//       around. linkLocked() is the one rule for "this line cannot be cut".
//
// 4. TRAVELLERS (scenario.travellers = { count }, node.traveller = true)
//
// A few marked people swap one of their contacts for a new one each night:
// one of their lines is dropped and a new line is drawn to someone far away
// on the web (travelNight). It happens after the night's spread, so the new
// line is on screen in the morning and the player has the day to react.
// Yesterday's safe group is not safe today. An isolated traveller stays
// put, and one whose lines were all cut has nowhere to go from.

export const INCUBATION_DEFAULT = Object.freeze({ minDays: 1, maxDays: 2, factor: 0.5 });
export const MASK_FACTOR = 0.5;

// Fields of a node the player must never be shown.
export const HIDDEN_NODE_FIELDS = Object.freeze(['incubating']);

// True for anyone carrying the infection without symptoms yet, known or not.
export function isCarrier(node) {
    return !!node && node.incubating != null;
}

// A carrier the player does not know about.
export function isHiddenCarrier(node) {
    return isCarrier(node) && node.state !== 'exposed';
}

// Can this person catch it tonight? Looks healthy and is not already carrying it.
export function isSusceptible(node) {
    return !!node && node.state === 'healthy' && node.incubating == null;
}

// Can pass it on tonight: visibly sick, or a carrier who is not isolated.
export function isInfectious(node) {
    if (!node || node.removed) return false;
    if (node.state === 'infected') return true;
    return node.incubating != null && node.state !== 'quarantined';
}

// What the player may know about a person: the node without hidden fields.
export function viewNode(node) {
    const out = {};
    for (const [k, v] of Object.entries(node)) if (!HIDDEN_NODE_FIELDS.includes(k)) out[k] = v;
    return out;
}

// The state the player sees. node.state is already that by design; this
// names the rule so UI code can say what it means.
export function visibleState(node) {
    return node ? node.state : null;
}

// The whole truth, for results and tests only: 'carrier' for anyone incubating.
export function trueState(node) {
    if (!node) return null;
    return isCarrier(node) ? 'carrier' : node.state;
}

// Incubation rule of a level, or null.
export function incubationOf(rules) {
    return (rules && rules.incubation) || null;
}

export function maskFactorOf(rules) {
    const f = rules && rules.maskFactor;
    return f != null ? f : MASK_FACTOR;
}

// Share of the usual chance that crosses the line between a and b.
export function linkFactor(a, b, maskFactor = MASK_FACTOR) {
    let f = 1;
    if (a && a.masked) f *= maskFactor;
    if (b && b.masked) f *= maskFactor;
    return f;
}

// Days a new carrier incubates: minDays to maxDays, both inclusive.
export function rollIncubation(inc, rng = Math.random) {
    const lo = Math.max(1, inc.minDays || 1);
    const hi = Math.max(lo, inc.maxDays || lo);
    return lo + Math.floor(rng() * (hi - lo + 1));
}

// Average days a carrier spends spreading before symptoms.
export function meanIncubation(inc) {
    if (!inc) return 0;
    const lo = Math.max(1, inc.minDays || 1);
    return (lo + Math.max(lo, inc.maxDays || lo)) / 2;
}

// How many people are carrying it unseen right now (results and tests).
export function hiddenCarrierCount(network) {
    return network.nodes.filter((n) => !n.removed && isHiddenCarrier(n)).length;
}

const endId = (ref) => (ref && typeof ref === 'object' ? ref.id : ref);

// The level's goal ({ type, ... }) or null. Accepts the scenario.
export function goalOf(scenario) {
    return (scenario && scenario.goal) || null;
}

// True when a line touches the place that must stay open. Link ends may be
// ids or node objects (the 3D view swaps ids for objects).
export function linkLocked(link, network) {
    if (!link) return false;
    const isHub = (ref) => {
        if (ref && typeof ref === 'object') return !!ref.hub;
        const n = network && network.nodes ? network.nodes.find((x) => x.id === ref) : null;
        return !!(n && n.hub);
    };
    return isHub(link.source) || isHub(link.target);
}

// Ids of the people in direct contact with the place that must stay open.
export function hubContacts(network) {
    const hubs = new Set(network.nodes.filter((n) => n.hub && !n.removed).map((n) => n.id));
    const out = new Set();
    if (!hubs.size) return out;
    for (const l of network.links) {
        const a = endId(l.source);
        const b = endId(l.target);
        if (hubs.has(a)) out.add(b);
        if (hubs.has(b)) out.add(a);
    }
    return out;
}

// Mark `count` healthy people as travellers (not the marked puzzle people).
export function markTravellers(nodes, { count = 2 } = {}, rng = Math.random) {
    const pool = nodes.filter((n) => n.state === 'healthy' && !n.hub && !n.envoy && !n.superSpreader);
    const picked = [];
    while (picked.length < count && pool.length) {
        const n = pool.splice(Math.floor(rng() * pool.length), 1)[0];
        n.traveller = true;
        picked.push(n);
    }
    return picked;
}

// A traveller who can still move: not isolated, not gone.
function roaming(n) {
    return !!n && n.traveller && !n.removed && n.state !== 'quarantined' && n.state !== 'dead';
}

// One night of travel. Each roaming traveller with at least one line drops
// one line (picked at random) and gains a line to someone at least three
// steps away (anyone who is not yet a contact when nobody is that far).
// Nobody travels to a person in isolation. Mutates network.links.
// Returns [{ traveller, from, to }] (ids), in traveller order.
export function travelNight(state, network, rng = Math.random) {
    const moves = [];
    const travellers = network.nodes.filter(roaming);
    if (!travellers.length) return moves;
    for (const t of travellers) {
        const mine = network.links.filter((l) => endId(l.source) === t.id || endId(l.target) === t.id);
        if (!mine.length) continue;
        const contacts = new Set(mine.map((l) => (endId(l.source) === t.id ? endId(l.target) : endId(l.source))));
        // Steps from the traveller to everyone (breadth first).
        const adj = new Map(network.nodes.map((n) => [n.id, []]));
        for (const l of network.links) {
            const a = endId(l.source);
            const b = endId(l.target);
            if (adj.has(a) && adj.has(b)) {
                adj.get(a).push(b);
                adj.get(b).push(a);
            }
        }
        const dist = new Map([[t.id, 0]]);
        const queue = [t.id];
        for (let i = 0; i < queue.length; i++) {
            for (const nb of adj.get(queue[i])) {
                if (!dist.has(nb)) {
                    dist.set(nb, dist.get(queue[i]) + 1);
                    queue.push(nb);
                }
            }
        }
        const open = network.nodes.filter((n) => n.id !== t.id && !n.removed && n.state !== 'quarantined' && n.state !== 'dead' && !contacts.has(n.id));
        if (!open.length) continue;
        const far = open.filter((n) => (dist.get(n.id) ?? Infinity) >= 3);
        const pool = far.length ? far : open;
        const drop = mine[Math.floor(rng() * mine.length)];
        const dest = pool[Math.floor(rng() * pool.length)];
        const from = endId(drop.source) === t.id ? endId(drop.target) : endId(drop.source);
        network.links = network.links.filter((l) => l !== drop);
        network.links.push({ source: t.id, target: dest.id });
        state.stats.trips = (state.stats.trips || 0) + 1;
        moves.push({ traveller: t.id, from, to: dest.id });
    }
    return moves;
}

// Could travel still bring the infection and a susceptible person together?
// True when a roaming traveller with a line is infectious while someone can
// still catch it, or can still catch it while someone is infectious.
export function travelCanSpread(network) {
    const anySusceptible = network.nodes.some((n) => !n.removed && isSusceptible(n));
    const anyInfectious = network.nodes.some(isInfectious);
    if (!anySusceptible || !anyInfectious) return false;
    const linked = new Set();
    for (const l of network.links) {
        linked.add(endId(l.source));
        linked.add(endId(l.target));
    }
    return network.nodes.some((n) => roaming(n) && linked.has(n.id) && (isInfectious(n) || isSusceptible(n)));
}
