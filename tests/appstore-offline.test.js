import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { PUBLIC_PRIVACY_URL, PUBLIC_SUPPORT_URL } from '../src/ui/settings.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const srcFiles = readdirSync(new URL('../src', import.meta.url), { recursive: true })
    .map((f) => String(f).replace(/\\/g, '/'))
    .filter((f) => /\.(js|css|html)$/.test(f));

// The game must play with no network at all: it ships inside the app and
// nothing may be fetched at run time. The Playwright check (every request
// same-origin, see the report for the App Store pass) proves it for one
// build; this scan keeps it true as the code changes.
describe('the game makes no network requests (App Store pass)', () => {
    // URLs that may appear in src. None of them is ever requested by the page.
    const ALLOWED = [
        // XML namespaces: identifiers, not addresses.
        /^http:\/\/www\.w3\.org\/(2000\/svg|1999\/xlink|1999\/xhtml)$/,
        // The public privacy and support pages, opened in Safari from the app.
        new RegExp(`^${PUBLIC_PRIVACY_URL.replace(/[.]/g, '\\.')}$`),
        new RegExp(`^${PUBLIC_SUPPORT_URL.replace(/[.]/g, '\\.')}$`),
    ];
    // Source citations for the real disease numbers: plain data, shown to
    // nobody as a link and never fetched.
    const CITATION_FILES = ['config/scenarios.js'];

    it('has no http or https URL in src outside the allowlist', () => {
        const found = [];
        for (const f of srcFiles) {
            if (CITATION_FILES.includes(f)) continue;
            for (const m of read(`src/${f}`).matchAll(/https?:\/\/[^\s"'`)<>\\]+/g)) {
                const url = m[0].replace(/[.,;]+$/, '');
                if (!ALLOWED.some((re) => re.test(url))) found.push(`${f}: ${url}`);
            }
        }
        expect(found).toEqual([]);
    });

    it('keeps citations as data: every URL in scenarios.js sits in a Source field', () => {
        const text = read('src/config/scenarios.js');
        const urls = [...text.matchAll(/https?:\/\/[^\s"'`)<>\\]+/g)];
        const inField = [...text.matchAll(/[A-Za-z]*Source: "https?:\/\/[^"]+"/g)];
        expect(urls.length).toBeGreaterThan(0);
        expect(inField.length).toBe(urls.length);
        // And no screen turns one into a link or a request.
        const users = srcFiles.filter((f) => f !== 'config/scenarios.js' && /\b(cfrSource|r0Source)\b/.test(read(`src/${f}`)));
        expect(users).toEqual([]);
    });

    it('calls no network API', () => {
        const apis = /\bfetch\s*\(|XMLHttpRequest|new WebSocket|sendBeacon|new EventSource|importScripts\s*\(|navigator\.serviceWorker/;
        const users = srcFiles.filter((f) => f.endsWith('.js') && apis.test(read(`src/${f}`)));
        expect(users).toEqual([]);
    });

    it('loads no script, style, font or image from another site in index.html', () => {
        const html = read('index.html');
        const remote = [...html.matchAll(/(?:src|href)\s*=\s*"(https?:)?\/\/[^"]+"/g)].map((m) => m[0]);
        expect(remote).toEqual([]);
        expect(html).not.toMatch(/fonts\.googleapis|cdn\.|unpkg|jsdelivr/);
    });

    it('bundles its font instead of linking to one', () => {
        const main = read('src/main.js');
        expect(main).toContain("import '@fontsource/fredoka/500.css';");
        expect(main).toContain("import '@fontsource/fredoka/700.css';");
        for (const f of srcFiles.filter((x) => x.endsWith('.css'))) {
            expect(read(`src/${f}`)).not.toMatch(/@import\s+url\(\s*['"]?https?:/);
        }
    });

    it('the static pages link out but load nothing remote', () => {
        for (const page of ['public/privacy.html', 'public/support.html']) {
            const html = read(page);
            expect([...html.matchAll(/<(?:script|img|iframe)[^>]*src="https?:[^"]*"/g)]).toEqual([]);
            expect([...html.matchAll(/<link[^>]*href="https?:[^"]*"/g)]).toEqual([]);
        }
    });
});

describe('privacy and support pages describe the app as it is now', () => {
    const privacy = read('public/privacy.html');
    const support = read('public/support.html');

    it('says storage is local, and that ads and purchases belong to the iPhone app', () => {
        expect(privacy).toContain('on your device');
        expect(privacy).toContain('plays offline');
        expect(privacy).toContain('the web version shows no real ads');
        expect(privacy).toContain('Purchases exist only in the iPhone app');
        expect(support).toContain('The web version has none.');
    });

    it('names the newer things the save holds', () => {
        for (const phrase of ['Daily puzzle streak', 'Bonus goals', 'upgrades', 'Gentle mode']) expect(privacy).toContain(phrase);
    });

    it('gives a way to get in touch, and help for the newer features', () => {
        expect(support).toMatch(/<h2>Contact<\/h2>/);
        expect(support).toContain('github.com/atroy8/VAXrebot/issues');
        expect(privacy).toContain('contact link on <a href="./support.html">');
        for (const phrase of ['Gentle mode', 'Hint', 'Undo', 'Test', 'Mask', 'not medical advice']) expect(support).toContain(phrase);
    });
});
