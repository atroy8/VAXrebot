// Wide audience pass, story and identity: inside the story every disease is
// an invented Blightborne strain. The real disease is named afterwards, on
// the results' Based on card and on the R card, with its real facts intact.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { scenarios } from '../src/config/scenarios.js';
import { LEVELS } from '../src/config/levels.js';
import { TOOLKITS } from '../src/config/toolkits.js';
import { levelRules } from '../src/config/level-rules.js';
import { briefingStrain, basedOnCard, realR0NoteFor, gameOddsLine, deathToast, resultsDeathLines } from '../src/ui/deaths.js';
import { basedOnMarkup, isGentleLevel } from '../src/ui/story.js';
import { rExplainer } from '../src/ui/game-screen-model.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const html = read('../index.html');
const REAL = /measles|influenza|\bflu\b|h1n1|norovirus|pneumo|streptococcus|mers|coronavirus|mmr/i;

describe('invented strains', () => {
    it('every scenario has a strain name, in-world traits and the real disease it is based on', () => {
        const names = new Set();
        for (const s of Object.values(scenarios)) {
            expect(s.strainName, s.id).toMatch(/^[A-Z][A-Za-z ]{3,18}$/);
            expect(s.strainTraits.length, s.id).toBeGreaterThan(30);
            expect(s.strainTraits.length, s.id).toBeLessThanOrEqual(110);
            expect(s.basedOn, s.id).toBeTruthy();
            // In-world text never names the real disease.
            for (const text of [s.strainName, s.strainTraits, s.strainVaccine || '', s.description, s.name]) expect(text, s.id).not.toMatch(REAL);
            expect(s.strainTraits).not.toContain('—');
            names.add(s.strainName);
        }
        expect(names.size).toBe(5);
    });

    it('a strain has an in-world vaccine exactly when the real disease has one', () => {
        for (const s of Object.values(scenarios)) {
            expect(Boolean(s.strainVaccine), s.id).toBe(Boolean(s.vaccine));
            if (s.strainVaccine) expect(s.strainVaccine).toContain(s.strainName);
        }
        expect(scenarios.festival.strainTraits).toMatch(/no vaccine/);
    });

    it('the real facts are still in the config, unchanged', () => {
        expect(scenarios.urban.diseaseName).toBe('Measles');
        expect(scenarios.urban.realCfr).toBe(0.01);
        expect(scenarios.urban.realR0).toBe('12 to 18');
        expect(scenarios.urban.vaccine).toBe('MMR vaccine');
        expect(scenarios.school.realCfr).toBe(0.0002);
        expect(scenarios.festival.realCfr).toBe(0.0003);
        expect(scenarios.care.realCfr).toBe(0.24);
        expect(scenarios.global.realCfr).toBe(0.36);
        for (const s of Object.values(scenarios)) expect(s.cfrSource, s.id).toMatch(/^https:\/\//);
    });

    it('the briefing profile shows the strain and how it behaves, not the real disease', () => {
        for (const s of Object.values(scenarios)) {
            const b = briefingStrain(s);
            expect(b.name).toBe(s.strainName);
            expect(b.traits).toBe(s.strainTraits);
        }
        expect(briefingStrain(null)).toEqual({ name: '', traits: '' });
        expect(html).toMatch(/<strong>Strain:<\/strong> <span id="briefing-disease">/);
        expect(html).toMatch(/id="briefing-traits-row"><strong>Behaviour:<\/strong> <span id="briefing-traits">/);
        expect(html).not.toMatch(/Real death rate/);
        const src = read('../src/ui/briefing.js');
        expect(src).toContain('briefingStrain(scenario)');
        expect(src).not.toContain('scenario.diseaseName');
    });

    it('what a player reads before a level never names a real disease in-world', () => {
        for (const level of LEVELS) {
            expect(`${level.name} ${level.blurb}`, level.id).not.toMatch(REAL);
        }
        for (const kit of Object.values(TOOLKITS)) {
            // A real-world aside is allowed when it says so ("On Earth, ...").
            const inWorld = kit.why.replace(/On Earth,[^.]*\./, '');
            expect(inWorld, kit.id).not.toMatch(REAL);
            expect(inWorld, kit.id).not.toMatch(/ebola/i);
        }
        expect(TOOLKITS.school.why).toContain(scenarios.school.strainVaccine);
        expect(TOOLKITS.festival.why).toContain(scenarios.festival.strainName);
    });
});

describe('the Based on card on the results', () => {
    it('names the real disease with its real facts and vaccine', () => {
        const card = basedOnCard({ scenario: scenarios.urban, fatalityRate: 0.2 });
        expect(card.title).toBe('Based on: measles');
        expect(card.lines[0]).toMatch(/^Cinderbloom is invented\./);
        expect(card.lines).toContain(`For real: ${scenarios.urban.cfrNote}`);
        expect(card.lines).toContain(scenarios.urban.r0Note);
        expect(card.lines).toContain('The real vaccine: MMR vaccine.');
    });

    it('says so when the real disease has no licensed vaccine', () => {
        expect(basedOnCard({ scenario: scenarios.festival }).lines).toContain('No vaccine for norovirus is licensed yet.');
        expect(basedOnCard({ scenario: scenarios.global }).lines).toContain('No vaccine for MERS is licensed yet.');
    });

    it('every scenario gets a card, without em dashes, and none without a real disease', () => {
        for (const s of Object.values(scenarios)) {
            const card = basedOnCard({ scenario: s, fatalityRate: 0.2 });
            expect(card.title).toBe(`Based on: ${s.basedOn}`);
            expect(card.lines.join(' ')).not.toContain('—');
        }
        expect(basedOnCard({ scenario: { name: 'x' } })).toBeNull();
        expect(basedOnCard()).toBeNull();
    });

    it('renders as a details block with the real disease in the summary', () => {
        const out = basedOnMarkup(basedOnCard({ scenario: scenarios.care }));
        expect(out).toMatch(/^<summary class="based-on-title">Based on: pneumococcal pneumonia<\/summary>/);
        expect(out).toContain('20% to 28%');
        expect(basedOnMarkup(null)).toBe('');
        expect(html).toContain('<details class="based-on" id="results-based-on" hidden></details>');
    });

    it('game.js fills it on the results and no longer puts For real in the death notes', () => {
        const game = read('../src/game.js');
        expect(game).toMatch(/storyResults\(\{ level: this\.currentLevel, outcome, stats, scenario: this\.currentScenario/);
        const notes = resultsDeathLines({ outcome: 'overwhelmed', stats: { totalDead: 2 }, lostNames: [] });
        expect(notes.join(' ')).not.toMatch(/For real/);
    });
});

describe('the R card says which real disease a real R0 belongs to', () => {
    it('prefixes the real R0 note with the strain and the disease it is based on', () => {
        const note = realR0NoteFor(scenarios.urban);
        expect(note).toBe(`Cinderbloom is based on measles. ${scenarios.urban.r0Note}`);
        expect(realR0NoteFor(scenarios.global)).toMatch(/^Voidcough is based on MERS\. Real MERS/);
        expect(realR0NoteFor(scenarios.care)).toBe('');
        expect(realR0NoteFor(null)).toBe('');
        const e = rExplainer({ r: 2.4, r0: '1.5 - 2.0', realR0Note: note });
        expect(e.lines.at(-1)).toBe(note);
    });

    it('game.js passes that note to the R card both times it opens', () => {
        const game = read('../src/game.js');
        expect(game.match(/realR0Note: realR0NoteFor\(this\.currentScenario\)/g)).toHaveLength(2);
        expect(game).not.toMatch(/realR0Note: this\.currentScenario\?\.r0Note/);
    });
});

describe('gentler death framing on the first planet', () => {
    it('the first planet counts as gentle, later planets do not', () => {
        expect(isGentleLevel(LEVELS[0])).toBe(true);
        expect(isGentleLevel(LEVELS[9])).toBe(true);
        expect(isGentleLevel(LEVELS[10])).toBe(false);
        expect(isGentleLevel(null)).toBe(false);
    });

    it('the gentle line gives no raw odds; the plain line still does', () => {
        const gentle = gameOddsLine(0.29, true);
        expect(gentle).not.toMatch(/\d/);
        // Round 57: no dice. The frail (heart mark) are the people in danger
        // and a ward always saves them.
        expect(gentle).toMatch(/ward care always saves them/);
        expect(gameOddsLine(0.29, false)).toMatch(/heart mark stand for the about 1 in 3 .*Ward care always saves them here/);
        expect(gameOddsLine(null, true)).toBe('');
    });

    it('level 1 results: no game odds in numbers, and the briefing carries no death odds at all', () => {
        const level = LEVELS[0];
        const { scenario, difficulty } = levelRules(level);
        const card = basedOnCard({ scenario, fatalityRate: difficulty.fatalityRate, gentle: isGentleLevel(level) });
        expect(card.lines.at(-1)).toBe(gameOddsLine(difficulty.fatalityRate, true));
        expect(card.lines.join(' ')).not.toMatch(/odds are raised/);
        expect(html).not.toMatch(/death rate/i);
        expect(read('../src/ui/briefing.js')).not.toMatch(/briefingCfr/);
    });

    it('the sim numbers are untouched', () => {
        const { difficulty } = levelRules(LEVELS[0]);
        expect(difficulty.fatalityRate).toBeGreaterThanOrEqual(0.12);
        expect(difficulty.fatalityRate).toBeLessThanOrEqual(0.3);
    });
});

describe('deaths are named', () => {
    it('the toast names who was lost when it knows', () => {
        expect(deathToast({ count: 1, names: ['Aiko the baker'] })).toBe('Aiko the baker did not survive.');
        expect(deathToast({ count: 2, names: ['Aiko the baker', 'Ren the fisher'] })).toBe('Aiko the baker and Ren the fisher did not survive.');
        expect(deathToast({ count: 3, names: ['A the cook', 'B the smith', 'C the clerk'] })).toBe('A the cook, B the smith and 1 other did not survive.');
        expect(deathToast({ count: 1, firstThisLevel: true, names: ['Aiko the baker'] })).toMatch(/^Aiko the baker did not survive\. .*Quarantine saves them/);
        // Without names it reads as before.
        expect(deathToast({ count: 1 })).toBe('Someone did not survive.');
        expect(deathToast({ count: 2, names: ['only one'] })).toBe('2 people did not survive.');
    });

    it('the results remember them by name', () => {
        const lines = resultsDeathLines({ outcome: 'contained', stats: { totalDead: 2 }, lostNames: ['Aiko the baker', 'Ren the fisher'] });
        expect(lines[0]).toBe('We remember Aiko the baker and Ren the fisher.');
        expect(resultsDeathLines({ outcome: 'contained', stats: { totalDead: 0 } })).toEqual(['Nobody died. Every person in this town made it.']);
    });

    it('game.js names the dead in the toast and keeps the list for the results', () => {
        const game = read('../src/game.js');
        expect(game).toContain('const names = deaths.map((d) => personFor(d.node.id).label);');
        expect(game).toContain('deathToast({ count: died, firstThisLevel: first, inWard, names })');
        expect(game).toContain('lostNames: this.gameState.lostNames || []');
    });
});
