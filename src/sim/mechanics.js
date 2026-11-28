// Rules that later planets add on top of the classic game. Pure helpers,
// shared by the engine, the actions, the solver, the bots, the view and the
// tests. A level only gets these rules through level.mechanics
// (src/config/planet-mechanics.js), which src/config/level-rules.js copies
// onto the rules it plays by.
//
// Round 57: every one of these rules is now free of dice. Once a level is
// dealt, the same moves always give the same result.
//
// 1. HIDDEN CARRIERS (scenario.hiddenCarriers = { count, days })
//
// When the level is dealt, `count` of the first case's healthy contacts
// already carry the infection. They look healthy, they pass it on from the
// first night exactly as a sick person does, and after `days` nights they
// fall visibly sick. Which contacts they are is fixed by the deal and
// unknown to the player until a Test finds them (or they fall sick). The
// briefing states the count and the days, and that carriers are always
// contacts of the first case, so the player can reason: test the contacts.
// Nobody who catches it later is hidden: new cases show at once, as on
// every other level.
//
// What the player can see is always node.state. A hidden carrier keeps
// state 'healthy' (or 'vaccinated' or 'quarantined' if the player acted on
// them without knowing), and the truth lives in one extra plain field:
//
//     node.incubating   nights left before symptoms (absent when not a carrier)
//
// So every piece of code that reads node.state (the 3D view, the care box,
// the red lines, the bots) sees exactly what the player sees and cannot
// leak who is carrying it. Only the engine and the solver's model of the
// truth read node.incubating. viewNode() below is the projection handed to
// anything that draws a person: it drops the hidden fields, and tests check
// a hidden carrier projects to the same object as a healthy person.
//
// A positive Test turns a hidden carrier into a KNOWN carrier: state
// 'exposed'. Known carriers still spread until they are isolated.
//
// How the counters treat hidden carriers (decisions, kept in one place):
//   cases and the case cap   count KNOWN cases only: a person is counted
//                            when they show symptoms or test positive.
//                            Every carrier does one or the other, so the
//                            final count is always the true one.
//                            stats.hiddenInfections is the dealt count.
//   R in the HUD (liveR)     is worked out from known cases over the
//                            contacts that look healthy.
//   winning                  needs nobody sick AND nobody incubating.
//   results                  stats.silentSpread counts infections passed on
//                            by people who were not showing symptoms yet.
//
// 2. MASKS (node.masked = true)
//
// A line with a masked person on either end takes TWO nights to cross
// instead of one. The first night the infection reaches it, the line
// charges (link.charged = true, drawn at full strength); the next night it
// crosses, unless the line was cut or one end protected in between. So a
// mask never stops a case by itself: it buys one day on every line of the
// person who wears it. maskedLink() and crossesTonight() are the one place
// that says so; simulateSpread, the solver and the view all use them.
//
// 3. NEW WAYS TO WIN (scenario.goal, set from level.mechanics.goal)
//
//   { type: 'holdLine', days }  Help is on the way. The level is won at the
//       dawn after `days` days if the case cap was never reached: the
//       vaccine shipment lands and mass vaccination ends the outbreak
//       (stats.heldLine). Stopping it sooner still wins. Doing nothing
//       never counts, as everywhere else.
//   { type: 'keepOpen', degreeShare }  One well connected person is the
//       place that must stay open (node.hub: a school, a market). Their
//       lines cannot be cut and they cannot be isolated while healthy, so
//       the outbreak has to be stopped before it gets there, or worked
//       around. linkLocked() is the one rule for "this line cannot be cut".
//
// 4. TRAVELLERS (scenario.travellers = { count }, node.traveller = true)
//
// A few marked people swap one of their contacts for a new one each night.
// Each traveller's route (node.route, the order of the people they will
// visit) is fixed when the level is dealt. travelPlan() reads tonight's
// move off the web as it stands: the traveller drops their oldest line and
// draws a new one to the next person on the route who is not already a
// contact and not in isolation. The view shows that plan all day (a dotted
// line to tonight's stop), and the night applies exactly the plan the
// player saw when they tapped Next day. It happens after the night's
// spread, so the new line cannot pass anything on until the next night. An
// isolated traveller stays put, and one whose lines were all cut has
// nowhere to go from.

export const INCUBATION_DEFAULT = Object.freeze({ days: 2, count: 2 });
// Nights a masked line takes to cross.
export const MASK_NIGHTS = 2;

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

// Hidden carrier rule of a level ({ count, days }), or null. Accepts the
// scenario or the difficulty (level-rules.js puts it on both).
export function incubationOf(rules) {
    return (rules && (rules.hiddenCarriers || rules.incubation)) || null;
}

// True when the line between a and b has a mask on either end.
export function maskedLink(a, b) {
    return !!((a && a.masked) || (b && b.masked));
}

// Does the infection cross this line tonight? A plain line always does; a
// masked line only once it has charged for a night.
export function crossesTonight(link, a, b) {
    return !maskedLink(a, b) || !!(link && link.charged);
}

// Mark `count` healthy contacts of the first cases as hidden carriers who
// fall sick after `days` nights. Returns the carriers (fewer than `count`
// when the first cases have too few contacts; the dealer rejects those).
// Never the Envoy, the hub or a traveller.
export function placeCarriers(nodes, links, { count = INCUBATION_DEFAULT.count, days = INCUBATION_DEFAULT.days } = {}, rng = Math.random) {
    const pool = carrierCandidates(nodes, links).filter((n) => !n.envoy && !n.hub && !n.traveller);
    const picked = [];
    while (picked.length < count && pool.length) {
        const n = pool.splice(Math.floor(rng() * pool.length), 1)[0];
        n.incubating = days;
        picked.push(n);
    }
    return picked;
}

// The people a hidden carrier can be: everyone who looks healthy and is in
// contact with a visibly sick person. This is exactly what the player can
// see on day 1, so it never leaks anything.
export function carrierCandidates(nodes, links) {
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const out = new Set();
    for (const l of links) {
        const a = byId.get(endId(l.source));
        const b = byId.get(endId(l.target));
        if (!a || !b) continue;
        if (a.state === 'infected' && b.state === 'healthy') out.add(b);
        if (b.state === 'infected' && a.state === 'healthy') out.add(a);
    }
    return [...out].sort((x, y) => x.id - y.id);
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

// Mark `count` healthy people as travellers (not the marked puzzle people)
// and fix each one's route: every other person, in an order rolled once.
export function markTravellers(nodes, { count = 2 } = {}, rng = Math.random) {
    const pool = nodes.filter((n) => n.state === 'healthy' && !n.hub && !n.envoy && !n.superSpreader && !n.frail);
    const picked = [];
    while (picked.length < count && pool.length) {
        const n = pool.splice(Math.floor(rng() * pool.length), 1)[0];
        n.traveller = true;
        const route = nodes.filter((x) => x.id !== n.id).map((x) => x.id);
        for (let i = route.length - 1; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1));
            [route[i], route[j]] = [route[j], route[i]];
        }
        n.route = route;
        n.routeAt = 0;
        picked.push(n);
    }
    return picked;
}

// A traveller who can still move: not isolated, not gone.
function roaming(n) {
    return !!n && n.traveller && !n.removed && n.state !== 'quarantined' && n.state !== 'dead';
}

// Tonight's moves, read off the web as it stands. Pure: changes nothing.
// Each roaming traveller with at least one line drops their oldest line
// (the first of theirs in network.links) and gains a line to the next
// person on their route who is not a contact, not in isolation and not
// gone. Returns [{ traveller, from, to, at }] (ids; `at` is the route
// position used), in traveller order. This is what the view draws as the
// dotted line, and exactly what the night will do.
export function travelPlan(network) {
    const plan = [];
    const byId = new Map(network.nodes.map((n) => [n.id, n]));
    for (const t of network.nodes) {
        if (!roaming(t)) continue;
        const mine = network.links.filter((l) => endId(l.source) === t.id || endId(l.target) === t.id);
        if (!mine.length) continue;
        const contacts = new Set(mine.map((l) => (endId(l.source) === t.id ? endId(l.target) : endId(l.source))));
        // A traveller marked by hand (no dealt route) heads for whoever is
        // farthest away on the web as it stands.
        const route = Array.isArray(t.route) && t.route.length ? t.route : farthestFirst(network, t.id);
        const len = route.length;
        const start = Array.isArray(t.route) ? t.routeAt || 0 : 0;
        for (let k = 0; k < len; k++) {
            const at = (start + k) % len;
            const dest = byId.get(route[at]);
            if (!dest || dest.removed || dest.state === 'quarantined' || dest.state === 'dead' || contacts.has(dest.id)) continue;
            const drop = mine[0];
            plan.push({ traveller: t.id, from: endId(drop.source) === t.id ? endId(drop.target) : endId(drop.source), to: dest.id, at });
            break;
        }
    }
    return plan;
}

// Everyone else, the farthest from `id` first (people out of reach before
// anyone, then by steps, then by id). Pure.
function farthestFirst(network, id) {
    const adj = new Map(network.nodes.map((n) => [n.id, []]));
    for (const l of network.links) {
        const a = endId(l.source);
        const b = endId(l.target);
        if (adj.has(a) && adj.has(b)) {
            adj.get(a).push(b);
            adj.get(b).push(a);
        }
    }
    const dist = new Map([[id, 0]]);
    const queue = [id];
    for (let i = 0; i < queue.length; i++) {
        for (const nb of adj.get(queue[i])) {
            if (!dist.has(nb)) {
                dist.set(nb, dist.get(queue[i]) + 1);
                queue.push(nb);
            }
        }
    }
    const steps = (x) => dist.get(x) ?? Infinity;
    return network.nodes.filter((n) => n.id !== id).map((n) => n.id).sort((a, b) => (steps(b) === steps(a) ? a - b : steps(b) - steps(a)));
}

// One night of travel: apply `plan` (travelPlan from before the night; it
// is worked out now when not given). A move is skipped when the traveller
// or the person they were going to see did not live through the night.
// Mutates network.links and the travellers' routeAt.
// Returns the moves made, [{ traveller, from, to }].
export function travelNight(state, network, plan = null) {
    const moves = [];
    const todo = Array.isArray(plan) ? plan : travelPlan(network);
    const byId = new Map(network.nodes.map((n) => [n.id, n]));
    const alive = (n) => !!n && !n.removed && n.state !== 'dead';
    for (const move of todo) {
        const t = byId.get(move.traveller);
        const dest = byId.get(move.to);
        if (!alive(t) || !alive(dest)) continue;
        const joins = (l, a, b) => (endId(l.source) === a && endId(l.target) === b) || (endId(l.source) === b && endId(l.target) === a);
        network.links = network.links.filter((l) => !joins(l, t.id, move.from));
        if (!network.links.some((l) => joins(l, t.id, dest.id))) network.links.push({ source: t.id, target: dest.id });
        if (Array.isArray(t.route) && t.route.length) t.routeAt = ((move.at ?? t.routeAt ?? 0) + 1) % t.route.length;
        if (state && state.stats) state.stats.trips = (state.stats.trips || 0) + 1;
        moves.push({ traveller: t.id, from: move.from, to: dest.id });
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
