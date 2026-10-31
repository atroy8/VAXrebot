// Cloisonne citizen tokens, drawn as vectors (see art/ARTCRAFT.md section 2).
// Every shape gets a dark wire shadow plus a raised gold wire, flat enamel
// inside, and at most one soft highlight. 1024 box, plain white background,
// ring centred with about 8% margin so `npm run art:import` can cut it out.
export const GOLD = '#d6b25e';
export const GOLD_LIGHT = '#f3dc96';
export const GOLD_DARK = '#a8823a';
export const WIRE = '#3b2a12';
export const SKIN = '#f6e3c4';
export const HAIR = '#2b2233';
export const ROBE = '#2f3f6e';

export const STATES = {
    healthy: { ground: '#8fd3a8' },
    exposed: { ground: '#f9a62b' },
    infected: { ground: '#da525d' },
    quarantined: { ground: '#f37420' },
    vaccinated: { ground: '#7c58b8' },
    recovered: { ground: '#0093a5' },
    dead: { ground: '#a2b0ad' },
};

export const FRAMES = {
    healthy: ['idle', 'blink', 'reaction'],
    exposed: ['idle', 'blink', 'cough'],
    infected: ['idle', 'blink', 'cough'],
    quarantined: ['idle', 'blink', 'sleepy'],
    vaccinated: ['idle', 'blink', 'happy'],
    recovered: ['idle', 'blink', 'happy'],
    dead: ['idle', 'blink', 'reaction'],
};

const attrs = (o) => Object.entries(o).map(([k, v]) => `${k}="${v}"`).join(' ');

// A shape outlined in raised gold wire with a dark shadow wire under it.
export function wire(tag, a, { fill = 'none', sw = 9, shadow = true, gold = GOLD } = {}) {
    const base = attrs(a);
    const under = shadow
        ? `<${tag} ${base} fill="none" stroke="${WIRE}" stroke-opacity="0.55" stroke-width="${sw + 7}" stroke-linejoin="round" stroke-linecap="round" transform="translate(0 3)"/>`
        : '';
    return `${under}<${tag} ${base} fill="${fill}" stroke="${gold}" stroke-width="${sw}" stroke-linejoin="round" stroke-linecap="round"/>`;
}

// One soft highlight.
const hl = (cx, cy, rx, ry, rot = -30, op = 0.38) =>
    `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" transform="rotate(${rot} ${cx} ${cy})" fill="#ffffff" opacity="${op}"/>`;

export function mix(hex, other, t) {
    const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const a = p(hex), b = p(other);
    return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, '0')).join('');
}

const CX = 512, CY = 512;
const HEAD = { x: 512, y: 500, r: 182 };

function ground(state) {
    const g = STATES[state].ground;
    const deep = mix(g, '#000000', 0.12);
    // Seigaiha waves in the enamel ground, low contrast so the state colour reads.
    let waves = '';
    for (let row = 0; row < 9; row++) {
        const y = 140 + row * 95;
        const off = row % 2 ? 0 : 60;
        for (let x = 40 + off; x < 1000; x += 120) {
            for (const r of [58, 38, 18]) {
                waves += `<path d="M${x - r} ${y} a${r} ${r} 0 0 1 ${2 * r} 0" fill="none" stroke="${deep}" stroke-width="5"/>`;
            }
        }
    }
    return `<circle cx="${CX}" cy="${CY}" r="408" fill="${g}"/>
  <g clip-path="url(#inner)" opacity="0.55">${waves}</g>
  ${hl(355, 255, 120, 46, -38, 0.33)}`;
}

function ring() {
    return `<circle cx="${CX}" cy="${CY}" r="426" fill="none" stroke="url(#goldRing)" stroke-width="38"/>
  <circle cx="${CX}" cy="${CY}" r="445" fill="none" stroke="${GOLD_DARK}" stroke-width="3"/>
  <circle cx="${CX}" cy="${CY}" r="407" fill="none" stroke="${WIRE}" stroke-opacity="0.6" stroke-width="5"/>
  <path d="M190 300 A370 370 0 0 1 420 150" fill="none" stroke="#fff6d6" stroke-opacity="0.7" stroke-width="8" stroke-linecap="round"/>`;
}

function body(state) {
    const collar = state === 'dead' ? '#e8e2d6' : '#f3e6cc';
    return `<g clip-path="url(#inner)">
    ${wire('path', { d: 'M232 960 Q236 742 512 716 Q788 742 792 960 Z' }, { fill: ROBE })}
    ${wire('rect', { x: 470, y: 650, width: 84, height: 90, rx: 20 }, { fill: SKIN, sw: 7 })}
    ${wire('path', { d: 'M418 728 L512 860 L606 728 L566 722 L512 800 L458 722 Z' }, { fill: collar, sw: 7 })}
    ${wire('path', { d: 'M300 900 q60 -30 110 0 M614 900 q60 -30 110 0' }, { sw: 5, shadow: false })}
    ${hl(360, 800, 60, 20, -20, 0.18)}
  </g>`;
}

function face(state, frame) {
    const { x, y, r } = HEAD;
    const closed = frame === 'blink' || state === 'dead' || frame === 'sleepy'
        || (state === 'healthy' && frame === 'reaction') || frame === 'cough';
    const ex = [x - 68, x + 68], ey = y + 22;
    let eyes;
    if (state === 'healthy' && frame === 'reaction') {
        // happy closed eyes, curved up
        eyes = ex.map((e) => `<path d="M${e - 24} ${ey + 8} q24 -30 48 0" fill="none" stroke="${WIRE}" stroke-width="12" stroke-linecap="round"/>`).join('');
    } else if (frame === 'cough') {
        // squeezed shut
        eyes = ex.map((e, i) => {
            const s = i ? -1 : 1;
            return `<path d="M${e - s * 20} ${ey - 15} L${e + s * 16} ${ey} L${e - s * 20} ${ey + 15}" fill="none" stroke="${WIRE}" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"/>`;
        }).join('');
    } else if (closed) {
        const k = state === 'dead' ? 16 : 12;
        eyes = ex.map((e) => `<path d="M${e - 26} ${ey} q26 ${k} 52 0" fill="none" stroke="${WIRE}" stroke-width="11" stroke-linecap="round"/>`).join('');
    } else if (state === 'quarantined') {
        // calm, half closed
        eyes = ex.map((e) => `<path d="M${e - 24} ${ey - 2} h48 a24 18 0 0 1 -48 0z" fill="${WIRE}"/><path d="M${e - 30} ${ey - 4} h60" stroke="${HAIR}" stroke-width="7" stroke-linecap="round"/>`).join('');
    } else {
        eyes = ex.map((e) => `<ellipse cx="${e}" cy="${ey}" rx="20" ry="26" fill="${WIRE}"/><circle cx="${e + 7}" cy="${ey - 9}" r="7" fill="#ffffff"/>`).join('');
    }

    const browY = ey - 58;
    let brows;
    if (state === 'exposed') {
        brows = `<path d="M${ex[0] - 30} ${browY + 12} q30 -4 48 -24 M${ex[1] + 30} ${browY + 12} q-30 -4 -48 -24" fill="none" stroke="${HAIR}" stroke-width="10" stroke-linecap="round"/>`;
    } else if (state === 'infected') {
        brows = `<path d="M${ex[0] - 30} ${browY + 4} q24 -14 48 -14 M${ex[1] + 30} ${browY + 4} q-24 -14 -48 -14" fill="none" stroke="${HAIR}" stroke-width="10" stroke-linecap="round" transform="rotate(0)"/>`;
    } else {
        brows = `<path d="M${ex[0] - 26} ${browY} q26 -14 52 0 M${ex[1] - 26} ${browY} q26 -14 52 0" fill="none" stroke="${HAIR}" stroke-width="9" stroke-linecap="round"/>`;
    }

    const my = y + 105;
    const mouths = {
        smile: `<path d="M${x - 38} ${my - 8} q38 34 76 0" fill="none" stroke="${WIRE}" stroke-width="11" stroke-linecap="round"/>`,
        soft: `<path d="M${x - 28} ${my - 4} q28 20 56 0" fill="none" stroke="${WIRE}" stroke-width="10" stroke-linecap="round"/>`,
        worried: `<path d="M${x - 30} ${my + 6} q30 -22 60 0" fill="none" stroke="${WIRE}" stroke-width="10" stroke-linecap="round"/>`,
        grin: wire('path', { d: `M${x - 52} ${my - 18} h104 q0 62 -52 62 q-52 0 -52 -62z` }, { fill: '#b8434e', sw: 7 })
            + `<path d="M${x - 44} ${my - 14} h88 v12 q-44 8 -88 0z" fill="#ffffff"/>`
            + `<ellipse cx="${x}" cy="${my + 28}" rx="22" ry="10" fill="#ef8a8f"/>`,
        beam: wire('path', { d: `M${x - 44} ${my - 14} h88 q0 50 -44 50 q-44 0 -44 -50z` }, { fill: '#b8434e', sw: 7 })
            + `<ellipse cx="${x}" cy="${my + 18}" rx="18" ry="8" fill="#ef8a8f"/>`,
        cough: wire('ellipse', { cx: x, cy: my + 2, rx: 24, ry: 28 }, { fill: '#8e2f3a', sw: 7 }),
        coughHard: wire('ellipse', { cx: x, cy: my + 4, rx: 32, ry: 36 }, { fill: '#8e2f3a', sw: 7 }),
    };
    const mouth = {
        healthy: frame === 'reaction' ? mouths.grin : mouths.smile,
        exposed: frame === 'cough' ? mouths.cough : mouths.worried,
        infected: frame === 'cough' ? mouths.coughHard : mouths.worried,
        quarantined: '',
        vaccinated: frame === 'happy' ? mouths.beam : mouths.smile,
        recovered: frame === 'happy' ? mouths.grin : mouths.smile,
        dead: mouths.soft,
    }[state];

    const blushColor = state === 'infected' ? '#e3606e' : '#f2a7a0';
    const blushOp = state === 'infected' ? 0.85 : state === 'dead' ? 0 : 0.5;
    const blush = `<g fill="${blushColor}" opacity="${blushOp}"><ellipse cx="${x - 112}" cy="${y + 78}" rx="34" ry="22"/><ellipse cx="${x + 112}" cy="${y + 78}" rx="34" ry="22"/></g>`;

    // Hair: rounded cap with a side part, bun and a gold pin.
    const hair = `${wire('circle', { cx: x, cy: y - 200, r: 50 }, { fill: HAIR })}
    ${wire('path', { d: `M${x - 36} ${y - 222} l72 -26`, }, { sw: 8, gold: GOLD_LIGHT })}
    ${wire('path', { d: `M${x - 188} ${y + 10} Q${x - 196} ${y - 192} ${x} ${y - 190} Q${x + 196} ${y - 192} ${x + 188} ${y + 10} Q${x + 160} ${y - 86} ${x + 40} ${y - 100} Q${x - 10} ${y - 60} ${x - 120} ${y - 70} Q${x - 170} ${y - 50} ${x - 188} ${y + 10} Z` }, { fill: HAIR })}
    ${hl(x - 80, y - 150, 50, 18, -18, 0.28)}`;

    const ears = [x - r + 6, x + r - 6].map((ex2) => wire('circle', { cx: ex2, cy: y + 30, r: 32 }, { fill: SKIN, sw: 7 })).join('');
    const head = `${ears}${wire('circle', { cx: x, cy: y, r }, { fill: SKIN })}${hl(x - 70, y - 40, 40, 22, -25, 0.45)}`;

    return { head, hair, eyes, brows, mouth, blush };
}

const sparkle = (cx, cy, s) => wire('path', { d: `M${cx} ${cy - s} Q${cx + s * 0.18} ${cy - s * 0.18} ${cx + s} ${cy} Q${cx + s * 0.18} ${cy + s * 0.18} ${cx} ${cy + s} Q${cx - s * 0.18} ${cy + s * 0.18} ${cx - s} ${cy} Q${cx - s * 0.18} ${cy - s * 0.18} ${cx} ${cy - s}Z` }, { fill: GOLD_LIGHT, sw: 5 });
const arcs = (n, side = 1) => {
    const { x, y } = HEAD;
    const mx = x + side * 168, my = y + 96;
    let s = '';
    for (let i = 0; i < n; i++) {
        const r = 26 + i * 22;
        s += wire('path', { d: `M${mx + side * r * 0.6} ${my - r * 0.8} a${r} ${r} 0 0 ${side > 0 ? 1 : 0} 0 ${r * 1.6}` }, { sw: 8 });
    }
    return s;
};

function cues(state, frame) {
    const { x, y } = HEAD;
    switch (state) {
        case 'exposed':
            return wire('path', { d: `M${x + 150} ${y - 92} q34 50 0 78 q-34 -28 0 -78z` }, { fill: '#7cc4f0', sw: 7 })
                + hl(x + 143, y - 40, 7, 12, 0, 0.7)
                + (frame === 'cough' ? arcs(2, -1) : '');
        case 'infected':
            return [[x - 120, y + 60, 20], [x + 118, y + 66, 18], [x + 128, y - 50, 14]]
                .map(([cx, cy, rr]) => wire('circle', { cx, cy, r: rr }, { fill: '#9e2a3a', sw: 5 })).join('')
                + (frame === 'cough' ? arcs(3, -1) + arcs(2, 1) : '');
        case 'quarantined':
            return wire('path', { d: `M${x - 128} ${y + 50} Q${x} ${y + 20} ${x + 128} ${y + 50} L${x + 118} ${y + 120} Q${x} ${y + 190} ${x - 118} ${y + 120} Z` }, { fill: '#fbf7ee' })
                + wire('path', { d: `M${x - 128} ${y + 54} L${x - 180} ${y + 28} M${x + 128} ${y + 54} L${x + 180} ${y + 28}` }, { sw: 6, shadow: false, gold: '#e9e1cf' })
                + wire('path', { d: `M${x - 90} ${y + 80} Q${x} ${y + 64} ${x + 90} ${y + 80} M${x - 86} ${y + 110} Q${x} ${y + 100} ${x + 86} ${y + 110}` }, { sw: 4, shadow: false })
                + hl(x - 50, y + 70, 30, 10, -8, 0.6);
        case 'vaccinated':
            return `<g transform="translate(-36 -96)">` + wire('path', { d: 'M640 770 l62 -22 l62 22 v52 q0 52 -62 78 q-62 -26 -62 -78z' }, { fill: GOLD, sw: 7, gold: GOLD_LIGHT })
                + wire('path', { d: 'M702 790 v76 M672 822 h60' }, { sw: 8, shadow: false, gold: '#fff4cf' })
                + '</g>' + (frame === 'happy' ? sparkle(300, 330, 46) + sparkle(745, 300, 34) : '');
        case 'recovered':
            return wire('path', { d: `M${x - 190} ${y - 70} q-96 -40 -84 -150 q100 10 112 116 z` }, { fill: '#5fa84a', sw: 8 })
                + wire('path', { d: `M${x - 186} ${y - 74} q-30 -50 -64 -102` }, { sw: 5, shadow: false })
                + wire('path', { d: `M${x - 200} ${y - 60} q-80 6 -110 -64 q76 -26 118 46 z` }, { fill: '#79c063', sw: 7 })
                + hl(x - 250, y - 160, 14, 6, -60, 0.5)
                + (frame === 'happy' ? sparkle(760, 340, 30) : '');
        case 'dead': {
            const petals = [0, 45, 90, 135, 180, 225, 270, 315]
                .map((a) => `<g transform="rotate(${a})">${wire('ellipse', { cx: 0, cy: -34, rx: 17, ry: 34 }, { fill: '#fbf7ee', sw: 5, shadow: false })}</g>`).join('');
            const flower = `<g transform="translate(512 800)">${petals}${wire('circle', { cx: 0, cy: 0, r: 15 }, { fill: GOLD, sw: 4, shadow: false })}</g>`;
            const falling = frame === 'reaction'
                ? `<g transform="translate(640 650) rotate(35)">${wire('ellipse', { cx: 0, cy: 0, rx: 15, ry: 30 }, { fill: '#fbf7ee', sw: 5 })}</g>`
                : '';
            return flower + falling;
        }
        default:
            return '';
    }
}

// Bubbles drifting up for the dozing frame (no letters, per the style bible).
const dozeBubbles = () => [[690, 300, 18], [730, 250, 13], [762, 210, 9]]
    .map(([cx, cy, r]) => wire('circle', { cx, cy, r }, { fill: '#fdf2d8', sw: 5 })).join('');

export function citizenSvg(state, frame, { size = 1024, background = '#ffffff' } = {}) {
    const f = face(state, frame);
    const tilt = frame === 'sleepy' ? 'rotate(-11 512 700)' : '';
    const fade = state === 'dead'
        ? `<circle cx="${CX}" cy="${CY}" r="408" fill="#ffffff" opacity="0.16"/>`
        : '';
    const bg = background ? `<rect width="1024" height="1024" fill="${background}"/>` : '';
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1024 1024">
  <defs>
    <clipPath id="inner"><circle cx="${CX}" cy="${CY}" r="407"/></clipPath>
    <linearGradient id="goldRing" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${GOLD_LIGHT}"/><stop offset="0.45" stop-color="${GOLD}"/><stop offset="1" stop-color="${GOLD_DARK}"/>
    </linearGradient>
  </defs>
  ${bg}
  ${ground(state)}
  <g transform="translate(512 600) scale(1.1) translate(-512 -600)">
  ${body(state)}
  <g clip-path="url(#inner)"><g transform="${tilt}">
    ${f.head}${f.hair}${f.blush}${f.brows}${f.eyes}${f.mouth}
    ${state === 'quarantined' || state === 'exposed' || state === 'infected' || state === 'recovered' ? cues(state, frame) : ''}
  </g>
  ${state === 'vaccinated' || state === 'dead' ? cues(state, frame) : ''}
  </g></g><g clip-path="url(#inner)">
  ${frame === 'sleepy' ? dozeBubbles() : ''}
  ${fade}</g>
  ${ring()}
</svg>`;
}
