import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { shouldAutoPause } from '../src/ui/game-screen-model.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const cssFiles = ['src/styles.css', ...readdirSync(new URL('../src/ui/', import.meta.url)).filter((f) => f.endsWith('.css')).map((f) => `src/ui/${f}`)];

describe('iPhone app shell (round 18)', () => {
    it('asks for viewport-fit=cover, because safe-area insets are 0 without it', () => {
        const html = read('index.html');
        const viewport = html.match(/<meta name="viewport" content="([^"]+)">/)[1];
        expect(viewport).toContain('viewport-fit=cover');
        expect(viewport).toContain('width=device-width');
        const usesInsets = cssFiles.some((f) => read(f).includes('env(safe-area-inset'));
        expect(usesInsets).toBe(true);
    });

    it('runs full screen when added to the home screen, with a see-through status bar', () => {
        const html = read('index.html');
        expect(html).toContain('<meta name="apple-mobile-web-app-capable" content="yes">');
        expect(html).toContain('<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">');
    });

    it('keeps the level HUD below the status bar and scrolling screens clear of the notch and home bar', () => {
        const css = read('src/ui/app-shell.css');
        const phone = css.slice(css.indexOf('@media (max-width: 768px)'));
        expect(phone).toMatch(/\.game-layout\s*\{[^}]*padding-top:\s*calc\(8px \+ env\(safe-area-inset-top, 0px\)\)/);
        expect(phone).toMatch(/\.screen\s*\{[^}]*padding-top:\s*calc\([^;]*env\(safe-area-inset-top, 0px\)\)/);
        expect(phone).toMatch(/\.screen\s*\{[^}]*padding-bottom:\s*calc\([^;]*env\(safe-area-inset-bottom, 0px\)\)/);
        // The game screen itself stays edge to edge; its layout does the padding.
        expect(phone).toMatch(/#game-screen\.screen\s*\{\s*padding:\s*0;/);
    });

    it('feels native: no double-tap zoom, no long-press selection, no page bounce, typing still works', () => {
        const css = read('src/ui/app-shell.css');
        const body = css.match(/\}\s*body\s*\{([^}]*)\}/)[1];
        expect(body).toContain('touch-action: manipulation');
        expect(body).toContain('-webkit-touch-callout: none');
        expect(body).toContain('user-select: none');
        expect(css).toMatch(/html,\s*body\s*\{[^}]*overscroll-behavior: none/);
        expect(css).toMatch(/input,\s*textarea[^{]*\{[^}]*user-select: text/);
    });

    it('loads after the other game styles so its insets win', () => {
        const src = read('src/game.js');
        const imports = [...src.matchAll(/^import '(\.\/ui\/[^']+\.css)';/gm)].map((m) => m[1]);
        expect(imports.at(-1)).toBe('./ui/app-shell.css');
    });
});


describe('auto-pause when the app goes to the background (round 18)', () => {
    const live = () => ({ gameOver: false, paused: false });

    it('pauses a level in progress when the page is hidden', () => {
        expect(shouldAutoPause({ hidden: true, screen: 'game', gameState: live() })).toBe(true);
    });

    it('leaves everything else alone', () => {
        expect(shouldAutoPause({ hidden: false, screen: 'game', gameState: live() })).toBe(false);
        expect(shouldAutoPause({ hidden: true, screen: 'briefing', gameState: live() })).toBe(false);
        expect(shouldAutoPause({ hidden: true, screen: 'game', gameState: null })).toBe(false);
        expect(shouldAutoPause({ hidden: true, screen: 'game', gameState: { gameOver: true, paused: false } })).toBe(false);
        // Already paused: pausing again would toggle it back on.
        expect(shouldAutoPause({ hidden: true, screen: 'game', gameState: { gameOver: false, paused: true } })).toBe(false);
        // Spread stopped! fast-forward has no decisions left, so let it finish.
        expect(shouldAutoPause({ hidden: true, screen: 'game', gameState: live(), wrapUp: { timer: 1 } })).toBe(false);
        expect(shouldAutoPause()).toBe(false);
    });

    it('is wired to visibilitychange and goes through the normal pause', () => {
        const src = read('src/game.js');
        const at = src.indexOf("addEventListener('visibilitychange'");
        expect(at).toBeGreaterThan(-1);
        expect(src.slice(at, at + 400)).toContain('shouldAutoPause(');
        expect(src.slice(at, at + 400)).toContain('this.togglePause()');
    });
});
