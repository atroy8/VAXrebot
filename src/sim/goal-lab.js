// Evidence that a bonus goal is fair on a level (wide audience round), used
// by scripts/tune-goals.mjs to write src/config/goal-targets.js and by
// tests/wide-meta-goals.test.js to check it again. Pure and seeded.
//
// A goal is "possible" when some style of play wins AND meets it often
// enough, and "not free" when a sensible winner (the plain smart bot) does
// not meet it most of the time without trying. Styles: the smart bot, the
// beginner bot, and (for goals about restraint) the smart bot held to the
// goal's own budget.
import { GOALS } from './goals.js';
import { metaSummary } from './meta-run.js';

// restraintMetRate: goals with a number ("at most 2 vaccines") get the
// tightest number the restrained bot still wins with this often, so they
// are a stretch, not a wall.
export const GOAL_FAIRNESS = Object.freeze({ minMetRate: 0.15, restraintMetRate: 0.3, maxFreeShare: 0.7 });

// Runs of the plain bots for one level, shared by every goal on it.
export function basePool(level, runs = 120, seed = 5) {
    return { smart: metaSummary(level, { bot: 'smart' }, runs, seed).runs, beginner: metaSummary(level, { bot: 'beginner' }, runs, seed).runs };
}

const won = (r) => r.outcome === 'contained';

// { metRate, freeShare, byStyle } for one goal ({ id, n }) on one level.
export function goalEvidence(level, goal, { runs = 120, seed = 5, pool = null } = {}) {
    const def = GOALS[goal.id];
    const base = pool || basePool(level, runs, seed);
    const styles = { ...base };
    const budget = def.budget(goal.n);
    if (budget) styles.restrained = metaSummary(level, { bot: 'smart', budget }, runs, seed).runs;
    const meets = (r) => won(r) && def.met(r.stats, { caseCap: r.caseCap }, goal.n);
    const byStyle = {};
    for (const [name, list] of Object.entries(styles)) byStyle[name] = list.filter(meets).length / list.length;
    const smartWins = base.smart.filter(won);
    return {
        metRate: Math.max(...Object.values(byStyle)),
        freeShare: smartWins.length ? smartWins.filter(meets).length / smartWins.length : 0,
        byStyle,
    };
}

export function isFair(evidence, rules = GOAL_FAIRNESS, minMetRate = rules.minMetRate) {
    return evidence.metRate >= minMetRate && evidence.freeShare <= rules.maxFreeShare;
}

// Choose the fair goals for a level, with numbers. Returns [{ id, n? }].
export function tuneLevelGoals(level, { runs = 200, seed = 5 } = {}) {
    const pool = basePool(level, runs, seed);
    const offered = [];
    for (const [id, def] of Object.entries(GOALS)) {
        if (!def.applies(level)) continue;
        if (!def.param) {
            if (isFair(goalEvidence(level, { id }, { runs, seed, pool }))) offered.push({ id });
            continue;
        }
        // Restraint goals get the tightest number a restrained bot still
        // wins with often enough; R gets the earliest day that is fair.
        const candidates = id === 'fastR' ? [1, 2, 3, 4] : Array.from({ length: 30 }, (_, i) => i + 1);
        for (const n of candidates) {
            const ev = goalEvidence(level, { id, n }, { runs, seed, pool });
            if (ev.freeShare > GOAL_FAIRNESS.maxFreeShare) break; // only gets easier from here
            if (isFair(ev, GOAL_FAIRNESS, id === 'fastR' ? GOAL_FAIRNESS.minMetRate : GOAL_FAIRNESS.restraintMetRate)) {
                offered.push({ id, n });
                break;
            }
        }
    }
    return offered;
}
