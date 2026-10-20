// Results tally after a win: the care box bins fill up face by face and count
// up, each bin's bonus lands, extras slide in, the stars pop one at a time,
// funding counts up, and any prize box this win unlocked drops in with
// confetti. Tap the tally to skip to the end. Reduced motion shows the end
// state right away.
import { faceTokenHtml } from './face-token.js';
import { starMeterHtml } from './star-meter.js';

const BIN_LOOKS = {
    treatment: { face: 'infected', label: 'Treated' },
    isolated: { face: 'quarantined', label: 'Isolated' },
    cured: { face: 'recovered', label: 'Cured' },
};
const MAX_FACES = 12;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// A prize box this win unlocked. It is a real button: tapping it leaves the
// results, flies to the box on the map and opens it (game.js wires the tap
// through data-chest-id).
export function prizeCardHtml(c) {
    return `
            <button type="button" class="tally-prize" data-chest-id="${c.id}" aria-label="Prize box unlocked! Tap to open it on the map.">
                <span class="tally-gift" aria-hidden="true"><span class="gift-lid"></span><span class="gift-box"></span></span>
                <span class="tally-prize-text"><strong>Prize box unlocked!</strong><span>Tap to open it on the map.</span></span>
                <span class="tally-prize-go" aria-hidden="true">Open</span>
                <span class="tally-confetti" aria-hidden="true">${Array.from({ length: 14 }, (_, i) => `<i style="--i:${i}"></i>`).join('')}</span>
            </button>`;
}

// bins: { treatment, isolated, cured } counts. bonus: careBonus() result.
// baseFunding: the level's normal award. chests: newly unlocked boxes.
// sound(kind, i): optional ('tick' | 'line' | 'star' | 'coin' | 'prize').
// meter: starProgress() result (star-meter.js), shown under the stars.
export function playResultsTally(el, { bins, bonus, stars, baseFunding, chests = [], meter = null, sound = () => {} }) {
    if (!el) return { skip() {} };
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const lineOf = (id) => bonus.lines.find((l) => l.id === id);
    const extras = bonus.lines.filter((l) => !BIN_LOOKS[l.id]);
    const totalFunding = baseFunding + bonus.total;

    el.hidden = false;
    el.classList.remove('done');
    el.innerHTML = `
        <div class="tally-bins">
            ${['treatment', 'isolated', 'cured']
                .map(
                    (id) => `
                <div class="tally-bin tally-bin--${id}" data-bin="${id}">
                    <div class="tally-faces" data-faces></div>
                    <div class="tally-count" data-count>0</div>
                    <div class="tally-label">${BIN_LOOKS[id].label}</div>
                    <div class="tally-pts" data-pts>${lineOf(id) ? `+${lineOf(id).each} each` : '&nbsp;'}</div>
                </div>`
                )
                .join('')}
        </div>
        <ul class="tally-lines" data-lines></ul>
        <div class="tally-stars" data-stars aria-label="${stars} of 3 stars">${'<span class="tally-star">★</span>'.repeat(3)}</div>
        <div class="tally-meter" data-meter></div>
        <ul class="tally-lines tally-lines--award" data-award></ul>
        <div class="tally-total"><span class="tally-coin" aria-hidden="true"></span><span data-total>+0</span> funding</div>
        <div class="tally-prizes" data-prizes></div>
        <div class="tally-skip" data-skip>Tap to skip</div>`;

    const q = (s) => el.querySelector(s);
    let skipped = false;
    const skip = () => {
        if (skipped) return;
        skipped = true;
        finish();
    };
    el.addEventListener('click', skip, { once: true });

    function fillBin(id, n, animate) {
        const bin = q(`[data-bin="${id}"]`);
        const faces = bin.querySelector('[data-faces]');
        const shown = Math.min(n, n > MAX_FACES ? MAX_FACES - 1 : MAX_FACES);
        faces.innerHTML =
            Array.from({ length: shown }, (_, i) => faceTokenHtml(BIN_LOOKS[id].face, { i, cls: animate ? 'face-pop' : '' })).join('') +
            (n > shown ? `<span class="tally-more">+${n - shown}</span>` : '');
        bin.querySelector('[data-count]').textContent = String(n);
        bin.classList.toggle('empty', n === 0);
    }

    function lineHtml(l) {
        const left = l.count != null ? `${l.label} <span class="tally-x">${l.count} &times; ${l.each}</span>` : l.label;
        return `<li class="tally-line"><span>${left}</span><strong>+${l.amount}</strong></li>`;
    }

    const awardLine = { id: 'award', label: `${stars}-star mission reward`, amount: baseFunding };

    function finish() {
        for (const id of Object.keys(BIN_LOOKS)) fillBin(id, bins[id] || 0, false);
        q('[data-lines]').innerHTML = bonus.lines.map(lineHtml).join('');
        q('[data-stars]').querySelectorAll('.tally-star').forEach((s, i) => s.classList.toggle('on', i < stars));
        q('[data-meter]').innerHTML = starMeterHtml(meter);
        q('[data-award]').innerHTML = baseFunding > 0 ? lineHtml(awardLine) : '';
        q('[data-total]').textContent = `+${totalFunding}`;
        q('[data-prizes]').innerHTML = chests.map(prizeCardHtml).join('');
        el.classList.add('done');
    }

    async function run() {
        await sleep(350);
        // 1. The bins fill face by face and count up.
        for (const id of ['treatment', 'isolated', 'cured']) {
            const n = bins[id] || 0;
            const bin = q(`[data-bin="${id}"]`);
            bin.classList.add('active');
            const faces = bin.querySelector('[data-faces]');
            const countEl = bin.querySelector('[data-count]');
            const step = Math.max(45, Math.min(140, 900 / Math.max(1, n)));
            for (let i = 0; i < n; i++) {
                if (skipped) return;
                if (i < MAX_FACES - (n > MAX_FACES ? 1 : 0)) {
                    faces.insertAdjacentHTML('beforeend', faceTokenHtml(BIN_LOOKS[id].face, { i, cls: 'face-pop' }));
                } else {
                    let more = faces.querySelector('.tally-more');
                    if (!more) {
                        faces.insertAdjacentHTML('beforeend', '<span class="tally-more"></span>');
                        more = faces.querySelector('.tally-more');
                    }
                    more.textContent = `+${i - (MAX_FACES - 2)}`;
                }
                countEl.textContent = String(i + 1);
                sound('tick', i);
                await sleep(step);
            }
            if (n === 0) bin.classList.add('empty');
            bin.classList.remove('active');
            if (skipped) return;
            await sleep(160);
        }
        // 2. Bonus lines slide in.
        const list = q('[data-lines]');
        for (const l of bonus.lines) {
            if (skipped) return;
            list.insertAdjacentHTML('beforeend', lineHtml(l));
            sound('line');
            await sleep(330);
        }
        // 3. Stars pop one at a time.
        const starEls = q('[data-stars]').querySelectorAll('.tally-star');
        for (let i = 0; i < stars; i++) {
            if (skipped) return;
            starEls[i].classList.add('on', 'pop');
            sound('star', i);
            await sleep(380);
        }
        if (meter) {
            if (skipped) return;
            q('[data-meter]').innerHTML = starMeterHtml(meter);
            q('[data-meter]').classList.add('enter');
            await sleep(450);
        }
        if (baseFunding > 0) {
            if (skipped) return;
            q('[data-award]').innerHTML = lineHtml(awardLine);
            sound('line');
            await sleep(330);
        }
        // 4. Funding counts up.
        const totalEl = q('[data-total]');
        const frames = 24;
        for (let f = 1; f <= frames; f++) {
            if (skipped) return;
            totalEl.textContent = `+${Math.round((totalFunding * f) / frames)}`;
            if (f % 4 === 0) sound('coin');
            await sleep(30);
        }
        // 5. Prize boxes drop in.
        for (const c of chests) {
            if (skipped) return;
            q('[data-prizes]').insertAdjacentHTML('beforeend', prizeCardHtml(c));
            sound('prize');
            await sleep(500);
        }
        if (!skipped) {
            skipped = true;
            el.removeEventListener('click', skip);
            finish();
        }
    }

    if (reduce) {
        skipped = true;
        finish();
    } else {
        run();
    }
    return { skip };
}

