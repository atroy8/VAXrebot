// Wide audience: show the spread. When a day ends, each new infection is
// drawn as a germ that travels along its line from the sick person to the
// new case; the new case keeps their old (healthy) face until it lands, then
// flips with a small pulse. Cause first, effect second.
//
// Before this the new case turned red at once and a small dot drifted off
// the line afterwards, so nothing on screen said who gave it to whom.
//
// Pure timing here (tested in tests/wide-visual-spread.test.js); the drawing
// is in network-view-3d.js (animateVirus).
export const SPREAD = Object.freeze({
    travelMs: 440, // germ travels the line
    pulseMs: 400, // ring opens on the new case as the face flips
    bounceMs: 450, // the face's small bounce (shared with other state changes)
    stillMs: 700, // reduced motion: a still ring that fades, nothing moves
    budgetMs: 900, // the whole thing must fit in this, so turns stay fast
});

// What happens when, for one new infection. With reduced motion nothing
// travels or grows: the face flips at once and a still ring marks the new
// case and fades.
export function spreadPlan(reduceMotion = false) {
    if (reduceMotion) return { travelMs: 0, flipAtMs: 0, pulseMs: SPREAD.stillMs, moving: false, totalMs: SPREAD.stillMs };
    return {
        travelMs: SPREAD.travelMs,
        flipAtMs: SPREAD.travelMs,
        pulseMs: SPREAD.pulseMs,
        moving: true,
        totalMs: SPREAD.travelMs + Math.max(SPREAD.pulseMs, SPREAD.bounceMs),
    };
}

// Eased position of the germ along the line (0 = sick person, 1 = new
// case) at t = 0..1 of the travel: quick away, gentle arrival.
export function spreadEase(t) {
    const x = Math.min(1, Math.max(0, t));
    return 1 - (1 - x) ** 2.2;
}

// The state a person is DRAWN in. While a germ is still on its way to them
// they keep the state they had (held), then show the real one.
export function shownState(real, held, holdUntil, now) {
    return held && now < holdUntil ? held : real;
}
