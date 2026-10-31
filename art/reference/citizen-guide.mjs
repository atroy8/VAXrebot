// Draws the ArtCraft reference sheets as SVG (rendered to PNG by
// scripts/render-art-guides.mjs). These are guides for image-to-image, not
// game art: they fix the framing, ring size and state cues so every
// generated token matches.
export const GOLD = '#d6b25e';
export const WIRE = '#3b2a12';
export const SKIN = '#f6e3c4';
export const HAIR = '#2b2233';

export const STATE_GUIDE = {
    healthy: { ground: '#8fd3a8', cue: null, label: 'healthy' },
    exposed: { ground: '#f9a62b', cue: 'sweat', label: 'exposed' },
    infected: { ground: '#da525d', cue: 'spots', label: 'infected' },
    quarantined: { ground: '#f37420', cue: 'mask', label: 'quarantined' },
    vaccinated: { ground: '#7c58b8', cue: 'shield', label: 'vaccinated' },
    recovered: { ground: '#0093a5', cue: 'leaf', label: 'recovered' },
    dead: { ground: '#a2b0ad', cue: 'flower', label: 'dead' },
};

const stroke = `stroke="${GOLD}" stroke-width="10" stroke-linejoin="round"`;

// One token centred in a 1024 box (ring radius 430, about 8% margin).
export function tokenSvg(state = 'healthy', { size = 1024 } = {}) {
    const g = STATE_GUIDE[state] || STATE_GUIDE.healthy;
    const dead = state === 'dead';
    const eyes = dead || state === 'quarantined'
        ? `<path d="M410 520 q30 ${dead ? 18 : 10} 60 0 M554 520 q30 ${dead ? 18 : 10} 60 0" fill="none" stroke="${WIRE}" stroke-width="12" stroke-linecap="round"/>`
        : `<circle cx="440" cy="515" r="20" fill="${WIRE}"/><circle cx="584" cy="515" r="20" fill="${WIRE}"/>`;
    const brows = state === 'exposed' ? `<path d="M405 470 l60 -18 M619 470 l-60 -18" stroke="${WIRE}" stroke-width="10" stroke-linecap="round"/>` : '';
    const mouth = state === 'quarantined' ? '' : state === 'infected' || state === 'exposed'
        ? `<path d="M480 600 q32 -20 64 0" fill="none" stroke="${WIRE}" stroke-width="10" stroke-linecap="round"/>`
        : `<path d="M470 585 q42 36 84 0" fill="none" stroke="${WIRE}" stroke-width="10" stroke-linecap="round"/>`;
    const cues = {
        sweat: `<path d="M660 420 q22 34 0 52 q-22 -18 0 -52z" fill="#7cc4f0" ${stroke}/>`,
        spots: `<g fill="#9e2a3a"><circle cx="400" cy="570" r="16"/><circle cx="625" cy="575" r="14"/><circle cx="540" cy="430" r="12"/></g>`,
        mask: `<path d="M400 545 q112 -30 224 0 v60 q-112 60 -224 0z" fill="#fbf7ee" ${stroke}/>`,
        shield: `<path d="M690 720 l50 -18 l50 18 v40 q0 40 -50 60 q-50 -20 -50 -60z" fill="${GOLD}" stroke="${WIRE}" stroke-width="6"/>`,
        leaf: `<path d="M350 400 q-60 -40 -40 -110 q70 10 80 90z" fill="#5fa84a" ${stroke}/>`,
        flower: `<g transform="translate(512 900)">${[0, 45, 90, 135, 180, 225, 270, 315].map((a) => `<ellipse rx="16" ry="34" transform="rotate(${a}) translate(0 -26)" fill="#fbf7ee" stroke="${GOLD}" stroke-width="4"/>`).join('')}<circle r="14" fill="${GOLD}"/></g>`,
    };
    const fade = dead ? ' opacity="0.85"' : '';
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1024 1024">
  <rect width="1024" height="1024" fill="#ffffff"/>
  <circle cx="512" cy="512" r="430" fill="${g.ground}"${fade} stroke="${GOLD}" stroke-width="36"/>
  <circle cx="512" cy="512" r="400" fill="none" stroke="${WIRE}" stroke-opacity="0.35" stroke-width="6"/>
  <ellipse cx="380" cy="330" rx="90" ry="40" fill="#ffffff" opacity="0.35" transform="rotate(-30 380 330)"/>
  <path d="M300 900 q0 -150 212 -170 q212 20 212 170" fill="#e9d3b0" ${stroke}/>
  <circle cx="512" cy="520" r="190" fill="${SKIN}" ${stroke}/>
  <path d="M322 520 q0 -200 190 -200 q190 0 190 200 q-40 -110 -190 -120 q-150 10 -190 120z" fill="${HAIR}" ${stroke}/>
  <circle cx="512" cy="300" r="42" fill="${HAIR}" ${stroke}/>
  ${state === 'infected' ? '<g fill="#f2a0a8" opacity="0.8"><circle cx="410" cy="580" r="30"/><circle cx="614" cy="580" r="30"/></g>' : ''}
  ${brows}${eyes}${mouth}
  ${g.cue ? cues[g.cue] : ''}
</svg>`;
}

// All seven states in a row, each with a 44 px preview under it, so the
// readability rule is visible on one sheet.
export function stateSheetSvg() {
    const states = Object.keys(STATE_GUIDE);
    const cell = 300;
    const w = cell * states.length;
    const parts = states.map((s, i) => {
        const inner = tokenSvg(s).replace(/<svg[^>]*>/, '').replace('</svg>', '').replace('<rect width="1024" height="1024" fill="#ffffff"/>', '');
        return `<g transform="translate(${i * cell + 20} 20) scale(${260 / 1024})">${inner}</g>
  <g transform="translate(${i * cell + 128} 300) scale(${44 / 1024})">${inner}</g>
  <text x="${i * cell + 150}" y="380" text-anchor="middle" font-family="sans-serif" font-size="26" fill="#222">${s}</text>`;
    });
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="400" viewBox="0 0 ${w} 400"><rect width="${w}" height="400" fill="#f6efe0"/>${parts.join('\n')}</svg>`;
}
