// Round 55 (Adam): "the game should speed to day 3 if the only action left
// is to quarantine the person". Once spread is over (no sick person touches
// anyone who can catch it), cutting and vaccinating change nothing; the one
// useful move is isolating the sick, which halves their risk. If Quarantine
// cannot be used today (it opens on a later day, or today's uses are spent)
// the days advance on their own until it can.
//
// care = careStillHelps(...) from src/sim/engine.js: { day, sick } where day
// is the first day Quarantine can reach someone, or null when it cannot help.
export const CARE_SKIP_MS = 1100;

export function shouldSkipToCare(care, state) {
    if (!care || !state || state.gameOver || state.paused) return false;
    return care.day > state.day;
}
