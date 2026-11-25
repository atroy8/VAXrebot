// Guided first level: the step logic, with no DOM.
//
// A new player used to read three How to play cards before touching the web.
// Now a small coach bubble sits next to the thing to tap on level 1 and moves
// on when the player does it. This file decides WHICH step shows; coach.js
// draws it. Everything here is plain data in, plain data out, so it is tested
// in tests/wide-firstrun-coach.test.js.
//
// facts (gathered from the live game by coach.js):
//   day, selectedTool, gameOver, blocked (paused, shop, wrap-up, a card open),
//   sick (people sick in the web), riskLines (red lines on screen),
//   sever: { state, left, limit }, vaccinate: { state }, quarantine: { state },
//   countdown (the day is about to end on its own, see auto-advance.js).
// memory: { dismissed: { [key]: true }, finished } and is never mutated.

// The same flag the old How to play cards used, so players who already saw
// those never get the coach, and the coach never shows twice.
export const COACH_FLAG = 'vaxrebot-onboarded';

export const COACH_TEXT = Object.freeze({
    sick: 'This person is sick. Red lines are where it will jump tonight.',
    pickSever: 'Tap Sever Link.',
    cutFirst: 'Now tap a red line to cut it.',
    cutMore: (left) => `Cut another red line. ${left} left.`,
    nextDay: 'Tap Next day.',
    nextDayNoLines: 'No red lines left. Tap Next day.',
    nextDayAuto: 'Cuts used up. The next day starts on its own.',
    vaccinate: 'New tool: Vaccinate protects a healthy person.',
    quarantine: 'New tool: Quarantine isolates the sick.',
});

// Hints (kind 'info') only need reading; the rest (kind 'do') name one tap.
const HINT_TOOLS = ['vaccinate', 'quarantine'];
// If the tools somehow never open, the coach still ends.
export const COACH_LAST_DAY = 5;

export function newCoachMemory() {
    return { dismissed: {}, finished: false };
}

const stateOf = (facts, id) => (facts && facts[id] && facts[id].state) || null;
const isOpen = (facts, id) => {
    const s = stateOf(facts, id);
    return s === 'ready' || s === 'spent';
};

// Every step that fits the facts, in the order they should show.
function candidates(facts) {
    const out = [];
    const sever = facts.sever || {};
    const left = sever.left || 0;
    const limit = sever.limit || 0;
    if (facts.day === 1) {
        const canCut = sever.state === 'ready' && left > 0 && (facts.riskLines || 0) > 0;
        const holding = facts.selectedTool === 'severLink';
        if (canCut && left === limit && !holding && (facts.sick || 0) > 0) {
            out.push({ id: 'sick', key: 'sick', kind: 'info', text: COACH_TEXT.sick, anchor: { type: 'sick' } });
        }
        if (canCut && !holding) {
            out.push({ id: 'pick-sever', key: 'pick-sever', kind: 'do', text: COACH_TEXT.pickSever, anchor: { type: 'tool', id: 'severLink' } });
        } else if (canCut) {
            out.push({
                id: 'cut',
                key: `cut:${left}`,
                kind: 'do',
                text: left === limit ? COACH_TEXT.cutFirst : COACH_TEXT.cutMore(left),
                anchor: { type: 'risk' },
            });
        } else {
            const text = facts.countdown ? COACH_TEXT.nextDayAuto : left > 0 && sever.state === 'ready' ? COACH_TEXT.nextDayNoLines : COACH_TEXT.nextDay;
            out.push({ id: 'next-day', key: 'next-day', kind: 'do', text, anchor: { type: 'next-day' } });
        }
        return out;
    }
    for (const id of HINT_TOOLS) {
        if (stateOf(facts, id) === 'ready') {
            out.push({ id, key: id, kind: 'info', text: COACH_TEXT[id], anchor: { type: 'tool', id } });
        }
    }
    return out;
}

// The step to show right now, or null (nothing to say, or out of the way).
export function coachStep(facts, memory = newCoachMemory()) {
    if (!facts || memory.finished || facts.gameOver || facts.blocked) return null;
    const dismissed = memory.dismissed || {};
    // One at a time, in order. A step the player waved away makes way for
    // the next one that fits; a later one waits for its own moment.
    const list = candidates(facts);
    return list.find((s) => !dismissed[s.key]) || null;
}

// A tap anywhere else waves the current step away (it never blocks play).
export function coachDismiss(memory, step) {
    if (!step) return memory;
    return { ...memory, dismissed: { ...(memory.dismissed || {}), [step.key]: true } };
}

// A stray tap (a miss, a pan) waves a "tap this" step away like any other
// tap. If the player then does nothing for a moment and the step still
// fits, it comes back, so one missed tap does not leave a new player alone
// with the web. Reading hints (kind 'info') never come back.
export const COACH_RECALL_MS = 5000;
export function coachRecall(facts, memory, idleMs) {
    if (!facts || !memory || memory.finished || !(idleMs >= COACH_RECALL_MS)) return memory;
    if (facts.gameOver || facts.blocked || coachStep(facts, memory)) return memory;
    const dismissed = memory.dismissed || {};
    const lost = candidates(facts).find((s) => s.kind === 'do' && dismissed[s.key]);
    if (!lost) return memory;
    const rest = { ...dismissed };
    delete rest[lost.key];
    return { ...memory, dismissed: rest };
}

// Skip: the coach is done for good.
export function coachSkip(memory) {
    return { ...memory, finished: true };
}

// True once the coach has nothing more to teach: skipped, the level is over,
// both new-tool hints have been seen (or those tools are not on this level),
// or the days have run past the point where it could still help.
export function coachFinished(facts, memory = newCoachMemory()) {
    if (memory.finished) return true;
    if (!facts) return false;
    if (facts.gameOver) return true;
    if ((facts.day || 1) > COACH_LAST_DAY) return true;
    const dismissed = memory.dismissed || {};
    return HINT_TOOLS.every((id) => dismissed[id] || stateOf(facts, id) === 'off' || stateOf(facts, id) === null) && (facts.day || 1) > 1;
}

// Where the bubble goes: under the anchor when the anchor is in the top
// half of the screen, above it otherwise, and never off the sides.
// anchor: { x, y, r } centre and half size in CSS px. Returns the bubble's
// left/top and where its arrow sits along its edge.
export function bubblePlacement(anchor, bubble, viewport, { gap = 14, margin = 8 } = {}) {
    const below = anchor.y < viewport.height / 2;
    const left = Math.max(margin, Math.min(viewport.width - bubble.width - margin, anchor.x - bubble.width / 2));
    const rawTop = below ? anchor.y + anchor.r + gap : anchor.y - anchor.r - gap - bubble.height;
    const top = Math.max(margin, Math.min(viewport.height - bubble.height - margin, rawTop));
    const arrow = Math.max(18, Math.min(bubble.width - 18, anchor.x - left));
    return { left, top, arrow, side: below ? 'below' : 'above' };
}

// The red line to point at: the longest one on screen is the easiest to
// hit. `lines` = [{ id, ax, ay, bx, by }]. Sticks with `keepId` while that
// line is still red, so the pointer does not jump about as the web settles.
export function pickRiskLine(lines = [], keepId = null) {
    if (!lines.length) return null;
    const kept = keepId != null ? lines.find((l) => l.id === keepId) : null;
    const len = (l) => Math.hypot(l.bx - l.ax, l.by - l.ay);
    const best = kept || lines.reduce((a, b) => (len(b) > len(a) ? b : a));
    return { id: best.id, x: (best.ax + best.bx) / 2, y: (best.ay + best.by) / 2 };
}

// Storage can be missing or throw (private mode): then the coach shows, and
// simply cannot remember that it did.
export function coachSeen(storage) {
    try {
        return !!storage && storage.getItem(COACH_FLAG) === 'true';
    } catch {
        return false;
    }
}

export function markCoachSeen(storage) {
    try {
        storage?.setItem(COACH_FLAG, 'true');
    } catch {
        /* ignore */
    }
}
