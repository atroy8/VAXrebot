import { toolkitCard } from '../config/toolkits.js';
import { briefingStrain } from './deaths.js';
import './briefing-lean.css';

// Briefing screen. There is no difficulty picker any more: each play rolls
// its own threat (src/config/difficulty-roll.js) and the briefing shows it
// as one to five pips plus a plain line about how fast it is spreading.

export function fillBriefing(scenario) {
    document.getElementById('briefing-title').textContent = scenario.name;
    document.getElementById('briefing-description-text').textContent = scenario.description;
    // Story framing: the profile names the invented Blightborne strain and
    // how it behaves. The real disease it is based on, with its real death
    // rate and R0, is shown after the level (basedOnCard in ./deaths.js).
    const strain = briefingStrain(scenario);
    document.getElementById('briefing-disease').textContent = strain.name;
    document.getElementById('briefing-agent').textContent = scenario.agent;
    document.getElementById('briefing-vector').textContent = scenario.vector;
    const traitsEl = document.getElementById('briefing-traits');
    if (traitsEl) traitsEl.textContent = strain.traits;
    const row = document.getElementById('briefing-traits-row');
    if (row) row.hidden = !strain.traits;
    resetBriefingMore();
}

// One screen briefing: the lesson, the disease profile and the star goal sit
// behind the More disclosure (index.html #briefing-more). Every briefing
// opens with it closed. The more-open class on the card lets the longer
// lines that live outside the <details> (why this toolkit, what the twist
// means) open along with it.
export function resetBriefingMore(doc = document) {
    const more = doc.getElementById('briefing-more');
    if (!more) return;
    const card = more.closest('.briefing-content');
    const sync = () => card?.classList.toggle('more-open', more.open);
    if (!more.dataset.bound) {
        more.dataset.bound = '1';
        more.addEventListener('toggle', sync);
    }
    more.open = false;
    sync();
}

export function threatPipsHtml(pips) {
    return Array.from({ length: 5 }, (_, i) => `<span class="threat-pip${i < pips ? ' on' : ''}"></span>`).join('');
}

export function showThreat({ pips, line, r0 = '' }) {
    const meter = document.getElementById('threat-meter');
    if (meter) {
        meter.innerHTML = threatPipsHtml(pips);
        meter.setAttribute('aria-label', `Threat ${pips} of 5`);
    }
    const text = document.getElementById('threat-line');
    if (text) text.textContent = line;
    const r0El = document.getElementById('briefing-r0');
    if (r0El) r0El.textContent = r0;
}

// Lesson card (item 5): fills #<id>, #<id>-title and #<id>-text, or hides the
// card when there is no lesson. Used by the briefing and the results screen.
export function fillLessonCard(id, title, text) {
    const card = document.getElementById(id);
    if (!card) return;
    const show = Boolean(title && text);
    card.hidden = !show;
    if (!show) return;
    document.getElementById(`${id}-title`).textContent = title;
    document.getElementById(`${id}-text`).textContent = text;
}

// Puzzle callout (round 14): a short card on puzzle levels. null hides it.
// The card is in the briefing markup now (it has to stay visible above the
// More disclosure, where the lesson went); building it on demand remains as
// a fallback for a page without it.
export function showVariantCallout(callout) {
    let card = document.getElementById('briefing-variant');
    if (!callout) {
        if (card) card.hidden = true;
        return;
    }
    if (!card) {
        card = document.createElement('div');
        card.id = 'briefing-variant';
        card.className = 'variant-card';
        card.setAttribute('role', 'note');
        card.innerHTML = '<strong class="variant-title"></strong><p class="variant-text"></p>';
        const anchor = document.getElementById('briefing-lesson');
        if (anchor) anchor.after(card);
        else document.getElementById('briefing-title')?.after(card);
    }
    card.querySelector('.variant-title').textContent = callout.title;
    card.querySelector('.variant-text').textContent = callout.text;
    card.hidden = false;
}

// Star goal (round 17): one line under the threat so players know what the
// stars reward before they start: lives kept and beating par.
export function starGoalLine({ parDays = 0, best = 0 } = {}) {
    const stars = '★'.repeat(best) + '☆'.repeat(3 - best);
    const par = parDays > 0 ? `, and every day you finish before day ${parDays} adds points` : '';
    if (best >= 3) return `Your best: ${stars}. A perfect response!`;
    return `Stars reward lives kept${par}.${best > 0 ? ` Your best: ${stars}` : ''}`;
}

export function showStarGoal(opts) {
    const el = document.getElementById('star-goal');
    if (el) el.textContent = starGoalLine(opts);
}

// Toolkit card (item 16): which tools this level offers and why, as chips in
// the tool tray's colours. Pure markup so it is unit tested.
const KIT_COLORS = { Vaccinate: '#7c3aed', Quarantine: '#f97316', Sever: '#0ea5e9' };
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export function toolkitMarkup(toolkit, variantToolDays = null) {
    const card = toolkitCard(toolkit, variantToolDays);
    if (!card) return '';
    // Each chip says the day its tool opens, the same "Day N" the tray shows.
    const chips = card.days
        .map(({ label, day }) => `<span class="kit-chip" style="--kit-color:${KIT_COLORS[label] || '#64748b'}">${esc(label)}<small>day ${day}</small></span>`)
        .join('');
    return `<strong class="kit-title">${esc(card.title)}</strong><div class="kit-chips">${chips}</div><p class="kit-why">${esc(card.why)}</p>`;
}

export function showToolkit(toolkit, variantToolDays = null) {
    const el = document.getElementById('briefing-toolkit');
    if (!el) return;
    const html = toolkitMarkup(toolkit, variantToolDays);
    el.innerHTML = html;
    el.hidden = !html;
}
