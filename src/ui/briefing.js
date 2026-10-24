import { toolkitCard } from '../config/toolkits.js';

// Briefing screen. There is no difficulty picker any more: each play rolls
// its own threat (src/config/difficulty-roll.js) and the briefing shows it
// as one to five pips plus a plain line about how fast it is spreading.

export function fillBriefing(scenario) {
    document.getElementById('briefing-title').textContent = scenario.name;
    document.getElementById('briefing-description-text').textContent = scenario.description;
    document.getElementById('briefing-disease').textContent = scenario.diseaseName;
    document.getElementById('briefing-agent').textContent = scenario.agent;
    document.getElementById('briefing-vector').textContent = scenario.vector;
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

// Puzzle callout (round 14): a short card under the lesson on puzzle levels,
// built on demand so the briefing markup stays unchanged. null hides it.
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

export function toolkitMarkup(toolkit) {
    const card = toolkitCard(toolkit);
    if (!card) return '';
    const chips = card.tools
        .map((t) => `<span class="kit-chip" style="--kit-color:${KIT_COLORS[t] || '#64748b'}">${esc(t)}${card.firstDay.includes(t) ? '<small>day 1</small>' : ''}</span>`)
        .join('');
    return `<strong class="kit-title">${esc(card.title)}</strong><div class="kit-chips">${chips}</div><p class="kit-why">${esc(card.why)}</p>`;
}

export function showToolkit(toolkit) {
    const el = document.getElementById('briefing-toolkit');
    if (!el) return;
    const html = toolkitMarkup(toolkit);
    el.innerHTML = html;
    el.hidden = !html;
}
