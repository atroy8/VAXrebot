import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { settingsMarkup, PRIVACY_URL, SUPPORT_URL } from '../src/ui/settings.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

describe('privacy and support pages (item 9)', () => {
    for (const page of ['public/privacy.html', 'public/support.html']) {
        it(`${page} exists, is phone ready, and has a title`, () => {
            expect(existsSync(new URL(`../${page}`, import.meta.url))).toBe(true);
            const html = read(page);
            expect(html).toMatch(/<title>VAXrebot [^<]+<\/title>/);
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
