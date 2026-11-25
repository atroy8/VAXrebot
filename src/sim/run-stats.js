// Bookkeeping for the bonus goals and the daily share text (wide audience
// round). Pure counters on state.stats: they record what happened and never
// change an outcome, a dice roll or a tool limit. Called from the shared
// actions (src/sim/actions.js), so the game and the balance bots count the
// same way.
//
// Added to state.stats:
//   toolUses     { vaccinate, quarantine }  uses of each node tool this level
//                (cuts are already counted in stats.linksSevered)
//   rTamedDay    the first day whose moves left the live R under 1 at
//                nightfall, or undefined when that never happened
//   activeByDay  people sick at the start, then after each night

const sickNow = (network) =>
    network.nodes.filter((n) => n.state === 'infected' || (n.state === 'quarantined' && n.sickWhileQuarantined)).length;

// One use of Vaccinate or Quarantine.
export function noteToolUse(state, toolId) {
    const uses = (state.stats.toolUses ||= {});
    uses[toolId] = (uses[toolId] || 0) + 1;
}

// Nightfall, before the day counter moves: `r` is the live R the player's
// moves left behind (liveR in src/sim/actions.js).
export function noteDayStart(state, network, r) {
    const stats = state.stats;
    if (!stats.activeByDay) stats.activeByDay = [sickNow(network)];
    if (stats.rTamedDay == null && r != null && r < 1) stats.rTamedDay = state.day;
}

// Morning, after spread and recoveries.
export function noteDayEnd(state, network) {
    (state.stats.activeByDay ||= []).push(sickNow(network));
}

// Uses of every classic tool so far this level.
export function toolUseTotals(stats) {
    const uses = (stats && stats.toolUses) || {};
    const totals = { vaccinate: uses.vaccinate || 0, quarantine: uses.quarantine || 0, severLink: (stats && stats.linksSevered) || 0 };
    totals.all = totals.vaccinate + totals.quarantine + totals.severLink;
    return totals;
}
