// Planet and star colours from Sanzo Wada's "A Dictionary of Color
// Combinations" (src/config/wada-palettes.js). Pure, no DOM, unit tested in
// tests/planet-palettes.test.js.
//
// planetPalette(combo) turns one combination into what the map paints:
//   ocean  [light, dark] sea gradient (the darkest colours of the combo)
//   land   six land colours (the lighter colours and soft blends of them)
//   frost  the pale outline around the land
//   wave   the colour of the seigaiha wave lines on the sea
//   glow   atmosphere and halo colour (0xRRGGBB)
//   button level button colour (0xRRGGBB)
// starPalette(combo) gives a sun: two stripe colours, a glow and a sky tint.
// paletteForSeed(seed) picks a combination for a generated world, the same
// one every time for the same seed, so new systems can colour themselves.
import { WADA_COMBINATIONS } from './wada-palettes.js';

// ---- colour math ------------------------------------------------------------
export function hexToRgb(hex) {
    const n = parseInt(hex.replace('#', ''), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex([r, g, b]) {
    const c = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
    return `#${c(r)}${c(g)}${c(b)}`;
}

export function hexNumber(hex) {
    return parseInt(hex.replace('#', ''), 16);
}

// CIE L* lightness (0 to 100) of an sRGB hex colour.
export function lightness(hex) {
    const lin = hexToRgb(hex).map((v) => {
        const c = v / 255;
        return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    const y = 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
    const f = y > 216 / 24389 ? Math.cbrt(y) : (24389 / 27 * y + 16) / 116;
    return 116 * f - 16;
}

// Blend two hex colours, t = 0 gives a, t = 1 gives b.
export function mix(a, b, t) {
    const x = hexToRgb(a);
    const y = hexToRgb(b);
    return rgbToHex(x.map((v, i) => v + (y[i] - v) * t));
}

const lighten = (hex, t) => mix(hex, '#ffffff', t);
const darken = (hex, t) => mix(hex, '#000000', t);

// Saturation 0 to 1 (HSV), to pick a lively button colour.
function saturation(hex) {
    const [r, g, b] = hexToRgb(hex);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    return max === 0 ? 0 : (max - min) / max;
}

// Nudge a colour lighter or darker until its L* sits inside [lo, hi].
export function clampLightness(hex, lo, hi) {
    let c = hex;
    for (let i = 0; i < 12 && lightness(c) < lo; i++) c = lighten(c, 0.15);
    for (let i = 0; i < 12 && lightness(c) > hi; i++) c = darken(c, 0.12);
    return c;
}

// ---- combinations -------------------------------------------------------------
export function combinationById(id, combos = WADA_COMBINATIONS) {
    return combos.find((c) => c.id === id) || null;
}

const hexesOf = (combo) => combo.colors.map((c) => c[1]);

// Good for a planet: 3 or 4 colours with a dark one for the sea and a light
// one for the land, far enough apart to read on a small phone.
export function isPlanetFriendly(combo) {
    if (!combo || combo.colors.length < 3) return false;
    const ls = hexesOf(combo).map(lightness);
    return Math.min(...ls) < 45 && Math.max(...ls) > 70;
}

export const MIN_SEA_LAND_CONTRAST = 22; // L* points between the sea and the land

export function planetPalette(combo) {
    const hexes = hexesOf(combo);
    const sorted = [...hexes].sort((a, b) => lightness(a) - lightness(b));
    const dark = sorted[0];
    // Seas: the darkest colour, as a gradient from a lighter to a deeper tone.
    let seaLight = lighten(dark, 0.2);
    let seaDark = darken(dark, 0.2);
    const landBase = sorted.slice(1);
    // Land: the lighter colours and soft blends, never as dark as the sea.
    const seaL = Math.max(lightness(seaLight), lightness(seaDark));
    const land = [];
    const candidates = [
        ...landBase,
        ...landBase.map((h, i) => mix(h, landBase[(i + 1) % landBase.length], 0.5)),
        ...landBase.map((h) => lighten(h, 0.3)),
        ...landBase.map((h) => lighten(h, 0.5)),
    ];
    for (const h of candidates) {
        let c = h;
        let guard = 0;
        while (lightness(c) - seaL < MIN_SEA_LAND_CONTRAST && guard++ < 10) c = lighten(c, 0.18);
        if (!land.includes(c)) land.push(c);
        if (land.length === 6) break;
    }
    while (land.length < 6) land.push(lighten(land[land.length - 1], 0.15));
    // If the sea is too light for the land, deepen it.
    let guard = 0;
    while (Math.min(...land.map(lightness)) - Math.max(lightness(seaLight), lightness(seaDark)) < MIN_SEA_LAND_CONTRAST && guard++ < 10) {
        seaLight = darken(seaLight, 0.15);
        seaDark = darken(seaDark, 0.15);
    }
    const lightest = sorted[sorted.length - 1];
    const lively = [...hexes].sort((a, b) => saturation(b) - saturation(a))[0];
    return {
        ocean: [seaLight, seaDark],
        land,
        frost: lighten(lightest, 0.55),
        wave: lighten(seaLight, 0.55),
        glow: hexNumber(lighten(lightest, 0.2)),
        button: hexNumber(clampLightness(lively, 48, 68)),
    };
}

// A sun from a combination: warm light stripes, a glow, and a deep sky tint
// for the background behind the system.
export function starPalette(combo) {
    const sorted = [...hexesOf(combo)].sort((a, b) => lightness(a) - lightness(b));
    const light = sorted[sorted.length - 1];
    const mid = sorted[Math.max(0, sorted.length - 2)];
    return {
        stripeA: lighten(light, 0.25),
        stripeB: lightness(mid) > 55 ? mid : lighten(mid, 0.4),
        glow: lighten(light, 0.1),
        sky: darken(sorted[0], 0.55),
    };
}

// Deterministic pick of a planet-friendly combination for any seed.
export function paletteForSeed(seed, combos = WADA_COMBINATIONS) {
    const pool = combos.filter(isPlanetFriendly);
    let h = (seed >>> 0) ^ 0x9e3779b9;
    h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    h = (h ^ (h >>> 16)) >>> 0;
    return pool[h % pool.length];
}

// Palette for a planet or system definition: its own paletteId when it has
// one, otherwise one generated from its seed or name.
export function comboFor(def, combos = WADA_COMBINATIONS) {
    const byId = def.paletteId != null ? combinationById(def.paletteId, combos) : null;
    if (byId) return byId;
    let seed = def.seed ?? 0;
    if (!seed && def.id) for (const ch of def.id) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
    return paletteForSeed(seed, combos);
}
