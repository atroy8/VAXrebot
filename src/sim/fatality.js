// Who can die, and when. Round 57: no dice. Pure: no DOM, shared by the
// game, the solver, the balance bots and the tests.
//
// THE RULE THE PLAYER READS OFF THE SCREEN
// A few people on every web are FRAIL (a small heart mark, node.frail, fixed
// when the level is dealt). Nobody else can die. A frail person who is sick
// and not in a ward on the third night of their illness is lost that night.
// A frail person in a ward (Quarantine on a sick person) always recovers.
// So a death is never bad luck: the mark says who is in danger, the count is
// always the same (two full days after they fall sick), and ward care is
// the way to save them.
//
// How many people are frail follows each disease's real case fatality rate
// (CFR), mapped on a log scale onto a playable band exactly as before
// (gameFatality): the order between diseases is kept (the MERS strain marks
// more people than the flu strain), but every web has at least one.
//
// Before round 57 every sick person rolled a daily chance of dying, which
// made a perfect plan fail at random and made 3 stars a matter of luck.

export const GAME_CFR_MIN = 0.12; // the mildest disease in the game
export const GAME_CFR_MAX = 0.3; // the deadliest
const LOG_LO = Math.log10(1e-4); // real CFR of 0.01% maps to GAME_CFR_MIN
const LOG_HI = Math.log10(0.4); // real CFR of 40% maps to GAME_CFR_MAX

// A frail person not in a ward is lost on this night of their illness.
// daysInfected counts nights sick: 1 the morning after they caught it (or on
// day 2 for a first case), so they can be isolated on two mornings first.
export const FRAIL_DEATH_NIGHT = 3;
// Never more than this many frail people, so the death line
// (OVERWHELMED_DEATH_FLOOR in engine.js) stays out of reach: a level is lost
// to cases, never to an unlucky count.
export const MAX_FRAIL = 4;
// Share of the game CFR that becomes the share of frail people.
export const FRAIL_SHARE = 0.6;

// The night of illness on which an untreated frail person is lost, for a
// disease that lasts recoveryTime days (never later than the last night).
export function frailDeathNight(recoveryTime) {
    return Math.max(1, Math.min(FRAIL_DEATH_NIGHT, recoveryTime || FRAIL_DEATH_NIGHT));
}

// How many people are frail on a web of `population` people.
export function frailCount(population, fatalityRate) {
    const rate = fatalityRate > 0 ? fatalityRate : GAME_CFR_MIN;
    return Math.max(1, Math.min(MAX_FRAIL, Math.round(population * rate * FRAIL_SHARE)));
}

// In care: isolated while sick. A Stay Home Pay break counts while it
// lasts (the person is looked after at home); once they are back out the
// count of nights goes on from where it stood.
export function inWard(node) {
    return !!node && node.state === 'quarantined' && !!node.sickWhileQuarantined;
}

// True when this sick person is lost tonight. daysInfected is the count
// after tonight's tick, as updateOutcomes in engine.js sees it.
export function diesTonight(node, recoveryTime) {
    if (!node || !node.frail || inWard(node)) return false;
    return (node.daysInfected || 0) >= frailDeathNight(recoveryTime);
}

// Mornings left on which a ward can still save this sick frail person,
// today included (0 when it is too late, or they are safe already).
export function careDaysLeft(node, recoveryTime) {
    if (!node || !node.frail || node.state !== 'infected') return 0;
    return Math.max(0, frailDeathNight(recoveryTime) - (node.daysInfected || 0));
}

// Real CFR (0..1) to the game's scale, which sets how many people are frail.
export function gameFatality(realCfr) {
    if (!(realCfr > 0)) return GAME_CFR_MIN;
    const t = (Math.log10(realCfr) - LOG_LO) / (LOG_HI - LOG_LO);
    const k = Math.min(1, Math.max(0, t));
    return Math.round((GAME_CFR_MIN + (GAME_CFR_MAX - GAME_CFR_MIN) * k) * 1000) / 1000;
}

// "about 1 in 3" style line for the Based on card.
export function oneIn(p) {
    if (!(p > 0)) return 'almost nobody';
    const n = 1 / p;
    if (n < 1.5) return 'almost everyone';
    if (n < 30) return `about 1 in ${Math.round(n)}`;
    const mag = Math.pow(10, Math.floor(Math.log10(n)));
    return `about 1 in ${(Math.round(n / mag) * mag).toLocaleString('en-US')}`;
}
