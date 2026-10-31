// Star meter on the results screen (round 17). Shows where this win's score
// landed against the level's 1, 2 and 3 star lines, what earned the points,
// and the cheapest way to reach the next star. The model is pure so it can be
// tested without a DOM; starMeterHtml turns it into markup for the tally.
import { SCORING, calculateScore, parDaysFor } from '../progress.js';

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// stats: game stats plus daysUsed and powerUpsUsed (as game.js stamps them).
// level: a level object with a target. Returns null on a loss or without a
// target, so the results screen simply leaves the meter out.
export function starProgress(outcome, stats, level) {
    if (outcome !== 'contained' || !level || !(level.target > 0)) return null;
    const pop = stats.initialPopulation || 0;
    if (pop <= 0) return null;
    const t = level.target;
    const lines = [t, t * SCORING.twoStarRatio, t * SCORING.threeStarRatio].map((x) => Math.round(x));
    const score = Math.round(calculateScore(outcome, stats, level));
    const stars = lines.filter((x) => score >= x).length;
    const parDays = parDaysFor(level);
    const daysUsed = stats.daysUsed == null ? parDays : stats.daysUsed;
    const deaths = stats.totalDead || 0;
    const powerUps = stats.powerUpsUsed || 0;
    const facts = {
        survivors: Math.max(0, pop - deaths),
        pop,
        recovered: stats.totalRecovered || 0,
        daysEarly: Math.max(0, parDays - daysUsed),
        powerUps,
    };

    let next = null;
    if (stars < 3) {
        const gap = lines[stars] - score;
        // Per-capita points each change is worth (score is points / pop * 100).
        const scale = SCORING.perCapitaBase / pop;
        const perDay = SCORING.perDayUnderPar * scale;
        const perLife = (SCORING.perSurvivor + SCORING.perRecovered) * scale;
        const perPowerUp = SCORING.perPowerUp * scale;
        const ways = [];
        const days = Math.ceil(gap / perDay);
        if (daysUsed - days >= 1) ways.push({ cost: days, text: `finish ${plural(days, 'day')} sooner` });
        const lives = Math.ceil(gap / perLife);
        if (deaths >= lives) ways.push({ cost: lives, text: `lose ${plural(lives, 'fewer person', 'fewer people')}` });
        const skips = Math.ceil(gap / perPowerUp);
        if (powerUps >= skips) ways.push({ cost: skips, text: `use ${plural(skips, 'fewer power-up', 'fewer power-ups')}` });
        ways.sort((a, b) => a.cost - b.cost);
        next = {
            star: stars + 1,
            gap,
            ways: ways.slice(0, 2).map((w) => w.text),
        };
    }
    return { score, lines, stars, facts, next };
}

export function starHint(p) {
    if (!p) return '';
    if (!p.next) {
        // Round 28: a flawless win no longer says "nearly everyone".
        const f = p.facts || {};
        const all = f.pop > 0 && f.survivors >= f.pop;
        return all ? 'Top marks! Fast, and everyone made it.' : 'Top marks! Fast, and nearly everyone made it.';
    }
    const head = `${p.next.gap} more ${p.next.gap === 1 ? 'point' : 'points'} for ${plural(p.next.star, 'star')}`;
    if (!p.next.ways.length) return `${head}. Act on day 1 to keep more people well.`;
    return `${head}: ${p.next.ways.join(' or ')}.`;
}

// Meter markup. The fill and marker are placed with percentages so the bar
// fits any width; the star lines get small gold ticks.
export function starMeterHtml(p) {
    if (!p) return '';
    const max = Math.max(p.lines[2] * 1.12, p.score + 20);
    const pct = (x) => `${Math.max(0, Math.min(100, (x / max) * 100)).toFixed(1)}%`;
    const f = p.facts;
    const chips = [
        `${f.survivors} of ${f.pop} kept alive`,
        `${f.recovered} recovered`,
        f.daysEarly > 0 ? `${plural(f.daysEarly, 'day')} under par` : 'on par',
        f.powerUps > 0 ? `${plural(f.powerUps, 'power-up')} used` : null,
    ].filter(Boolean);
    return `
        <div class="star-meter" data-star-meter role="img" aria-label="Score ${p.score}. ${p.lines.map((x, i) => `${i + 1} star at ${x}`).join(', ')}.">
            <div class="star-meter-head"><span>Score</span><strong data-star-score>${p.score}</strong></div>
            <div class="star-meter-bar">
                <div class="star-meter-fill" style="width:${pct(p.score)}"></div>
                ${p.lines.map((x, i) => `<span class="star-meter-tick${p.score >= x ? ' on' : ''}" style="left:${pct(x)}"><i>${'★'.repeat(i + 1)}</i></span>`).join('')}
            </div>
            <p class="star-meter-hint" data-star-hint>${starHint(p)}</p>
            <ul class="star-meter-facts">${chips.map((c) => `<li>${c}</li>`).join('')}</ul>
            <p class="star-meter-why">Real outbreak teams are judged the same way: lives saved and how fast it ends.</p>
        </div>`;
}
