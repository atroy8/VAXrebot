// Story pieces on the briefing and the results (wide audience pass): the
// mentor's one line with her portrait, and the Based on card that names the
// real disease behind the level's invented strain. The words come from pure
// modules (src/config/mentor.js, src/ui/deaths.js); this file only fills
// #briefing-mentor, #results-mentor and #results-based-on. Styles: story.css.
import './story.css';
import { MENTOR, mentorBriefingLine, mentorResultLine } from '../config/mentor.js';
import { basedOnCard } from './deaths.js';
import { lookFaceUrl } from './people.js';

const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// Markup for one mentor line. portraitUrl '' leaves just the name label.
export function mentorMarkup(line, portraitUrl = '') {
    if (!line) return '';
    const face = portraitUrl ? `<img class="mentor-face" src="${esc(portraitUrl)}" alt="" width="44" height="44" decoding="async" draggable="false">` : '';
    return `${face}<p class="mentor-say"><strong class="mentor-name">${esc(MENTOR.short)}</strong> <span class="mentor-text">${esc(line)}</span></p>`;
}

// Markup for the Based on card (a <details>): the real disease is in the
// summary, its facts open underneath.
export function basedOnMarkup(card) {
    if (!card) return '';
    return `<summary class="based-on-title">${esc(card.title)}</summary>${card.lines.map((l) => `<p class="based-on-line">${esc(l)}</p>`).join('')}`;
}

function mentorPortrait() {
    try {
        return lookFaceUrl(MENTOR.look, 'healthy', 'idle');
    } catch {
        return ''; // the name label alone still reads fine
    }
}

function fill(id, html) {
    const el = typeof document !== 'undefined' ? document.getElementById(id) : null;
    if (!el) return;
    el.innerHTML = html;
    el.hidden = !html;
    if (el.tagName === 'DETAILS') el.open = false;
}

// Briefing: the mentor's line for this level.
export function storyBriefing(level) {
    fill('briefing-mentor', level ? mentorMarkup(mentorBriefingLine(level.id), mentorPortrait()) : '');
}

// The first planet frames deaths gently for new players.
export function isGentleLevel(level) {
    return !!level && level.planetIndex === 0;
}

// Results: the mentor reacts to how it went, and the Based on card names
// the real disease. stats needs daysUsed; caseCap and parDays sharpen the
// mentor's read of a narrow loss or a slow win.
export function storyResults({ level = null, outcome, stats = {}, scenario = null, fatalityRate = null, caseCap = Infinity, parDays = 0 } = {}) {
    const said = mentorResultLine(level?.id, outcome, { ...stats, caseCap, parDays });
    fill('results-mentor', mentorMarkup(said.line, mentorPortrait()));
    fill('results-based-on', basedOnMarkup(basedOnCard({ scenario, fatalityRate, gentle: isGentleLevel(level) })));
}
