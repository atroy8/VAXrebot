// Pure helpers for the globe's HTML marker labels (no three.js, no DOM), so
// they can be unit tested.

const LOCK_ICON =
    '<svg class="globe-lock-icon" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">' +
    '<rect x="5" y="10.5" width="14" height="10" rx="2.5" fill="currentColor"/>' +
    '<path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>' +
    '</svg>';

export function starRow(stars) {
    const n = Math.max(0, Math.min(3, Math.floor(stars || 0)));
    return '★'.repeat(n) + '☆'.repeat(3 - n);
}

// Label for a level marker: the level number, then stars when completed or a
// padlock icon when locked. Locked levels used to print the word "lock".
export function levelLabelHtml(index, { unlocked, completed, stars }) {
    const num = `<span class="globe-label-num">${index + 1}</span>`;
    if (completed) return `${num}<span class="globe-label-stars" aria-label="${stars} of 3 stars">${starRow(stars)}</span>`;
    if (!unlocked) return `${num}<span class="globe-label-lock" aria-label="Locked">${LOCK_ICON}</span>`;
    return num;
}

// Keeps a label centred on x but fully inside the screen, with a margin, so
// markers near the edge of the globe never get their text cut off.
export function clampLabelX(x, labelWidth, viewportWidth, margin = 6) {
    const half = labelWidth / 2;
    const min = half + margin;
    const max = viewportWidth - half - margin;
    if (max < min) return viewportWidth / 2;
    return Math.min(max, Math.max(min, x));
}
