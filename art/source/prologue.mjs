// Prologue paintings as cloisonne vectors (see art/ARTCRAFT.md section 3).
// Each fills a 1024 square; the game frames it in a gold plaque.
import { wire, mix, GOLD, GOLD_LIGHT, GOLD_DARK, WIRE } from './citizens.mjs';

const JEWELS = ['#8fd3a8', '#f9a62b', '#da525d', '#7c58b8', '#0093a5', '#e8a0b8', '#5d8fd1', '#f3dc96'];

function rng(seed) {
    let s = seed >>> 0;
    return () => {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 2 ** 32;
    };
}

const hl = (cx, cy, rx, ry, rot = -30, op = 0.35) =>
    `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" transform="rotate(${rot} ${cx} ${cy})" fill="#ffffff" opacity="${op}"/>`;

const sparkle = (cx, cy, s, fill = GOLD_LIGHT, op = 1) =>
    `<path opacity="${op}" d="M${cx} ${cy - s} Q${cx + s * 0.16} ${cy - s * 0.16} ${cx + s} ${cy} Q${cx + s * 0.16} ${cy + s * 0.16} ${cx} ${cy + s} Q${cx - s * 0.16} ${cy + s * 0.16} ${cx - s} ${cy} Q${cx - s * 0.16} ${cy - s * 0.16} ${cx} ${cy - s}Z" fill="${fill}"/>`;

function starField(seed, n, op = 1) {
    const r = rng(seed);
    let s = '';
    for (let i = 0; i < n; i++) {
        const x = r() * 1024, y = r() * 1024, k = r();
        s += k > 0.85 ? sparkle(x, y, 6 + r() * 8, GOLD_LIGHT, op) : `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(1.5 + r() * 2.5).toFixed(1)}" fill="#f6ecd0" opacity="${(0.4 + r() * 0.6) * op}"/>`;
    }
    return s;
}

// A jewel planet: enamel disc, gold wire band cells, one highlight.
let planetId = 0;
function planet(cx, cy, r, color, { band = true, ringed = false, shade = 0, lights = 0, seed = 1, sw } = {}) {
    const id = `pl${planetId++}`;
    const deep = mix(color, '#000000', 0.22), pale = mix(color, '#ffffff', 0.25);
    const w = sw ?? Math.max(4, r * 0.05);
    let cells = '';
    if (band) {
        cells += `<path d="M${cx - r} ${cy - r * 0.15} Q${cx} ${cy - r * 0.42} ${cx + r} ${cy - r * 0.05} L${cx + r} ${cy + r * 0.25} Q${cx} ${cy + r * 0.02} ${cx - r} ${cy + r * 0.22}Z" fill="${deep}"/>`;
        cells += `<path d="M${cx - r} ${cy - r * 0.15} Q${cx} ${cy - r * 0.42} ${cx + r} ${cy - r * 0.05} M${cx - r} ${cy + r * 0.22} Q${cx} ${cy + r * 0.02} ${cx + r} ${cy + r * 0.25}" fill="none" stroke="${GOLD}" stroke-width="${w * 0.7}"/>`;
        cells += `<ellipse cx="${cx + r * 0.35}" cy="${cy + r * 0.55}" rx="${r * 0.28}" ry="${r * 0.16}" fill="${pale}" stroke="${GOLD}" stroke-width="${w * 0.6}"/>`;
    }
    let lit = '';
    if (lights) {
        const rr = rng(seed);
        for (let i = 0; i < lights; i++) {
            const a = rr() * Math.PI * 2, d = Math.sqrt(rr()) * r * 0.85;
            const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d;
            lit += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(r * 0.035 + 2).toFixed(1)}" fill="#ffe7a0"/><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(r * 0.08 + 4).toFixed(1)}" fill="#ffd36b" opacity="0.25"/>`;
        }
    }
    const shadow = shade
        ? `<path d="M${cx + r * 0.1} ${cy - r * 1.1} A${r * 1.1} ${r * 1.1} 0 0 1 ${cx + r * 0.1} ${cy + r * 1.1} L${cx + r * 1.2} ${cy + r * 1.2} L${cx + r * 1.2} ${cy - r * 1.2}Z" fill="#0b0c22" opacity="${shade}"/>`
        : '';
    const ringBack = ringed ? `<ellipse cx="${cx}" cy="${cy}" rx="${r * 1.7}" ry="${r * 0.42}" transform="rotate(-18 ${cx} ${cy})" fill="none" stroke="${GOLD}" stroke-width="${w * 1.4}" opacity="0.9"/>` : '';
    const ringFront = ringed ? `<path d="M${cx - r * 1.7} ${cy} A${r * 1.7} ${r * 0.42} 0 0 0 ${cx + r * 1.7} ${cy}" transform="rotate(-18 ${cx} ${cy})" fill="none" stroke="${GOLD_LIGHT}" stroke-width="${w * 1.4}"/>` : '';
    return `<defs><clipPath id="${id}"><circle cx="${cx}" cy="${cy}" r="${r}"/></clipPath></defs>
  ${ringBack}
  ${wire('circle', { cx, cy, r }, { fill: color, sw: w })}
  <g clip-path="url(#${id})">${cells}${lit}${shadow}</g>
  ${wire('circle', { cx, cy, r }, { sw: w, shadow: false })}
  ${hl(cx - r * 0.4, cy - r * 0.45, r * 0.28, r * 0.12, -35, 0.4)}
  ${ringFront}`;
}

function sky(top, bottom, glow = null) {
    return `<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient>
  ${glow ? `<radialGradient id="glow" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="${glow}" stop-opacity="0.85"/><stop offset="1" stop-color="${glow}" stop-opacity="0"/></radialGradient>` : ''}</defs>
  <rect width="1024" height="1024" fill="url(#sky)"/>`;
}

// Spiral galaxy of gold wire with jewel planets on the arms.
function galaxy(bright) {
    const cx = 512, cy = 520;
    const armPts = (phase) => {
        const pts = [];
        for (let t = 0.2; t <= 3.6 * Math.PI; t += 0.12) {
            const r = 34 * Math.exp(0.235 * t);
            pts.push([cx + Math.cos(t + phase) * r, cy + Math.sin(t + phase) * r * 0.82]);
        }
        return pts;
    };
    const path = (pts) => 'M' + pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(' L');
    const arms = [0, Math.PI].map(armPts);
    let s = sky(bright ? '#2b3a8f' : '#141845', bright ? '#433a8c' : '#221a4f', bright ? '#ffe3a0' : '#c9b6ff');
    s += starField(bright ? 11 : 7, bright ? 170 : 120, bright ? 1 : 0.8);
    s += `<ellipse cx="${cx}" cy="${cy}" rx="${bright ? 470 : 380}" ry="${bright ? 400 : 320}" fill="url(#glow)" opacity="${bright ? 0.75 : 0.45}"/>`;
    for (const pts of arms) {
        s += `<path d="${path(pts)}" fill="none" stroke="${bright ? '#6c74d8' : '#3c3f99'}" stroke-width="70" stroke-linecap="round" opacity="0.55"/>`;
        s += `<path d="${path(pts)}" fill="none" stroke="${WIRE}" stroke-width="16" stroke-linecap="round" opacity="0.5" transform="translate(0 3)"/>`;
        s += `<path d="${path(pts)}" fill="none" stroke="${bright ? GOLD_LIGHT : GOLD}" stroke-width="9" stroke-linecap="round"/>`;
    }
    // Core
    s += wire('circle', { cx, cy, r: 62 }, { fill: bright ? '#fff1c4' : '#f3dc96', sw: 8 }) + hl(cx - 20, cy - 22, 22, 10, -30, 0.6);
    // Planets on the arms, linked by star lanes.
    const picks = [[0, 30], [0, 52], [0, 76], [1, 24], [1, 44], [1, 66], [0, 92], [1, 86]];
    const pos = picks.map(([a, i]) => arms[a][Math.min(i, arms[a].length - 1)]);
    const order = [0, 3, 1, 4, 2, 5, 6, 7, 0];
    let lanes = '';
    for (let k = 0; k < order.length - 1; k++) {
        const [x1, y1] = pos[order[k]], [x2, y2] = pos[order[k + 1]];
        if (bright) lanes += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#ffe7a0" stroke-width="14" opacity="0.25" stroke-linecap="round"/>`;
        lanes += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${bright ? GOLD_LIGHT : GOLD}" stroke-width="${bright ? 5 : 3}" stroke-dasharray="${bright ? '0' : '4 12'}" stroke-linecap="round" opacity="${bright ? 0.95 : 0.75}"/>`;
    }
    s += lanes;
    pos.forEach(([x, y], i) => {
        const r = [30, 40, 48, 28, 38, 50, 44, 40][i];
        if (bright) s += `<circle cx="${x}" cy="${y}" r="${r * 1.8}" fill="#ffe7a0" opacity="0.18"/>`;
        s += planet(x, y, r, JEWELS[i % JEWELS.length], { band: r > 35, ringed: i === 5, lights: bright ? 5 : 0, seed: i + 3 });
    });
    if (bright) {
        s += sparkle(170, 190, 26) + sparkle(860, 230, 20) + sparkle(820, 860, 24) + sparkle(220, 820, 18);
        // a sunrise wash from below: a fresh start
        s += `<rect width="1024" height="1024" fill="url(#dawn)"/>`;
        s = s.replace('</defs>', `<linearGradient id="dawn" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#ffcf7a" stop-opacity="0.35"/><stop offset="0.5" stop-color="#ffcf7a" stop-opacity="0"/></linearGradient></defs>`);
    }
    return s;
}

function ship(x, y, s, rot) {
    // Angular Blightborne ship: purple-black enamel with red wire.
    const RED = '#c2324a';
    const pts = [[0, -60], [44, -10], [90, 10], [40, 22], [0, 60], [-40, 22], [-90, 10], [-44, -10]];
    const d = 'M' + pts.map(([a, b]) => `${a} ${b}`).join(' L') + 'Z';
    return `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})">
    <path d="${d}" fill="none" stroke="#000" stroke-opacity="0.5" stroke-width="16" transform="translate(0 4)" stroke-linejoin="round"/>
    <path d="${d}" fill="#2a1838" stroke="${RED}" stroke-width="7" stroke-linejoin="round"/>
    <path d="M0 -60 L0 60 M-44 -10 L44 -10 M-90 10 L90 10" stroke="${RED}" stroke-width="4" opacity="0.8"/>
    <path d="M-20 -22 L0 -44 L20 -22 L0 -6Z" fill="#4a2a5c" stroke="${RED}" stroke-width="4"/>
    <circle cx="0" cy="34" r="9" fill="#ff5a6e"/>
    ${hl(-28, -14, 14, 5, -40, 0.25)}
  </g>`;
}

function spore(x, y, r) {
    return `<circle cx="${x}" cy="${y}" r="${r * 2.6}" fill="url(#sporeGlow)"/>
  <circle cx="${x}" cy="${y}" r="${r}" fill="#e2394f" stroke="#ff8a96" stroke-width="2.5"/>
  ${[0, 60, 120, 180, 240, 300].map((a) => `<circle cx="${(x + Math.cos(a * Math.PI / 180) * r * 1.25).toFixed(1)}" cy="${(y + Math.sin(a * Math.PI / 180) * r * 1.25).toFixed(1)}" r="${(r * 0.22).toFixed(1)}" fill="#e2394f"/>`).join('')}`;
}

function blight() {
    let s = sky('#0f1230', '#2b1640');
    s = s.replace('</defs>', `<radialGradient id="sporeGlow"><stop offset="0" stop-color="#ff4d63" stop-opacity="0.55"/><stop offset="1" stop-color="#ff4d63" stop-opacity="0"/></radialGradient></defs>`);
    s += starField(21, 110, 0.7);
    s += planet(300, 840, 340, '#4f86d6', { band: true });
    // green continents on the blue planet
    s += `<g clip-path="url(#pl${planetId - 1})">${wire('path', { d: 'M120 640 q60 -60 140 -20 q40 40 110 10 q30 60 -40 90 q-90 10 -130 60 q-60 -40 -80 -140z' }, { fill: '#79c58a', sw: 7 })}${wire('path', { d: 'M420 760 q50 -30 100 10 q20 60 -40 80 q-60 -20 -60 -90z' }, { fill: '#79c58a', sw: 7 })}</g>`;
    s += ship(700, 250, 1.6, 18) + ship(880, 470, 1.0, 28) + ship(520, 140, 0.8, 8);
    const r = rng(5);
    const sources = [[700, 300], [880, 500], [520, 170]];
    sources.forEach(([sx, sy], k) => {
        for (let i = 1; i <= 5; i++) {
            const t = i / 6;
            const x = sx + (380 - sx) * t * 0.9 + (r() - 0.5) * 70;
            const y = sy + (640 - sy) * t * 0.9 + (r() - 0.5) * 50;
            s += spore(x, y, 9 + r() * 7 - k * 1.5);
        }
    });
    return s;
}

function dark() {
    let s = sky('#0d0f2a', '#1d1a3c');
    s += starField(33, 90, 0.55);
    // star lanes closing: broken dashed lines
    s += `<path d="M120 200 Q400 260 560 420 Q700 560 940 600" fill="none" stroke="${GOLD}" stroke-width="4" stroke-dasharray="20 30" opacity="0.35"/>`;
    s += planet(190, 210, 90, '#8fd3a8', { lights: 14, seed: 4 });
    s += planet(520, 430, 140, '#e8a0b8', { lights: 7, seed: 9, shade: 0.5 });
    s += planet(760, 780, 300, '#7c58b8', { lights: 6, seed: 2, shade: 0.72, ringed: true });
    // lights winking out: faint empty rings where cities were
    for (const [x, y] of [[480, 400], [560, 470], [700, 700], [640, 840]]) {
        s += `<circle cx="${x}" cy="${y}" r="9" fill="none" stroke="#ffe7a0" stroke-width="2" opacity="0.35"/>`;
    }
    return s;
}

function hope() {
    let s = sky('#16205a', '#2b2a6e', '#9ff0d8');
    s += starField(44, 130, 0.85);
    s += `<circle cx="790" cy="610" r="420" fill="url(#glow)" opacity="0.35"/>`;
    s += planet(790, 610, 250, '#6cc287', { band: true, lights: 8, seed: 12 });
    // dotted gold trail
    const trail = 'M60 960 C200 820 260 640 420 560 S560 470 600 460';
    s += `<path d="${trail}" fill="none" stroke="${GOLD_LIGHT}" stroke-width="10" stroke-dasharray="1 30" stroke-linecap="round"/>`;
    // response ship: cream hull, gold wire, teal light
    s += `<g transform="translate(470 520) rotate(-22)">
    <ellipse cx="-110" cy="0" rx="60" ry="22" fill="#7ff0e0" opacity="0.35"/>
    ${wire('path', { d: 'M-80 -30 Q-20 -64 80 -20 Q120 0 80 20 Q-20 64 -80 30 Q-100 0 -80 -30Z' }, { fill: '#f6ead0', sw: 7 })}
    ${wire('path', { d: 'M-50 -40 L-90 -84 L-20 -50Z' }, { fill: '#e7d3a8', sw: 6 })}
    ${wire('path', { d: 'M-50 40 L-90 84 L-20 50Z' }, { fill: '#e7d3a8', sw: 6 })}
    ${wire('ellipse', { cx: 34, cy: -6, rx: 26, ry: 16 }, { fill: '#2bb3b1', sw: 6 })}
    <circle cx="34" cy="-6" r="40" fill="#7ff0e0" opacity="0.25"/>
    ${wire('path', { d: 'M-60 0 H40' }, { sw: 4, shadow: false })}
    <circle cx="-96" cy="0" r="12" fill="#7ff0e0"/>
    ${hl(-10, -30, 34, 9, -10, 0.55)}
  </g>`;
    s += sparkle(860, 230, 22) + sparkle(260, 300, 16);
    return s;
}

function badge(cx, cy, r, color, icon) {
    const deep = mix(color, '#000000', 0.2);
    return `${wire('circle', { cx, cy, r: r + 14 }, { fill: GOLD, sw: 6, gold: GOLD_DARK })}
  ${wire('circle', { cx, cy, r }, { fill: color, sw: 8 })}
  <circle cx="${cx}" cy="${cy}" r="${r - 22}" fill="none" stroke="${deep}" stroke-width="5"/>
  <g transform="translate(${cx} ${cy})">${icon}</g>
  ${hl(cx - r * 0.42, cy - r * 0.5, r * 0.3, r * 0.1, -35, 0.4)}`;
}

function tools() {
    let s = sky('#1a1f52', '#2a2160');
    // seigaiha field
    let waves = '';
    for (let row = 0; row < 13; row++) {
        const y = 40 + row * 84, off = row % 2 ? 0 : 52;
        for (let x = off; x < 1080; x += 104) for (const r of [50, 32, 14]) waves += `<path d="M${x - r} ${y} a${r} ${r} 0 0 1 ${2 * r} 0" fill="none" stroke="${GOLD}" stroke-width="2.5" opacity="0.18"/>`;
    }
    s += waves;
    const CREAM = '#fbf3df';
    const vial = `${wire('rect', { x: -26, y: -70, width: 52, height: 120, rx: 14 }, { fill: CREAM, sw: 6 })}
    <rect x="-20" y="-6" width="40" height="50" rx="10" fill="#b79ce6"/>
    ${wire('rect', { x: -34, y: -92, width: 68, height: 28, rx: 8 }, { fill: GOLD, sw: 5 })}
    ${wire('path', { d: 'M0 50 V96' }, { sw: 6 })}
    ${wire('path', { d: 'M-12 -30 h24 M-12 -6 h24' }, { sw: 4, shadow: false })}`;
    const house = `${wire('path', { d: 'M-80 -10 Q-40 -30 0 -82 Q40 -30 80 -10 Q60 -16 54 -10 L54 70 L-54 70 L-54 -10 Q-60 -16 -80 -10Z' }, { fill: CREAM, sw: 6 })}
    ${wire('path', { d: 'M-86 -6 Q-40 -28 0 -88 Q40 -28 86 -6' }, { fill: 'none', sw: 12, gold: '#c4502a' })}
    ${wire('rect', { x: -18, y: 18, width: 36, height: 52, rx: 16 }, { fill: '#f37420', sw: 5 })}
    <circle cx="0" cy="-26" r="10" fill="#f9a62b" stroke="${GOLD}" stroke-width="4"/>`;
    const scissors = `${wire('path', { d: 'M-96 40 Q-40 30 -10 10 M30 -10 Q60 -26 96 -40' }, { sw: 6, gold: CREAM })}
    ${wire('path', { d: 'M-10 10 L-60 -64 L6 0Z' }, { fill: '#eef2f6', sw: 5 })}
    ${wire('path', { d: 'M-10 10 L60 -64 L-6 -4Z' }, { fill: '#eef2f6', sw: 5 })}
    ${wire('circle', { cx: -34, cy: 52, r: 22 }, { fill: '#2f6fb3', sw: 6 })}
    ${wire('circle', { cx: 34, cy: 52, r: 22 }, { fill: '#2f6fb3', sw: 6 })}
    ${wire('path', { d: 'M-18 36 L-2 6 M18 36 L2 6' }, { sw: 8 })}
    <circle cx="0" cy="6" r="6" fill="${GOLD_LIGHT}"/>`;
    s += badge(205, 512, 150, '#7c58b8', vial);
    s += badge(512, 512, 150, '#f37420', house);
    s += badge(819, 512, 150, '#3f86c8', scissors);
    s += sparkle(512, 250, 24) + sparkle(205, 770, 16) + sparkle(819, 770, 16) + sparkle(120, 140, 14) + sparkle(900, 160, 18);
    return s;
}

export const PAINTINGS = {
    peace: () => galaxy(false),
    blight,
    dark,
    hope,
    tools,
    begin: () => galaxy(true),
};

export function paintingSvg(card, { size = 1024 } = {}) {
    planetId = 0;
    const body = PAINTINGS[card]();
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1024 1024">${body}</svg>`;
}
