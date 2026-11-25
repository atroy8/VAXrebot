// Round 55 (Adam): the button for the next sensible step glows and pulses,
// so a player always knows where to tap. Pure decision here, DOM in
// markNextStep. The play screen asks the smart bot which tool it would use
// next (src/sim/hint.js chooseMove, the same advice Hint gives): only the
// TOOL glows, never the person or line, so Hint keeps its value.
//
// facts: { gameOver, wrapUp, paused, counting, selectedTool, move }
//   move = chooseMove(...) result or null (nothing useful left today)
// Returns 'tool:<id>' | 'next-day' | null.
export function nextStepTarget({ gameOver = false, wrapUp = false, paused = false, counting = false, selectedTool = null, move = null } = {}) {
    if (gameOver || wrapUp || paused) return null;
    // A tool is in hand: the next tap is on the web, no button to point at.
    if (selectedTool) return null;
    if (move && move.toolId) return `tool:${move.toolId}`;
    // Nothing useful left today. While the countdown runs the button
    // already shows its own progress.
    return counting ? null : 'next-day';
}

export const NEXT_STEP_CLASS = 'next-step';

// Put the glow on one button of the play screen and take it off the rest.
export function markNextStep(target, doc = typeof document !== 'undefined' ? document : null) {
    if (!doc) return;
    for (const el of doc.querySelectorAll(`#game-screen .${NEXT_STEP_CLASS}`)) el.classList.remove(NEXT_STEP_CLASS);
    if (!target) return;
    const el = target === 'next-day' ? doc.getElementById('next-day') : doc.querySelector(`#tools-list .tool-item[data-tool="${target.slice(5)}"]`);
    if (el && !el.classList.contains('disabled') && !el.disabled) el.classList.add(NEXT_STEP_CLASS);
}
