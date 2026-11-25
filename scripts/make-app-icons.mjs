// npm run icons: draws the app icon and launch screen from the game's own
// vector art and writes every size the iOS project and the web manifest use.
//
//   store/icon/app-icon-1024.png                     master, for App Store Connect
//   ios/App/App/Assets.xcassets/AppIcon.appiconset/  the one 1024 px icon Xcode needs
//   ios/App/App/Assets.xcassets/Splash.imageset/     launch image (navy, gold title)
//   public/icons/                                    web manifest and home screen icons
//
// Apple's rules for the icon: 1024 x 1024, square corners (iOS rounds them),
// and no transparency. flatten() plus removeAlpha() below guarantee the last
// one. The art is a citizen token from art/source/citizens.mjs, the same
// cloisonne face the player protects in every level, on the game's navy.
import { mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { citizenSvg, GOLD, GOLD_LIGHT, GOLD_DARK } from '../art/source/citizens.mjs';
import { TITLE_GALACTIC, TITLE_OUTBREAK, TITLE_CAP_HEIGHT } from '../art/source/title-path.mjs';

export const NAVY = '#0b1838';
export const NAVY_LIGHT = '#1b3a7a';
export const ICON_SIZE = 1024;
export const SPLASH_SIZE = 2732;

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// A four-point gold sparkle, the star shape the game uses for its rewards.
const sparkle = (x, y, r, op = 1) => {
    const k = r * 0.22;
    return `<path d="M${x} ${y - r} Q${x + k} ${y - k} ${x + r} ${y} Q${x + k} ${y + k} ${x} ${y + r} Q${x - k} ${y + k} ${x - r} ${y} Q${x - k} ${y - k} ${x} ${y - r} Z" fill="${GOLD_LIGHT}" opacity="${op}"/>`;
};

const defs = `<defs>
    <radialGradient id="sky" cx="0.5" cy="0.42" r="0.75">
      <stop offset="0" stop-color="${NAVY_LIGHT}"/><stop offset="1" stop-color="${NAVY}"/>
    </radialGradient>
    <linearGradient id="titleGold" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${GOLD_LIGHT}"/><stop offset="0.55" stop-color="${GOLD}"/><stop offset="1" stop-color="${GOLD_DARK}"/>
    </linearGradient>
  </defs>`;

// The token art is drawn in a 1024 box with the ring out to about 470 from
// the centre. `scale` places it inside the icon; `safe` shrinks everything
// into the middle 80 percent for Android style maskable icons.
export function iconSvg({ size = ICON_SIZE, scale = 1.02, safe = false } = {}) {
    const s = safe ? scale * 0.74 : scale;
    const token = citizenSvg('vaccinated', 'happy', { size: 1024, background: null })
        .replace(/^<svg[^>]*>/, '')
        .replace(/<\/svg>\s*$/, '');
    const stars = safe
        ? ''
        : [sparkle(92, 104, 46), sparkle(936, 132, 34, 0.9), sparkle(118, 912, 30, 0.85), sparkle(930, 906, 42)].join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1024 1024">
  ${defs}
  <rect width="1024" height="1024" fill="url(#sky)"/>
  ${stars}
  <g transform="translate(512 512) scale(${s}) translate(-512 -512)">${token}</g>
</svg>`;
}

// One line of the title, centred on x, with its baseline on y.
function titleLine(line, cx, baseline, capPx, fill = 'url(#titleGold)') {
    const k = capPx / TITLE_CAP_HEIGHT;
    const x = cx - (line.width * k) / 2;
    const shadow = `<path d="${line.d}" transform="translate(${x} ${baseline + capPx * 0.07}) scale(${k})" fill="#050b1f" opacity="0.7"/>`;
    return `${shadow}<path d="${line.d}" transform="translate(${x} ${baseline}) scale(${k})" fill="${fill}"/>`;
}

// Launch screen art. iOS shows it with scaleAspectFill, so on a tall phone
// only the middle 46 percent of the width is visible: the title stays well
// inside that strip.
export function splashSvg({ size = SPLASH_SIZE } = {}) {
    const c = SPLASH_SIZE / 2;
    const cap = 150;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${SPLASH_SIZE} ${SPLASH_SIZE}">
  ${defs}
  <rect width="${SPLASH_SIZE}" height="${SPLASH_SIZE}" fill="${NAVY}"/>
  ${sparkle(c - 380, c - 330, 34, 0.9)}${sparkle(c + 400, c - 270, 24, 0.8)}${sparkle(c + 330, c + 330, 30, 0.85)}${sparkle(c - 420, c + 280, 20, 0.75)}
  ${titleLine(TITLE_GALACTIC, c, c - 40, cap)}
  ${titleLine(TITLE_OUTBREAK, c, c + 190, cap)}
</svg>`;
}

// PNG bytes with no alpha channel, whatever the size.
export function renderPng(svg, size) {
    return sharp(Buffer.from(svg), { density: 72 })
        .resize(size, size)
        .flatten({ background: NAVY })
        .removeAlpha()
        .png({ compressionLevel: 9 })
        .toBuffer();
}

export const renderIcon = (size = ICON_SIZE, opts = {}) => renderPng(iconSvg({ ...opts, size }), size);

export const WEB_ICONS = [
    { file: 'icon-192.png', size: 192 },
    { file: 'icon-512.png', size: 512 },
    { file: 'icon-maskable-512.png', size: 512, safe: true },
    { file: 'apple-touch-icon.png', size: 180 },
];

async function main() {
    const write = async (file, buf) => {
        mkdirSync(dirname(file), { recursive: true });
        await sharp(buf).toFile(file);
        return file;
    };
    const done = [];
    const master = await renderIcon(ICON_SIZE);
    done.push(await write(join(root, 'store/icon/app-icon-1024.png'), master));

    for (const { file, size, safe } of WEB_ICONS) {
        done.push(await write(join(root, 'public/icons', file), await renderIcon(size, { safe })));
    }

    const catalog = join(root, 'ios/App/App/Assets.xcassets');
    if (existsSync(catalog)) {
        done.push(await write(join(catalog, 'AppIcon.appiconset/AppIcon-512@2x.png'), master));
        const splash = await renderPng(splashSvg(), SPLASH_SIZE);
        for (const name of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']) {
            done.push(await write(join(catalog, 'Splash.imageset', name), splash));
        }
    } else {
        console.log('No ios/ project here: skipped the asset catalog. Run `npx cap add ios` first.');
    }
    console.log(`Wrote ${done.length} images:\n` + done.map((f) => '  ' + f.replace(root + '/', '')).join('\n'));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    await main();
}
