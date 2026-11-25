// Words about par (round 57). Pure text, no DOM.
//
// Par is the best achievable play on the web that was dealt, found by the
// solver (src/sim/solver.js): { cases, deaths, days }. The briefing says
// what 3 stars means on this deal without giving the moves away, and the
// results say exactly how the run went against it.

const cases = (n) => `${n} ${n === 1 ? 'case' : 'cases'}`;
const people = (n) => (n === 1 ? '1 person' : `${n} people`);

// Briefing: "3 stars: stop it at 4 cases." A level's own goal changes the
// verb, and a par that loses someone says so (it cannot be helped there).
export function parGoalLine(par, { goal = null } = {}) {
    if (!par) return '';
    const hold = goal && goal.type === 'holdLine';
    const head = hold ? `3 stars: hold it to ${cases(par.cases)}` : `3 stars: stop it at ${cases(par.cases)}`;
    if (par.deaths > 0) return `${head}, losing no more than ${people(par.deaths)}.`;
    return `${head}.`;
}

// The same with the player's best so far, for the line under the threat.
export function parBriefingLine(par, { best = 0, goal = null } = {}) {
    const line = parGoalLine(par, { goal });
    if (!line) return '';
    if (best >= 3) return `${line} Your best: ★★★`;
    if (best > 0) return `${line} Your best: ${'★'.repeat(best)}${'☆'.repeat(3 - best)}`;
    return line;
}

export const DEALING_LINE = 'Dealing a new web...';

// Results: how the run went against par, in one or two short sentences.
// result = { outcome, cases, deaths, powerUps }.
export function parResultLine(result, par) {
    if (!par || !result) return '';
    const mine = result.cases || 0;
    const lost = result.deaths || 0;
    const best = `Best possible was ${cases(par.cases)}`;
    const won = result.outcome === 'contained';
    const withPower = result.powerUps > 0 ? ' With a power-up, but it counts.' : '';
    if (won && mine < par.cases) return `You beat the best play we found: ${cases(mine)} against ${par.cases}.${withPower}`;
    if (won && mine === par.cases && lost <= par.deaths) return `${best}, and you matched it.${withPower}`;
    if (mine === par.cases) {
        // Same cases, more people lost.
        const parLost = par.deaths > 0 ? `${people(par.deaths)} lost` : 'nobody lost';
        return `${best} with ${parLost}. You lost ${lost}.`;
    }
    return `${best}. You had ${mine}.`;
}

// The HUD's small reminder next to the case count: "par 4".
export function parChip(par) {
    return par ? `par ${par.cases}` : '';
}
