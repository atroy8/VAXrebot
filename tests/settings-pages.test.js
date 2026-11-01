import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { settingsMarkup, PRIVACY_URL, SUPPORT_URL } from '../src/ui/settings.js';
import { AD_CONFIG } from '../src/config/ads.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

describe('privacy and support pages (item 9)', () => {
    for (const page of ['public/privacy.html', 'public/support.html']) {
        it(`${page} exists, is phone ready, and has a title`, () => {
            expect(existsSync(new URL(`../${page}`, import.meta.url))).toBe(true);
            const html = read(page);
            expect(html).toMatch(/<title>Galactic Outbreak [^<]+<\/title>/);
            expect(html).toContain('name="viewport"');
            expect(html).toContain('href="./index.html"');
        });
    }

    it('privacy policy covers storage, ads, purchases and children', () => {
        const html = read('public/privacy.html');
        for (const topic of ['on your device', 'AdMob', 'Remove Ads', 'Apple', 'under 13']) {
            expect(html).toContain(topic);
        }
    });

    it('privacy policy matches the ad settings the app actually ships', () => {
        const html = read('public/privacy.html');
        if (AD_CONFIG.requestTracking) {
            expect(html).toContain('ask your permission before any tracking');
        } else {
            // No App Tracking Transparency prompt, so every ad is non-personalized
            // and the policy must not promise a prompt that never appears.
            expect(html).not.toContain('ask your permission before any tracking');
            expect(html).toContain('never shows Apple\'s tracking prompt');
            expect(html).toContain('non-personalized');
        }
        if (AD_CONFIG.maxAdContentRating === 'General') {
            expect(html).toContain('general audiences');
        }
        expect(html).toMatch(/Last updated [A-Z][a-z]+ \d{1,2}, \d{4}\./);
    });

    it('privacy policy names everything the game saves on the device (round 29)', () => {
        // Every localStorage key in src/ needs a line in What the game stores,
        // so the App Store privacy answers stay true as features are added.
        const html = read('public/privacy.html');
        const covered = {
            'vaxrebot-save-v1': ['level progress', 'stars', 'in-game funding', 'power-up charges'],
            'vaxrebot-monetization-v1': ['own Remove Ads'],
            'vaxrebot_music_enabled': ['music'],
            'vaxrebot-haptics-v1': ['vibration'],
            'galactic-outbreak.view-3d.v1': ['2D or 3D'],
            'galactic-outbreak.prologue-seen.v1': ['seen the story'],
            'vaxrebot-onboarded': ['how-to-play screen'],
            'galactic-outbreak.orbit-hint.v1': ['3D view tip'],
        };
        const files = readdirSync(new URL('../src', import.meta.url), { recursive: true })
            .filter((f) => f.endsWith('.js'));
        const src = files.map((f) => read(`src/${f}`)).join('\n');
        const keys = [...new Set([...src.matchAll(/'((?:vaxrebot|galactic-outbreak)[-_.a-z0-9]*)'/g)].map((m) => m[1]))];
        expect(keys.sort()).toEqual(Object.keys(covered).sort());
        for (const phrases of Object.values(covered)) {
            for (const phrase of phrases) expect(html).toContain(phrase);
        }
    });

    it('help page describes the game as it plays today (round 29)', () => {
        const html = read('public/support.html');
        for (const idea of ['red line', 'later days', 'can die', 'Restore purchases']) {
            expect(html).toContain(idea);
        }
    });

    it('settings links to both pages and offers Remove Ads and Restore', () => {
        const html = settingsMarkup({ adsRemoved: false });
        expect(PRIVACY_URL).toBe('./privacy.html');
        expect(SUPPORT_URL).toBe('./support.html');
        expect(html).toContain(`href="${PRIVACY_URL}"`);
        expect(html).toContain(`href="${SUPPORT_URL}"`);
        expect(html).toContain('Remove Ads');
        expect(html).toContain('Restore purchases');
    });
});

describe('game page head (round 11)', () => {
    it('is titled Galactic Outbreak and ships its own icon, so browsers do not 404 on favicon.ico', () => {
        const html = read('index.html');
        expect(html).toContain('<title>Galactic Outbreak</title>');
        expect(html).toMatch(/<link rel="icon" type="image\/svg\+xml" href="data:image\/svg\+xml,/);
    });
});
