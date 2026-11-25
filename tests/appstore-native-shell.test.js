import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
    isNativeApp,
    registerNativePlugins,
    externalUrlFor,
    setupNativeShell,
    NATIVE_CLASS,
    NATIVE_PLUGINS,
    NATIVE_VIEWPORT,
    PUBLIC_PAGES,
} from '../src/ui/native-shell.js';
import { PUBLIC_PRIVACY_URL, PUBLIC_SUPPORT_URL, PRIVACY_URL, SUPPORT_URL, settingsMarkup } from '../src/ui/settings.js';
import { pickAdProvider } from '../src/monetization/ad-provider-admob.js';
import { createHaptics } from '../src/ui/haptics.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const nativeCap = (extra = {}) => ({ isNativePlatform: () => true, Plugins: {}, ...extra });
const webCap = () => ({ isNativePlatform: () => false, Plugins: {} });

describe('native shell: telling the app from the browser', () => {
    it('is native only when Capacitor says so', () => {
        expect(isNativeApp(nativeCap())).toBe(true);
        expect(isNativeApp(webCap())).toBe(false);
        expect(isNativeApp(undefined)).toBe(false);
        expect(isNativeApp({})).toBe(false);
        expect(isNativeApp({ isNativePlatform: () => { throw new Error('boom'); } })).toBe(false);
    });

    it('does nothing in a browser', () => {
        const calls = [];
        const out = setupNativeShell({ cap: webCap(), doc: { addEventListener: () => calls.push('listen') }, register: () => calls.push('register') });
        expect(out).toEqual({ native: false, plugins: [] });
        expect(calls).toEqual([]);
        expect(registerNativePlugins(webCap(), () => calls.push('register'))).toEqual([]);
        expect(calls).toEqual([]);
    });
});

describe('native shell: plugins', () => {
    it('registers the plugins the game looks up, once each', () => {
        const cap = nativeCap();
        const seen = [];
        const register = (name) => {
            seen.push(name);
            cap.Plugins[name] = { name };
        };
        expect(NATIVE_PLUGINS).toEqual(['Haptics', 'AdMob']);
        expect(registerNativePlugins(cap, register)).toEqual(['Haptics', 'AdMob']);
        expect(registerNativePlugins(cap, register)).toEqual(['Haptics', 'AdMob']);
        expect(seen).toEqual(['Haptics', 'AdMob']);
    });

    it('survives a plugin that cannot register', () => {
        const cap = nativeCap();
        const register = (name) => {
            if (name === 'Haptics') throw new Error('no');
            cap.Plugins[name] = {};
        };
        expect(registerNativePlugins(cap, register)).toEqual(['AdMob']);
    });

    it('makes the app pick the AdMob adapter, never the labeled web sample ad', async () => {
        const cap = nativeCap();
        // What registerPlugin leaves behind when the ad SDK is not in the app:
        // an object whose every call rejects.
        const missing = new Proxy({}, { get: (_, prop) => (prop === 'then' ? undefined : () => Promise.reject(new Error('not implemented'))) });
        registerNativePlugins(cap, (name) => { cap.Plugins[name] = missing; });
        const web = { isAvailable: () => true, showInterstitial: async () => true, sample: true };
        const provider = pickAdProvider({ capacitor: cap, web, config: { isTesting: true, requestTracking: false, loadTimeoutMs: 50, showTimeoutMs: 50 } });
        expect(provider).not.toBe(web);
        expect(provider.sample).toBeUndefined();
        // With no SDK the adapter fails quietly: no ad, no crash, no hang.
        expect(await provider.init()).toBe(false);
        expect(await provider.showInterstitial()).toBe(false);
        // In a browser the sample stays.
        expect(pickAdProvider({ capacitor: webCap(), web })).toBe(web);
    });

    it('gives the haptics module a native plugin to call', () => {
        const cap = nativeCap();
        const calls = [];
        registerNativePlugins(cap, (name) => {
            cap.Plugins[name] = { impact: (o) => { calls.push(o); return Promise.resolve(); }, notification: () => Promise.resolve() };
        });
        const haptics = createHaptics({ capacitor: cap, navigator: {}, storage: null });
        expect(haptics.isSupported()).toBe(true);
        expect(haptics.play('sever')).toBe('native');
        expect(calls).toEqual([{ style: 'MEDIUM' }]);
    });
});

describe('native shell: links open outside the app', () => {
    const app = 'capacitor://localhost/index.html';

    it('sends the bundled privacy and support pages to their public URLs', () => {
        expect(externalUrlFor(PRIVACY_URL, app)).toBe(PUBLIC_PRIVACY_URL);
        expect(externalUrlFor(SUPPORT_URL, app)).toBe(PUBLIC_SUPPORT_URL);
        expect(externalUrlFor('capacitor://localhost/privacy.html', app)).toBe(PUBLIC_PRIVACY_URL);
        expect(Object.keys(PUBLIC_PAGES)).toEqual(['privacy.html', 'support.html']);
    });

    it('covers every link in the settings sheet', () => {
        const hrefs = [...settingsMarkup({ adsRemoved: false }).matchAll(/<a [^>]*href="([^"]+)"/g)].map((m) => m[1]);
        expect(hrefs.length).toBe(2);
        for (const href of hrefs) expect(externalUrlFor(href, app)).toMatch(/^https:\/\/atroy8\.github\.io\/VAXrebot\//);
    });

    it('passes real web links through and leaves in-app navigation alone', () => {
        expect(externalUrlFor('https://example.org/a?b=1', app)).toBe('https://example.org/a?b=1');
        expect(externalUrlFor('mailto:help@example.org', app)).toBe('mailto:help@example.org');
        expect(externalUrlFor('./index.html', app)).toBe(null);
        expect(externalUrlFor('#top', app)).toBe(null);
        expect(externalUrlFor('javascript:alert(1)', app)).toBe(null);
        expect(externalUrlFor('', app)).toBe(null);
        expect(externalUrlFor(null, app)).toBe(null);
    });

    function fakeDoc() {
        const listeners = {};
        const classes = new Set();
        const viewport = { content: 'width=device-width, initial-scale=1.0, viewport-fit=cover', setAttribute(k, v) { this[k] = v; } };
        return {
            listeners,
            classes,
            viewport,
            documentElement: { classList: { add: (c) => classes.add(c) } },
            querySelector: (sel) => (sel === 'meta[name="viewport"]' ? viewport : null),
            addEventListener: (type, fn) => { listeners[type] = fn; },
        };
    }

    it('in the app: marks the page, locks zoom and opens tapped links in Safari', () => {
        const doc = fakeDoc();
        const opened = [];
        const cap = nativeCap();
        const out = setupNativeShell({
            cap,
            doc,
            win: { location: { href: app }, open: (url, target) => opened.push([url, target]) },
            register: (name) => { cap.Plugins[name] = {}; },
        });
        expect(out).toEqual({ native: true, plugins: ['Haptics', 'AdMob'] });
        expect(doc.classes.has(NATIVE_CLASS)).toBe(true);
        expect(doc.viewport.content).toBe(NATIVE_VIEWPORT);
        expect(NATIVE_VIEWPORT).toContain('viewport-fit=cover');
        expect(NATIVE_VIEWPORT).toContain('user-scalable=no');

        const link = (href) => ({ getAttribute: () => href });
        const click = (href) => {
            let prevented = false;
            doc.listeners.click({ target: { closest: () => (href ? link(href) : null) }, preventDefault: () => { prevented = true; } });
            return prevented;
        };
        expect(click('./privacy.html')).toBe(true);
        expect(click('./support.html')).toBe(true);
        expect(click('./index.html')).toBe(false);
        expect(click(null)).toBe(false);
        expect(opened).toEqual([[PUBLIC_PRIVACY_URL, '_blank'], [PUBLIC_SUPPORT_URL, '_blank']]);

        // Pinch zoom and the long-press menu are off in the app.
        for (const type of ['gesturestart', 'contextmenu']) {
            let prevented = false;
            doc.listeners[type]({ preventDefault: () => { prevented = true; } });
            expect(prevented).toBe(true);
        }
    });
});

describe('native shell: CSS', () => {
    const css = read('src/ui/native-shell.css');
    const phone = css.slice(css.indexOf('@media (max-width: 768px)'));

    it('is loaded last from main.js, after the game and its styles', () => {
        const main = read('src/main.js');
        const imports = [...main.matchAll(/^import [^;]*'([^']+)';/gm)].map((m) => m[1]);
        expect(imports.at(-1)).toBe('./ui/native-shell.js');
        expect(imports.indexOf('./game.js')).toBeLessThan(imports.indexOf('./ui/native-shell.js'));
        expect(read('src/ui/native-shell.js')).toContain("import './native-shell.css';");
    });

    it('names the four safe-area insets once, as variables a test page can override', () => {
        for (const side of ['top', 'right', 'bottom', 'left']) {
            expect(css).toContain(`--safe-${side}: env(safe-area-inset-${side}, 0px);`);
        }
    });

    it('keeps the HUD under the notch and the bottom tray above the home bar', () => {
        const layout = phone.match(/html \.game-layout\s*\{([^}]*)\}/)[1];
        expect(layout).toContain('padding-top: calc(8px + var(--safe-top))');
        expect(layout).toContain('padding-bottom: calc(8px + var(--safe-bottom))');
        expect(layout).toContain('padding-left: calc(8px + var(--safe-left))');
        expect(layout).toContain('padding-right: calc(8px + var(--safe-right))');
        // The rules this backs up are still there in the files they came from.
        expect(read('src/ui/game-screen.css')).toMatch(/\.game-layout\s*\{[^}]*padding: 8px 8px calc\(8px \+ env\(safe-area-inset-bottom, 0px\)\)/);
        expect(read('src/ui/app-shell.css')).toMatch(/\.game-layout\s*\{[^}]*padding-top: calc\(8px \+ env\(safe-area-inset-top, 0px\)\)/);
    });

    it('counts the home bar once on the results screen, so no paper sticks out under the card', () => {
        expect(css).toMatch(/--results-foot: max\(var\(--space-16, 16px\), calc\(var\(--safe-bottom\) - 12px\)\);/);
        expect(phone).toMatch(/#game-over-screen\.screen\s*\{\s*padding-bottom: var\(--results-foot\);/);
        expect(phone).toMatch(/#game-over-screen\.screen \.game-over-actions::after\s*\{\s*height: calc\(var\(--results-foot\) \+ 2px\);/);
        // The skirt (results-foot + 2) must stay shorter than the card's own
        // bottom padding and border (26 px), with or without a 34 px home bar.
        for (const inset of [0, 21, 34]) expect(Math.max(16, inset - 12) + 2).toBeLessThan(26);
    });

    it('moves sheets, overlays and the R card clear of the status bar', () => {
        expect(css).toMatch(/html body \.r-card\s*\{\s*top: calc\(150px \+ var\(--safe-top\)\);/);
        expect(css).toMatch(/\.onboarding-overlay,\s*\.ad-overlay\s*\{[^}]*padding-top: calc\(16px \+ var\(--safe-top\)\)/);
        expect(css).toMatch(/\.settings-sheet\s*\{\s*max-height: min\(88vh, calc\(100dvh - var\(--safe-top\) - 24px\)\);/);
        expect(css).toMatch(/\.shop-sheet-panel\s*\{\s*max-height: min\(85dvh, calc\(100dvh - var\(--safe-top\) - 24px\)\);/);
    });

    it('feels native: no tap flash, no bounce behind a level, no long-press preview', () => {
        expect(css).toMatch(/html\s*\{\s*-webkit-tap-highlight-color: transparent;/);
        expect(css).toMatch(/#game-screen,\s*\.game-layout\s*\{\s*overscroll-behavior: none;/);
        expect(css).toMatch(/\.shop-sheet-panel,[^{]*\{\s*overscroll-behavior: contain;/);
        expect(css).toMatch(/img,\s*a,\s*canvas,\s*svg\s*\{[^}]*-webkit-touch-callout: none;/);
        // Double-tap zoom and text selection were already off (round 18).
        const shell = read('src/ui/app-shell.css');
        expect(shell).toContain('touch-action: manipulation');
        expect(shell).toContain('user-select: none');
    });

    it('hides the pretend-owned switch inside the app, and only there', () => {
        expect(css).toMatch(/html\.native-app \.settings-switch:has\(\[data-act='preview-owned'\]\)\s*\{\s*display: none;/);
        expect(settingsMarkup({ adsRemoved: false })).toContain('data-act="preview-owned"');
        expect(NATIVE_CLASS).toBe('native-app');
    });
});
