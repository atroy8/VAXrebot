// Hint: one good move for the player who is stuck. Pure.
// Round 57: the move comes from the solver (src/sim/solver.js). It solves
// the level again from the state as it stands, within a node budget, and
// the hint is the first move of today on its best line, so a hint is always
// a truly best move (the best the search found). On a level with hidden
// carriers the solver only knows what the player can know: until the
// carriers are certain its line opens with Tests (see solver.js).
// planDay (the smart bot's day) is kept for the bots that play to a budget
// (src/sim/meta-run.js) and as a fallback should the solver find no line.
import { BOTS } from './balance.js';
import { canUseTool } from './engine.js';
import { linkLocked } from './mechanics.js';
import { neighbors } from './actions.js';
import { solveRun, findMove } from './solver.js';

// Solver budget for one hint: small enough to feel instant on a phone.
export const HINT_NODE_BUDGET = 1200;
// The next-step glow asks after every tap, so it looks a third as far.
export const GLOW_NODE_BUDGET = 400;

const endId = (ref) => (ref && typeof ref === 'object' ? ref.id : ref);

// Deep enough copy of a run for a bot to play on without touching the real
// one. Returns { run, nodeOf, linkOf } where nodeOf/linkOf map the copies
// back to the live objects.
export function cloneRun(state, network, difficulty) {
    const nodeOf = new Map();
    const linkOf = new Map();
    const nodes = network.nodes.map((n) => {
        const copy = { ...n };
        nodeOf.set(copy, n);
        return copy;
    });
    const links = network.links.map((l) => {
        const copy = { source: endId(l.source), target: endId(l.target) };
        linkOf.set(copy, l);
        return copy;
    });
    const run = {
        state: {
            ...state,
            stats: JSON.parse(JSON.stringify(state.stats)),
            dailyUsage: { ...state.dailyUsage },
            usedOnPeople: new Set(state.usedOnPeople),
        },
        network: { nodes, links },
        difficulty,
        trace: [],
    };
    return { run, nodeOf, linkOf };
}

// Every move the bot would make today, in its own order, as
// [{ toolId, node } | { toolId: 'severLink', link }] on the LIVE objects.
// Nothing is changed.
export function planDay(state, network, difficulty, bot = 'smart', rng = Math.random) {
    const { run, nodeOf, linkOf } = cloneRun(state, network, difficulty);
    BOTS[bot](run, rng);
    return run.trace.map((m) => (m.link ? { toolId: m.toolId, link: linkOf.get(m.link) } : { toolId: m.toolId, node: nodeOf.get(m.node) }));
}

// The single move to suggest now, or null when the best line does nothing
// more today. `tools` is the game's tool table; the move is re-checked
// against it, so a hint is always legal. `scenario` carries the level's
// goal, length and case cap (the game passes its own; without one the
// solver plays to contain the outbreak with no cap).
// Returns { toolId, node | link, reason, line } where line is the solver's
// result ({ cases, deaths, days }) for the best line from here.
export function chooseMove(state, network, tools, difficulty, scenario = null, { nodeBudget = HINT_NODE_BUDGET } = {}) {
    const run = { state, network, scenario: scenario || { duration: 60 }, difficulty };
    let sol = solveRun(run, { nodeBudget, tools });
    // No way left to win under the cap: still show the move that keeps the
    // most people well.
    if (!sol.found) sol = solveRun(run, { nodeBudget, tools, cap: Infinity });
    const today = sol.found ? sol.moves.filter((m) => m.day === state.day) : planDay(state, network, difficulty).map((m) => ({ ...m, live: true }));
    for (const m of today) {
        const found = m.live ? m : findMove(network, m);
        if (!found) continue;
        const move = { toolId: m.toolId, ...(found.link ? { link: found.link } : { node: found.node }) };
        if (move.link && linkLocked(move.link, network)) continue;
        const { allowed } = canUseTool(state, tools, move.toolId, difficulty, move.node || null);
        if (allowed) return { ...move, reason: moveReason(move, network), line: sol.found ? { cases: sol.cases, deaths: sol.deaths, days: sol.days } : null };
    }
    return null;
}

// Why this move: 'cut' | 'bridge' | 'isolate' | 'care' | 'shield' | 'next' | 'hub'.
export function moveReason(move, network) {
    const byId = new Map(network.nodes.map((n) => [n.id, n]));
    const hot = (n) => !!n && (n.state === 'infected' || n.state === 'exposed');
    if (move.toolId === 'severLink') {
        const a = byId.get(endId(move.link.source)) || move.link.source;
        const b = byId.get(endId(move.link.target)) || move.link.target;
        const red = (hot(a) && b && b.state === 'healthy') || (hot(b) && a && a.state === 'healthy');
        return red ? 'cut' : 'bridge';
    }
    if (move.toolId === 'quarantine') {
        if (!hot(move.node)) return 'shield';
        // A sick frail person with nobody left to infect: the ward saves them.
        const spreads = neighbors(network, move.node.id).some((nb) => byId.get(nb.id)?.state === 'healthy');
        return !spreads && move.node.frail ? 'care' : 'isolate';
    }
    // Later planets (src/sim/mechanics.js): Test and Mask have their own lines.
    if (move.toolId === 'test') return 'test';
    if (move.toolId === 'mask') return hot(move.node) ? 'maskSick' : 'mask';
    const nextToSick = neighbors(network, move.node.id).some((nb) => hot(byId.get(nb.id)));
    return nextToSick ? 'next' : 'hub';
}

const HINT_LINES = {
    cut: 'Try cutting this red line. It is part of the best play.',
    bridge: 'Try cutting this line now. It is the way into the next group, and tomorrow you will be short of cuts.',
    isolate: 'Try isolating this sick person. That closes all their lines at once.',
    care: 'Try isolating this frail person. In a ward they will recover.',
    shield: 'Try isolating this person to keep them safe.',
    next: 'Try vaccinating this person. They are next in line.',
    hub: 'Try vaccinating this person now. The outbreak is heading their way.',
    test: 'Try testing this person. They are a contact of the first case.',
    maskSick: 'Try masking this sick person. All their lines take two nights instead of one.',
    mask: 'Try masking this person. Their lines take two nights instead of one.',
};
export const NO_HINT_LINE = 'The best play does nothing more today. Tap Next day.';

export function hintLine(move) {
    return move ? HINT_LINES[move.reason] || 'Try this move.' : NO_HINT_LINE;
}

// One free hint per level, then a small funding cost, so a hint helps
// without playing the game for you.
export const HINT_RULES = Object.freeze({ freePerLevel: 1, cost: 15 });

// Price of the next hint given how many were used this level.
export function hintPrice(used, free = HINT_RULES.freePerLevel, cost = HINT_RULES.cost) {
    return used < free ? 0 : cost;
}

// Can the player take a hint? Returns { ok, price, reason? }.
export function hintOffer({ used = 0, funding = 0, free = HINT_RULES.freePerLevel } = {}) {
    const price = hintPrice(used, free);
    if (price > funding) return { ok: false, price, reason: `The next hint costs ${price} gold.` };
    return { ok: true, price };
}

// Label for the hint button: "Hint" while free, then "Hint 15".
export function hintLabel(used, free = HINT_RULES.freePerLevel) {
    const price = hintPrice(used, free);
    return price === 0 ? 'Hint' : `Hint ${price}`;
}
