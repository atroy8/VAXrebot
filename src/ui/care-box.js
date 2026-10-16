// Care box UI: three bins on the right of the network with live counts and
// a little stack of faces. People fly in from the network when they are
// isolated or cured (see NetworkView onBoxed and game.js).
import { faceTokenHtml } from './face-token.js';
import { BINS, careCounts, binFor } from './care-box-model.js';

// Faces shown per bin before a "+N" chip; the bins are tall on phones, so
// two columns of five fit.
const MAX_FACES = 10;

export function mountCareBox() {
    const el = document.getElementById('care-box');
    if (!el || el.dataset.ready) return el;
    el.dataset.ready = '1';
    el.innerHTML = BINS.map(
        (b) => `
        <div class="care-bin care-bin--${b.id}" data-bin="${b.id}" title="${b.tip}">
            <div class="care-bin-head">
                <span class="care-count" data-count>0</span>
            </div>
            <div class="care-faces" data-faces aria-hidden="true"></div>
            <div class="care-label">${b.label}</div>
        </div>`
    ).join('');
    return el;
}

export function renderCareBox(nodes) {
    const el = mountCareBox();
    if (!el) return;
    const counts = careCounts(nodes);
    for (const b of BINS) {
        const bin = el.querySelector(`[data-bin="${b.id}"]`);
        const countEl = bin.querySelector('[data-count]');
        const n = counts[b.id];
        if (countEl.textContent !== String(n)) countEl.textContent = String(n);
        const faces = bin.querySelector('[data-faces]');
        const shown = n > MAX_FACES ? MAX_FACES - 1 : n;
        const key = `${shown}:${n}`;
        if (faces.dataset.key !== key) {
            const before = faces.querySelectorAll('.face-token').length;
            faces.dataset.key = key;
            faces.innerHTML =
                Array.from({ length: shown }, (_, i) => faceTokenHtml(b.face, { i, cls: i >= before ? 'face-pop' : '' })).join('') +
                (n > shown ? `<span class="care-more">+${n - shown}</span>` : '');
        }
        bin.classList.toggle('empty', n === 0);
        bin.setAttribute('aria-label', `${b.label}: ${n}`);
    }
}

// Fly faces from the network into their bins. leaving: [{ node, from:{x,y} }]
export function flyToCareBox(leaving, { onLand } = {}) {
    const el = document.getElementById('care-box');
    if (!el) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    leaving.forEach(({ node, from }, i) => {
        const binId = binFor(node);
        const bin = binId && el.querySelector(`[data-bin="${binId}"]`);
        if (!bin || !from) return;
        const to = (bin.querySelector('.care-faces .face-token:last-of-type') || bin.querySelector('.care-faces')).getBoundingClientRect();
        const face = document.createElement('span');
        face.className = 'care-flyer';
        face.innerHTML = faceTokenHtml(BINS.find((b) => b.id === binId).face);
        face.style.left = `${from.x - 20}px`;
        face.style.top = `${from.y - 20}px`;
        document.body.appendChild(face);
        const dx = to.left + to.width / 2 - from.x;
        const dy = to.top + to.height / 2 - from.y;
        const land = () => {
            face.remove();
            bin.classList.remove('care-bump');
            void bin.offsetWidth;
            bin.classList.add('care-bump');
            onLand?.(binId);
        };
        if (reduce || !face.animate) {
            land();
            return;
        }
        // Pop up out of the network, then arc over into the bin.
        const anim = face.animate(
            [
                { transform: 'translate(0, 0) scale(0.6)', opacity: 0.9 },
                { transform: `translate(${dx * 0.35}px, ${dy * 0.35 - 70}px) scale(1.35)`, opacity: 1, offset: 0.4 },
                { transform: `translate(${dx}px, ${dy}px) scale(0.65)`, opacity: 1 },
            ],
            { duration: 700, delay: i * 70, easing: 'cubic-bezier(.45,0,.3,1)', fill: 'both' }
        );
        anim.onfinish = land;
    });
}
