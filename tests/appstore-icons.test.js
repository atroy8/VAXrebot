import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { iconSvg, splashSvg, renderIcon, renderPng, WEB_ICONS, NAVY, ICON_SIZE, SPLASH_SIZE } from '../scripts/make-app-icons.mjs';
import { TITLE_GALACTIC, TITLE_OUTBREAK } from '../art/source/title-path.mjs';

const file = (p) => fileURLToPath(new URL(`../${p}`, import.meta.url));

describe('app icon (App Store pass)', () => {
    it('draws a citizen token from the game art on the navy sky, with square corners', () => {
        const svg = iconSvg();
        // Booleans, so a failure does not print the whole drawing.
        const has = (text) => svg.includes(text);
        expect(has('viewBox="0 0 1024 1024"')).toBe(true);
        expect(has('<rect width="1024" height="1024" fill="url(#sky)"/>')).toBe(true); // full bleed, square: iOS rounds the corners
        expect(has(NAVY)).toBe(true);
        expect(has('clip-path="url(#inner)"')).toBe(true); // the token from art/source/citizens.mjs
        expect(has('data-ring="double"')).toBe(true); // the protected citizen
        expect(has('<text')).toBe(false);
    });

    it('renders with no alpha channel at any size', async () => {
        for (const size of [60, 180]) {
            const meta = await sharp(await renderIcon(size)).metadata();
            expect(meta.format).toBe('png');
            expect(meta.width).toBe(size);
            expect(meta.height).toBe(size);
            expect(meta.hasAlpha).toBe(false);
            expect(meta.channels).toBe(3);
        }
    });

    it('keeps the maskable icon inside the safe middle', async () => {
        const size = 96;
        const { data } = await sharp(await renderIcon(size, { safe: true })).raw().toBuffer({ resolveWithObject: true });
        // A point 8 percent in from the edge is plain sky: dark blue, no gold ring.
        const at = (x, y) => [...data.subarray((y * size + x) * 3, (y * size + x) * 3 + 3)];
        for (const [x, y] of [[8, 48], [88, 48], [48, 8], [48, 88]]) {
            const [r, g, b] = at(x, y);
            expect(r).toBeLessThan(60);
            expect(b).toBeGreaterThan(g);
        }
    });

    it('the committed master is 1024 x 1024 with no transparency, and reads at small sizes', async () => {
        const master = file('store/icon/app-icon-1024.png');
        const meta = await sharp(master).metadata();
        expect([meta.width, meta.height]).toEqual([ICON_SIZE, ICON_SIZE]);
        expect(meta.hasAlpha).toBe(false);
        // Square corners: the corner pixel is the navy sky, fully painted.
        const { data } = await sharp(master).extract({ left: 0, top: 0, width: 1, height: 1 }).raw().toBuffer({ resolveWithObject: true });
        expect(data[2]).toBeGreaterThan(data[0]);
        // Readable at 60 px: the face in the middle is much lighter than the sky at the edge.
        const small = await sharp(master).resize(60, 60).greyscale().raw().toBuffer();
        const lum = (x, y) => small[y * 60 + x];
        expect(lum(30, 32) - lum(2, 30)).toBeGreaterThan(80);
    });

    it('the iOS catalog icon is the same picture as the master', async () => {
        const a = await sharp(file('store/icon/app-icon-1024.png')).resize(32, 32).raw().toBuffer();
        const b = await sharp(file('ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png')).resize(32, 32).raw().toBuffer();
        expect(Buffer.compare(a, b)).toBe(0);
        expect((await sharp(file('ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png')).metadata()).hasAlpha).toBe(false);
    });

    it('web icons exist at the sizes the manifest and the page ask for', async () => {
        expect(WEB_ICONS.map((i) => i.file)).toEqual(['icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png']);
        for (const { file: name, size } of WEB_ICONS) {
            const meta = await sharp(file(`public/icons/${name}`)).metadata();
            expect([meta.width, meta.height]).toEqual([size, size]);
            expect(meta.hasAlpha).toBe(false);
        }
    });
});

describe('launch screen', () => {
    it('is the gold title on navy, drawn from the game font outlines', () => {
        const svg = splashSvg();
        const has = (text) => svg.includes(text);
        expect(has(`fill="${NAVY}"`)).toBe(true);
        expect(has('url(#titleGold)')).toBe(true);
        expect(has(TITLE_GALACTIC.d.slice(0, 40))).toBe(true);
        expect(has(TITLE_OUTBREAK.d.slice(0, 40))).toBe(true);
        expect(has('<text')).toBe(false); // no system font needed
    });

    it('keeps the title inside the strip a tall phone shows', async () => {
        // Aspect fill on a 9 by 19.5 phone shows the middle 46 percent of the width.
        const size = 400;
        const buf = await renderPng(splashSvg(), size);
        const { data } = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
        const bright = (x, y) => data[(y * size + x) * 3] > 150; // gold is bright in red, navy is not
        let minX = size;
        let maxX = 0;
        for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (bright(x, y)) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); }
        expect(minX).toBeGreaterThan(size * 0.27);
        expect(maxX).toBeLessThan(size * 0.73);
        expect(maxX - minX).toBeGreaterThan(size * 0.2);
    });

    it('the committed launch images are square, opaque and navy at the edge', async () => {
        for (const name of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']) {
            const p = file(`ios/App/App/Assets.xcassets/Splash.imageset/${name}`);
            expect(existsSync(p)).toBe(true);
            const meta = await sharp(p).metadata();
            expect([meta.width, meta.height]).toEqual([SPLASH_SIZE, SPLASH_SIZE]);
            expect(meta.hasAlpha).toBe(false);
        }
        const { data } = await sharp(file('ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732.png')).extract({ left: 5, top: 5, width: 1, height: 1 }).raw().toBuffer({ resolveWithObject: true });
        expect([...data]).toEqual([0x0b, 0x18, 0x38]);
    });
});
