import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { PUBLIC_PRIVACY_URL, PUBLIC_SUPPORT_URL } from '../src/ui/settings.js';
import { LEVELS, PLANET_DEFS } from '../src/config/levels.js';
import { MENTOR } from '../src/config/mentor.js';
import { ALIEN_RACE } from '../src/ui/prologue.js';
import { AD_POLICY } from '../src/monetization/ad-policy.js';
import { AD_CONFIG } from '../src/config/ads.js';

const path = (p) => new URL(`../${p}`, import.meta.url);
const read = (p) => readFileSync(path(p), 'utf8');
const field = (name) => read(`store/listing/${name}`).trim();
// Apple counts characters, so count code points, not UTF-16 units.
const chars = (s) => [...s].length;

// App Store Connect limits.
const LIMITS = {
    'name.txt': 30,
    'subtitle.txt': 30,
    'promotional-text.txt': 170,
    'description.txt': 4000,
    'keywords.txt': 100,
    'whats-new.txt': 4000,
    'review-notes.txt': 4000,
};

describe('store listing respects Apple limits', () => {
    for (const [file, max] of Object.entries(LIMITS)) {
        it(`${file} is at most ${max} characters and not empty`, () => {
            const text = field(file);
            expect(chars(text)).toBeGreaterThan(0);
            expect(chars(text)).toBeLessThanOrEqual(max);
        });
    }

    it('short fields are one line', () => {
        for (const file of ['name.txt', 'subtitle.txt', 'promotional-text.txt', 'keywords.txt']) {
            expect(field(file)).not.toContain('\n');
        }
    });

    it('keywords are comma separated with no spaces, no repeats and no words from the name', () => {
        const words = field('keywords.txt').split(',');
        expect(field('keywords.txt')).not.toMatch(/\s/);
        expect(words.length).toBeGreaterThanOrEqual(8);
        expect(new Set(words).size).toBe(words.length);
        for (const w of words) expect(w).toMatch(/^[a-z]+$/);
        const nameWords = `${field('name.txt')} ${field('subtitle.txt')}`.toLowerCase().split(/[^a-z]+/);
        expect(words.filter((w) => nameWords.includes(w))).toEqual([]);
    });

    it('the description uses the room it has', () => {
        expect(chars(field('description.txt'))).toBeGreaterThan(1500);
    });
});

describe('store listing is true to the game', () => {
    const description = field('description.txt');

    it('uses the game name, the villains and the mentor', () => {
        expect(field('name.txt')).toBe('Galactic Outbreak');
        expect(description).toContain('Galactic Outbreak');
        expect(ALIEN_RACE).toBe('the Blightborne');
        expect(description).toContain('Blightborne');
        expect(description).toContain(MENTOR.name);
        expect(field('whats-new.txt')).toContain(MENTOR.short);
    });

    it('counts levels and planets the way the game does', () => {
        expect(description).toContain(`${LEVELS.length} levels across ${PLANET_DEFS.length} `);
        expect(field('promotional-text.txt')).toMatch(/Eighty outbreak puzzles on eight planets/);
        expect(LEVELS.length).toBe(80);
        expect(PLANET_DEFS.length).toBe(8);
        expect(description).toContain(PLANET_DEFS[0].name);
        expect(description).toContain(PLANET_DEFS.at(-1).name);
    });

    it('names only strains, tools and lessons that exist', () => {
        const scenarios = read('src/config/scenarios.js');
        const strains = description.match(/invented strains \(([^)]+)\)/)[1].split(/,\s*|\s+and\s+/).filter(Boolean);
        expect(strains.length).toBe(5);
        for (const s of strains) expect(scenarios).toContain(`strainName: "${s}"`);
        const tools = read('src/config/tools.js');
        for (const t of ['Vaccinate', 'Quarantine', 'Sever Link', 'Test', 'Mask']) expect(tools).toContain(t);
        const lessons = read('src/config/lessons.js');
        for (const title of ['Herd immunity', 'Contact tracing', 'Masks buy time', 'Flatten the curve', 'Keep R below 1', 'Hubs and super-spreaders', 'Ring vaccination', 'Shield the vulnerable', 'Act early']) {
            expect(lessons).toContain(`title: '${title}'`);
        }
        for (const idea of ['R, the number', 'Herd immunity', 'Contact tracing', 'Masks', 'flattening the curve']) {
            expect(description).toContain(idea);
        }
    });

    it('is honest about ads, deaths and medical advice, and never says Kids', () => {
        expect(description).toMatch(/ads between levels, never during one/);
        expect(description).toContain('Remove Ads');
        expect(description).toMatch(/can die/);
        expect(description).toContain('not medical advice');
        expect(description).toContain('Plays offline');
        const everything = readdirSync(path('store/listing')).map((f) => read(`store/listing/${f}`)).join('\n');
        expect(everything).not.toMatch(/\bfor kids\b|kid-friendly|#1|best game/i);
    });

    it('review notes describe the ad pacing the code enforces', () => {
        const notes = field('review-notes.txt');
        expect(AD_POLICY.minLevelsBeforeFirstAd).toBe(2);
        expect(AD_POLICY.levelsBetweenAds).toBe(2);
        expect(notes).toContain('finished two levels');
        expect(notes).toContain('at most one per two finished levels');
        expect(notes).toMatch(/NO LOGIN/);
        expect(notes).toContain('Remove Ads');
        expect(notes).toContain('Restore purchases');
        expect(notes).toContain('remove_ads');
        if (!AD_CONFIG.requestTracking) expect(notes).toContain('does not show the App Tracking Transparency prompt');
    });

    it('points at the pages the game itself links to', () => {
        expect(field('privacy-policy-url.txt')).toBe(PUBLIC_PRIVACY_URL);
        expect(field('support-url.txt')).toBe(PUBLIC_SUPPORT_URL);
        expect(field('marketing-url.txt')).toBe('https://atroy8.github.io/VAXrebot/');
        expect(existsSync(path('public/privacy.html'))).toBe(true);
        expect(existsSync(path('public/support.html'))).toBe(true);
    });
});

describe('store pack is complete', () => {
    const docs = ['README.md', 'RELEASE.md', 'categories.md', 'age-rating.md', 'app-privacy.md', 'export-compliance.md'];

    it('has every document and no long dashes', () => {
        const longDash = String.fromCharCode(0x2014);
        for (const doc of docs) {
            const text = read(`store/${doc}`);
            expect(text.length).toBeGreaterThan(400);
            expect(text).not.toContain(longDash);
        }
        for (const f of readdirSync(path('store/listing'))) expect(read(`store/listing/${f}`)).not.toContain(longDash);
    });

    it('suggests Games with Puzzle first and keeps out of the Kids category', () => {
        const cats = read('store/categories.md');
        expect(cats).toMatch(/Primary category \| Games/);
        expect(cats).toMatch(/subcategory 1 \| Puzzle/);
        expect(cats).toContain('do not choose the Kids category');
        expect(read('store/age-rating.md')).toMatch(/Made for Kids \| No/);
        expect(read('store/age-rating.md')).toMatch(/Medical or Treatment Information \| Infrequent or Mild/);
    });

    it('privacy answers follow the tracking setting in the code', () => {
        const privacy = read('store/app-privacy.md');
        expect(privacy).toContain(`requestTracking: ${AD_CONFIG.requestTracking}`);
        expect(privacy).toContain('Third-Party Advertising');
        expect(privacy).toContain('Identifiers, Device ID');
        expect(privacy).toContain('After a player buys Remove Ads');
    });

    it('the checklist runs from enrolling to submitting and names the product id', () => {
        const release = read('store/RELEASE.md');
        const steps = [...release.matchAll(/^## (\d+)\. (.+)$/gm)].map((m) => [Number(m[1]), m[2]]);
        expect(steps.map((s) => s[0])).toEqual(steps.map((_, i) => i + 1));
        expect(steps.length).toBeGreaterThanOrEqual(10);
        expect(steps[0][1]).toMatch(/Apple Developer Program/);
        expect(steps.at(-1)[1]).toMatch(/Submit for review/);
        for (const must of ['com.adamtroy.galacticoutbreak', '`remove_ads`', 'Non-Consumable', 'AdMob', 'RevenueCat', 'TestFlight', 'NSUserTrackingUsageDescription', 'Sandbox']) {
            expect(release).toContain(must);
        }
        // The tracking prompt quoted in the checklist is the one in the app.
        const prompt = read('ios/App/App/Info.plist').match(/<key>NSUserTrackingUsageDescription<\/key>\s*<string>([^<]*)<\/string>/)[1];
        expect(release).toContain(prompt);
    });

    it('says plainly that the purchase is not wired yet, while that is true', () => {
        const settings = read('src/ui/settings.js');
        if (settings.includes('Purchases arrive with the App Store version.')) {
            expect(read('store/RELEASE.md')).toContain('The Remove Ads purchase is not wired.');
        }
    });

    it('ships the master icon, and screenshots only if they are small enough for the repo', () => {
        expect(existsSync(path('store/icon/app-icon-1024.png'))).toBe(true);
        const dir = path('store/screenshots');
        if (!existsSync(dir)) return;
        let total = 0;
        for (const f of readdirSync(dir, { recursive: true })) {
            const s = statSync(new URL(`../store/screenshots/${f}`, import.meta.url));
            if (s.isFile()) total += s.size;
        }
        expect(total).toBeLessThan(8 * 1024 * 1024);
    });
});
