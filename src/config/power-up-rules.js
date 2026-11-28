// Round 55 (Adam): power-ups open after two turns, on day 3, so a level
// cannot be cleared on day 1 with one overpowered tap. The first two days
// are played with the level's own tools. Tiny file with no imports so the
// pure tray model and the economy can both read it.
export const POWER_UP_FIRST_DAY = 3;

export function powerUpsOpen(day) {
    return (Number(day) || 0) >= POWER_UP_FIRST_DAY;
}

export function powerUpLockedLine() {
    return `Power-ups open on day ${POWER_UP_FIRST_DAY}. Use your tools first.`;
}
