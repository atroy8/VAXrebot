// Round 59 (item 13): the store listing tells the truth about the game as it
// plays after rounds 57 and 58. Round 57 made spread certain and gave every
// web a best answer; round 58 narrated Show best play. The listing written in
// round 56 still spoke of odds and slower spread. These checks tie each
// claim to the code so the listing cannot drift again.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { GENTLE } from '../src/config/gentle.js';
import { MASK_NIGHTS, INCUBATION_DEFAULT } from '../src/sim/mechanics.js';
import { DEFAULT_TOOL_DAYS } from '../src/config/toolkits.js';
import { dealActionsShown } from '../src/ui/deal-actions.js';

const path = (p) => new URL(`../${p}`, import.meta.url);
const read = (p) => readFileSync(path(p), 'utf8');
const field = (name) => read(`store/listing/${name}`).trim();
const everything = () => readdirSync(path('store/listing')).map((f) => read(`store/listing/${f}`)).join('\n');
const WORDS = ['zero', 'one', 'two', 'three', 'four'];

describe('round 59: the listing matches the certain-spread puzzle game', () => {
    it('never promises odds, luck or randomness, except the one honest line about real outbreaks', () => {
        const text = everything().replace('Real outbreaks involve chance.', '');
        expect(text).not.toMatch(/\b(odds|luck|lucky|random|randomly|chance|chances|probability|dice roll)\b/i);
        expect(field('description.txt')).toContain('Real outbreaks involve chance. The game shows the worst case');
        expect(field('description.txt')).toContain('no dice');
    });

    it('describes masks the way the engine runs them', () => {
        expect(field('description.txt')).toContain(`needs ${WORDS[MASK_NIGHTS]} nights to cross a line`);
    });

    it('describes Gentle mode with the numbers the code applies', () => {
        const d = field('description.txt');
        expect(GENTLE).toEqual({ extraUses: 1, extraCap: 1 });
        expect(d).toContain(`${WORDS[GENTLE.extraUses]} extra use of each tool every day`);
        expect(d).toContain(`room for ${WORDS[GENTLE.extraCap]} more case`);
        expect(d).not.toMatch(/slower spread/i);
    });

    it('names the results buttons and par text exactly as the game shows them', () => {
        const html = read('index.html');
        const d = field('description.txt');
        const notes = field('review-notes.txt');
        for (const label of ['Show best play', 'Retry this web']) {
            expect(html).toContain(`>${label}</button>`);
            expect(d).toContain(label);
            expect(notes).toContain(label);
        }
        // Show best play only appears when 3 stars were missed.
        expect(dealActionsShown({ hasDeal: true, hasPar: true, stars: 2 }).best).toBe(true);
        expect(dealActionsShown({ hasDeal: true, hasPar: true, stars: 3 }).best).toBe(false);
        expect(d).toMatch(/Missed it\? Show best play/);
        // The par line the listing paraphrases is the one the game prints.
        expect(read('src/ui/par-text.js')).toContain('3 stars: stop it at');
        expect(read('src/ui/par-text.js')).toContain('Best possible was');
    });

    it('review notes give the tool days the toolkits use and say spread is certain', () => {
        const notes = field('review-notes.txt');
        expect(DEFAULT_TOOL_DAYS.vaccinate).toBe(2);
        expect(DEFAULT_TOOL_DAYS.quarantine).toBe(3);
        expect(notes).toContain('From day 2 you can tap Vaccinate');
        expect(notes).toContain('from day 3 Quarantine');
        expect(notes).toContain('where it will spread tonight');
    });

    it('hidden carriers are a fixed part of the deal, not a surprise', () => {
        // The listing calls them hidden carriers you find by testing; the
        // dealer always places the same number, among the first contacts.
        expect(INCUBATION_DEFAULT.count).toBe(2);
        expect(field('description.txt')).toContain('test people to find hidden carriers');
    });
});

describe('round 59: the store screenshot script never ships a lost level as the outbreak shot', () => {
    it('tries only real levels, idle then with play, and checks the level is still running', async () => {
        const { OUTBREAK_LEVELS, SHOTS } = await import('../scripts/store-screenshots.mjs');
        const { LEVELS } = await import('../src/config/levels.js');
        const ids = new Set(LEVELS.map((l) => l.id));
        expect(OUTBREAK_LEVELS.length).toBeGreaterThanOrEqual(5);
        for (const id of OUTBREAK_LEVELS) expect(ids.has(id)).toBe(true);
        expect(SHOTS[2].file).toBe('03-outbreak');
        const src = read('scripts/store-screenshots.mjs');
        expect(src).toContain("for (const mode of ['idle', 'play'])");
        expect(src).toMatch(/!g\.gameState\.gameOver && g\.gameState\.day >= 2/);
    });
});
