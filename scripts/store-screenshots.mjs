// npm run store:screenshots: real in-game screenshots at the sizes the App
// Store asks for. It builds nothing: it drives a preview that is already
// running and saves PNGs into store/screenshots/.
//
// How to run:
//   npx vite build --base=./
//   npx vite preview --port 4320 --strictPort &
//   npm run store:screenshots
//
// Options (environment variables):
//   STORE_URL        where the preview is            (default http://localhost:4320/)
//   STORE_OUT        output folder                   (default store/screenshots)
//   STORE_SIZES      which sizes, comma separated    (default 6.9-inch,6.5-inch)
//   STORE_FORMAT     jpg or png                      (default jpg: App Store Connect
//                    takes both, and twelve PNGs would add 20 MB to the repo)
//   PLAYWRIGHT_FROM  a folder or file next to a node_modules that has
//                    playwright, when it is not installed in this repo.
//                    Otherwise: npm install --no-save playwright
//                    and npx playwright install chromium
//
// What it does: writes a saved game into localStorage (three planets
// finished, the fourth under way, see src/save.js for the format) so later
// levels are unlocked, then walks through the game and plays real moves
// through the game's own handlers. Nothing in a screenshot is mocked. The
// iPhone safe area (status bar and home bar) is simulated so the layout is
// the one a player sees on the device.
//
// Sizes: 6.9 inch is 1320 x 2868 (viewport 440 x 956 at 3x) and 6.5 inch is
// 1284 x 2778 (428 x 926 at 3x). Apple needs the 6.9 inch set; the 6.5 inch
// set is optional.
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const FORMAT = process.env.STORE_FORMAT === 'png' ? 'png' : 'jpg';

export const SIZES = {
    '6.9-inch': { width: 440, height: 956, scale: 3, insets: { top: 62, bottom: 34, left: 0, right: 0 } },
    '6.5-inch': { width: 428, height: 926, scale: 3, insets: { top: 47, bottom: 34, left: 0, right: 0 } },
};

// Levels tried, in order, for the mid-outbreak shot.
export const OUTBREAK_LEVELS = ['hanabi-8', 'mizuho-8', 'hanabi-6', 'tsukimi-8', 'mizuho-6', 'hanabi-3', 'mizuho-5'];

export const SHOTS = [
    { file: '01-title', what: 'The title planet' },
    { file: '02-star-map', what: 'The star map' },
    { file: '03-outbreak', what: 'A level mid-outbreak, red lines showing where it spreads next' },
    { file: '04-masks', what: 'A later planet: masks at a festival' },
    { file: '05-results', what: 'Results: three stars and a word from Dr. Diallo' },
    { file: '06-daily', what: 'The Daily puzzle' },
];

// A save with the first three planets finished and three levels of the
// fourth, some funding and two power-ups. Same shape as freshSave() in
// src/save.js; missing fields get their defaults on load.
export function craftSave() {
    const levels = {};
    for (const planet of ['mizuho', 'hanabi', 'tsukimi']) {
        for (let i = 1; i <= 10; i++) {
            levels[`${planet}-${i}`] = { stars: i % 4 === 0 ? 2 : 3, completed: true, bestDeaths: 0, standardClear: true };
        }
    }
    for (let i = 1; i <= 3; i++) levels[`kumoji-${i}`] = { stars: 3, completed: true, bestDeaths: 0, standardClear: true };
    return { version: 2, funding: 340, livesSaved: 412, levels, powerups: { eureka: 1, blitz: 1, pay: 0 }, openedChests: [] };
}

// Keys that mark the first-run story, how-to-play and tips as seen.
export const SEEN_FLAGS = ['galactic-outbreak.prologue-seen.v1', 'vaxrebot-onboarded', 'galactic-outbreak.orbit-hint.v1'];

async function loadPlaywright() {
    try {
        return await import('playwright');
    } catch {
        const from = process.env.PLAYWRIGHT_FROM || '/home/claude/x.js';
        return createRequire(resolve(from))('playwright');
    }
}

async function capture(chromium, name, size, url, outDir) {
    const browser = await chromium.launch();
    const context = await browser.newContext({
        viewport: { width: size.width, height: size.height },
        deviceScaleFactor: size.scale,
        hasTouch: true,
        isMobile: true,
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    try {
        const cdp = await context.newCDPSession(page);
        await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: size.insets });
    } catch {
        console.log('  (this Chromium cannot fake the safe area; shots are edge to edge)');
    }
    await page.addInitScript(
        ({ save, flags }) => {
            if (localStorage.getItem('vaxrebot-save-v1')) return;
            localStorage.setItem('vaxrebot-save-v1', JSON.stringify(save));
            for (const key of flags) localStorage.setItem(key, '1');
        },
        { save: craftSave(), flags: SEEN_FLAGS }
    );

    const dir = join(outDir, name);
    mkdirSync(dir, { recursive: true });
    const wait = (ms) => page.waitForTimeout(ms);
    const shot = async (i) => {
        const png = FORMAT === 'png';
        const file = `${SHOTS[i].file}.${png ? 'png' : 'jpg'}`;
        await page.screenshot(png ? { path: join(dir, file) } : { path: join(dir, file), type: 'jpeg', quality: 92 });
        console.log(`  ${name}/${file}  ${SHOTS[i].what}`);
    };
    const tap = async (label) => {
        await page.getByRole('button', { name: label }).filter({ visible: true }).first().tap({ force: true, timeout: 8000 });
        await wait(1200);
    };
    // Every shot starts from the same crafted save, so earlier plays never
    // change the threat roll, the funding or the streak of a later one.
    const home = async () => {
        await page.evaluate(() => localStorage.clear()).catch(() => {});
        await page.goto(url);
        await page.waitForFunction(() => window.game && document.querySelector('.globe-home'), null, { timeout: 20000 });
        await wait(2500);
    };
    const startLevel = async (levelId) => {
        await page.evaluate((id) => window.game.selectLevel(id), levelId);
        await wait(1500); // the tap guard ignores taps right after a screen change
        await tap(/^Begin Containment/);
        await page.waitForFunction(() => window.game.view && window.game.gameState && !window.game.gameState.gameOver, null, { timeout: 20000 });
        await wait(2500);
        // Skip the coach tips if they show.
        await page.getByRole('button', { name: /^Skip tips/ }).filter({ visible: true }).first().tap({ force: true, timeout: 500 }).catch(() => {});
    };
    // One day of sensible play through the game's own handlers: isolate the
    // sick, mask or vaccinate the people next to them, cut red lines.
    const playDay = () =>
        page.evaluate(() => {
            const g = window.game;
            const live = (n) => !n.removed;
            const sick = (n) => live(n) && n.state === 'infected';
            const riskLinks = () => g.network.links.filter((l) => (sick(l.source) && live(l.target) && l.target.state === 'healthy') || (sick(l.target) && live(l.source) && l.source.state === 'healthy'));
            const has = (id) => g.currentChips().some((c) => c.id === id && c.state === 'ready');
            const use = (id, target, link) => {
                if (g.gameState.gameOver || !has(id)) return false;
                // selectTool toggles, so only pick a tool that is not already held.
                if (g.selectedTool !== id) g.selectTool(id, { hint: false });
                if (g.selectedTool !== id) return false;
                const before = JSON.stringify(g.gameState.dailyUsage);
                if (link) g.handleLinkClick(null, target);
                else g.handleNodeClick(null, target);
                return JSON.stringify(g.gameState.dailyUsage) !== before;
            };
            for (let i = 0; i < 12; i++) {
                const s = g.network.nodes.find(sick);
                if (!s || !use('quarantine', s)) break;
            }
            for (const id of ['mask', 'vaccinate']) {
                for (let i = 0; i < 12; i++) {
                    const l = riskLinks().find((x) => !(sick(x.source) ? x.target : x.source).masked);
                    if (!l || !use(id, sick(l.source) ? l.target : l.source)) break;
                }
            }
            for (let i = 0; i < 12; i++) {
                const l = riskLinks()[0];
                if (!l || !use('severLink', l, true)) break;
            }
            return { day: g.gameState.day, over: g.gameState.gameOver, outcome: g.gameState.outcome };
        });
    const nextDay = async () => {
        const day = await page.evaluate(() => window.game.gameState.day);
        if (await page.evaluate(() => window.game.gameState.gameOver)) return;
        await page.getByRole('button', { name: /^Next day/ }).filter({ visible: true }).first().tap({ force: true, timeout: 3000 }).catch(() => {});
        await page.waitForFunction((d) => window.game.gameState.gameOver || window.game.gameState.day > d, day, { timeout: 20000 }).catch(() => {});
        await wait(3500);
    };

    // 1. Title planet.
    await home();
    await shot(0);

    // 2. Star map.
    await tap(/^Play$/);
    await wait(2500);
    await shot(1);

    // 3. Mid-outbreak on day 2: it has spread and the red lines show where
    // it goes next. Round 59: since round 57 spread is certain, so a level
    // left alone for a day is often already lost, and the old loop then shot
    // the Outbreak Overwhelmed screen. Each level is tried left alone first,
    // then with a day of sensible play, and a lost or quiet level is never
    // kept. If nothing works, the shot falls back to day 1 of the first level.
    const busyNow = () =>
        page.evaluate(() => {
            const g = window.game;
            const sick = (n) => !n.removed && n.state === 'infected';
            const red = g.network.links.filter((l) => (sick(l.source) && l.target.state === 'healthy') || (sick(l.target) && l.source.state === 'healthy'));
            return !g.gameState.gameOver && g.gameState.day >= 2 && g.network.nodes.filter(sick).length >= 3 && red.length >= 2;
        });
    let busy = false;
    for (const levelId of OUTBREAK_LEVELS) {
        for (const mode of ['idle', 'play']) {
            await home();
            await startLevel(levelId);
            if (mode === 'play') await playDay();
            await nextDay();
            busy = await busyNow();
            if (busy) break;
        }
        if (busy) break;
    }
    if (!busy) {
        console.log('  (no busy day 2 found; the outbreak shot shows day 1)');
        await home();
        await startLevel(OUTBREAK_LEVELS[0]);
    }
    await page.evaluate(() => {
        const g = window.game;
        if (!g.gameState.gameOver && g.selectedTool !== 'severLink') g.selectTool('severLink', { hint: false });
    });
    await wait(1500);
    await shot(2);

    // 4. Masks at a festival on the fourth planet.
    await home();
    await startLevel('kumoji-4');
    await page.evaluate(() => {
        const g = window.game;
        const sick = (n) => !n.removed && n.state === 'infected';
        const next = g.network.nodes.filter((n) => !n.removed && n.state === 'healthy' && g.network.links.some((l) => (l.source === n && sick(l.target)) || (l.target === n && sick(l.source))));
        for (const n of next.slice(0, 2)) {
            if (g.selectedTool !== 'mask') g.selectTool('mask', { hint: false });
            g.handleNodeClick(null, n);
        }
        if (g.selectedTool !== 'mask') g.selectTool('mask', { hint: false });
    });
    await wait(6000); // let the "Masked" toast go
    await shot(3);

    // 5. Results: win the first level for real, with three stars, retrying
    // when the dice say no.
    let won = false;
    for (let attempt = 0; attempt < 10 && !won; attempt++) {
        await home();
        await startLevel('mizuho-1');
        for (let day = 0; day < 20; day++) {
            const state = await playDay();
            if (state.over) break;
            await wait(600);
            await nextDay();
        }
        await page.waitForSelector('#game-over-screen.active', { timeout: 20000 });
        // The results tally labels its stars "N of 3 stars".
        const stars = await page.evaluate(() => Number((document.querySelector('#game-over-screen .tally-stars')?.getAttribute('aria-label') || '0').match(/\d/)?.[0] || 0));
        won = (await page.evaluate(() => window.game.gameState.outcome)) === 'contained' && stars === 3;
    }
    if (!won) console.log('  (no three star win in ten tries; the results shot shows the last attempt)');
    await wait(9000); // the tally counts up
    await shot(4);

    // 6. Daily puzzle.
    await home();
    await page.locator('.daily-btn').filter({ visible: true }).first().tap({ force: true });
    await wait(1500);
    await shot(5);

    await browser.close();
    if (errors.length) console.log('  page errors:', errors);
}

async function main() {
    const { chromium } = await loadPlaywright();
    const url = process.env.STORE_URL || 'http://localhost:4320/';
    const outDir = resolve(process.env.STORE_OUT || join(root, 'store/screenshots'));
    const names = (process.env.STORE_SIZES || Object.keys(SIZES).join(',')).split(',').filter((n) => SIZES[n]);
    for (const name of names) {
        console.log(`${name}: ${SIZES[name].width * SIZES[name].scale} x ${SIZES[name].height * SIZES[name].scale}`);
        await capture(chromium, name, SIZES[name], url, outDir);
    }
    console.log(`Done. Screenshots are in ${outDir}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    await main();
}
