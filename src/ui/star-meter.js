// Star meter on the results screen. Round 57: stars come from the result
// against par (src/progress.js starsAgainstPar), so the meter no longer
// shows a score against three score lines. It shows the three star lines
// in cases (par, par + the two star slack, any win), where this run landed,
// and the exact way to the next star. The score is still shown, since it
// pays the gold. The model is pure so it can be tested without a DOM;
// starMeterHtml turns it into markup for the tally.
import { calculateScore, starsAgainstPar, speedParDays } from '../progress.js';
import { twoStarSlack } from '../config/puzzle-specs.js';

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// stats: game stats plus daysUsed and powerUpsUsed (as game.js stamps them)
// and par (put there when the level is dealt). Returns null on a loss or
// without a par, so the results screen simply leaves the meter out.
export function starProgress(outcome, stats, level) {
    if (outcome !== 'contained' || !stats || !stats.par) return null;
    const pop = stats.initialPopulation || 0;
    if (pop <= 0) return null;
    const par = stats.par;
    const cases = stats.totalInfected || 0;
    const deaths = stats.totalDead || 0;
    const slack = twoStarSlack(pop);
    const stars = starsAgainstPar({ outcome, cases, deaths, population: pop }, par);
    const score = Math.round(calculateScore(outcome, stats, level));
    const parDays = speedParDays(stats, level);
    const daysUsed = stats.daysUsed == null ? parDays : stats.daysUsed;
    const facts = {
        survivors: Math.max(0, pop - deaths),
        pop,
        cases,
        keptWell: Math.max(0, pop - cases),
        daysEarly: Math.max(0, parDays - daysUsed),
        powerUps: stats.powerUpsUsed || 0,
    };
    let next = null;
    if (stars < 3) {
        const ways = [];
        if (stars === 1) ways.push(`keep it to ${plural(par.cases + slack, 'case')}`);
        else if (cases > par.cases) ways.push(`keep it to ${plural(par.cases, 'case')}`);
        if (stars === 2 && cases <= par.cases && deaths > par.deaths) ways.push(par.deaths > 0 ? `lose no more than ${plural(par.deaths, 'person', 'people')}` : 'lose nobody');
        next = { star: stars + 1, ways };
    }
    return { score, stars, par: { cases: par.cases, deaths: par.deaths || 0 }, lines: { three: par.cases, two: par.cases + slack }, facts, next };
}

export function starHint(p) {
    if (!p) return '';
    if (!p.next) {
        const f = p.facts || {};
        if (f.cases < p.par.cases) return `Top marks! You beat the best play we found (${plural(p.par.cases, 'case')}).`;
        return f.pop > 0 && f.survivors >= f.pop ? 'Top marks! That was the best possible play, and everyone made it.' : 'Top marks! That was the best possible play.';
    }
    return `For ${plural(p.next.star, 'star')}: ${p.next.ways.join(' and ') || 'match the best play'}.`;
}

// Meter markup: three steps (1, 2 and 3 stars) with the cases each needs.
export function starMeterHtml(p) {
    if (!p) return '';
    const f = p.facts;
    const chips = [
        `${plural(f.cases, 'case')}, best possible ${p.par.cases}`,
        `${f.survivors} of ${f.pop} kept alive`,
        f.daysEarly > 0 ? `speed bonus ${plural(f.daysEarly, 'day')}` : null,
        f.powerUps > 0 ? `${plural(f.powerUps, 'power-up')} used` : null,
    ].filter(Boolean);
    const steps = [
        { n: 1, label: 'any win' },
        { n: 2, label: `${p.lines.two} or fewer` },
        { n: 3, label: `${p.lines.three} or fewer` },
    ];
    return `
        <div class="star-meter" data-star-meter role="img" aria-label="${p.stars} of 3 stars. 3 stars at ${plural(p.lines.three, 'case')}, 2 stars at ${p.lines.two}.">
            <div class="star-meter-head"><span>Score</span><strong data-star-score>${p.score}</strong></div>
            <ol class="star-meter-steps">
                ${steps.map((s) => `<li class="star-meter-step${p.stars >= s.n ? ' on' : ''}"><i>${'★'.repeat(s.n)}</i><span>${s.label}</span></li>`).join('')}
            </ol>
            <p class="star-meter-hint" data-star-hint>${starHint(p)}</p>
            <ul class="star-meter-facts">${chips.map((c) => `<li>${c}</li>`).join('')}</ul>
            <p class="star-meter-why">Stars compare your result with the best possible play on this exact web. The score pays the gold.</p>
        </div>`;
}
