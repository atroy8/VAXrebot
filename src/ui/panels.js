// DOM rendering for the game screen chrome: header stats, tools panel,
// action log, toast notifications, and the game-over stats screen.
// No game logic here; callers pass plain data.
import { formatR, rTone, rExplainer, rScalePos } from './game-screen-model.js';
import { spriteFor } from '../sprites.js';
import { toolChips, lossReason } from './game-screen-model.js';
import { threatPipsHtml } from './briefing.js';

// Small inline icons for the tool tray (no emoji on the game screen).
const ICONS = {
    vaccinate:
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" d="M17 3l4 4M19 5l-9.5 9.5M14 6l4 4M7 13l4 4M5.5 18.5L3 21M8.5 11.5l-3 3 3 3 3-3"/></svg>',
    quarantine:
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round" d="M4 11l8-7 8 7v9H4z"/><path fill="currentColor" d="M10 14h4v6h-4z"/></svg>',
    severLink:
        '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="18" r="3" fill="none" stroke="currentColor" stroke-width="2.4"/><circle cx="18" cy="18" r="3" fill="none" stroke="currentColor" stroke-width="2.4"/><path fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" d="M8 16L17 4M16 16L7 4"/></svg>',
    powerUp:
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M13 2L4 14h7l-1 8 9-12h-7z"/></svg>',
    shop:
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" d="M4 7h16l-1.5 12h-13zM9 7a3 3 0 0 1 6 0"/></svg>',
};
const TOOL_COLORS = { vaccinate: '#7c3aed', quarantine: '#f97316', severLink: '#0ea5e9' };

export function renderHeader({ scenarioName, difficultyName, difficultyId, threatPips = null, day, infected, protected: protectedCount, population, paused = false, cases = null, caseCap = Infinity, r = null, actionsLeft = null, deaths = 0 }) {
    document.getElementById('game-scenario-name').textContent = scenarioName;
    const badge =
        threatPips != null
            ? `<span class="threat-badge" aria-label="Threat ${threatPips} of 5">${threatPipsHtml(threatPips)}</span>`
            : `<span class="difficulty-badge ${difficultyId}">${difficultyName}</span>`;
    document.getElementById('current-difficulty-badge').innerHTML = badge;

    // Clear paused indicator: the day stat reads "N (Paused)" while paused.
    document.getElementById('current-day').textContent = day; // the pause card says Paused
    document.getElementById('infected-count').textContent = infected;
    document.getElementById('protected-count').textContent = protectedCount;
    document.getElementById('population-count').textContent = population;

    // Case cap meter: total cases so far against the cap that ends the run.
    const capEl = document.getElementById('case-meter');
    if (capEl && cases != null) {
        const finite = Number.isFinite(caseCap);
        capEl.querySelector('.case-meter-value').textContent = finite ? `${cases}/${caseCap}` : String(cases);
        const share = finite ? Math.min(1, cases / caseCap) : 0;
        capEl.style.setProperty('--fill', String(share));
        capEl.classList.toggle('warn', share >= 0.7);
    }
    // Effective R: above 1 the outbreak grows, below 1 it shrinks.
    const rEl = document.getElementById('r-value');
    if (rEl) {
        rEl.textContent = formatR(r);
        const tone = rTone(r);
        rEl.classList.toggle('r-up', tone === 'up');
        rEl.classList.toggle('r-down', tone === 'down');
    }
    const aEl = document.getElementById('actions-left');
    if (aEl && actionsLeft != null) aEl.textContent = actionsLeft;
    // Item 20: deaths so far, shown once someone has died.
    const lost = document.getElementById('lost-stat');
    if (lost) {
        const was = Number(document.getElementById('deaths-count').textContent) || 0;
        lost.hidden = !(deaths > 0);
        document.getElementById('deaths-count').textContent = deaths;
        if (deaths > was) {
            lost.classList.remove('lost-new');
            void lost.offsetWidth;
            lost.classList.add('lost-new');
        }
    }
}

// Bottom tool tray: one button per tool plus a Shop button. Power-ups with
// no charges stay tappable ('empty') so a tap can open the shop.
export function renderTools(tools, difficulty, day, dailyUsage, { charges = {}, funding = null, selected = null } = {}) {
    const toolsList = document.getElementById('tools-list');
    const chips = toolChips(tools, difficulty, day, dailyUsage, charges);
    const html = chips
        .map((c) => {
            const cls = ['tool-item', c.state === 'locked' || c.state === 'spent' || c.state === 'off' ? 'disabled' : '', c.state === 'off' ? 'off' : '', c.state === 'empty' ? 'empty' : '', selected === c.id ? 'selected' : '']
                .filter(Boolean)
                .join(' ');
            const color = c.color || TOOL_COLORS[c.id] || '#64748b';
            const icon = ICONS[c.id] || ICONS.powerUp;
            return `<button type="button" class="${cls}" data-tool="${c.id}" aria-pressed="${selected === c.id}" ${c.state === 'locked' || c.state === 'spent' || c.state === 'off' ? 'aria-disabled="true"' : ''}>
                    <span class="tool-icon" style="--tool-color:${color}">${icon}</span>
                    <span class="tool-text"><span class="tool-name">${c.label}</span><span class="tool-usage">${c.usage}</span></span>
                </button>`;
        })
        .join('');
    const shop = `<button type="button" class="tool-item shop-chip" data-tool="shop">
            <span class="tool-icon">${ICONS.shop}</span>
            <span class="tool-text"><span class="tool-name">Shop</span><span class="tool-usage">${funding == null ? 'Power-ups' : `${funding} funds`}</span></span>
        </button>`;
    toolsList.innerHTML = html + shop;
}

// One-line hint over the network for the selected tool; empty hides it.
export function showToolHint(text) {
    const el = document.getElementById('tool-hint');
    if (!el) return;
    el.textContent = text || '';
    el.hidden = !text;
    // Round 29: the newest message wins the bottom of the web. Picking a
    // tool means the player has moved on, so toasts still showing fade out
    // instead of sitting on top of the hint.
    if (text) dismissToasts();
    // The hint teaches once, then gets out of the way of the network.
    clearTimeout(showToolHint.timer);
    if (text) showToolHint.timer = setTimeout(() => { el.hidden = true; }, 4500);
}

// Round 29: a toast and the tool hint share the bottom of the web on phones,
// so whichever came second covered the other and left half a sentence
// showing behind it. A toast now clears the hint, and a hint clears toasts.
export function hideToolHint() {
    const el = document.getElementById('tool-hint');
    if (!el) return;
    clearTimeout(showToolHint.timer);
    el.hidden = true;
}

// Fade out every toast still on screen (see showToolHint).
export function dismissToasts() {
    const container = document.getElementById('notification-container');
    if (!container) return;
    for (const n of [...container.children]) {
        if (n.dataset.leaving) continue;
        clearTimeout(n._timer);
        n.dataset.leaving = '1';
        n.style.animation = 'fadeOutRight 0.25s forwards';
        setTimeout(() => n.remove(), 250);
    }
}

// Day banner (replaces the old text log): one line, fades on its own.
export function showDayBanner({ text, tone = 'calm' }) {
    const el = document.getElementById('day-banner');
    if (!el) return;
    el.hidden = true;
    el.className = `day-banner ${tone}`;
    el.textContent = text;
    // Restart the CSS animation on every day.
    void el.offsetWidth;
    el.hidden = false;
    clearTimeout(showDayBanner.timer);
    showDayBanner.timer = setTimeout(() => {
        el.hidden = true;
    }, 1900);
}

// The text log is gone from the game screen (item 7). Kept as a safe no-op
// so older callers and power-ups keep working; it writes only if a log
// container exists (none in the current markup).
export function addLogEntry(day, message, important = false) {
    const logContainer = document.getElementById('log-entries');
    if (!logContainer) return;
    const entry = document.createElement('div');
    entry.className = `log-entry ${important ? 'important' : ''}`;
    entry.innerHTML = `<span class="log-time">Day ${day}</span> <span class="log-message">${message}</span>`;
    logContainer.prepend(entry);
    if (logContainer.children.length > 50) {
        logContainer.removeChild(logContainer.lastChild);
    }
}

// Toasts: plain text (emoji stripped), an identical toast already on screen
// is refreshed instead of stacked, and at most two show at once.
export function showNotification(message, type = 'info') {
    const container = document.getElementById('notification-container');
    if (!container) return;
    const text = String(message).replace(/[\p{Extended_Pictographic}\ufe0f\u200d]\s*/gu, '').trim();
    hideToolHint();
    let notification = [...container.children].find((n) => n.textContent === text && !n.dataset.leaving);
    if (!notification) {
        notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = text;
        container.appendChild(notification);
        while (container.children.length > 2) container.firstChild.remove();
    }
    clearTimeout(notification._timer);
    notification._timer = setTimeout(() => {
        notification.dataset.leaving = '1';
        notification.style.animation = 'fadeOutRight 0.5s forwards';
        setTimeout(() => notification.remove(), 500);
    }, 3000);
}

export function renderGameOver({ outcome, stats, difficultyId, threatPips = null, stars = 0, fundingEarned = 0, livesSaved = 0, caseCap = Infinity, tally = false, deathLines = [] }) {
    const attackRate = stats.initialPopulation > 0 ? (stats.totalInfected / stats.initialPopulation) * 100 : 0;
    const caseFatalityRate = stats.totalInfected > 0 ? (stats.totalDead / stats.totalInfected) * 100 : 0;

    // Distinct copy per outcome. 'overwhelmed' is the loss: deaths reached the
    // loss threshold and overwhelmed the response. 'burnout' is neutral: the
    // virus faded on its own because the player never intervened. Keep copy
    // plain, no em dashes.
    const title =
        outcome === 'contained'
            ? 'Outbreak Contained!'
            : outcome === 'overwhelmed'
              ? 'Outbreak Overwhelmed'
              : outcome === 'envoy-lost'
                ? 'The Envoy Fell Ill'
              : outcome === 'burnout'
                ? 'Outbreak Burned Out'
                : 'Simulation Over';
    const message =
        outcome === 'contained'
            ? stats.totalDead > 0
                ? `You stopped the spread. ${stats.totalDead === 1 ? '1 person' : `${stats.totalDead} people`} did not survive, and everyone else is safe.`
                : 'Excellent work! Your strategic interventions stopped the spread.'
            : outcome === 'overwhelmed'
              ? lossReason({ totalInfected: stats.totalInfected, caseCap })
              : outcome === 'envoy-lost'
                ? 'The virus reached the Envoy and the peace talks are off. Protect the Envoy and the people around them before cases get close.'
              : outcome === 'burnout'
                ? 'The virus ran its course and faded on its own. You never intervened, so this is not a victory. Containment requires action: try a new strategy.'
                : 'The simulation period has ended. Analyze the results and try a new strategy.';

    document.getElementById('game-over-title').textContent = title;
    document.getElementById('final-total-infected').textContent = stats.totalInfected;
    document.getElementById('final-total-dead').textContent = stats.totalDead;
    document.getElementById('final-total-recovered').textContent = stats.totalRecovered;
    document.getElementById('final-attack-rate').textContent = `${attackRate.toFixed(1)}%`;
    document.getElementById('final-case-fatality').textContent = `${caseFatalityRate.toFixed(1)}%`;
    document.getElementById('people-protected').textContent = stats.totalProtected;

    document.getElementById('game-over-message').textContent = message;
    const notes = document.getElementById('final-death-notes');
    if (notes) {
        notes.replaceChildren(
            ...deathLines.map((t) => {
                const li = document.createElement('li');
                li.textContent = t;
                return li;
            })
        );
        notes.hidden = deathLines.length === 0;
    }

    // Progression rewards: stars, funding, and lives saved on a win.
    // Rendered only when provided so the pre-progression callers keep working.
    const existing = document.getElementById('game-over-rewards');
    if (existing) existing.remove();
    // A win shows the animated tally (results-tally.js) instead, with the
    // outbreak numbers folded away under a summary the player can open.
    document.getElementById('game-over-screen').classList.toggle('has-tally', !!tally);
    const statsWrap = document.getElementById('final-stats-wrap');
    if (statsWrap) statsWrap.open = !tally;
    const tallyEl = document.getElementById('results-tally');
    if (tallyEl && !tally) {
        tallyEl.hidden = true;
        tallyEl.innerHTML = '';
    }
    if (stars > 0 && !tally) {
        const rewards = document.createElement('div');
        rewards.id = 'game-over-rewards';
        rewards.className = 'game-over-rewards';
        rewards.innerHTML = `
            <div class="reward-stars">${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}</div>
            <div class="reward-line">+${fundingEarned} funding earned</div>
            <div class="reward-line">${livesSaved.toLocaleString()} lives saved in this mission</div>`;
        document.getElementById('game-over-message').after(rewards);
    }

    // Outcome hook for styling: win, loss, or neutral on the screen element.
    // Burnout is neutral (not a victory, not a defeat).
    const screen = document.getElementById('game-over-screen');
    screen.classList.remove('outcome-win', 'outcome-loss', 'outcome-timeout');
    screen.classList.add(outcome === 'contained' ? 'outcome-win' : outcome === 'overwhelmed' || outcome === 'envoy-lost' ? 'outcome-loss' : 'outcome-timeout');

    const badgeEl = document.getElementById('final-difficulty-badge');
    const played = outcome === 'contained' ? 'Completed' : 'Played';
    if (threatPips != null) {
        badgeEl.innerHTML = `${played} at threat ${threatPips} of 5 <span class="threat-badge">${threatPipsHtml(threatPips)}</span>`;
    } else {
        const badge = document.createElement('span');
        badge.className = `difficulty-badge ${difficultyId}`;
        badge.textContent = difficultyId;
        badgeEl.innerHTML = `${played} on `;
        badgeEl.appendChild(badge);
    }
}

// Network legend: one badge per node state, using the same sprites as the
// graph. Rendered once into the network panel; idempotent.
const LEGEND_ITEMS = [
    ['healthy', 'Healthy'],
    ['infected', 'Infected'],
    ['recovered', 'Recovered'],
    ['vaccinated', 'Vaccinated'],
    ['quarantined', 'Quarantined'],
    ['dead', 'Deceased'],
];

export function renderLegend() {
    const container = document.querySelector('.network-container');
    if (!container || container.querySelector('.network-legend')) return;
    const legend = document.createElement('div');
    legend.className = 'network-legend';
    legend.setAttribute('aria-label', 'Node state legend');
    legend.innerHTML = LEGEND_ITEMS.map(
        ([state, label]) =>
            `<span class="legend-item"><img src="${spriteFor(state)}" alt="${label}" width="24" height="24" loading="lazy"><span>${label}</span></span>`
    ).join('');
    container.appendChild(legend);
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'legend-toggle';
    toggle.textContent = 'Key';
    toggle.setAttribute('aria-expanded', 'false');
    toggle.addEventListener('click', () => {
        const open = legend.classList.toggle('open');
        toggle.setAttribute('aria-expanded', String(open));
        toggle.textContent = open ? 'Hide key' : 'Key';
    });
    container.appendChild(toggle);
}

// ---- R card (round 16) ------------------------------------------------------
// Tap the R stat to see what the number means today. Closes on Got it, on a
// tap outside, or when the R value changes under it.
const escapeHtml = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export function renderRCard({ r = null, r0 = '' } = {}) {
    const card = document.getElementById('r-card');
    if (!card) return null;
    const { value, headline, lines } = rExplainer({ r, r0 });
    const tone = rTone(r) || 'none';
    card.className = `r-card r-card--${tone}`;
    card.innerHTML = `<div class="r-card-top">
            <span class="r-card-value" aria-hidden="true">R ${escapeHtml(value === "–" ? "?" : value)}</span>
            <strong class="r-card-headline" id="r-card-headline">${escapeHtml(headline)}</strong>
        </div>
        ${tone === 'none' ? '' : `<div class="r-card-scale" aria-hidden="true"><span class="r-card-mark" style="--pos:${rScalePos(r)}"></span><span class="r-card-one">1</span></div>`}
        ${lines.map((l) => `<p>${escapeHtml(l)}</p>`).join('')}
        <button type="button" class="btn btn--primary r-card-close">Got it</button>`;
    return card;
}

export function openRCard(opts) {
    const card = renderRCard(opts);
    if (!card) return;
    card.hidden = false;
    document.getElementById('r-stat')?.setAttribute('aria-expanded', 'true');
}

export function closeRCard() {
    const card = document.getElementById('r-card');
    if (card) card.hidden = true;
    document.getElementById('r-stat')?.setAttribute('aria-expanded', 'false');
}

export function isRCardOpen() {
    const card = document.getElementById('r-card');
    return !!card && !card.hidden;
}
