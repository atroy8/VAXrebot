// Wide audience: each planet looks like its own place. The play screen was
// navy and cream on every planet; only the paper behind the web changed.
// Now the planet's own colours tint the chrome too: the lacquer of the HUD,
// the night sky behind everything, the tool tray, and a thread of the
// planet's bright colour in the gold borders and glows.
//
// A tint, not a repaint: gold wire, cream tools and white numbers stay, and
// every text colour on the HUD keeps WCAG AA contrast (4.5 to 1) on every
// planet. tintPlan() is pure and tested in tests/wide-visual-tint.test.js.
//
// The planet palettes live in a big, lazily loaded chunk (the Wada colour
// dictionary). This file is in the entry bundle, so it carries only two
// colours per planet, copied from each planet's combination (the test checks
// they really are in it): `deep` tints the dark surfaces, `accent` is the
// bright thread.
export const PLANET_ACCENTS = Object.freeze({
    mizuho: { deep: '#1c4286', accent: '#e2b540' }, // ocean indigo, sand gold
    hanabi: { deep: '#064f6e', accent: '#f99d1b' }, // night teal, firework orange
    tsukimi: { deep: '#00978d', accent: '#ffdd00' }, // moonlit sea, moon yellow
    kumoji: { deep: '#004f46', accent: '#e2625e' }, // deep jade, sunset coral
    sango: { deep: '#005b8d', accent: '#f8ed43' }, // reef blue, sun yellow
    yukimi: { deep: '#40456a', accent: '#00939b' }, // slate dusk, ice teal
    hotaru: { deep: '#112f2c', accent: '#96d1aa' }, // forest night, firefly green
    kaminari: { deep: '#501345', accent: '#cc1236' }, // storm purple, lightning red
});

// Colours the HUD already uses (theme-ai-gold.css).
export const CHROME = Object.freeze({
    lacquer: ['#3565b8', '#1b3a7a', '#13265a'], // --indigo-lacquer stops
    sky: ['#0b1838', '#13265a', '#1b3a7a'], // --night-sky stops
    gold: '#ddb94a', // --kin-400 borders
    label: '#ecd27e', // --kin-300 labels and the level name
    value: '#ffffff', // numbers
    rUp: '#ff8a76',
    rDown: '#8ee6b0',
    chip: ['#0b1838', 0.45], // the stat chips' dark glaze over the lacquer
    washiEdge: '#e7dcc0',
});

export const AA_TEXT = 4.5;
export const AA_GRAPHIC = 3;

function rgb(hex) {
    const n = parseInt(hex.replace('#', ''), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// Blend two hex colours: t = 0 gives a, t = 1 gives b.
export function blend(a, b, t) {
    const x = rgb(a);
    const y = rgb(b);
    return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('');
}

// WCAG 2 relative luminance (0 to 1) and contrast ratio (1 to 21).
export function luminance(hex) {
    const [r, g, b] = rgb(hex).map((v) => {
        const c = v / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a, b) {
    const la = luminance(a);
    const lb = luminance(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

// Darken `bg` a little at a time until every colour in `inks` reads on it.
export function darkenUntilReadable(bg, inks, min = AA_TEXT) {
    let c = bg;
    for (let i = 0; i < 40 && inks.some((ink) => contrast(c, ink) < min); i++) c = blend(c, '#000000', 0.06);
    return c;
}

// Lighten `ink` a little at a time until it stands out from every `bg`.
export function lightenUntilVisible(ink, bgs, min = AA_GRAPHIC) {
    let c = ink;
    for (let i = 0; i < 40 && bgs.some((bg) => contrast(c, bg) < min); i++) c = blend(c, '#ffffff', 0.08);
    return c;
}

const rgba = (hex, a) => {
    const [r, g, b] = rgb(hex);
    return `rgba(${r}, ${g}, ${b}, ${a})`;
};

// How strongly the planet shows through.
export const TINT = Object.freeze({ lacquer: 0.5, sky: 0.42, edge: 0.3, glow: 0.4, tray: 0.6 });

// Every colour the tinted play screen uses for a planet, or null for an
// unknown planet (the screen then keeps its plain navy look).
export function tintPlan(planetId) {
    const p = PLANET_ACCENTS[planetId];
    if (!p) return null;
    const inks = [CHROME.label, CHROME.value];
    // HUD lacquer: the planet's deep colour, lit at the top and dark at the
    // foot like the indigo it replaces, then darkened until text reads.
    const lit = blend(p.deep, '#ffffff', 0.12);
    const low = blend(p.deep, '#000000', 0.35);
    const lacquer = [
        darkenUntilReadable(blend(CHROME.lacquer[0], lit, TINT.lacquer), inks),
        darkenUntilReadable(blend(CHROME.lacquer[1], p.deep, TINT.lacquer), inks),
        darkenUntilReadable(blend(CHROME.lacquer[2], low, TINT.lacquer), inks),
    ];
    // Night sky behind the whole screen: stays night dark.
    const sky = [
        darkenUntilReadable(blend(CHROME.sky[0], blend(p.deep, '#000000', 0.6), TINT.sky), inks, 7),
        darkenUntilReadable(blend(CHROME.sky[1], blend(p.deep, '#000000', 0.45), TINT.sky), inks, 7),
        darkenUntilReadable(blend(CHROME.sky[2], blend(p.deep, '#000000', 0.3), TINT.sky), inks, 7),
    ];
    // The bright thread: a clear accent for glows, and gold leaning toward it
    // for the borders (still gold, still clear of the lacquer).
    const accent = lightenUntilVisible(p.accent, [...lacquer, ...sky]);
    const edge = lightenUntilVisible(blend(CHROME.gold, accent, TINT.edge), lacquer);
    const tray = blend(sky[0], p.deep, 0.25);
    return {
        planetId,
        lacquer,
        sky,
        accent,
        edge,
        glow: rgba(accent, TINT.glow),
        tray: rgba(tray, TINT.tray),
        trayColor: tray,
        webEdge: blend(CHROME.washiEdge, p.accent, 0.4),
    };
}

// The CSS custom properties for a plan (pure, so tests can read them).
export function tintVars(plan) {
    return {
        '--pt-lacquer-1': plan.lacquer[0],
        '--pt-lacquer-2': plan.lacquer[1],
        '--pt-lacquer-3': plan.lacquer[2],
        '--pt-sky-1': plan.sky[0],
        '--pt-sky-2': plan.sky[1],
        '--pt-sky-3': plan.sky[2],
        '--pt-accent': plan.accent,
        '--pt-edge': plan.edge,
        '--pt-glow': plan.glow,
        '--pt-tray': plan.tray,
        '--pt-web-edge': plan.webEdge,
    };
}

// Tint the play screen for a planet (game.js calls this when a level
// starts). An unknown planet clears the tint. Safe with no element.
export function applyPlanetTint(el, planetId) {
    if (!el) return null;
    const plan = tintPlan(planetId);
    if (!plan) {
        for (const k of Object.keys(tintVars(tintPlan('mizuho')))) el.style.removeProperty(k);
        el.classList.remove('planet-tinted');
        delete el.dataset.planet;
        return null;
    }
    for (const [k, v] of Object.entries(tintVars(plan))) el.style.setProperty(k, v);
    el.classList.add('planet-tinted');
    el.dataset.planet = planetId;
    return plan;
}
