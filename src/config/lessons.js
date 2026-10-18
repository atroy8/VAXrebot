// One public health lesson per level (item 5). Since round 14 lessons are
// keyed by lesson id and each level names its lessonId (src/config/campaign.js).
import { levelById } from './levels.js';
//
// Each level teaches a single real idea from epidemiology. The player learns it
// by playing, then the game names it once: a short line on the briefing card and
// a one-line takeaway on the results screen. Keep the copy short, plain, true,
// and never preachy. No em dashes.
//
// Fields:
//   title    the idea, two to four words
//   brief    what to try in this level (briefing card, one sentence)
//   win      the real-world fact behind it (results after a win)
//   retry    a concrete tip for the next attempt (results after a loss)
//   retryBusy optional: the tip when the player used every action and still
//            lost (only where `retry` is about acting sooner)

export const LESSONS = {
    'act-early': {
        title: 'Act early',
        brief: 'Outbreaks grow by multiplying, so the moves you make on day 1 stop the most cases.',
        win: 'Each case you stop early would have seeded more. That is why health teams move on the very first reports.',
        retry: 'Cases multiply, so a slow start snowballs. Use your actions on day 1 next time.',
        retryBusy: 'You used every action and it still got ahead. Cut the red links around the sick first: each one is a case that never starts.',
    },
    'isolation': {
        title: 'Isolation breaks chains',
        brief: 'A sick person kept apart cannot pass the infection on. Quarantine the sick to break chains of spread.',
        win: 'Separating the sick from the healthy is older than vaccines. The word quarantine comes from the 40 days ships waited off medieval Venice.',
        retry: 'Chains kept going. Quarantine the people who are sick now, before they reach their neighbors.',
    },
    'hubs': {
        title: 'Hubs and super-spreaders',
        brief: 'A few people have far more contacts than everyone else. Protect those hubs first.',
        win: 'In real outbreaks like SARS and COVID-19, a small share of cases caused most of the spread. Finding the hubs matters.',
        retry: 'Look for the people with the most links. One sick hub can infect a whole neighborhood in a day.',
    },
    'keep-r-below-1': {
        title: 'Keep R below 1',
        brief: 'R is how many people each case infects. Above 1 the outbreak grows, below 1 it shrinks. Watch R at the top.',
        win: 'You pushed R below 1, so each wave of cases was smaller than the last. That is the goal of every outbreak response.',
        retry: 'R stayed above 1, so each wave was bigger than the one before. Every link cut or dose given pulls R down.',
    },
    'herd-immunity': {
        title: 'Herd immunity',
        brief: 'When enough people are immune, the infection keeps hitting dead ends. Spread your vaccines across the school.',
        win: 'The more contagious a disease, the more people need immunity. For measles that is over 90 percent, which is why every dose counts.',
        retry: 'Too few people were immune for chains to fade. Vaccinate early and spread doses across the whole network.',
    },
    'cut-bridges': {
        title: 'Cut the bridges',
        brief: 'A few links join otherwise separate groups. Sever those bridges and the outbreak stays local.',
        win: 'Cutting contact between places cannot stop an outbreak alone, but it buys time for vaccines and care to catch up.',
        retry: 'The infection crossed into new groups through a few bridge links. Sever them before cases reach them.',
    },
    'ring-vaccination': {
        title: 'Ring vaccination',
        brief: 'Vaccinate the people around each case to build a ring of immunity the infection cannot cross.',
        win: 'Ring vaccination helped wipe out smallpox, declared eradicated in 1980, and was used against Ebola in Guinea in 2015.',
        retry: 'Doses far from the cases protect less. Ring the sick: vaccinate the people they touch first.',
    },
    'layers': {
        title: 'Layers of defense',
        brief: 'No single tool is perfect. Stack vaccines, quarantine and cut links so each covers the gaps of the others.',
        win: 'Public health calls this the Swiss cheese model: every layer has holes, but stacked together few infections get through.',
        retry: 'Leaning on one tool leaves gaps. Mix vaccines, quarantine and cut links every day.',
    },
    'flatten-curve': {
        title: 'Flatten the curve',
        brief: 'You may not stop every case, but slowing the spread keeps the sick count below what hospitals can handle.',
        win: 'Slowing spread stretches cases over time, so hospitals are not overwhelmed and more people survive. That is flattening the curve.',
        retry: 'Cases came faster than the response could handle. Every early link cut and dose flattens the peak.',
    },
    'super-spreaders': {
        title: 'Stop the super-spreader',
        brief: 'One carrier has far more contacts than anyone else. Cut their links on day 1, then isolate them the moment you can.',
        win: 'A few people often cause most of the spread. Typhoid Mary infected dozens of people in New York in the early 1900s without ever feeling sick.',
        retry: 'The carrier kept spreading it. Cut the carrier\'s busiest links first, then quarantine them on day 2.',
        retryBusy: 'Every action went in, but the carrier got through. Aim at the carrier first: their links matter more than anyone else\'s.',
    },
    'protect-vulnerable': {
        title: 'Shield the vulnerable',
        brief: 'Some people are at more risk than others. Build a wall of protected people around the Envoy before the virus arrives.',
        win: 'Health teams protect the most vulnerable first, like vaccinating the elderly and the people who care for them. It saves the most lives per dose.',
        retry: 'The virus reached the Envoy. Vaccinate the Envoy and the people around them early, before cases get close.',
    },
    'contact-tracing': {
        title: 'Contact tracing',
        brief: 'No vaccines here. Follow the links from each sick person and break them before the next person catches it.',
        win: 'Contact tracing means finding everyone a sick person met and keeping them apart. It ended outbreaks of Ebola and SARS before vaccines existed.',
        retry: 'Chains slipped through. Follow each red link from a sick person and cut it, then isolate the sick.',
    },
};

export function lessonFor(levelId) {
    const level = levelById(levelId);
    const key = level ? level.lessonId : levelId;
    return LESSONS[key] || null;
}

// The one-line takeaway for the results screen. Wins get the real-world fact,
// everything else gets a concrete tip for the next attempt, shaped by how the
// player actually played: `unusedActions` counts daily actions left on the
// table when a day ended (fast-forwarded days excluded).
export const UNUSED_ACTIONS_NUDGE = 2;

export function debriefLine(lesson, outcome, { unusedActions = null } = {}) {
    if (!lesson) return '';
    if (outcome === 'contained') return lesson.win;
    if (unusedActions != null && unusedActions >= UNUSED_ACTIONS_NUDGE) {
        return `You ended days with ${unusedActions} actions unused. ${lesson.retry}`;
    }
    if (unusedActions === 0 && lesson.retryBusy) return lesson.retryBusy;
    return lesson.retry;
}
