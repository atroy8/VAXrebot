import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { LEVELS } from '../src/config/levels.js';
import { LESSONS, lessonFor, debriefLine } from '../src/config/lessons.js';
import { createViewLoader } from '../src/ui/view-loader.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const EMOJI = /\p{Extended_Pictographic}/u;
const DASHES = /[–—]/;

describe('one lesson per level (item 5)', () => {
    it('every level has a complete lesson', () => {
        for (const level of LEVELS) {
            const l = lessonFor(level.id);
            expect(l, level.id).toBeTruthy();
            for (const key of ['title', 'brief', 'win', 'retry']) {
                expect(typeof l[key], `${level.id}.${key}`).toBe('string');
                expect(l[key].trim().length, `${level.id}.${key}`).toBeGreaterThan(3);
            }
        }
    });

    it('no orphan lessons and no repeated titles', () => {
        const ids = new Set(LEVELS.map((l) => l.id));
        for (const id of Object.keys(LESSONS)) expect(ids.has(id), id).toBe(true);
        const titles = Object.values(LESSONS).map((l) => l.title);
        expect(new Set(titles).size).toBe(titles.length);
    });

    it('copy is short enough for a phone and uses no emoji or long dashes', () => {
        for (const [id, l] of Object.entries(LESSONS)) {
            expect(l.title.split(/\s+/).length, id).toBeLessThanOrEqual(4);
            for (const key of ['brief', 'win', 'retry']) {
                expect(l[key].length, `${id}.${key}`).toBeLessThanOrEqual(150);
                expect(l[key], `${id}.${key}`).not.toMatch(DASHES);
                expect(l[key], `${id}.${key}`).not.toMatch(EMOJI);
            }
        }
    });

    it('results show the fact on a win and a tip otherwise', () => {
        const l = lessonFor('r1-care-home');
        expect(debriefLine(l, 'contained')).toBe(l.win);
        expect(debriefLine(l, 'overwhelmed')).toBe(l.retry);
        expect(debriefLine(l, 'timeout')).toBe(l.retry);
        expect(debriefLine(null, 'contained')).toBe('');
        expect(lessonFor('nope')).toBeNull();
    });

    it('briefing and results screens have a lesson card wired from game.js', () => {
        const html = read('index.html');
        for (const id of ['briefing-lesson', 'briefing-lesson-title', 'briefing-lesson-text', 'game-over-lesson', 'game-over-lesson-title', 'game-over-lesson-text']) {
            expect(html).toContain(`id="${id}"`);
        }
        const game = read('src/game.js');
        expect(game).toMatch(/fillLessonCard\('briefing-lesson'/);
        expect(game).toMatch(/fillLessonCard\('game-over-lesson'/);
    });
});

describe('lazy network view (item 8)', () => {
    it('game.js has no static import of three.js or the 3D view', () => {
        const game = read('src/game.js');
        expect(game).not.toMatch(/^import[^;]*['"]three['"]/m);
        expect(game).not.toMatch(/^import[^;]*network-view-3d/m);
        expect(game).toMatch(/import\('\.\/ui\/network-view-3d\.js'\)/);
        const main = read('src/main.js');
        expect(main).not.toMatch(/^import[^;]*['"]three['"]/m);
    });

    it('loads once and caches the module', async () => {
        const mod = { NetworkView: class {} };
        const importer = vi.fn(async () => mod);
        const loader = createViewLoader(importer);
        loader.prefetch();
        const [a, b] = await Promise.all([loader.load(), loader.load()]);
        expect(a).toBe(mod);
        expect(b).toBe(mod);
        expect(importer).toHaveBeenCalledTimes(1);
    });

    it('a failed load can be retried', async () => {
        const mod = { NetworkView: class {} };
        const importer = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(mod);
        const loader = createViewLoader(importer);
        await expect(loader.load()).rejects.toThrow('offline');
        await expect(loader.load()).resolves.toBe(mod);
        expect(importer).toHaveBeenCalledTimes(2);
    });

    it('prefetch swallows errors', async () => {
        const loader = createViewLoader(() => Promise.reject(new Error('x')));
        expect(() => loader.prefetch()).not.toThrow();
        await new Promise((r) => setTimeout(r, 0));
    });
});
