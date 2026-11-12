// Round 40: a stray tap can no longer skip the results.
//
// The results screen opens the moment a level ends, often while the player's
// thumb is still tapping Next day (or the day countdown is about to run out).
// On a win, Next level sits right where Next day was, so one late tap jumped
// straight to the next briefing: no stars, no tally, no lesson. On a loss,
// Try again restarted the level the same way. In a level 1 playtest at
// 390x844, one tap where Next day had been, 200 ms after the results
// opened, restarted the level before the results could be read.
//
// Fix: for a short moment after a screen opens, taps on it are swallowed and
// its buttons show as settling in. After that everything works as before.
// The pure part (timing) lives here and is tested in
// tests/round40-tap-guard.test.js; game.js wires it to the screens.

// Long enough to catch a tap already on its way (a quick double tap is about
// 300 ms apart), short enough that nobody waiting to press notices.
export const TAP_GUARD_MS = 650;

// A guard that blocks taps until `ms` after the last arm(). `now` is
// injectable for tests.
export function createTapGuard({ ms = TAP_GUARD_MS, now = () => performance.now() } = {}) {
    let until = -Infinity;
    return {
        arm(at = now()) {
            until = at + ms;
        },
        disarm() {
            until = -Infinity;
        },
        blocks(at = now()) {
            return at < until;
        },
        remaining(at = now()) {
            return Math.max(0, until - at);
        },
    };
}

// Wires a guard to a screen element: arm() swallows clicks on the screen (in
// the capture phase, before any button or the tally hears them) and adds the
// `tap-guarded` class, which the CSS uses to show the buttons settling in.
// Returns { arm } so the caller can arm it each time the screen opens.
export function guardScreenTaps(el, { ms = TAP_GUARD_MS, now, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
    const guard = createTapGuard({ ms, now });
    if (!el) return { arm() {}, guard };
    let timer = null;
    const swallow = (e) => {
        if (!guard.blocks()) return;
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation?.();
    };
    el.addEventListener('click', swallow, true);
    return {
        guard,
        arm() {
            guard.arm();
            el.classList.add('tap-guarded');
            if (timer) clearTimer(timer);
            timer = setTimer(() => {
                timer = null;
                el.classList.remove('tap-guarded');
            }, ms);
        },
    };
}
