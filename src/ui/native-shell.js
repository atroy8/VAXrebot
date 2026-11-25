// Native shell: the small set of things that differ when the game runs inside
// the iOS app (a Capacitor WKWebView) instead of a browser tab.
//
// 1. Plugins. The game looks plugins up as window.Capacitor.Plugins.<Name>
//    (src/ui/haptics.js, src/monetization/ad-provider-admob.js). That table
//    is only filled when the page registers each plugin, so it happens here,
//    before the game starts. AdMob is registered even while the ad SDK is not
//    in the app yet: its calls then fail quietly and no ad shows, which is
//    what the store build must do. The labeled web sample ad never appears
//    in the app.
// 2. Links. A target="_blank" link to a page inside the app goes nowhere in
//    a WKWebView. Privacy and support open in Safari from their public URLs.
// 3. Touch. No pinch zoom, no long-press menu. The browser build keeps both,
//    because zoom is an accessibility feature on the web.
//
// Everything is injected, so tests can run it with fakes. On the web the
// setup does nothing except load native-shell.css.

import './native-shell.css';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { PUBLIC_PRIVACY_URL, PUBLIC_SUPPORT_URL } from './settings.js';

export const NATIVE_CLASS = 'native-app';
export const NATIVE_PLUGINS = Object.freeze(['Haptics', 'AdMob']);
export const NATIVE_VIEWPORT = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover';

// Pages that ship inside the app but must open in Safari.
export const PUBLIC_PAGES = Object.freeze({
    'privacy.html': PUBLIC_PRIVACY_URL,
    'support.html': PUBLIC_SUPPORT_URL,
});

export function isNativeApp(cap) {
    try {
        return typeof cap?.isNativePlatform === 'function' && cap.isNativePlatform() === true;
    } catch {
        return false;
    }
}

export function registerNativePlugins(cap, register = registerPlugin, names = NATIVE_PLUGINS) {
    if (!isNativeApp(cap)) return [];
    const done = [];
    for (const name of names) {
        try {
            if (!cap.Plugins?.[name]) register(name);
            done.push(name);
        } catch {
            // A plugin that cannot register is simply absent; the game copes.
        }
    }
    return done;
}

// Where a tapped link should open outside the app, or null to leave it alone.
export function externalUrlFor(href, appBase = 'capacitor://localhost/') {
    if (typeof href !== 'string' || !href.trim()) return null;
    let url;
    let base;
    try {
        base = new URL(appBase);
        url = new URL(href.trim(), base);
    } catch {
        return null;
    }
    const sameApp = url.protocol === base.protocol && url.host === base.host;
    if (sameApp) {
        const page = url.pathname.split('/').pop();
        return PUBLIC_PAGES[page] || null;
    }
    if (url.protocol === 'https:' || url.protocol === 'http:' || url.protocol === 'mailto:') return url.href;
    return null;
}

export function setupNativeShell({
    cap = Capacitor,
    doc = typeof document !== 'undefined' ? document : null,
    win = typeof window !== 'undefined' ? window : null,
    register = registerPlugin,
} = {}) {
    if (!isNativeApp(cap) || !doc) return { native: false, plugins: [] };
    const plugins = registerNativePlugins(cap, register);
    doc.documentElement.classList.add(NATIVE_CLASS);
    doc.querySelector('meta[name="viewport"]')?.setAttribute('content', NATIVE_VIEWPORT);

    doc.addEventListener(
        'click',
        (e) => {
            const a = e.target?.closest?.('a[href]');
            if (!a) return;
            const url = externalUrlFor(a.getAttribute('href'), win?.location?.href);
            if (!url) return;
            e.preventDefault();
            win?.open?.(url, '_blank');
        },
        true
    );
    const stop = (e) => e.preventDefault();
    doc.addEventListener('gesturestart', stop, { passive: false });
    doc.addEventListener('contextmenu', stop);
    return { native: true, plugins };
}

setupNativeShell();
