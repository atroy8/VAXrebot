// Auto-advance countdown: once every daily action is spent, the day ends on
// its own after a short delay. The player keeps their options during the
// countdown (power-ups, Next day, panning the network) and can Hold to stop
// it and think. Timers are injectable so tests can drive it with fake time.
//
//   const aa = createAutoAdvance({ delayMs: 3000, onTick, onFire, onStop });
//   aa.start();   // begin (or restart) the countdown
//   aa.hold();    // stop it; the player advances manually
//   aa.cancel();  // stop it silently (day advanced, game over, paused)
//   onStop(why)   // why: 'held' | 'cancelled' | 'fired' (just before onFire)
export function createAutoAdvance({
    delayMs = 3000,
    tickMs = 100,
    onTick = () => {},
    onFire = () => {},
    onStop = () => {},
    // Wrapped so the browser globals are called unbound (calling
    // window.setInterval as a method of another object throws).
    timers = {
        setInterval: (fn, ms) => setInterval(fn, ms),
        clearInterval: (h) => clearInterval(h),
        now: () => Date.now(),
    },
} = {}) {
    let handle = null;
    let startedAt = 0;
    let held = false;

    function clear() {
        if (handle !== null) timers.clearInterval(handle);
        handle = null;
    }

    function tick() {
        const left = Math.max(0, delayMs - (timers.now() - startedAt));
        onTick(left, 1 - left / delayMs);
        if (left <= 0) {
            clear();
            // Round 27: tell the button the countdown is over before the day
            // turns. Without this, nextDay's cancel() saw no timer and never
            // called onStop, so "Next day in 0" and Hold stayed up all day.
            onStop('fired');
            onFire();
        }
    }

    return {
        start() {
            clear();
            held = false;
            startedAt = timers.now();
            handle = timers.setInterval(tick, tickMs);
            onTick(delayMs, 0);
        },
        hold() {
            if (handle === null) return;
            clear();
            held = true;
            onStop('held');
        },
        cancel() {
            if (handle === null) return;
            clear();
            onStop('cancelled');
        },
        isRunning: () => handle !== null,
        isHeld: () => held,
    };
}
