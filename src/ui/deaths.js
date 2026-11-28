// Item 20 (round 24): words for deaths. Pure (no DOM) so tests can read it.
// Tone: gentle and plain. A death is a loss to notice, never a joke or gore.
import { oneIn } from '../sim/fatality.js';
import { listPeople } from '../config/people-names.js';

// Toast for a death during play. The first one in a level teaches the rule.
// names (wide audience pass): who they were ("Aiko the baker"), when known.
export function deathToast({ count = 1, firstThisLevel = false, inWard = false, names = [] }) {
    const named = names.length > 0 && names.length === count ? listPeople(names, 2) : '';
    const who = named ? `${named} did not survive.` : count === 1 ? 'Someone did not survive.' : `${count} people did not survive.`;
    if (!firstThisLevel) return who;
    // Round 57: only frail people (the heart mark) can be lost, and only
    // outside a ward, so the first loss says exactly how to prevent the next.
    if (inWard) return who;
    return `${who} Frail people are lost on their third night sick. Quarantine saves them.`;
}

// How deadly the disease is for real. The briefing no longer shows it (the
// story names an invented strain there); it lives on the Based on card.
export function briefingCfr(scenario) {
    if (!scenario || scenario.realCfr == null) return '';
    return `${oneIn(scenario.realCfr)} cases`;
}

// Round 49: the real disease's R0 ('' when there is no well-known figure).
export function briefingRealR0(scenario) {
    return scenario && scenario.realR0 ? String(scenario.realR0) : '';
}

// Results lines under the numbers. Returns [] or up to three short lines.
// lostNames: the people lost during play, by name, remembered in one line.
// The real disease's facts moved to basedOnCard below.
export function resultsDeathLines({ outcome, stats, lostNames = [] }) {
    const lines = [];
    const dead = stats.totalDead || 0;
    const after = stats.aftermathDead || 0;
    if (after > 0) {
        lines.push(
            after === 1
                ? '1 more person who was still sick when the outbreak got away did not survive.'
                : `${after} more people who were still sick when the outbreak got away did not survive.`
        );
    }
    if (outcome === 'contained' && dead === 0) lines.push('Nobody died. Every person in this town made it.');
    if (lostNames.length > 0) lines.unshift(`We remember ${listPeople(lostNames, 3)}.`);
    return lines;
}

// ---- Story framing (wide audience pass) ------------------------------------
// Inside the story every disease is an invented Blightborne strain; the real
// disease it is modelled on is named afterwards, with its real facts.

// What the briefing's Disease Profile shows: the strain and how it behaves.
export function briefingStrain(scenario) {
    if (!scenario) return { name: '', traits: '' };
    return { name: scenario.strainName || scenario.diseaseName || '', traits: scenario.strainTraits || '' };
}

// The R card's real R0 line, saying which real disease the strain stands for.
export function realR0NoteFor(scenario) {
    if (!scenario || !scenario.r0Note) return '';
    if (!scenario.strainName || !scenario.basedOn) return scenario.r0Note;
    return `${scenario.strainName} is based on ${scenario.basedOn}. ${scenario.r0Note}`;
}

// How the game differs from the real disease, said honestly (round 57).
// Real outbreaks involve chance; the game shows the worst case so a plan
// can be made, and marks in advance who is in danger.
export const WORST_CASE_LINE = 'Real outbreaks involve chance: not every contact catches it, and nobody knows in advance who will. This game shows the worst case, where every contact does, so you can plan.';
export function gameOddsLine(fatalityRate, gentle = false) {
    if (fatalityRate == null) return '';
    if (gentle) return 'In the game only the people with a heart mark can be lost, and ward care always saves them. For real, care lowers the risk but cannot remove it.';
    return `In the game the people with a heart mark stand for the ${oneIn(fatalityRate)} who would be in danger on a small web. Ward care always saves them here; for real it lowers the risk but cannot remove it.`;
}

// The results' Based on card: { title, lines[] }, or null without a real
// disease. Every fact comes unchanged from src/config/scenarios.js.
export function basedOnCard({ scenario, fatalityRate = null, gentle = false } = {}) {
    if (!scenario || !scenario.basedOn) return null;
    const strain = scenario.strainName || 'This strain';
    const lines = [`${strain} is invented. It spreads the way ${scenario.basedOn} does, and that is real.`];
    if (scenario.cfrNote) lines.push(`For real: ${scenario.cfrNote}`);
    if (scenario.r0Note) lines.push(scenario.r0Note);
    lines.push(scenario.vaccine ? `The real vaccine: ${scenario.vaccine}.` : `No vaccine for ${scenario.basedOn} is licensed yet.`);
    lines.push(WORST_CASE_LINE);
    const odds = gameOddsLine(fatalityRate, gentle);
    if (odds) lines.push(odds);
    return { title: `Based on: ${scenario.basedOn}`, lines };
}
