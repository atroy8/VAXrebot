// Little people for the care box and the results tally: the same faces the
// network uses (src/assets/faces), on a glossy colored ball, blinking now
// and then. Plain HTML and CSS, so they are cheap to show by the dozen.

import { citizenFaceUrl, DEFAULT_CIV } from './citizen-faces.js';
import { lookFor, lookFaceUrl } from './people.js';

// Item 29 (c): the care box and the results show the people of the land
// being played. game.js sets it when a level starts.
let currentCiv = DEFAULT_CIV;
export function setFaceCivilization(civ) {
    currentCiv = civ || DEFAULT_CIV;
}
export function faceCivilization() {
    return currentCiv;
}

// Ball color and the blink frame per state, matching the 3D network.
export const FACE_LOOKS = {
    infected: { color: '#e5484d', blink: 'cough' },
    quarantined: { color: '#fd8a3c', blink: 'sleepy' },
    recovered: { color: '#2fc6e8', blink: 'happy' },
    healthy: { color: '#3cbf6a', blink: 'blink' },
    vaccinated: { color: '#8b5cf6', blink: 'happy' },
    // Round 42: the Lost bin on the results. Never blinks.
    dead: { color: '#9aa3ad', blink: 'idle' },
};

// i staggers the blink so a row of faces never blinks in unison.
// Round 53: with no land named, the token shows the level's crowd (the
// i-th person of the cast, src/ui/people.js), so the care box and the results
// are as varied as the web. Naming a land keeps that land's one face.
export function faceTokenHtml(state, { i = 0, cls = '', civ = null } = {}) {
    const look = FACE_LOOKS[state] || FACE_LOOKS.healthy;
    const delay = ((i * 1.37) % 4).toFixed(2);
    const person = civ ? null : lookFor(i);
    const src = (frame) => (person ? lookFaceUrl(person, state, frame) : citizenFaceUrl(civ || currentCiv, state, frame));
    return (
        `<span class="face-token ${cls}" style="--ball:${look.color};--blink-delay:-${delay}s" aria-hidden="true">` +
        `<img class="face-idle" src="${src('idle')}" alt="">` +
        `<img class="face-blink" src="${src(look.blink)}" alt="">` +
        `</span>`
    );
}
