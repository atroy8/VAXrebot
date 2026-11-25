// The mentor (wide audience pass): one recurring character who briefs the
// player before each level and says one line on the results. Dr. Amina
// Diallo is a veteran field epidemiologist of the Galactic Response Team:
// warm, dry and brief. Pure data and pure pickers, no DOM.
//
// Rules for the copy: one line, at most 90 characters, plain words, never a
// joke about a death, and every tip true to how the game and real outbreak
// response work (tests/wide-story-mentor.test.js checks length and variety).
import { LEVELS } from './levels.js';

export const MENTOR = Object.freeze({
    name: 'Dr. Amina Diallo',
    short: 'Dr. Diallo',
    title: 'Field epidemiologist',
    // A fixed look for her portrait (drawn by art/source/citizens.mjs through
    // src/ui/people.js lookFaceUrl): grey hair, glasses, a teal coat.
    look: Object.freeze({ civ: 'sahel', skin: '#8d5b3e', tone: 7, hair: '#d9d6d0', style: 'short', elder: true, glasses: true, beard: false, robe: '#2f6f8f', key: 'mentor.diallo' }),
});

export const MENTOR_MAX_CHARS = 90;

// ---- Briefing lines --------------------------------------------------------
// One pool per kind of level. A planet plays each kind once, so ten levels in
// a row never share a pool, and each planet takes the next line of the pool.
export const BRIEFING_LINES = Object.freeze({
    // The first level of each planet: one line per planet, in planet order.
    opener: [
        'Welcome aboard, rookie. Cut the red lines first. I will be right here.',
        'Hanabi loves a crowd. So does the virus. Start with the red lines.',
        'Three moons, one outbreak. Let us keep it that way.',
        'Cloud cities have few bridges. Good news: fewer to cut.',
        'Everyone here lives by the water, and close together. Move early.',
        'Cold outside, crowded inside. Warm domes are a gift to a virus.',
        'Pretty lanterns. Do not be charmed. Find the first case.',
        'This is their home front. Same tools, same rules. Steady hands.',
    ],
    school: [
        'Children share everything. Split the classes before they share this.',
        'A school is one big handshake. Send the sick home early.',
        'No doses in time here. Good old distance will do the job.',
        'Schools empty fast when you ask nicely. Ask on day one.',
    ],
    superSpreader: [
        'One carrier, half the town on their dance card. Isolate them.',
        'Find the one with the most lines. That is your whole problem.',
        'A carrier is just a hub with bad intentions. Cut around them.',
        'Do not chase every case. Chase the one feeding all the others.',
    ],
    festival: [
        'No wards in a field. Close the paths between the friend groups.',
        'Festivals are bridges with music. Cut the bridges, keep the music.',
        'One tool today. Use it where two crowds meet.',
        'Shared food, shared trouble. Keep the camps apart.',
    ],
    noVaccines: [
        'The doses are floating past a moon somewhere. We work without them.',
        'No vaccine today. Medicine got by on distance for centuries.',
        'Lost shipment. Isolate the sick and cut what you cannot isolate.',
        'Fewer tools, clearer thinking. Break the chains by hand.',
    ],
    global: [
        'Trial doses, straight off the ship. Ring the sick with them.',
        'Vaccinate the neighbours of a case, not the far corner.',
        "A spaceport is everyone's next stop. End it here.",
        'Doses from day one. Spend them next to the red.',
    ],
    envoy: [
        'Keep the Envoy well and we get a treaty. No pressure.',
        'Guard the roads that lead to the Envoy, not just the Envoy.',
        'Peace talks hate a cough. Cut every path to the Envoy.',
        'One person matters most today. Do not let a case get near.',
    ],
    urban: [
        'Markets are all hubs. Protect the busiest stalls first.',
        'Everyone knows everyone here. Look for who knows the most.',
        'All three tools today. Layer them. No single one is enough.',
        'A market forgives a slow start about as well as a fire does.',
    ],
    noQuarantine: [
        'No wards. Vaccinate ahead of the spread and cut behind it.',
        'We cannot isolate anyone here, so get ahead of the virus.',
        'Doses and scissors, nothing else. It has been done with less.',
        'Without wards the sick stay put. Protect who they can reach.',
    ],
    boss: [
        'The big carrier. Every tool is yours. So is my confidence.',
        'Stop the carrier and this world breathes again. Go.',
        "The planet's last stand. Isolate the carrier before anything else.",
        'Biggest web yet. Same answer: find the hub, cut around the hub.',
    ],
    // A level the campaign does not know (free play).
    fallback: ['Find the sick, cut the red lines, and act on day one.'],
});

// ---- Results lines ---------------------------------------------------------
export const RESULT_LINES = Object.freeze({
    flawless: [
        'Nobody lost. I have waited years to write that in a report.',
        'Clean sweep. Do not let it go to your head. Fine, a little.',
        'Everyone made it. That is the whole job, done right.',
        'Not one life lost. I am putting this one on the wall.',
        'Fast and clean. You are making my old reports look bad.',
        'All safe. Somewhere a Blightborne captain is very annoyed.',
        'Perfect. I checked twice, which is my way of saying well done.',
        'Everyone goes home tonight. Remember how this feels.',
        'Textbook. I should know, I wrote a chapter of it.',
        'No losses. Tea is on me.',
    ],
    wonWithDeaths: [
        'You stopped it. We lost people too. Both things are true.',
        'Contained. Take a moment for the ones we lost, then we go on.',
        'A win with a cost. A ward halves the risk, so use them early.',
        'It is over here. I will write to the families myself.',
        'You held the line. Next time let us hold it a day sooner.',
        'Stopped. Not everyone saw the end of it. Carry that gently.',
        'A hard win. Sick people in wards do better, remember that.',
        'The town is safe. Some chairs are empty. We keep working.',
        'Good work. Grieve a little. It keeps us careful.',
        'Contained, and it mattered. Earlier isolation saves more.',
    ],
    wonSlow: [
        'Everyone lived. It took a while, and I will take that trade.',
        'Slow and safe. Now try fast and safe.',
        'All well. Act a day sooner and you will be home for supper.',
        'No losses. The day one moves are worth the most, mind.',
        'Safe, if unhurried. Early cuts end it quicker.',
        'Everyone made it. The virus dawdled, and so did we.',
        'Good result. Spend every action on day one next time.',
        'Nobody lost. A quicker finish earns more, for what it is worth.',
        'A patient win. Patience is fine. Speed is better.',
        'All safe. You took the scenic route.',
    ],
    lostEarly: [
        'It got away fast. Day one matters most. Cut the red lines.',
        'That was quick. It happens. Try the red lines first.',
        'Outbreaks multiply, so the first moves count for the most.',
        'An early loss. Find the busiest sick person and box them in.',
        'Happens to all of us. Start with the lines touching the sick.',
        'Too fast to catch that time. Go again, and move on day one.',
    ],
    lostLate: [
        'You held it a long while. One more cut would have done it.',
        'A long fight. Look for the bridge it crossed near the end.',
        'So close to done. Do not ease off while anyone is still sick.',
        'It slipped late. Keep spending actions until the last case.',
        'Good defence, wrong ending. Watch R: above 1 means trouble.',
        'You nearly outlasted it. Isolate sooner and you will.',
    ],
    lostByOne: [
        'One case. One. I have lost outbreaks by less. Go again.',
        'A single case over. You know exactly what to do now.',
        'One case from safe. That is not failing, that is practice.',
        'By one. The universe has a mean sense of humour.',
        'One more cut link and we are celebrating. Again?',
        'Lost by a hair. Same plan, one day earlier.',
    ],
    envoyLost: [
        'The Envoy caught it. Guard the paths to them next time.',
        'The treaty is off, for now. Cut the Envoy\'s risky contacts first.',
        'We lost a treaty, not the war. Try again.',
        'Protect the neighbours and you protect the Envoy.',
    ],
    burnout: [
        'It burned out by itself. We do not get paid to watch.',
        'The virus finished the job for us. Badly. Use your tools.',
        'Doing nothing is a plan. It is just never a good one.',
    ],
    // Out of days while it was still spreading.
    timeout: [
        'Out of days, and it is still moving. Push R under 1 sooner.',
        'Time ran out on us. Bigger moves early, smaller ones late.',
        'It outlasted the clock. Cut more red lines on the first days.',
    ],
});

// A loss on or before this day counts as early.
export const EARLY_LOSS_DAY = 4;

const levelOf = (levelId) => LEVELS.find((l) => l.id === levelId) || null;

// A small stable number from any string, for ids the campaign does not know.
function hash(text) {
    let h = 0;
    for (const ch of String(text ?? '')) h = (h * 31 + ch.codePointAt(0)) >>> 0;
    return h;
}

// Where a level sits in the campaign (0 to 79), or a stable number.
function levelNumber(levelId) {
    const i = LEVELS.findIndex((l) => l.id === levelId);
    return i >= 0 ? i : hash(levelId);
}

// Which briefing pool a level draws from.
export function briefingKind(level) {
    if (!level) return 'fallback';
    if (level.variant?.boss) return 'boss';
    if (level.variant?.type && BRIEFING_LINES[level.variant.type]) return level.variant.type;
    if (level.levelInPlanet === 0) return 'opener';
    return BRIEFING_LINES[level.scenarioId] ? level.scenarioId : 'fallback';
}

// The mentor's one line for a level's briefing. Pure: same level, same line.
export function mentorBriefingLine(levelId) {
    const level = levelOf(levelId);
    const pool = BRIEFING_LINES[briefingKind(level)];
    return pool[(level?.planetIndex ?? 0) % pool.length];
}

// How the level went, as one of the RESULT_LINES keys.
// stats: { totalDead, totalInfected, daysUsed, caseCap?, parDays? }.
export function mentorOutcome(outcome, stats = {}) {
    const dead = stats.totalDead || 0;
    const days = stats.daysUsed || 0;
    if (outcome === 'contained') {
        if (dead > 0) return 'wonWithDeaths';
        return stats.parDays > 0 && days > stats.parDays ? 'wonSlow' : 'flawless';
    }
    if (outcome === 'envoy-lost') return 'envoyLost';
    if (outcome === 'overwhelmed') {
        if (days <= EARLY_LOSS_DAY) return 'lostEarly';
        // The level ends when cases reach the cap: landing exactly on it
        // after a long fight means one case fewer would have kept it alive.
        // (On small webs a quick loss often lands on the cap too, and that
        // is not a near miss, so early losses are read first.)
        if (Number.isFinite(stats.caseCap) && (stats.totalInfected || 0) === stats.caseCap) return 'lostByOne';
        return 'lostLate';
    }
    return outcome === 'burnout' ? 'burnout' : 'timeout';
}

// The mentor's one line on the results. Pure and deterministic given
// (levelId, outcome, stats). Wins walk the pool by level, so ten wins in a
// row never repeat a line; a loss also moves with the run's numbers, so a
// retry of the same level usually hears something new.
export function mentorResultLine(levelId, outcome, stats = {}) {
    const kind = mentorOutcome(outcome, stats);
    const pool = RESULT_LINES[kind];
    let n = levelNumber(levelId);
    if (outcome !== 'contained') n += (stats.totalInfected || 0) + (stats.daysUsed || 0) + (stats.totalDead || 0);
    return { kind, line: pool[n % pool.length] };
}
