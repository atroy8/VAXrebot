// The one sentence at the top of the results screen.
//
// The results used to open with a score bar, pills, bins, six numbers and a
// real world fact all at once. They now lead with the outcome, the stars and
// ONE sentence: the single most useful thing to know. After a perfect win
// that is praise; after any other win it is the cheapest way to the next
// star; after a loss it is the one thing to try next. Everything else is in
// Details. Pure text, tested in tests/wide-firstrun-results.test.js.
import { UNUSED_ACTIONS_NUDGE } from '../config/lessons.js';

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
    'flatten-curve': 'Next time, cut red lines early so cases come more slowly.',
    'super-spreaders': "Next time, cut the carrier's lines on day 1 and isolate them on day 2.",
    'protect-vulnerable': 'Next time, vaccinate the Envoy and the people around them first.',
    'contact-tracing': 'Next time, follow each red line from a sick person and cut it.',
    'hidden-carriers': 'Next time, test the contacts of the sick before they show it.',
    masks: 'Next time, mask the sick and their busiest contacts early.',
    'keep-it-open': 'Next time, guard the hub with cuts and isolation around it.',
    'borders-leak': 'Next time, isolate sick travellers before they move on.',
});

export const HEADLINES = Object.freeze({
    win: 'You stopped the spread.',
    perfect: 'Top marks! Fast, and everyone made it.',
    perfectNearly: 'Top marks! Fast, and nearly everyone made it.',
    envoy: 'Next time, vaccinate the Envoy and the people around them first.',
    burnout: 'It faded on its own, so use your tools next time to earn the win.',
    deaths: 'Next time, isolate the sick sooner so fewer people are lost.',
    loss: 'Next time, act on day 1 and cut the red lines around the sick first.',
    timeout: 'Time ran out, so act earlier next time.',
});

const stars = (n) => `${n} ${n === 1 ? 'star' : 'stars'}`;

// outcome: 'contained' | 'overwhelmed' | 'envoy-lost' | 'burnout' | other.
// meter: starProgress() result on a win (star-meter.js), or null.
// lessonId: the level's lesson. unusedActions: actions left over at day ends.
// stats and caseCap tell a loss at the case cap from a loss to deaths.
export function resultsHeadline({ outcome, meter = null, lessonId = null, unusedActions = null, stats = null, caseCap = Infinity } = {}) {
    if (outcome === 'contained') {
        if (!meter) return HEADLINES.win;
        if (!meter.next) {
            const f = meter.facts || {};
            return f.pop > 0 && f.survivors >= f.pop ? HEADLINES.perfect : HEADLINES.perfectNearly;
        }
        const way = (meter.next.ways || [])[0] || 'act on day 1 to keep more people well';
        return `For ${stars(meter.next.star)} next time, ${way}.`;
    }
    if (outcome === 'envoy-lost') return HEADLINES.envoy;
    if (outcome === 'burnout') return HEADLINES.burnout;
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
