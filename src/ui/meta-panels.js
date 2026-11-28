// Meta-game panels (wide audience round): bonus goals on the briefing and
// the results, the Gentle mode offer, and the permanent upgrades in the
// shop sheet. DOM only, plain data in. The markup builders are pure and
// tested; the render functions just place them.
import './meta.css';
import { UPGRADES } from '../config/upgrades.js';
import { GOAL_FUNDING, goalsFor, goalPips } from '../sim/goals.js';
import { clearBadge } from '../meta.js';

const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// ---- Bonus goals ------------------------------------------------------------

// One short row for the briefing: up to three checkboxes. `done` holds the
// ids already completed on this level. gentle adds a small "Gentle" tag.
export function briefingGoalsMarkup(goals = [], done = [], { gentle = false } = {}) {
    if (!goals.length && !gentle) return '';
    const set = new Set(done);
    const chips = goals
        .map((g) => `<span class="goal-chip${set.has(g.id) ? ' done' : ''}" title="${esc(g.label)}"><span class="goal-box" aria-hidden="true">${set.has(g.id) ? '✓' : ''}</span>${esc(g.short)}</span>`)
        .join('');
    const tag = gentle ? '<span class="goal-chip gentle-tag" title="Gentle mode is on">Gentle</span>' : '';
    const label = goals.length ? `Bonus goals: ${goals.map((g) => `${g.label}${set.has(g.id) ? ' (done)' : ''}`).join(', ')}` : 'Gentle mode is on';
    return `<div class="goal-row" role="group" aria-label="${esc(label)}">${chips}${tag}</div>`;
}

export function renderBriefingGoals(goals, done, opts) {
    const el = document.getElementById('briefing-goals');
    if (!el) return;
    const html = briefingGoalsMarkup(goals, done, opts);
    el.innerHTML = html;
    el.hidden = !html;
}

// Ticks for the results: `checked` is [{ id, label, met }], `fresh` the ids
// that paid funding this time, `saved` the ids completed on earlier plays.
export function resultsGoalsMarkup(checked = [], fresh = [], saved = []) {
    if (!checked.length) return '';
    const paid = new Set(fresh);
    const before = new Set(saved);
    const rows = checked
        .map((g) => {
            const state = g.met ? 'met' : before.has(g.id) ? 'earlier' : 'open';
            const mark = g.met ? '✓' : before.has(g.id) ? '✓' : '';
            const note = paid.has(g.id) ? `<span class="goal-pay">+${GOAL_FUNDING} gold</span>` : state === 'earlier' ? '<span class="goal-note">done before</span>' : '';
            return `<li class="goal-line ${state}"><span class="goal-box" aria-hidden="true">${mark}</span><span class="goal-text">${esc(g.label)}</span>${note}</li>`;
        })
        .join('');
    return `<strong class="goal-title">Bonus goals</strong><ul class="goal-list">${rows}</ul>`;
}

export function renderResultsGoals(checked, fresh, saved) {
    const el = document.getElementById('results-goals');
    if (!el) return;
    const html = resultsGoalsMarkup(checked, fresh, saved);
    el.innerHTML = html;
    el.hidden = !html;
}

// One short addition to a level's line on the map: goal pips and how it
// was cleared, for example " Goals: ●●○ Standard clear".
export function levelMetaLine(level, save) {
    const parts = [];
    if (goalsFor(level).length) parts.push(`Goals: ${goalPips(level, (save.goals && save.goals[level.id]) || [])}`);
    const badge = clearBadge(save.levels && save.levels[level.id]);
    if (badge === 'standard') parts.push('Standard clear');
    else if (badge === 'gentle') parts.push('Gentle clear');
    return parts.length ? ` ${parts.join(' · ')}` : '';
}

// ---- Gentle mode offer (results, after two losses in a row) -----------------

export function gentleOfferMarkup() {
    return `<div class="gentle-offer" role="note">
        <strong>Want a gentler outbreak?</strong>
        <p>Gentle mode slows the spread a little and gives one extra use of each tool every day. Stars still count. You can switch it off in Settings.</p>
        <button type="button" class="btn btn--primary" data-meta="gentle-on">Turn on Gentle mode</button>
    </div>`;
}

// ---- Permanent upgrades in the shop sheet -----------------------------------

export function upgradesMarkup({ funding = 0, owned = [] } = {}) {
    const set = new Set(owned);
    const cards = UPGRADES.map((u) => {
        const has = set.has(u.id);
        const can = !has && funding >= u.cost;
        return `<div class="upgrade-card${has ? ' owned' : ''}">
            <div class="upgrade-icon" aria-hidden="true">${u.icon}</div>
            <div class="upgrade-info"><div class="upgrade-name">${esc(u.name)}</div><div class="upgrade-effect">${esc(u.effect)}</div></div>
            ${has ? '<span class="upgrade-owned">Owned</span>' : `<button type="button" class="upgrade-buy" data-upgrade="${u.id}" ${can ? '' : 'disabled'}>${u.cost} gold</button>`}
        </div>`;
    }).join('');
    return `<h3>Field kit</h3>
        <p class="upgrade-sub">Buy once, keep for good. Each one starts working on your next level.</p>
        ${cards}
        <div class="upgrade-msg" role="status"></div>`;
}

// Renders (or re-renders) the upgrades section inside the shop sheet body.
export function renderUpgrades(host, { funding, owned, onBuy }) {
    if (!host) return null;
    let el = host.querySelector('#upgrade-shop');
    if (!el) {
        el = document.createElement('section');
        el.id = 'upgrade-shop';
        el.className = 'upgrade-shop';
        el.setAttribute('aria-label', 'Permanent upgrades');
        el.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-upgrade]');
            if (btn && !btn.disabled && el._onBuy) el._onBuy(btn.dataset.upgrade);
        });
        host.appendChild(el);
    }
    el._onBuy = onBuy;
    el.innerHTML = upgradesMarkup({ funding, owned });
    return el;
}

export function showUpgradeMessage(host, text, isError = false) {
    const msg = host && host.querySelector('.upgrade-msg');
    if (!msg) return;
    msg.textContent = text;
    msg.classList.toggle('error', !!isError);
}
