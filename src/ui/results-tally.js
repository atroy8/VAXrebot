// Results tally after a win: the care box bins fill up face by face and count
// up, each bin's bonus lands, extras slide in, the stars pop one at a time,
// funding counts up, and any prize box this win unlocked drops in with
// confetti. Tap the tally to skip to the end. Reduced motion shows the end
// state right away.
import { faceTokenHtml } from './face-token.js';
import { starMeterHtml } from './star-meter.js';

const BIN_LOOKS = {
    treatment: { face: 'infected', label: 'Treated' },
    // Round 41: "Kept safe", the same words as the bonus line, so the bin
    // no longer reads as the sick people you isolated (those are Treated).
    isolated: { face: 'quarantined', label: 'Kept safe' },
    cured: { face: 'recovered', label: 'Cured' },
    // Round 42: people who died, shown last and in grey, with no points.
    // Treated 4 and Cured 3 left the fourth person unexplained; now the
    // tally says what happened to them, gently, the way the HUD does.
    lost: { face: 'dead', label: 'Lost', pts: 'remembered' },
};
const BIN_ORDER = ['treatment', 'isolated', 'cured', 'lost'];
const MAX_FACES = 12;

// Round 41: only the bins somebody landed in. On level 1 nobody healthy is
// isolated, and a big empty 0 box between Treated and Cured looked like a
// missed goal. Always keeps a care bin so a win never shows only a loss.
export function shownBins(bins = {}) {
    const ids = BIN_ORDER.filter((id) => ((bins || {})[id] || 0) > 0);
    return ids.some((id) => id !== 'lost') ? ids : ['cured', ...ids];
}

// Round 42: the bins that count toward funding make a tick as they fill;
// the Lost bin fills slowly and quietly.
export function binTicks(id) {
    return id !== 'lost';
}

// The bins row, empty, ready to fill. Pure so it can be tested in node.
export function tallyBinsHtml(bins, bonus) {
    const ids = shownBins(bins);
    const lineOf = (id) => (bonus?.lines || []).find((l) => l.id === id);
    return `<div class="tally-bins" style="--bins:${ids.length}">${ids
        .map(
            (id) => `
                <div class="tally-bin tally-bin--${id}" data-bin="${id}">
                    <div class="tally-faces" data-faces></div>
                    <div class="tally-count" data-count>0</div>
                    <div class="tally-label">${BIN_LOOKS[id].label}</div>
                    <div class="tally-pts" data-pts>${lineOf(id) ? `+${lineOf(id).each} each` : BIN_LOOKS[id].pts || '&nbsp;'}</div>
                </div>`
        )
        .join('')}
        </div>`;
}
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
// lead: { stars, reward } elements (results-lead.js). When given, the stars,
// the funding total and the prize boxes play there, at the top of the
// results, and `el` (inside Details) keeps the bins, the bonus lines and the
// score meter. The bins then count up the first time Details is opened.
export function playResultsTally(el, { bins, bonus, stars, baseFunding, awardLabel = '', chests = [], meter = null, sound = () => {}, lead = null }) {
    if (!el) return { skip() {} };
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const totalFunding = baseFunding + bonus.total;
    const starsHtml = `<div class="tally-stars" data-stars aria-label="${stars} of 3 stars">${'<span class="tally-star">★</span>'.repeat(3)}</div>`;
    const rewardHtml = `
        <div class="tally-total" data-total-row hidden><span class="tally-coin" aria-hidden="true"></span><span data-total>+0</span> gold</div>
        <div class="tally-prizes" data-prizes></div>`;

    el.hidden = false;
    el.classList.remove('done');
    el.innerHTML = `
        ${tallyBinsHtml(bins, bonus)}
        <ul class="tally-lines" data-lines></ul>
        ${lead ? '' : starsHtml}
        <div class="tally-meter" data-meter></div>
        <ul class="tally-lines tally-lines--award" data-award></ul>
        ${lead ? '' : rewardHtml}
        <div class="tally-skip" data-skip>Tap to skip</div>`;
    if (lead) {
        lead.stars.innerHTML = starsHtml;
        lead.reward.innerHTML = rewardHtml;
        lead.reward.classList.remove('done');
    }

    const roots = lead ? [el, lead.stars, lead.reward] : [el];
    const q = (s) => {
        for (const r of roots) {
            const hit = r.querySelector(s);
            if (hit) return hit;
        }
        return null;
    };
    // Each play owns the tally until the next one starts (a replayed level).
    const token = {};
    el._tallyToken = token;
    const stale = () => el._tallyToken !== token;
    let skipped = false;
    const skip = () => {
        if (skipped) return;
        skipped = true;
        finish();
    };
    const skipTargets = lead ? [lead.stars, lead.reward] : [el];
    for (const t of skipTargets) t.addEventListener('click', skip, { once: true });

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

    const awardLine = { id: 'award', label: awardLabel || `${stars}-star mission reward`, amount: baseFunding };

    // The part that lives in Details when the results are lean.
    function finishDetails() {
        for (const id of shownBins(bins)) fillBin(id, bins[id] || 0, false);
        for (const bin of el.querySelectorAll('[data-bin]')) bin.classList.remove('active');
        q('[data-lines]').innerHTML = bonus.lines.map(lineHtml).join('');
        q('[data-meter]').innerHTML = starMeterHtml(meter);
        q('[data-award]').innerHTML = baseFunding > 0 ? lineHtml(awardLine) : '';
        el.classList.add('done');
    }

    function finish() {
        finishDetails();
        q('[data-stars]').querySelectorAll('.tally-star').forEach((s, i) => s.classList.toggle('on', i < stars));
        q('[data-total]').textContent = `+${totalFunding}`;
        q('[data-total-row]').hidden = false;
        q('[data-prizes]').innerHTML = chests.map(prizeCardHtml).join('');
        if (lead) lead.reward.classList.add('done');
    }

    // The steps of the animation. Each stops early once off() is true.
    // 1. The bins fill face by face and count up.
    async function binsStep(off) {
        for (const id of shownBins(bins)) {
            const n = bins[id] || 0;
            const bin = q(`[data-bin="${id}"]`);
            bin.classList.add('active');
            const faces = bin.querySelector('[data-faces]');
            const countEl = bin.querySelector('[data-count]');
            const step = binTicks(id) ? Math.max(45, Math.min(140, 900 / Math.max(1, n))) : 320;
            for (let i = 0; i < n; i++) {
                if (off()) return;
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
                if (binTicks(id)) sound('tick', i);
                await sleep(step);
            }
            if (n === 0) bin.classList.add('empty');
            bin.classList.remove('active');
            if (off()) return;
            await sleep(160);
        }
    }
    // 2. Bonus lines slide in.
    async function linesStep(off) {
        const list = q('[data-lines]');
        for (const l of bonus.lines) {
            if (off()) return;
            list.insertAdjacentHTML('beforeend', lineHtml(l));
            sound('line');
            await sleep(330);
        }
    }
    // 3. Stars pop one at a time.
    async function starsStep(off) {
        const starEls = q('[data-stars]').querySelectorAll('.tally-star');
        for (let i = 0; i < stars; i++) {
            if (off()) return;
            starEls[i].classList.add('on', 'pop');
            sound('star', i);
            await sleep(380);
        }
    }
    async function meterStep(off) {
        if (!meter || off()) return;
        q('[data-meter]').innerHTML = starMeterHtml(meter);
        q('[data-meter]').classList.add('enter');
        await sleep(450);
    }
    async function awardStep(off) {
        if (!(baseFunding > 0) || off()) return;
        q('[data-award]').innerHTML = lineHtml(awardLine);
        sound('line');
        await sleep(330);
    }
    // 4. Funding counts up. Round 41: the row only appears now, so it
    // never sits at +0 funding while the bins are still filling.
    async function totalStep(off) {
        if (off()) return;
        const totalEl = q('[data-total]');
        q('[data-total-row]').hidden = false;
        q('[data-total-row]').classList.add('enter');
        const frames = 24;
        for (let f = 1; f <= frames; f++) {
            if (off()) return;
            totalEl.textContent = `+${Math.round((totalFunding * f) / frames)}`;
            if (f % 4 === 0) sound('coin');
            await sleep(30);
        }
    }
    // 5. Prize boxes drop in.
    async function prizesStep(off) {
        for (const c of chests) {
            if (off()) return;
            q('[data-prizes]').insertAdjacentHTML('beforeend', prizeCardHtml(c));
            sound('prize');
            await sleep(500);
        }
    }

    async function run() {
        await sleep(350);
        const off = () => skipped || stale();
        // Lean results: only the stars and the reward play up top.
        const steps = lead ? [starsStep, totalStep, prizesStep] : [binsStep, linesStep, starsStep, meterStep, awardStep, totalStep, prizesStep];
        for (const step of steps) {
            if (off()) return;
            await step(off);
        }
        if (!off()) {
            skipped = true;
            for (const t of skipTargets) t.removeEventListener('click', skip);
            finish();
        }
    }

    // Lean results: the bins are out of sight at first, so they are set to
    // their end state, and count up the first time Details is opened.
    function armDetailsReplay() {
        const wrap = el.closest ? el.closest('details') : null;
        if (!wrap) return;
        const onToggle = async () => {
            if (stale()) return wrap.removeEventListener('toggle', onToggle);
            if (!wrap.open) return;
            wrap.removeEventListener('toggle', onToggle);
            let stop = false;
            const off = () => stop || stale();
            el.addEventListener('click', () => { stop = true; }, { once: true });
            el.classList.remove('done');
            for (const bin of el.querySelectorAll('[data-bin]')) {
                bin.querySelector('[data-faces]').innerHTML = '';
                bin.querySelector('[data-count]').textContent = '0';
                bin.classList.remove('empty');
            }
            q('[data-lines]').innerHTML = '';
            await binsStep(off);
            if (!off()) await linesStep(off);
            if (!stale()) finishDetails();
        };
        wrap.addEventListener('toggle', onToggle);
    }

    if (reduce) {
        skipped = true;
        finish();
    } else {
        if (lead) {
            finishDetails();
            armDetailsReplay();
        }
        run();
    }
    return { skip };
}
