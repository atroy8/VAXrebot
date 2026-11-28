// The one sentence at the top of the results screen.
//
// The results used to open with a score bar, pills, bins, six numbers and a
// real world fact all at once. They now lead with the outcome, the stars and
// ONE line: the single most useful thing to know. Round 57: that is how the
// run went against par, the best possible play on this exact web ("Best
// possible was 4 cases. You had 5."), which replaces the old "finish 1 day
// sooner" advice. A loss says the same, and the Show best play button under
// it shows how. Without a par (a web that was not dealt) the old lines
// remain. Everything else is in Details. Pure text.
import { UNUSED_ACTIONS_NUDGE } from '../config/lessons.js';
import { parResultLine } from './par-text.js';

// What to try next after a loss, by the level's lesson. One short sentence
// each, an instruction and not a diagnosis (the long form is in Details).
export const TRY_NEXT = Object.freeze({
    'act-early': 'Next time, spend every action on day 1.',
    isolation: 'Next time, quarantine the sick before they reach their neighbors.',
    hubs: 'Next time, deal with the people who have the most lines first.',
    'keep-r-below-1': 'Next time, keep cutting red lines until R drops below 1.',
    'herd-immunity': 'Next time, vaccinate early and spread the doses around.',
    'cut-bridges': 'Next time, cut the few lines that join one group to the next.',
    'ring-vaccination': 'Next time, vaccinate the people right next to the sick.',
    layers: 'Next time, use every tool you have, every day.',
    'flatten-curve': 'Next time, cut red lines early so fewer people fall sick each night.',
    'super-spreaders': "Next time, cut the carrier's lines to the people with the most contacts first.",
    'protect-vulnerable': 'Next time, vaccinate the Envoy and the people around them first.',
    'contact-tracing': 'Next time, follow each red line from a sick person and cut it.',
    'hidden-carriers': 'Next time, test the contacts of the sick on day 1 and isolate a carrier at once.',
    masks: 'Next time, mask the sick to buy a day, then cut their lines.',
    'keep-it-open': 'Next time, guard the hub with cuts and isolation around it.',
    'borders-leak': 'Next time, isolate sick travellers before they move on.',
});

export const HEADLINES = Object.freeze({
    win: 'You stopped the spread.',
    perfect: 'Top marks! Everyone made it.',
    perfectNearly: 'Top marks! Nearly everyone made it.',
    envoy: 'Next time, vaccinate the Envoy and the people around them first.',
    burnout: 'It faded on its own, so use your tools next time to earn the win.',
    deaths: 'Next time, isolate the sick sooner so fewer people are lost.',
    loss: 'Next time, act on day 1 and cut the red lines around the sick first.',
    timeout: 'Time ran out, so act earlier next time.',
});

// outcome: 'contained' | 'overwhelmed' | 'envoy-lost' | 'burnout' | other.
// stats: the run's stats (stats.par is the deal's par, when it was dealt).
// meter: starProgress() result on a win (star-meter.js), or null.
// lessonId: the level's lesson. unusedActions: actions left over at day ends.
// caseCap tells a loss at the case cap from a loss to deaths.
export function resultsHeadline({ outcome, meter = null, lessonId = null, unusedActions = null, stats = null, caseCap = Infinity } = {}) {
    const par = stats && stats.par ? stats.par : null;
    const against = par ? parResultLine({ outcome, cases: stats.totalInfected, deaths: stats.totalDead, powerUps: stats.powerUpsUsed || 0 }, par) : '';
    if (outcome === 'contained') {
        if (against) return against;
        if (!meter) return HEADLINES.win;
        return HEADLINES.perfect;
    }
    if (outcome === 'burnout') return HEADLINES.burnout;
    if (outcome === 'envoy-lost') return par ? `The Envoy fell ill. The best play keeps the Envoy well and stops it at ${par.cases} ${par.cases === 1 ? 'case' : 'cases'}.` : HEADLINES.envoy;
    if (against) return against;
    if (outcome !== 'overwhelmed') return HEADLINES.timeout;
    // The most common way to lose early levels is to end days with actions
    // still in hand, so that comes first when it applies.
    if (unusedActions != null && unusedActions >= UNUSED_ACTIONS_NUDGE) {
        return `Next time, use every action each day: ${unusedActions} went unused.`;
    }
    const hitCap = !stats || !Number.isFinite(caseCap) || (stats.totalInfected || 0) >= caseCap;
    if (!hitCap) return HEADLINES.deaths;
    return TRY_NEXT[lessonId] || HEADLINES.loss;
}
