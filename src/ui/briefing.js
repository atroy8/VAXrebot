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
