// Wide audience pass, story and identity: the game has one name, Galactic
// Outbreak. "VAXrebot" may remain only as the repo and package name (and in
// storage keys, which players never see); "Epidemic Control Simulator" is
// gone from everything a player can see.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => readFileSync(join(root, p), 'utf8');

function walk(dir, out = []) {
    for (const name of readdirSync(join(root, dir))) {
        const p = `${dir}/${name}`;
        if (statSync(join(root, p)).isDirectory()) walk(p, out);
        else if (/\.(js|mjs|html|css)$/.test(name)) out.push(p);
    }
    return out;
}

// What a player can see: the page, the public pages, and the text the
// scripts put on screen (comments, storage keys and repo links are not).
const pages = ['index.html', ...walk('public')];
const scripts = walk('src');

function visible(source) {
    return source
        .replace(/\/\*[\s\S]*?\*\//g, '') // block comments
        .replace(/^\s*\/\/.*$/gm, '') // comment lines
        .replace(/\s\/\/ .*$/gm, '') // trailing comments
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/atroy8(\.github\.io)?\/VAXrebot/g, '') // repo and pages links
        .replace(/['"`]_*vaxrebot[-_][-_.a-z0-9]*['"`]/g, ''); // storage keys
}

describe('one name: Galactic Outbreak', () => {
    it('the page title, meta tags and headings say Galactic Outbreak', () => {
        const html = read('index.html');
        expect(html).toContain('<title>Galactic Outbreak</title>');
        expect(html).toMatch(/name="apple-mobile-web-app-title" content="Galactic Outbreak"/);
        expect(html).toMatch(/name="description" content="Galactic Outbreak/);
        for (const h1 of html.match(/<h1>[^<]*<\/h1>/g) || []) expect(h1).toBe('<h1>Galactic Outbreak</h1>');
    });

    it('the public pages name the game Galactic Outbreak', () => {
        for (const p of ['public/privacy.html', 'public/support.html']) {
            expect(read(p)).toMatch(/<title>Galactic Outbreak /);
        }
    });

    it('no player-visible source says Epidemic Control Simulator', () => {
        for (const p of [...pages, ...scripts]) {
            expect(read(p), p).not.toMatch(/epidemic\s+control/i);
        }
    });

    it('VAXrebot appears only as the repo name and in storage keys', () => {
        expect(pages.length).toBeGreaterThan(2);
        expect(scripts.length).toBeGreaterThan(50);
        for (const p of [...pages, ...scripts]) {
            expect(visible(read(p)), p).not.toMatch(/vaxrebot/i);
        }
    });

    it('the check itself would catch the old names', () => {
        expect(visible("title.textContent = 'VAXrebot';")).toMatch(/vaxrebot/i);
        expect(visible("const KEY = 'vaxrebot-save-v1'; // VAXrebot save")).not.toMatch(/vaxrebot/i);
    });
});
