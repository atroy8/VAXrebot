import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { requestChestOpen, takeChestRequest, peekChestRequest, chestDestination } from '../src/ui/pending-chest.js';
import { prizeCardHtml } from '../src/ui/results-tally.js';
import { CHESTS } from '../src/config/chests.js';
import { LEVELS } from '../src/config/levels.js';
import { PLANETS } from '../src/config/solar-system.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

describe('prize box from the award screen (round 14)', () => {
    it('the award screen card is a real button that names its box', () => {
        const html = prizeCardHtml({ id: 'chest-3b' });
        expect(html).toMatch(/<button type="button" class="tally-prize" data-chest-id="chest-3b"/);
        expect(html).toContain('Prize box unlocked!');
        expect(html).toContain('Tap to open it on the map.');
        const css = read('src/ui/game-screen.css');
        expect(css).toMatch(/button\.tally-prize \{[^}]*min-height: 56px/);
    });

    it('a request is handed to the map once', () => {
        expect(takeChestRequest()).toBeNull();
        requestChestOpen('chest-1a');
        expect(peekChestRequest()).toBe('chest-1a');
        expect(takeChestRequest()).toBe('chest-1a');
        expect(takeChestRequest()).toBeNull();
        requestChestOpen(null);
        expect(takeChestRequest()).toBeNull();
    });

    it('every box knows which planet to fly to', () => {
        for (const c of CHESTS) {
            const d = chestDestination(c.id, { chests: CHESTS, levels: LEVELS, planets: PLANETS });
            expect(d).not.toBeNull();
            expect(PLANETS[d.planetIndex].regionId).toBe(LEVELS[c.afterLevelIndex].regionId);
            expect(d.levelIndex).toBe(c.afterLevelIndex);
        }
        expect(chestDestination('nope', { chests: CHESTS, levels: LEVELS, planets: PLANETS })).toBeNull();
    });

    it('game.js sends the tap through leaveResults (ad pacing) and the map opens the box', () => {
        const game = read('src/game.js');
        expect(game).toMatch(/closest\?\.\('\[data-chest-id\]'\)[\s\S]{0,300}this\.leaveResults\(\(\) => \{\s*requestChestOpen\(chestId\);\s*this\.showScreen\('welcome'\);/);
        const globe = read('src/ui/globe-view.js');
        expect(globe).toContain('takeChestRequest()');
        expect(globe).toMatch(/openRequestedChest[\s\S]*flyToPlanet\(dest\.planetIndex[\s\S]*handleChestOpen\(marker\)/);
    });
});
