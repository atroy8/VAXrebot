// Start page (round 12): replaces the How to play pop-up. The game opens on
// one planet with a crowd of little people bouncing along its top edge, the
// VAXrebot title in gold, and one big Play button. Tapping a person makes them
// leap. Play flies out to the solar system.
//
// The people are HTML face tokens laid over the 3D canvas and pinned to the
// planet's outline every frame, so they stay crisp and cheap. The geometry
// below is pure so it can be tested without a browser.

import { faceTokenHtml } from './face-token.js';

// Who stands on the planet: mostly healthy townsfolk, a few protected or
// recovered, and one sick person (the reason you are here).
export const START_CROWD = ['healthy', 'vaccinated', 'healthy', 'recovered', 'infected', 'healthy', 'vaccinated', 'healthy', 'recovered'];

// Spots along the top arc of a circle (the planet on screen).
// Angles run from -spread to +spread degrees around straight up.
// Each spot: { x, y, angle } where (x, y) is the point on the outline and
// angle is the tilt in degrees so a person stands upright on the surface.
export function rimSpots(count, { cx, cy, r, spreadDeg = 70 }) {
    if (count <= 0) return [];
    if (count === 1) return [{ x: cx, y: cy - r, angle: 0 }];
    const spots = [];
    for (let i = 0; i < count; i++) {
        const angle = -spreadDeg + (2 * spreadDeg * i) / (count - 1);
        const a = (angle * Math.PI) / 180;
        spots.push({ x: cx + r * Math.sin(a), y: cy - r * Math.cos(a), angle });
    }
    return spots;
}

// Person size from the planet's on-screen radius: big enough to tap (at
// least 44 px) and never so big they crowd each other on the arc.
export function personSize(r, count = START_CROWD.length, spreadDeg = 70) {
    const arc = (2 * spreadDeg * Math.PI) / 180 * r;
    const gap = count > 1 ? arc / (count - 1) : arc;
    return Math.round(Math.max(44, Math.min(64, gap * 0.82, r * 0.26)));
}

export function startPageMarkup(crowd = START_CROWD) {
    const people = crowd
        .map((state, i) => `<button type="button" class="start-person" data-i="${i}" style="--d:${((i * 0.37) % 1.1).toFixed(2)}s" aria-label="Say hi">${faceTokenHtml(state, { i })}</button>`)
        .join('');
    return `
        <div class="start-page" id="start-page">
            <div class="start-people" id="start-people">${people}</div>
            <div class="start-top">
                <h1 class="start-title">VAXrebot</h1>
                <p class="start-tagline">Stop the outbreak. Save the planet.</p>
            </div>
            <button type="button" class="start-play" id="start-play">Play</button>
        </div>`;
}

// Pins the people to the planet outline. `circle` is { cx, cy, r } in CSS
// pixels relative to the start page, or null to hide them.
export function layoutPeople(container, circle) {
    const els = container.querySelectorAll('.start-person');
    if (!circle) {
        container.style.visibility = 'hidden';
        return;
    }
    container.style.visibility = '';
    const size = personSize(circle.r, els.length);
    // Stand on the surface: push each spot out by half a person.
    const spots = rimSpots(els.length, { cx: circle.cx, cy: circle.cy, r: circle.r + size * 0.42 });
    els.forEach((el, i) => {
        const s = spots[i];
        el.style.setProperty('--size', `${size}px`);
        el.style.transform = `translate(${(s.x - size / 2).toFixed(1)}px, ${(s.y - size / 2).toFixed(1)}px) rotate(${s.angle.toFixed(1)}deg)`;
    });
}

// A tapped person leaps high and flips; taps during a leap restart it.
export function bindPeopleTaps(container, onTap) {
    container.addEventListener('click', (e) => {
        const btn = e.target.closest('.start-person');
        if (!btn) return;
        btn.classList.remove('leap');
        void btn.offsetWidth; // restart the animation
        btn.classList.add('leap');
        onTap?.(btn);
    });
    container.addEventListener('animationend', (e) => {
        const btn = e.target.closest?.('.start-person');
        if (btn && e.animationName === 'startLeap') btn.classList.remove('leap');
    });
}
