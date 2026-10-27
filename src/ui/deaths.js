// Item 20 (round 24): words for deaths. Pure (no DOM) so tests can read it.
// Tone: gentle and plain. A death is a loss to notice, never a joke or gore.
import { oneIn, TREATED_FACTOR } from '../sim/fatality.js';

// Toast for a death during play. The first one in a level teaches the rule.
export function deathToast({ count = 1, firstThisLevel = false, inWard = false }) {
    const who = count === 1 ? 'Someone did not survive.' : `${count} people did not survive.`;
    if (!firstThisLevel) return who;
    if (inWard) return `${who} Even with care, some cases are fatal.`;
    return `${who} Sick people in a ward get care and are half as likely to die.`;
}

// Briefing line: how deadly the disease is for real.
export function briefingCfr(scenario) {
    if (!scenario || scenario.realCfr == null) return '';
    return `${oneIn(scenario.realCfr)} cases`;
}

// Results lines under the numbers. Returns [] or up to three short lines.
export function resultsDeathLines({ outcome, stats, scenario, fatalityRate }) {
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
    if (scenario && scenario.cfrNote) {
        const game = fatalityRate != null ? ` Here the odds are raised to ${oneIn(fatalityRate)} so every life counts on a small web, and ${oneIn(fatalityRate * TREATED_FACTOR)} with ward care.` : '';
        lines.push(`For real: ${scenario.cfrNote}${game}`);
    }
    return lines;
}
