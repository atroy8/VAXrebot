// Item 20 (round 24): people can die, at odds that follow each disease's
// real case fatality rate (CFR), scaled so deaths show up on small webs.
// Pure: no DOM, shared by the game, the balance bots and the tests.
//
// Real CFRs span four orders of magnitude (pandemic flu about 1 in 5,000,
// MERS about 1 in 3), and a web of 10 to 25 people would never see a flu
// death at the real rate. So the game maps the real CFR on a log scale onto
// a playable band: the order between diseases is kept (MERS is always
// deadlier than flu), but every disease can take someone.
//
// Timing: a sick person may die on any day of their illness, not only on
// the last one, at a daily chance that adds up to the disease's game CFR
// over the full illness. Sick people in an isolation ward get care, which
// halves that chance (TREATED_FACTOR), as supportive care does for real.

export const GAME_CFR_MIN = 0.12; // the mildest disease in the game
export const GAME_CFR_MAX = 0.3; // the deadliest
const LOG_LO = Math.log10(1e-4); // real CFR of 0.01% maps to GAME_CFR_MIN
const LOG_HI = Math.log10(0.4); // real CFR of 40% maps to GAME_CFR_MAX
export const TREATED_FACTOR = 0.5;

// Real CFR (0..1) to the chance a sick person dies over their whole illness.
export function gameFatality(realCfr) {
    if (!(realCfr > 0)) return GAME_CFR_MIN;
    const t = (Math.log10(realCfr) - LOG_LO) / (LOG_HI - LOG_LO);
    const k = Math.min(1, Math.max(0, t));
    return Math.round((GAME_CFR_MIN + (GAME_CFR_MAX - GAME_CFR_MIN) * k) * 1000) / 1000;
}

// Chance of dying on one sick day, so that `days` such rolls add up to
// `illnessChance`: 1 - (1 - h)^days = illnessChance.
export function dailyDeathChance(illnessChance, days) {
    if (illnessChance >= 1) return 1;
    if (illnessChance <= 0) return 0;
    const d = Math.max(1, days);
    return 1 - Math.pow(1 - illnessChance, 1 / d);
}

// Whole-illness chance for one person: halved while they are in a ward.
export function personFatality(node, fatalityRate) {
    const treated = node.state === 'quarantined' && node.sickWhileQuarantined;
    return treated ? fatalityRate * TREATED_FACTOR : fatalityRate;
}

// "about 1 in 3" style line for the briefing and results.
export function oneIn(p) {
    if (!(p > 0)) return 'almost nobody';
    const n = 1 / p;
    if (n < 1.5) return 'almost everyone';
    if (n < 30) return `about 1 in ${Math.round(n)}`;
    const mag = Math.pow(10, Math.floor(Math.log10(n)));
    return `about 1 in ${(Math.round(n / mag) * mag).toLocaleString('en-US')}`;
}
