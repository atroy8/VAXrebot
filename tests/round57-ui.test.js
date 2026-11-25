// Round 57: what the player is told. Par on the briefing, the result against
// par on the results, Show best play, Retry this web, and wording that says
// "will" where it used to say "can".
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { parGoalLine, parBriefingLine, parResultLine, parChip, DEALING_LINE } from '../src/ui/par-text.js';
import { resultsHeadline } from '../src/ui/results-headline.js';
import { starGoalLine } from '../src/ui/briefing.js';
import { COACH_TEXT } from '../src/ui/coach-model.js';
import { HOW_TO_PLAY } from '../src/ui/onboarding.js';
import { LESSONS } from '../src/config/lessons.js';
import { RESULT_LINES, mentorOutcome } from '../src/config/mentor.js';
import { basedOnCard, deathToast, WORST_CASE_LINE } from '../src/ui/deaths.js';
import { mechanicToolFeedback, travelLine } from '../src/ui/mechanics-text.js';
import { careNudgeLine, rExplainer } from '../src/ui/game-screen-model.js';
import { nodeMarks, NODE_MARKS, maskedEnds } from '../src/ui/node-marks.js';
import { travelPoints, travelLabel } from '../src/ui/travel-marks.js';
import { variantCallout } from '../src/sim/variants.js';
import { GOALS } from '../src/sim/goals.js';
import { scenarios } from '../src/config/scenarios.js';
import { LEVELS } from '../src/config/levels.js';
import { tools } from '../src/config/tools.js';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

describe('the briefing says what 3 stars means on this deal', () => {
    it('one plain line, without the moves', () => {
        expect(parGoalLine({ cases: 4, deaths: 0 })).toBe('3 stars: stop it at 4 cases.');
        expect(parGoalLine({ cases: 1, deaths: 0 })).toBe('3 stars: stop it at 1 case.');
        expect(parGoalLine({ cases: 6, deaths: 1 })).toBe('3 stars: stop it at 6 cases, losing no more than 1 person.');
        expect(parGoalLine({ cases: 7, deaths: 0 }, { goal: { type: 'holdLine', days: 7 } })).toBe('3 stars: hold it to 7 cases.');
        expect(parGoalLine(null)).toBe('');
    });

    it('adds the best stars so far, and says so while the web is still being dealt', () => {
        expect(parBriefingLine({ cases: 4, deaths: 0 }, { best: 2 })).toBe('3 stars: stop it at 4 cases. Your best: ★★☆');
        expect(parBriefingLine({ cases: 4, deaths: 0 }, { best: 3 })).toMatch(/★★★$/);
        expect(parBriefingLine({ cases: 4, deaths: 0 }, { best: 0 })).not.toMatch(/best/);
        expect(starGoalLine({ par: null })).toBe(DEALING_LINE);
        expect(starGoalLine({ par: { cases: 3, deaths: 0 }, best: 1 })).toBe('3 stars: stop it at 3 cases. Your best: ★☆☆');
        expect(parChip({ cases: 4 })).toBe('par 4');
    });

    it('the briefing has the line, and the game fills it from the deal', () => {
        expect(read('index.html')).toContain('id="star-goal"');
        const deal = read('src/game-deal.js');
        expect(deal).toContain("document.getElementById('star-goal')");
        expect(deal).toContain('starGoalLine({ par: deal.par');
        expect(read('src/game.js')).toMatch(/selectLevel\(levelId\) \{[\s\S]*?this\.beginDeal\(\);[\s\S]*?this\.showScreen\('briefing'\)/);
    });
});

describe('the results say exactly how it went against par', () => {
    const par = { cases: 4, deaths: 0, days: 7 };
    const stats = (over = {}) => ({ initialPopulation: 14, totalInfected: 5, totalDead: 0, par, ...over });

    it('the sentence from the brief', () => {
        expect(parResultLine({ outcome: 'contained', cases: 5, deaths: 0 }, par)).toBe('Best possible was 4 cases. You had 5.');
        expect(resultsHeadline({ outcome: 'contained', stats: stats() })).toBe('Best possible was 4 cases. You had 5.');
    });

    it('a match, a beat, and a loss', () => {
        expect(resultsHeadline({ outcome: 'contained', stats: stats({ totalInfected: 4 }) })).toBe('Best possible was 4 cases, and you matched it.');
        expect(resultsHeadline({ outcome: 'contained', stats: stats({ totalInfected: 3 }) })).toBe('You beat the best play we found: 3 cases against 4.');
        expect(resultsHeadline({ outcome: 'overwhelmed', stats: stats({ totalInfected: 8 }), caseCap: 8 })).toBe('Best possible was 4 cases. You had 8.');
        expect(resultsHeadline({ outcome: 'timeout', stats: stats({ totalInfected: 6 }) })).toBe('Best possible was 4 cases. You had 6.');
    });

    it('the same cases with someone lost names the loss', () => {
        expect(resultsHeadline({ outcome: 'contained', stats: stats({ totalInfected: 4, totalDead: 1 }) })).toBe('Best possible was 4 cases with nobody lost. You lost 1.');
        expect(parResultLine({ outcome: 'contained', cases: 4, deaths: 2 }, { cases: 4, deaths: 1 })).toBe('Best possible was 4 cases with 1 person lost. You lost 2.');
    });

    it('a power-up win that matches par is noted, and still counts', () => {
        expect(resultsHeadline({ outcome: 'contained', stats: stats({ totalInfected: 4, powerUpsUsed: 1 }) })).toBe('Best possible was 4 cases, and you matched it. With a power-up, but it counts.');
    });

    it('the Envoy and doing nothing keep their own lines', () => {
        expect(resultsHeadline({ outcome: 'envoy-lost', stats: stats() })).toBe('The Envoy fell ill. The best play keeps the Envoy well and stops it at 4 cases.');
        expect(resultsHeadline({ outcome: 'burnout', stats: stats() })).toMatch(/faded on its own/);
    });

    it('the old "finish 1 day sooner" advice is gone', () => {
        const all = [read('src/ui/results-headline.js'), read('src/ui/star-meter.js'), read('src/ui/par-text.js')].join('\n');
        expect(all).not.toMatch(/sooner`|day sooner'|finish \$\{/);
        expect(resultsHeadline({ outcome: 'contained', stats: stats({ daysUsed: 12 }) })).not.toMatch(/sooner|day/);
    });

    it('the game hands the stats (with par) to the headline', () => {
        expect(read('src/game.js')).toMatch(/resultsHeadline\(\{ outcome,[^}]*\bstats\b/);
        expect(read('src/sim/solver.js')).toContain('state.stats.par = { cases: deal.par.cases');
    });

    it('the mentor calls a win over par a slow one, and a par win flawless', () => {
        expect(mentorOutcome('contained', { totalDead: 0, totalInfected: 5, par })).toBe('wonSlow');
        expect(mentorOutcome('contained', { totalDead: 0, totalInfected: 4, par })).toBe('flawless');
        expect(mentorOutcome('contained', { totalDead: 1, totalInfected: 4, par })).toBe('wonWithDeaths');
    });
});

describe('Show best play and Retry this web', () => {
    const html = read('index.html');
    const deal = read('src/game-deal.js');
    const game = read('src/game.js');
    const css = read('src/ui/round57.css');

    it('both buttons are on the results, above Details, and big enough to tap', () => {
        expect(html).toMatch(/id="show-best"[^>]*hidden>Show best play</);
        expect(html).toMatch(/id="retry-web"[^>]*hidden>Retry this web</);
        expect(html.indexOf('id="show-best"')).toBeLessThan(html.indexOf('id="results-details"'));
        expect(css).toMatch(/\.results-more-btn \{[^}]*min-height: 44px/);
        expect(css).toMatch(/\.demo-banner \.demo-skip \{[^}]*min-height: 44px/);
    });

    it('Show best play is offered after any result under 3 stars, when the deal has a par', () => {
        expect(deal).toMatch(/best\.hidden = !hasPar \|\| stars >= 3/);
        expect(game).toContain('this.refreshDealActions(stars)');
    });

    it('the best play replays the solver moves on the same deal, step by step', () => {
        expect(deal).toContain('moves: [...deal.par.moves]');
        expect(deal).toContain('findMove(this.network, move)');
        expect(deal).toContain('this.applyToolToLink(found.link)');
        expect(deal).toContain('this.applyToolToNode(move.toolId, found.node)');
        expect(deal).toContain('this.nextDay()');
        expect(deal).toMatch(/setTimeout\(step, DEMO_STEP_MS\)/);
    });

    it('it never banks a reward or counts as an attempt', () => {
        // The demo ends in endDemo, not in showGameOver (the only place that
        // records a result, pays gold or counts toward ad pacing).
        expect(game).toMatch(/if \(this\.demo\) \{\s*setTimeout\(\(\) => this\.endDemo\(\), \d+\);\s*return;\s*\}\s*setTimeout\(\(\) => this\.showGameOver\(\)/);
        const demoCode = deal.slice(deal.indexOf('async showBestPlay()'));
        for (const word of ['recordCompletion', 'writeSave', 'goldAward', 'settleMeta', 'onLevelFinished', 'showGameOver']) expect(demoCode, word).not.toContain(word);
        expect(demoCode).toContain("this.showScreen('game-over')");
        // The finished run the results belong to is put back.
        expect(demoCode).toContain('this.gameState = kept.state');
    });

    it('taps do nothing while the solver plays, and the coach and auto-advance stay out of it', () => {
        expect(game).toMatch(/handleNodeClick\(event, node\) \{\s*if \(this\.demo\) return;/);
        expect(game).toMatch(/handleLinkClick\(event, link\) \{\s*if \(this\.demo\) return;/);
        expect(game).toContain('!this.demo) {\n            import(\'./ui/coach.js\')');
        expect(game).toMatch(/if \(!this\.gameState \|\| this\.gameState\.gameOver \|\| this\.demo\) return;/);
        expect(css).toMatch(/#game-screen\.is-demo #tool-tray \{ pointer-events: none; \}|#game-screen\.is-demo \.network-container,\s*#game-screen\.is-demo #tool-tray \{ pointer-events: none; \}/);
        expect(html).toContain('id="demo-skip"');
    });

    it('Replay deals a new web and Retry this web opens the same deal', () => {
        // Replay: a new deal (a new seed), then start.
        expect(game).toMatch(/getElementById\('play-again'\)[\s\S]{0,400}this\.beginDeal\(\);[\s\S]{0,80}this\.startGame\(\)/);
        // Retry: start again without dealing, so openDeal reuses this.deal.
        expect(deal).toMatch(/getElementById\('retry-web'\)\?\.addEventListener\('click', \(\) => this\.leaveResults\(\(\) => this\.startGame\(\)\)\)/);
        expect(deal).toMatch(/ensureDeal\(\) \{\s*if \(this\.deal\) return this\.deal;/);
        expect(deal).toContain('randomSeed()');
        expect(deal).toContain('dailySeed(this.daily.date)');
    });

    it('dealing never blocks the briefing for long', () => {
        expect(deal).toMatch(/export const DEAL_SLICE_MS = \d+;/);
        expect(deal).toMatch(/export const DEAL_HARD_MS = 400;/);
        expect(deal).toContain('this.dealTimer = setTimeout(work, 0)');
        // The Daily is never cut short, so it is the same web on any phone.
        expect(deal).toContain('while (!done && (this.daily || clock() < until))');
    });
});

describe('wording: certainty instead of chance', () => {
    it('the level 1 coach line', () => {
        expect(COACH_TEXT.sick).toBe('This person is sick. Red lines are where it will jump tonight.');
    });

    it('how to play, lessons, mentor lines and callouts no longer talk about odds', () => {
        const texts = [
            ...HOW_TO_PLAY.map((c) => c.body),
            ...Object.values(LESSONS).flatMap((l) => [l.title, l.brief, l.win, l.retry, l.retryBusy, l.briefHidden]),
            ...Object.values(RESULT_LINES).flat(),
            ...Object.values(COACH_TEXT).filter((t) => typeof t === 'string'),
            ...LEVELS.filter((l) => l.mechanics).flatMap((l) => [l.mechanics.callout?.text, l.mechanics.why, l.mechanics.whyAdd, l.toolkit.why]),
            ...['superSpreader', 'envoy', 'noVaccines', 'noQuarantine'].map((type) => variantCallout({ type }).text),
            tools.mask.description,
            mechanicToolFeedback('mask', { masked: true }, { id: 1 }).toast,
            mechanicToolFeedback('test', { positive: false }, { id: 1 }).toast,
            careNudgeLine({ day: 3, sick: 1 }, 1),
            ...rExplainer({ r: 2.4, r0: 'about 4' }).lines,
            ...Object.values(GOALS).map((g) => g.label(2)),
        ].filter(Boolean);
        for (const t of texts) {
            expect(t, t).not.toMatch(/\bodds\b|\bchance\b|\blikely\b|can jump|halve|half as|\bluck/i);
            expect(t).not.toContain(String.fromCharCode(0x2014));
        }
    });

    it('still teaches the real idea', () => {
        expect(LESSONS.masks.title).toBe('Masks buy time');
        expect(LESSONS.masks.brief).toMatch(/two nights to cross/);
        expect(LESSONS['hidden-carriers'].brief).toMatch(/test the contacts/);
        expect(LESSONS['act-early'].brief).toMatch(/Every red line is a new case tonight/);
        expect(HOW_TO_PLAY[0].body).toMatch(/red lines are tonight's new cases unless you act/);
        expect(HOW_TO_PLAY[2].body).toMatch(/heart mark/);
        expect(variantCallout({ type: 'superSpreader' }).text).toMatch(/choose who to save/);
    });

    it('one honest line says real outbreaks involve chance and the game shows the worst case', () => {
        expect(WORST_CASE_LINE).toMatch(/Real outbreaks involve chance/);
        expect(WORST_CASE_LINE).toMatch(/worst case/);
        for (const scenario of Object.values(scenarios)) {
            const card = basedOnCard({ scenario, fatalityRate: 0.2 });
            expect(card.lines).toContain(WORST_CASE_LINE);
            expect(card.lines.join(' ')).toMatch(/heart mark/);
        }
    });

    it('the first death explains the rule a player can plan around', () => {
        expect(deathToast({ count: 1, firstThisLevel: true, names: ['Aiko the baker'] })).toBe('Aiko the baker did not survive. Frail people are lost on their third night sick. Quarantine saves them.');
        expect(deathToast({ count: 1, firstThisLevel: false })).toBe('Someone did not survive.');
    });

    it('a traveller moving on is no surprise any more', () => {
        expect(travelLine({ travel: [{ traveller: 1, from: 2, to: 3 }] })).toMatch(/as the dotted line showed/);
        expect(travelLabel({ traveller: 1, from: 2, to: 3 })).toMatch(/Tonight/);
    });

    it('no em dash anywhere in the round 57 files', () => {
        const files = ['src/sim/solver.js', 'src/sim/dealer.js', 'src/sim/rng.js', 'src/sim/puzzle-lab.js', 'src/sim/fatality.js', 'src/sim/mechanics.js', 'src/config/puzzle-specs.js', 'src/config/puzzle-tuning.js', 'src/game-deal.js', 'src/ui/par-text.js', 'src/ui/star-meter.js', 'src/ui/travel-marks.js', 'src/ui/round57.css', 'scripts/tune-puzzles.mjs'];
        for (const name of readdirSync(new URL('.', import.meta.url))) if (name.startsWith('round57-')) files.push(`tests/${name}`);
        for (const file of files) expect(read(file).includes(String.fromCharCode(0x2014)), file).toBe(false);
    });
});

describe('marks the player reads the rules off', () => {
    it('frail people carry a heart while it matters', () => {
        expect(NODE_MARKS.frail).toBeTruthy();
        expect(nodeMarks({ state: 'healthy', frail: true })).toContain('frail');
        expect(nodeMarks({ state: 'infected', frail: true })).toContain('frail');
        expect(nodeMarks({ state: 'recovered', frail: true })).not.toContain('frail');
        expect(nodeMarks({ state: 'quarantined', frail: true })).not.toContain('frail');
        expect(nodeMarks({ state: 'healthy' })).not.toContain('frail');
        // Never in the same corner as another mark the same person can carry.
        const clash = Object.entries(NODE_MARKS).filter(([k, m]) => k !== 'frail' && k !== 'hub' && m.pos[0] === NODE_MARKS.frail.pos[0] && m.pos[1] === NODE_MARKS.frail.pos[1]);
        expect(clash).toEqual([]);
    });

    it('a masked line is pale until it has charged, then full strength: it crosses tonight', () => {
        const link = { source: { masked: true }, target: {} };
        expect(maskedEnds(link)).toBe(1);
        expect(maskedEnds({ ...link, charged: true })).toBe(0);
    });

    it('the dotted travel line is placed with the view and never leaks a hidden field', () => {
        const view = { nodeObjs: new Map([[1, { pos: 'a' }], [4, { pos: 'b' }], [0, { pos: 'c' }]]), screenPoint: (p) => ({ x: p.charCodeAt(0), y: 0 }) };
        expect(travelPoints(view, { traveller: 1, to: 4, from: 0 })).toEqual({ from: { x: 97, y: 0 }, to: { x: 98, y: 0 }, leaves: { x: 99, y: 0 } });
        expect(travelPoints(view, { traveller: 9, to: 4, from: 0 })).toBe(null);
        expect(read('src/ui/travel-marks.js')).not.toContain('incubating');
        expect(read('src/game-deal.js')).toContain('showTravelPlan(this.view, travelPlan(this.network))');
        expect(read('src/ui/round57.css')).toMatch(/\.travel-plan \{[^}]*pointer-events: none/);
    });

    it('nothing that draws a person reads the hidden truth', () => {
        for (const file of ['src/ui/node-marks.js', 'src/ui/travel-marks.js', 'src/ui/par-text.js', 'src/ui/star-meter.js', 'src/game-deal.js']) {
            const code = read(file).split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
            expect(code, file).not.toMatch(/\.incubating|isCarrier|isHiddenCarrier|trueState/);
        }
    });
});
