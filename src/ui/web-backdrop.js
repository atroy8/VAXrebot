// Item 22 (round 25): the scene behind the contact web.
//
// The flat 2D web used to sit on the same plain cream paper on every planet,
// and the 3D web on the same dark dotted field. Now each planet paints its
// own scene from its Wada colour combination:
//   2D: washi paper tinted with the planet's colours, lighter at the top and
//       deeper toward a band of faint seigaiha waves at the bottom, a soft
//       glowing sun, a vignette for depth, and slow drifting mist.
//   3D: a deep sky made from the planet's darkest colour, a soft nebula in
//       its liveliest colour, and the old gold and white stars.
//
// backdropPlan(combo) is pure (no DOM) and unit tested in
// tests/web-backdrop.test.js, including contrast checks against the colours
// people and lines use. applyBackdrop(el, plan) only sets CSS variables; the
// look itself lives in game-screen.css.
import { hexToRgb, lightness, mix } from '../config/planet-palettes.js';

const WASHI = '#f7f2e4';

// Colours the web draws with (network-view-3d.js). Kept here so the tests
// can check the backdrop against them.
export const WEB_INK = Object.freeze({
    risk: '#ff4d6d', // 3D at-risk line
    normal: '#8fa3bf', // 3D plain line
    risk2d: '#d91a44', // 2D at-risk line: a deeper red that reads on paper
    normal2d: '#6f84a3', // 2D plain line
    healthyFace: '#9fe3b6',
    faceOutline: '#1d2b22',
    sick: '#dc3545',
});

// Limits the tests hold every planet to.
export const LIGHT_MIN_L = 88; // 2D colours stay paper light (CIE L*)
export const DARK_MAX_L = 20; // 3D colours stay night dark
export const WAVE_ALPHA = 0.09;
export const MIST_ALPHA = 0.32;
export const SUN_ALPHA = 0.28;
export const NEBULA_ALPHA = 0.22;
export const EDGE_ALPHA = 0.35;

const hexesOf = (combo) => combo.colors.map((c) => c[1]);
const byLightness = (hexes) => [...hexes].sort((a, b) => lightness(a) - lightness(b));

function saturation(hex) {
    const [r, g, b] = hexToRgb(hex);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    return max === 0 ? 0 : (max - min) / max;
}

// Pull a colour up (or down) in steps until it sits inside the L* limits.
function atLeastL(hex, lo) {
    let c = hex;
    for (let i = 0; i < 20 && lightness(c) < lo; i++) c = mix(c, '#ffffff', 0.12);
    return c;
}
function atMostL(hex, hi) {
    let c = hex;
    for (let i = 0; i < 20 && lightness(c) > hi; i++) c = mix(c, '#000000', 0.12);
    return c;
}

// The colour you see where a translucent layer sits on a base colour.
export function over(base, top, alpha) {
    return mix(base, top, alpha);
}

export function backdropPlan(combo) {
    const hexes = hexesOf(combo);
    const sorted = byLightness(hexes);
    const darkest = sorted[0];
    const lightest = sorted[sorted.length - 1];
    const mid = sorted[Math.floor((sorted.length - 1) / 2)] === darkest ? sorted[1] : sorted[Math.floor((sorted.length - 1) / 2)];
    const lively = [...hexes].sort((a, b) => saturation(b) - saturation(a))[0];

    const light = {
        top: atLeastL(mix(WASHI, lightest, 0.22), 94),
        bottom: atLeastL(mix(WASHI, mid, 0.16), LIGHT_MIN_L + 3),
        wave: darkest, // drawn at WAVE_ALPHA
        mist: '#ffffff', // drawn at MIST_ALPHA
        sun: atLeastL(lively, 62), // drawn at SUN_ALPHA
        edge: atLeastL(mix(WASHI, darkest, 0.18), 80),
    };
    const dark = {
        top: atMostL(mix(darkest, '#0b1230', 0.55), DARK_MAX_L - 6),
        bottom: atMostL(mix(darkest, '#04060f', 0.75), DARK_MAX_L - 10),
        nebula: atMostL(lively, 55), // drawn at NEBULA_ALPHA
        star: '#ecd27e',
    };
    return { comboId: combo.id, light, dark };
}

// Every colour a viewer can actually see in each mode, layers composited,
// so contrast is checked against what is on screen.
export function visibleColours(plan) {
    const { light, dark } = plan;
    return {
        light: [
            light.top,
            light.bottom,
            over(light.bottom, light.wave, WAVE_ALPHA),
            over(light.top, light.mist, MIST_ALPHA),
            over(light.top, light.sun, SUN_ALPHA),
            over(light.bottom, light.edge, EDGE_ALPHA),
            over(over(light.bottom, light.edge, EDGE_ALPHA), light.wave, WAVE_ALPHA),
        ],
        dark: [dark.top, dark.bottom, over(dark.top, dark.nebula, NEBULA_ALPHA), over(dark.bottom, dark.nebula, NEBULA_ALPHA)],
    };
}

// WCAG 2 contrast ratio between two hex colours (1 to 21).
export function contrastRatio(a, b) {
    const lum = (hex) => {
        const [r, g, bl] = hexToRgb(hex).map((v) => {
            const c = v / 255;
            return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
    };
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
}

const rgba = (hex, a) => {
    const [r, g, b] = hexToRgb(hex);
    return `rgba(${r}, ${g}, ${b}, ${a})`;
};

// Seigaiha (overlapping wave arcs) as a tiny tiling SVG in the planet's
// darkest colour. Stroke only, so it stays a whisper behind the web.
export function seigaihaTile(hex, alpha = WAVE_ALPHA) {
    const [r, g, b] = hexToRgb(hex);
    const c = `rgb(${r},${g},${b})`;
    const arcs = (cx, cy) =>
        [16, 11, 6]
            .map((rad) => `<path d='M${cx - rad} ${cy}a${rad} ${rad} 0 0 1 ${rad * 2} 0' fill='none' stroke='${c}' stroke-opacity='${alpha}' stroke-width='1.4'/>`)
            .join('');
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='40' height='20'>${arcs(0, 20)}${arcs(40, 20)}${arcs(20, 10)}</svg>`;
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

// CSS custom properties for a plan (pure, so tests can read them).
export function backdropVars(plan) {
    const { light, dark } = plan;
    return {
        '--bd-top': light.top,
        '--bd-bottom': light.bottom,
        '--bd-edge': rgba(light.edge, EDGE_ALPHA),
        '--bd-sun': rgba(light.sun, SUN_ALPHA),
        '--bd-mist': rgba(light.mist, MIST_ALPHA),
        '--bd-wave-tile': seigaihaTile(light.wave),
        '--bd-night-top': dark.top,
        '--bd-night-bottom': dark.bottom,
        '--bd-nebula': rgba(dark.nebula, NEBULA_ALPHA),
        '--bd-star': rgba(dark.star, 0.55),
    };
}

// Paint a plan on the network container: CSS variables on the container and
// one decorative layer as its first child, so the web's canvas (appended
// later) always draws above it. Safe to call with no element.
export function applyBackdrop(el, plan) {
    if (!el) return;
    let layer = el.querySelector(':scope > .web-backdrop');
    if (!plan) {
        el.classList.remove('has-backdrop');
        layer?.remove();
        return;
    }
    for (const [k, v] of Object.entries(backdropVars(plan))) el.style.setProperty(k, v);
    el.dataset.backdrop = String(plan.comboId);
    el.classList.add('has-backdrop');
    if (!layer) {
        layer = document.createElement('div');
        layer.className = 'web-backdrop';
        layer.setAttribute('aria-hidden', 'true');
        layer.innerHTML = '<i class="bd-sun"></i><i class="bd-mist"></i><i class="bd-waves"></i><i class="bd-nebula"></i>';
        el.prepend(layer);
    }
}

// The planet definition behind a level's region id, for the scene.
export function planetDefFor(regionId, planetDefs) {
    return planetDefs.find((d) => d.id === regionId) || null;
}
