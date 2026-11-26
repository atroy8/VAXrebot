// Show best play, narrated (round 58). Pure text helpers, no DOM.
//
// Round 57's replay applied the solver's moves 0.8 s apart with only
// "Best play: N cases" on screen, so a player could not tell which line was
// cut or who was vaccinated. The replay now names each move before it
// happens ("Day 1: Cut the line between Aiko and Bram"), marks it on the web,
// and counts the moves, so watching it teaches the answer.

// What each tool does, as a short imperative. Unknown tools fall back to
// their own id so a new tool never shows an empty banner.
const VERBS = Object.freeze({
    vaccinate: 'Vaccinate',
    quarantine: 'Quarantine',
    test: 'Test',
    mask: 'Mask',
    eureka: 'Use Eureka on',
    pay: 'Use Pay on',
    blitz: 'Use Blitz on',
});

const named = (nameOf, id) => {
    const n = typeof nameOf === 'function' ? nameOf(id) : null;
    return n ? String(n) : `person ${Number(id) + 1}`;
};

// The main line for one move. move = { day, toolId, node } or, for a cut,
// { day, toolId: 'severLink', a, b }. nameOf(id) gives a person's first name.
export function demoMoveText(move, nameOf) {
    if (!move) return '';
    const day = `Day ${move.day}: `;
    if (move.toolId === 'severLink') return `${day}Cut the line between ${named(nameOf, move.a)} and ${named(nameOf, move.b)}`;
    const verb = VERBS[move.toolId] || move.toolId;
    return `${day}${verb} ${named(nameOf, move.node)}`;
}

// The small line above it: the target and how far along the replay is.
export function demoHeadText({ cases, done = 0, total = 0 }) {
    const goal = `Best play: ${cases} ${cases === 1 ? 'case' : 'cases'}`;
    if (!total) return goal;
    return `${goal} · move ${Math.min(done, total)} of ${total}`;
}

// Between days. movesLeft = moves still to come on later days.
export function demoNightText(day, movesLeft) {
    if (movesLeft > 0) return `Day ${day} done. Night falls.`;
    return 'Every move made. Now watch it fade out.';
}
