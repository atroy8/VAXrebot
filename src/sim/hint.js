// Hint: one good move for the player who is stuck (wide audience round).
// Pure. The move is the smart balance bot's own first move on a copy of the
// current state, so a hint is always what "a reasonable player" would do
// and the bot (src/sim/balance.js) stays the single source of that advice.
import { BOTS } from './balance.js';
import { canUseTool } from './engine.js';
import { neighbors } from './actions.js';

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

// The single move to suggest now, or null when the bot would do nothing
// more today. `tools` is the game's tool table; the move is re-checked
// against it, so a hint is always legal.
export function chooseMove(state, network, tools, difficulty) {
    for (const move of planDay(state, network, difficulty)) {
        const { allowed } = canUseTool(state, tools, move.toolId, difficulty, move.node || null);
        if (allowed) return { ...move, reason: moveReason(move, network) };
    }
    return null;
}

// Why this move: 'cut' | 'isolate' | 'shield' | 'next' | 'hub'.
export function moveReason(move, network) {
    if (move.toolId === 'severLink') return 'cut';
    if (move.toolId === 'quarantine') return move.node.state === 'infected' || move.node.state === 'exposed' ? 'isolate' : 'shield';
    // Later planets (src/sim/mechanics.js): Test and Mask have their own lines.
    if (move.toolId === 'test') return 'test';
    if (move.toolId === 'mask') return move.node.state === 'infected' || move.node.state === 'exposed' ? 'maskSick' : 'mask';
    const byId = new Map(network.nodes.map((n) => [n.id, n]));
    const nextToSick = neighbors(network, move.node.id).some((nb) => byId.get(nb.id)?.state === 'infected');
    return nextToSick ? 'next' : 'hub';
}

const HINT_LINES = {
    cut: 'Try cutting this red line.',
    isolate: 'Try isolating this sick person.',
    shield: 'Try isolating this person to keep them safe.',
    next: 'Try vaccinating this person. They are next in line.',
    hub: 'Try vaccinating this person. They know the most people.',
    test: 'Try testing this person. They are close to a known case.',
    maskSick: 'Try masking this sick person. All their lines spread less.',
    mask: 'Try masking this person. Their lines will spread less.',
};
export const NO_HINT_LINE = 'Nothing more to do today. Tap Next day.';

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
    if (price > funding) return { ok: false, price, reason: `The next hint costs ${price} funding.` };
    return { ok: true, price };
}

// Label for the hint button: "Hint" while free, then "Hint 15".
export function hintLabel(used, free = HINT_RULES.freePerLevel) {
    const price = hintPrice(used, free);
    return price === 0 ? 'Hint' : `Hint ${price}`;
}
