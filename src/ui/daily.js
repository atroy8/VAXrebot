// Daily puzzle UI (wide audience round): the Daily button on the home
// screen and the share box on the results. DOM only; the puzzle, the streak
// and the share text are pure (src/sim/daily.js).
import './meta.css';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// '2026-11-25' -> 'Nov 25'
export function shortDate(dateStr) {
    const [, m, d] = String(dateStr).split('-').map(Number);
    return MONTHS[m - 1] ? `${MONTHS[m - 1]} ${d}` : String(dateStr);
}

// Text for the Daily button. status comes from dailyStatus().
export function dailyButtonText(dateStr, status = {}) {
    const streak = status.streak > 0 ? `, streak ${status.streak}` : '';
    return { title: `Daily ${shortDate(dateStr)}`, sub: status.done ? `Done${streak}` : `New puzzle${streak}`, done: !!status.done };
}

// The Daily button, mounted once on the home screen (start page and map).
export function mountDailyButton(host, { onPlay } = {}) {
    if (!host || typeof document === 'undefined') return null;
    let btn = document.getElementById('daily-btn');
    if (!btn) {
        btn = document.createElement('button');
        btn.type = 'button';
        btn.id = 'daily-btn';
        btn.className = 'daily-btn';
        btn.innerHTML = '<span class="daily-btn-title"></span><span class="daily-btn-sub"></span>';
        btn.addEventListener('click', () => btn._onPlay && btn._onPlay());
        host.appendChild(btn);
    }
    btn._onPlay = onPlay;
    return btn;
}

export function refreshDailyButton(dateStr, status) {
    const btn = typeof document !== 'undefined' && document.getElementById('daily-btn');
    if (!btn) return;
    const t = dailyButtonText(dateStr, status);
    btn.querySelector('.daily-btn-title').textContent = t.title;
    btn.querySelector('.daily-btn-sub').textContent = t.sub;
    btn.classList.toggle('done', t.done);
    btn.setAttribute('aria-label', `${t.title}. ${t.sub}`);
}

const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// Share box for the results. counted: this was the attempt that counts.
export function dailyResultMarkup({ text, counted, streak = 0 }) {
    const note = counted ? (streak > 0 ? `Streak: ${streak} day${streak === 1 ? '' : 's'}. Come back tomorrow for a new one.` : 'That was today\'s attempt. Replay as often as you like for practice.') : 'Practice run. Your first attempt today is the one that counts.';
    return `<div class="daily-result">
        <strong class="daily-result-title">Daily puzzle</strong>
        <p class="daily-result-note">${esc(note)}</p>
        <pre class="daily-share-text" id="daily-share-text">${esc(text)}</pre>
        <button type="button" class="btn btn--secondary daily-share-btn" data-meta="share">Share</button>
        <span class="daily-share-status" role="status"></span>
    </div>`;
}

// Share with the system sheet when there is one, the clipboard otherwise.
// Returns 'shared' | 'copied' | 'failed'. `nav` is injectable for tests.
export async function shareText(text, nav = typeof navigator !== 'undefined' ? navigator : null) {
    if (!nav) return 'failed';
    if (typeof nav.share === 'function') {
        try {
            await nav.share({ text });
            return 'shared';
        } catch (err) {
            if (err && err.name === 'AbortError') return 'failed';
            // Fall through to the clipboard when sharing is not allowed here.
        }
    }
    try {
        if (nav.clipboard && typeof nav.clipboard.writeText === 'function') {
            await nav.clipboard.writeText(text);
            return 'copied';
        }
    } catch {
        // Clipboard blocked: the text stays on screen to copy by hand.
    }
    return 'failed';
}

export const SHARE_STATUS = Object.freeze({ shared: 'Shared.', copied: 'Copied. Paste it anywhere.', failed: 'Could not share here. Press and hold the text to copy it.' });
