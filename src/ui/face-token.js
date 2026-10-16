// Little people for the care box and the results tally: the same faces the
// network uses (src/assets/faces), on a glossy colored ball, blinking now
// and then. Plain HTML and CSS, so they are cheap to show by the dozen.

const faceModules = import.meta.glob('../assets/faces/*/*.png', { eager: true, query: '?url', import: 'default' });

function faceUrl(state, frame) {
    return faceModules[`../assets/faces/${state}/${frame}.png`] || faceModules[`../assets/faces/${state}/idle.png`] || '';
}

// Ball color and the blink frame per state, matching the 3D network.
export const FACE_LOOKS = {
    infected: { color: '#e5484d', blink: 'cough' },
    quarantined: { color: '#fd8a3c', blink: 'sleepy' },
    recovered: { color: '#2fc6e8', blink: 'happy' },
    healthy: { color: '#3cbf6a', blink: 'blink' },
    vaccinated: { color: '#8b5cf6', blink: 'happy' },
};

// i staggers the blink so a row of faces never blinks in unison.
export function faceTokenHtml(state, { i = 0, cls = '' } = {}) {
    const look = FACE_LOOKS[state] || FACE_LOOKS.healthy;
    const delay = ((i * 1.37) % 4).toFixed(2);
    return (
        `<span class="face-token ${cls}" style="--ball:${look.color};--blink-delay:-${delay}s" aria-hidden="true">` +
        `<img class="face-idle" src="${faceUrl(state, 'idle')}" alt="">` +
        `<img class="face-blink" src="${faceUrl(state, look.blink)}" alt="">` +
        `</span>`
    );
}
