// Undo: one step back within the current day (wide audience round). Pure.
// takeSnapshot() copies everything a tool or power-up can change;
// restoreSnapshot() puts it back IN PLACE, so the node and link objects the
// view holds stay the same objects. Never across Next day: the dice have
// been rolled by then, so canRestore() refuses a snapshot from another day.

// Later planets add per-person fields (src/sim/mechanics.js): a hidden
// carrier's days, a revealed case, today's tested clear mark and a mask.
export const NODE_FIELDS = ['state', 'daysInfected', 'removed', 'sickWhileQuarantined', 'homeUntilDay', 'incubating', 'knownCase', 'testedClear', 'masked'];

// `extra` rides along untouched (the game stores power-up charges there).
export function takeSnapshot(state, network, extra = null) {
    return {
        day: state.day,
        nodes: network.nodes.map((n) => {
            const fields = {};
            for (const f of NODE_FIELDS) if (f in n) fields[f] = n[f];
            return { node: n, fields };
        }),
        links: [...network.links],
        stats: JSON.parse(JSON.stringify(state.stats)),
        dailyUsage: { ...state.dailyUsage },
        usedOnPeople: [...state.usedOnPeople],
        extra,
    };
}

export function canRestore(state, snapshot) {
    return !!snapshot && !!state && !state.gameOver && snapshot.day === state.day;
}

// Returns true when the snapshot was applied.
export function restoreSnapshot(state, network, snapshot) {
    if (!canRestore(state, snapshot)) return false;
    for (const { node, fields } of snapshot.nodes) {
        for (const f of NODE_FIELDS) {
            if (f in fields) node[f] = fields[f];
            else delete node[f];
        }
    }
    network.nodes = snapshot.nodes.map((s) => s.node);
    network.links = [...snapshot.links];
    // Keep the stats object itself (the game holds references to it).
    for (const key of Object.keys(state.stats)) delete state.stats[key];
    Object.assign(state.stats, JSON.parse(JSON.stringify(snapshot.stats)));
    for (const key of Object.keys(state.dailyUsage)) state.dailyUsage[key] = snapshot.dailyUsage[key] ?? 0;
    state.usedOnPeople.clear();
    for (const key of snapshot.usedOnPeople) state.usedOnPeople.add(key);
    return true;
}
