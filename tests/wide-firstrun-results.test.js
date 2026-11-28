// Wide audience pass, the results: the screen used to show a score bar,
// stars, pills, funding, bins, six numbers and a real world fact all at
// once. It now leads with the outcome, the stars, ONE sentence, the reward
// and the buttons; everything else is in a closed Details section.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resultsHeadline, TRY_NEXT, HEADLINES } from '../src/ui/results-headline.js';
import { renderResultsLead, resultsLeadSlots, EMPTY_STARS } from '../src/ui/results-lead.js';
import { starProgress } from '../src/ui/star-meter.js';
import { LESSONS, UNUSED_ACTIONS_NUDGE } from '../src/config/lessons.js';
import { LEVELS } from '../src/config/levels.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const oneSentence = (t) => {
    expect(t).toMatch(/[.!]$/);
    // One full stop or exclamation mark at the very end, or a short "Top marks!" opener.
    expect(t.replace(/^Top marks! /, '').slice(0, -1)).not.toMatch(/[.!?] /);
    expect(t.length).toBeLessThanOrEqual(80);
    expect(t).not.toMatch(/[\u2013\u2014]/);
};

describe('the one sentence: wins', () => {
    const level = LEVELS[0];
    const stats = (over = {}) => ({ initialPopulation: 9, totalInfected: 2, totalDead: 0, totalRecovered: 2, daysUsed: 6, powerUpsUsed: 0, ...over });

    // Round 57: the sentence is the result against par (the best possible
    // play on the web that was dealt). It replaces the old "finish 1 day
    // sooner" advice; tests/round57-ui.test.js has every case.
    const par = { cases: 2, deaths: 0, days: 6 };

    it('a perfect win is praised', () => {
        expect(resultsHeadline({ outcome: 'contained', stats: stats({ par }) })).toBe('Best possible was 2 cases, and you matched it.');
        // Without a par (a web that was not dealt) the old praise remains.
        const meter = { score: 1200, stars: 3, facts: { pop: 9, survivors: 9 }, next: null };
        expect(resultsHeadline({ outcome: 'contained', meter })).toBe('Top marks! Everyone made it.');
    });

    it('any other win says exactly how far it was from the best play', () => {
        expect(resultsHeadline({ outcome: 'contained', stats: stats({ par, totalInfected: 3 }) })).toBe('Best possible was 2 cases. You had 3.');
        expect(resultsHeadline({ outcome: 'contained', stats: stats({ par, totalDead: 1 }) })).toBe('Best possible was 2 cases with nobody lost. You lost 1.');
    });

    it('works on the real star meter for level 1', () => {
        for (const s of [stats({ par }), stats({ par, daysUsed: 14, totalDead: 2 }), stats({ par, totalInfected: 4 })]) {
            const meter = starProgress('contained', s, level);
            const line = resultsHeadline({ outcome: 'contained', meter, stats: s });
            expect(line).not.toContain(String.fromCharCode(0x2014));
            if (meter.next) expect(line).toMatch(/^Best possible was 2 cases/);
            else expect(line).toMatch(/matched it/);
        }
    });

    it('a win with no star target still says something true', () => {
        expect(resultsHeadline({ outcome: 'contained', meter: null })).toBe(HEADLINES.win);
    });
});

describe('the one sentence: losses say what to try next', () => {
    const atCap = { stats: { totalInfected: 5 }, caseCap: 5 };

    it('unused actions come first, since that is how early levels are lost', () => {
        const line = resultsHeadline({ outcome: 'overwhelmed', lessonId: 'act-early', unusedActions: 3, ...atCap });
        expect(line).toBe('Next time, use every action each day: 3 went unused.');
        expect(resultsHeadline({ outcome: 'overwhelmed', lessonId: 'act-early', unusedActions: UNUSED_ACTIONS_NUDGE - 1, ...atCap })).toBe(TRY_NEXT['act-early']);
    });

    it('otherwise the tip comes from the level lesson', () => {
        expect(resultsHeadline({ outcome: 'overwhelmed', lessonId: 'isolation', unusedActions: 0, ...atCap })).toBe(TRY_NEXT.isolation);
        expect(resultsHeadline({ outcome: 'overwhelmed', lessonId: 'no-such-lesson', unusedActions: 0, ...atCap })).toBe(HEADLINES.loss);
    });

    it('has a tip for every lesson in the game, each one short sentence', () => {
        expect(Object.keys(TRY_NEXT).sort()).toEqual(Object.keys(LESSONS).sort());
        for (const t of Object.values(TRY_NEXT)) {
            oneSentence(t);
            expect(t).toMatch(/^Next time, /);
        }
        for (const t of Object.values(HEADLINES)) oneSentence(t);
    });

    it('a loss to deaths below the case cap talks about isolation', () => {
        expect(resultsHeadline({ outcome: 'overwhelmed', lessonId: 'hubs', unusedActions: 0, stats: { totalInfected: 3 }, caseCap: 9 })).toBe(HEADLINES.deaths);
    });

    it('covers the Envoy, a burnout and a timeout', () => {
        expect(resultsHeadline({ outcome: 'envoy-lost', unusedActions: 9 })).toBe(HEADLINES.envoy);
        expect(resultsHeadline({ outcome: 'burnout' })).toBe(HEADLINES.burnout);
        expect(resultsHeadline({ outcome: 'timeout' })).toBe(HEADLINES.timeout);
        expect(resultsHeadline()).toBe(HEADLINES.timeout);
    });
});

describe('results markup: the lead, then Details', () => {
    const html = read('index.html');
    const screen = html.slice(html.indexOf('id="game-over-screen"'), html.indexOf('<script type="module"'));
    const at = (needle) => {
        const i = screen.indexOf(needle);
        expect(i, needle).toBeGreaterThan(-1);
        return i;
    };
    const open = at('<details class="results-details" id="results-details">');
    const close = screen.lastIndexOf('</details>');
    const inDetails = (id) => at(`id="${id}"`) > open && at(`id="${id}"`) < close;

    it('leads with title, stars, mentor slot, one sentence, reward', () => {
        const order = ['game-over-title', 'results-lead', 'results-stars', 'results-mentor', 'results-headline', 'results-reward', 'results-details', 'play-again'].map((id) => at(`id="${id}"`));
        expect([...order].sort((a, b) => a - b)).toEqual(order);
        for (const id of ['game-over-title', 'results-stars', 'results-mentor', 'results-headline', 'results-reward']) expect(inDetails(id), id).toBe(false);
        expect(screen).toMatch(/id="results-stars"><\/div>\s*<div class="mentor-line" id="results-mentor" hidden><\/div>/);
    });

    it('folds the score bar, bins, numbers, message, averted card and the fact into Details', () => {
        for (const id of ['final-difficulty-badge', 'results-tally', 'final-stats-wrap', 'final-total-infected', 'game-over-message', 'final-death-notes', 'averted', 'game-over-lesson', 'results-based-on']) {
            expect(inDetails(id), id).toBe(true);
        }
        expect(screen).toMatch(/<details class="results-details" id="results-details">\s*<summary class="results-details-summary">Details<\/summary>/);
        expect(screen).not.toMatch(/<details[^>]*id="results-details"[^>]*\sopen/);
    });

    it('keeps the buttons outside Details, so they are in reach with it closed', () => {
        for (const id of ['play-again', 'try-different-scenario', 'next-level']) expect(inDetails(id), id).toBe(false);
        expect(at('class="game-over-actions"')).toBeGreaterThan(close);
    });

    it('keeps every id the game fills, each exactly once', () => {
        for (const id of ['game-over-title', 'results-lead', 'results-stars', 'results-mentor', 'results-headline', 'results-reward', 'results-details', 'results-based-on', 'final-difficulty-badge', 'results-tally', 'final-stats-wrap', 'game-over-message', 'final-death-notes', 'averted', 'game-over-lesson', 'play-again', 'try-different-scenario', 'next-level']) {
            expect(html.split(`id="${id}"`).length - 1, id).toBe(1);
        }
    });
});

// A stand-in page with just the nodes the lead touches.
function fakeDoc(ids = ['results-headline', 'results-stars', 'results-reward', 'results-details']) {
    const nodes = Object.fromEntries(ids.map((id) => [id, { id, textContent: '', innerHTML: 'old', hidden: false, open: true }]));
    return { nodes, getElementById: (id) => nodes[id] || null };
}

describe('filling the lead', () => {
    it('writes the sentence, closes Details and shows hollow stars after a loss', () => {
        const doc = fakeDoc();
        renderResultsLead({ headline: 'Next time, spend every action on day 1.', tally: false }, doc);
        expect(doc.nodes['results-headline'].textContent).toBe('Next time, spend every action on day 1.');
        expect(doc.nodes['results-headline'].hidden).toBe(false);
        expect(doc.nodes['results-details'].open).toBe(false);
        expect(doc.nodes['results-stars'].innerHTML).toBe(EMPTY_STARS);
        expect(doc.nodes['results-reward'].innerHTML).toBe('');
        expect((EMPTY_STARS.match(/tally-star"/g) || []).length).toBe(3);
        expect(EMPTY_STARS).not.toContain('tally-star on');
    });

    it('leaves the stars and reward to the tally on a win', () => {
        const doc = fakeDoc();
        renderResultsLead({ headline: 'Top marks! Fast, and everyone made it.', tally: true }, doc);
        expect(doc.nodes['results-stars'].innerHTML).toBe('old');
        expect(doc.nodes['results-reward'].innerHTML).toBe('old');
    });

    it('hides an empty sentence and copes with old markup', () => {
        const doc = fakeDoc();
        renderResultsLead({}, doc);
        expect(doc.nodes['results-headline'].hidden).toBe(true);
        expect(() => renderResultsLead({ headline: 'x' }, fakeDoc([]))).not.toThrow();
        expect(() => renderResultsLead({ headline: 'x' }, null)).not.toThrow();
        expect(resultsLeadSlots(fakeDoc([]))).toBeNull();
        const slots = resultsLeadSlots(doc);
        expect(slots.stars).toBe(doc.nodes['results-stars']);
        expect(slots.reward).toBe(doc.nodes['results-reward']);
    });
});

describe('results wiring', () => {
    const game = read('src/game.js');
    const panels = read('src/ui/panels.js');
    const tally = read('src/ui/results-tally.js');
    const css = read('src/ui/results-lean.css');

    it('the game picks the sentence and hands it to the results', () => {
        expect(game).toMatch(/headline: resultsHeadline\(\{ outcome, meter: starProgress\(outcome, stats, this\.currentLevel\), lessonId: this\.currentLevel\?\.lessonId, unusedActions: stats\.unusedActions \?\? 0/);
        expect(panels).toMatch(/renderResultsLead\(\{ headline, tally \}\)/);
    });

    it('the stars, funding and prize box play in the lead; the bins stay in Details', () => {
        expect(game).toContain('lead: resultsLeadSlots(),');
        expect(tally).toContain('lead.stars.innerHTML = starsHtml;');
        expect(tally).toContain('lead.reward.innerHTML = rewardHtml;');
        expect(tally).toMatch(/const steps = lead \? \[starsStep, totalStep, prizesStep\] : \[binsStep, linesStep, starsStep, meterStep, awardStep, totalStep, prizesStep\];/);
    });

    it('the bins count up the first time Details is opened', () => {
        expect(tally).toMatch(/wrap\.addEventListener\('toggle', onToggle\)/);
        const replay = tally.slice(tally.indexOf('function armDetailsReplay'), tally.indexOf('if (reduce) {'));
        expect(replay).toContain('await binsStep(off);');
        expect(replay).toContain('finishDetails();');
    });

    it('a tap on the prize box still opens it on the map, from the lead', () => {
        expect(game).toMatch(/getElementById\('results-lead'\)\?\.addEventListener\('click', \(e\) => \{\s*const card = e\.target\.closest\?\.\('\[data-chest-id\]'\);/);
        expect(game).toMatch(/requestChestOpen\(chestId\);\s*this\.showScreen\('welcome'\);/);
    });

    it('still tells monetization the level finished, before the results render', () => {
        const show = game.slice(game.indexOf('showGameOver() {'), game.indexOf('applyResultsActions(outcome) {'));
        expect(show.indexOf('this.monetization.onLevelFinished();')).toBeGreaterThan(-1);
        expect(show.indexOf('this.monetization.onLevelFinished();')).toBeLessThan(show.indexOf('renderGameOver({'));
        expect(game).toContain('await this.monetization.maybeShowInterstitial({ inLevel: false });');
    });

    it('Details has a 44 px target and the lean styles load with the lead', () => {
        expect(css).toMatch(/\.results-details-summary \{[^}]*min-height:\s*44px/);
        expect(read('src/ui/results-lead.js')).toContain("import './results-lean.css';");
        expect(css).toMatch(/\.results-reward\.done \.tally-confetti \{ display: none; \}/);
    });

    it('uses no long dashes', () => {
        for (const t of [css, tally, read('src/ui/results-lead.js'), read('src/ui/results-headline.js'), read('src/ui/briefing-lean.css')]) expect(t).not.toMatch(/[\u2013\u2014]/);
    });
});
