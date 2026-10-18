// "Cases averted" card on the results screen. Markup is a pure function so it
// can be tested without a browser; renderAverted puts it on the page.
//
// Two bars on one scale: the no-response outbreak and the player's outbreak.
// On a loss only the baseline shows, because the round ended early at the cap.

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export function avertedMarkup({ summary, actual, baseline, population }) {
    if (!summary) return '';
    const pct = (n) => `${Math.max(2, Math.min(100, Math.round((n / population) * 100)))}%`;
    const win = summary.averted != null && summary.averted > 0;
    const bars = win
        ? `<div class="averted-bars" aria-hidden="true">
            <div class="averted-row"><span class="averted-label">No response</span><span class="averted-track"><span class="averted-bar averted-bar--base" style="--w:${pct(baseline)}"></span></span><span class="averted-num">${baseline}</span></div>
            <div class="averted-row"><span class="averted-label">You</span><span class="averted-track"><span class="averted-bar averted-bar--you" style="--w:${pct(actual)}"></span></span><span class="averted-num">${actual}</span></div>
        </div>`
        : '';
    const big = win ? `<span class="averted-kicker">How health teams score a response</span><strong class="averted-big">${summary.averted} ${summary.averted === 1 ? 'case' : 'cases'} averted</strong>` : '';
    return `${big}${bars}<p class="averted-text">${esc(summary.text)}</p>`;
}

export function renderAverted(el, data) {
    if (!el) return;
    const html = avertedMarkup(data);
    el.innerHTML = html;
    el.hidden = !html;
}
