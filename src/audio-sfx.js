// Named sound effects, synthesised with the Web Audio API. No audio files.
//
// An effect is a pure description: a declared duration plus a list of
// layers. A layer is one sound source (oscillator, FM pair or filtered
// noise) with a start offset, a gain envelope, an optional filter sweep,
// a stereo position and a reverb send. renderSfx() turns a description
// into audio nodes on any AudioContext; SfxPlayer adds the shared output
// chain (gentle saturation and a small comb reverb), a polyphony cap and
// per effect spacing so a busy night is a run of blips, not a wall.
//
// Layer fields (times in seconds, gains 0..1):
//   src   'osc' | 'fm' | 'noise'
//   wave  oscillator type (osc)            colour 'white' | 'pink' | 'brown' (noise)
//   f     start frequency                  fTo, fT  glide target and glide time
//   ratio, index, indexTo                  FM modulator ratio and depth (fm)
//   at    start offset                     a, h, d  attack, hold, decay
//   g     peak gain                        filt     [type, f0, f1, Q]
//   pan   -1..1                            send     reverb send 0..1
//   jit   seeded detune range in cents (each play differs a little)
//
// Low sounds keep energy above 150 Hz on purpose: a phone speaker plays
// almost nothing under that.

const O = (wave, f, o = {}) => ({ src: 'osc', wave, f, ...o });
const N = (colour, o = {}) => ({ src: 'noise', colour, ...o });
const FM = (f, ratio, index, o = {}) => ({ src: 'fm', f, ratio, index, ...o });

// Yo scale on D (D E G A B), the bright pentatonic of Japanese folk music.
const D5 = 587.33, E5 = 659.25, G5 = 783.99, A5 = 880, B5 = 987.77, D6 = 1174.66;

// A small struck bell: an FM strike over a pure body.
export const bell = (f, { at = 0, g = 0.12, d = 0.7, pan = 0, send = 0.4 } = {}) => [
    FM(f, 2.4, 1.1, { indexTo: 0.05, at, a: 0.003, d, g, pan, send }),
    O('sine', f, { at, a: 0.003, d, g: g * 0.6, pan }),
];

// A koto-like pluck: a filtered triangle with a tiny pick click.
export const pluck = (f, { at = 0, g = 0.13, d = 0.45, pan = 0, send = 0.35 } = {}) => [
    O('triangle', f, { at, a: 0.002, d, g, pan, send, filt: ['lowpass', f * 5, f * 1.6, 0.8] }),
    N('white', { at, a: 0.001, d: 0.012, g: g * 0.35, pan, filt: ['bandpass', 3000, 3000, 1.2] }),
];

// name -> { dur, prio, gap, queue, layers }
//   dur    declared length: every source has stopped by then
//   prio   2 = never dropped for a lesser sound, 1 = normal, 0 = decoration
//   gap    minimum spacing between two plays of this effect
//   queue  how many late plays may line up behind the gap (others are dropped)
export const SFX = Object.freeze({
    // The signature move. Two blade clicks 24 ms apart, a tiny metal ring,
    // then the line parting: a falling twang with a soft body under it.
    snip: {
        dur: 0.24, prio: 2,
        layers: [
            N('white', { a: 0.001, d: 0.014, g: 0.34, pan: -0.2, filt: ['highpass', 5200, 5200, 0.7] }),
            N('white', { at: 0.024, a: 0.001, d: 0.02, g: 0.3, pan: 0.2, filt: ['bandpass', 3400, 3400, 1.5] }),
            FM(2300, 2.76, 1.5, { indexTo: 0.1, at: 0.022, a: 0.001, d: 0.05, g: 0.1, send: 0.25 }),
            O('triangle', 620, { fTo: 240, fT: 0.12, at: 0.04, a: 0.004, d: 0.17, g: 0.2, send: 0.3, jit: 60, filt: ['bandpass', 700, 350, 2] }),
            O('sine', 210, { fTo: 120, fT: 0.09, at: 0.03, a: 0.004, d: 0.11, g: 0.16 }),
        ],
    },
    // A soft pop, then a shimmer that rises like a shield going up.
    vaccinate: {
        dur: 0.45,
        layers: [
            O('sine', 420, { fTo: 180, fT: 0.05, a: 0.002, d: 0.06, g: 0.22 }),
            N('white', { a: 0.001, d: 0.02, g: 0.1, filt: ['bandpass', 1800, 1800, 1] }),
            O('sine', 880, { fTo: 1760, fT: 0.3, at: 0.04, a: 0.03, d: 0.32, g: 0.09, send: 0.4 }),
            O('sine', 1320, { fTo: 2640, fT: 0.3, at: 0.07, a: 0.03, d: 0.3, g: 0.05, pan: 0.3, send: 0.4 }),
        ],
    },
    // A padded door closing, with a calm tone so it reads as care, not jail.
    quarantine: {
        dur: 0.5,
        layers: [
            N('brown', { a: 0.003, d: 0.12, g: 0.4, filt: ['lowpass', 420, 160, 0.7] }),
            O('sine', 170, { fTo: 95, fT: 0.09, a: 0.003, d: 0.13, g: 0.26 }),
            N('pink', { a: 0.02, d: 0.1, g: 0.06, filt: ['bandpass', 900, 900, 0.8] }),
            O('sine', 392, { at: 0.06, a: 0.03, d: 0.4, g: 0.09, send: 0.35 }),
            O('sine', 587.33, { at: 0.06, a: 0.03, d: 0.36, g: 0.04, send: 0.35 }),
        ],
    },
    // A warm bell third (G and B) for someone getting well.
    cure: {
        dur: 0.95, gap: 0.09, queue: 4,
        layers: [...bell(G5, { g: 0.12, d: 0.7 }), ...bell(B5, { at: 0.07, g: 0.1, d: 0.7, pan: 0.2 })],
    },
    // A low wet blip. Unsettling, never harsh; seeded detune per person.
    infection: {
        dur: 0.3, gap: 0.07, queue: 8,
        layers: [
            O('sine', 230, { fTo: 130, fT: 0.12, a: 0.008, d: 0.2, g: 0.2, jit: 180, filt: ['lowpass', 900, 900, 0.7] }),
            O('triangle', 345, { fTo: 170, fT: 0.1, a: 0.008, d: 0.16, g: 0.08, jit: 180 }),
            N('pink', { a: 0.004, d: 0.09, g: 0.12, filt: ['bandpass', 500, 1400, 4] }),
        ],
    },
    // Morning: one wood block knock and a small temple bell.
    dayStart: {
        dur: 0.95, gap: 0.3,
        layers: [
            O('sine', 880, { fTo: 820, a: 0.001, d: 0.06, g: 0.2, filt: ['bandpass', 900, 900, 3] }),
            N('white', { a: 0.001, d: 0.012, g: 0.12, filt: ['bandpass', 1200, 1200, 2] }),
            ...bell(392, { at: 0.05, g: 0.1, d: 0.8, send: 0.45 }),
        ],
    },
    // Evening: two soft wooden clappers, the second quieter.
    dayEnd: {
        dur: 0.4, gap: 0.3,
        layers: [
            O('sine', 640, { fTo: 600, a: 0.001, d: 0.07, g: 0.16, send: 0.3, filt: ['bandpass', 660, 660, 3] }),
            N('white', { a: 0.001, d: 0.01, g: 0.08, filt: ['bandpass', 1500, 1500, 2] }),
            O('sine', 640, { fTo: 600, at: 0.17, a: 0.001, d: 0.09, g: 0.1, send: 0.4, filt: ['bandpass', 660, 660, 3] }),
            N('white', { at: 0.17, a: 0.001, d: 0.01, g: 0.05, filt: ['bandpass', 1500, 1500, 2] }),
        ],
    },
    // One low bell with a long tail. Gentle and respectful, once per night.
    death: {
        dur: 3.2, prio: 2, gap: 1.2,
        layers: [
            O('sine', 196, { a: 0.006, d: 3.0, g: 0.16, send: 0.5 }),
            O('sine', 392, { a: 0.006, d: 2.2, g: 0.07, send: 0.5 }),
            O('sine', 541, { a: 0.006, d: 1.4, g: 0.04 }),
            O('sine', 1058, { a: 0.004, d: 0.5, g: 0.02 }),
            N('pink', { a: 0.002, d: 0.05, g: 0.08, filt: ['lowpass', 500, 500, 0.7] }),
        ],
    },
    // Short and joyful: the yo scale climbing an octave, landing on D.
    win: {
        dur: 2.3, prio: 2, gap: 2,
        layers: [
            ...pluck(D5, { at: 0, g: 0.13 }),
            ...pluck(E5, { at: 0.12, g: 0.13, pan: -0.15 }),
            ...pluck(G5, { at: 0.24, g: 0.14, pan: 0.15 }),
            ...pluck(A5, { at: 0.36, g: 0.14, pan: -0.1 }),
            ...pluck(B5, { at: 0.5, g: 0.15, pan: 0.1 }),
            ...bell(D6, { at: 0.66, g: 0.15, d: 1.4, send: 0.5 }),
            O('sine', G5, { at: 0.66, a: 0.02, d: 1.3, g: 0.06, pan: -0.3, send: 0.5 }),
            O('sine', B5, { at: 0.66, a: 0.02, d: 1.3, g: 0.05, pan: 0.3, send: 0.5 }),
            N('white', { at: 0.66, a: 0.2, d: 0.8, g: 0.02, filt: ['highpass', 6000, 6000, 0.7] }),
        ],
    },
    // A falling sigh. Sad for a breath, never a punishment.
    loss: {
        dur: 1.6, prio: 2, gap: 2,
        layers: [
            O('sine', 440, { fTo: 262, fT: 1.1, a: 0.08, d: 1.3, g: 0.12, send: 0.4, filt: ['lowpass', 1200, 500, 0.7] }),
            O('triangle', 330, { fTo: 196, fT: 1.1, a: 0.1, d: 1.2, g: 0.07, send: 0.4 }),
            N('pink', { a: 0.15, d: 1.0, g: 0.06, filt: ['bandpass', 1200, 400, 1] }),
        ],
    },
    // One note per star; the player transposes it G, B, D so three stars rise.
    star: {
        dur: 0.5,
        layers: [
            FM(G5, 3, 1.2, { indexTo: 0.05, a: 0.002, d: 0.4, g: 0.14, send: 0.45 }),
            O('sine', G5 * 2, { a: 0.002, d: 0.25, g: 0.05 }),
            N('white', { a: 0.001, d: 0.03, g: 0.04, filt: ['highpass', 7000, 7000, 0.7] }),
        ],
    },
    // A latch, a lid lifting, then four sparkles.
    chestOpen: {
        dur: 1.1, gap: 0.5,
        layers: [
            N('white', { a: 0.001, d: 0.015, g: 0.2, filt: ['bandpass', 2600, 2600, 2] }),
            O('sawtooth', 180, { fTo: 270, fT: 0.2, at: 0.03, a: 0.05, d: 0.2, g: 0.07, filt: ['lowpass', 700, 1100, 2] }),
            O('sine', D6, { at: 0.22, a: 0.003, d: 0.4, g: 0.08, send: 0.5, pan: -0.3 }),
            O('sine', G5 * 2, { at: 0.3, a: 0.003, d: 0.4, g: 0.08, send: 0.5, pan: 0.3 }),
            O('sine', A5 * 2, { at: 0.38, a: 0.003, d: 0.4, g: 0.08, send: 0.5, pan: -0.2 }),
            O('sine', D6 * 2, { at: 0.46, a: 0.003, d: 0.6, g: 0.08, send: 0.5, pan: 0.2 }),
        ],
    },
    // A coin: two quick high tings.
    coin: {
        dur: 0.14, prio: 0, gap: 0.04, queue: 6,
        layers: [
            O('sine', 1568, { a: 0.001, d: 0.05, g: 0.08 }),
            O('sine', 2093, { at: 0.035, a: 0.001, d: 0.09, g: 0.08, send: 0.2 }),
        ],
    },
    // Any button: a soft, short, woody tap.
    tap: {
        dur: 0.07, prio: 0, gap: 0.04,
        layers: [
            O('sine', 520, { fTo: 380, a: 0.001, d: 0.05, g: 0.1 }),
            N('white', { a: 0.001, d: 0.008, g: 0.06, filt: ['bandpass', 2400, 2400, 1] }),
        ],
    },
    // A move that is not allowed: soft and dull, never a buzzer.
    error: {
        dur: 0.2, gap: 0.12,
        layers: [
            O('triangle', 240, { fTo: 190, a: 0.005, d: 0.16, g: 0.16, filt: ['lowpass', 600, 400, 0.7] }),
            N('brown', { a: 0.003, d: 0.06, g: 0.2, filt: ['lowpass', 400, 400, 0.7] }),
        ],
    },
    // R fell below 1: two bells a fourth apart and a breath going down,
    // like the curve bending.
    rBelowOne: {
        dur: 1.3, prio: 2, gap: 1,
        layers: [
            ...bell(A5, { g: 0.12, d: 0.6 }),
            ...bell(D6, { at: 0.14, g: 0.13, d: 1.0, pan: 0.2, send: 0.5 }),
            N('pink', { at: 0.1, a: 0.05, d: 0.6, g: 0.05, filt: ['bandpass', 3000, 600, 1.5] }),
        ],
    },
    // A turning point (carrier isolated, spread stopped): two bright bells.
    milestone: {
        dur: 0.95, gap: 0.4,
        layers: [...bell(G5, { g: 0.12, d: 0.5 }), ...bell(D6, { at: 0.11, g: 0.12, d: 0.8, pan: 0.2 })],
    },
    // A big jump in cases: a low uneasy swell, a semitone rub, no alarm.
    spike: {
        dur: 0.75, gap: 0.6,
        layers: [
            O('sawtooth', 110, { fTo: 104, a: 0.15, d: 0.5, g: 0.12, filt: ['lowpass', 300, 700, 1] }),
            O('sawtooth', 116.5, { a: 0.15, d: 0.5, g: 0.08, filt: ['lowpass', 300, 700, 1] }),
            N('brown', { a: 0.01, d: 0.2, g: 0.15, filt: ['lowpass', 320, 320, 0.7] }),
        ],
    },
    // Countdown to the next day: a dry wood tick.
    tick: {
        dur: 0.06, prio: 0, gap: 0.2,
        layers: [
            O('sine', 1100, { a: 0.001, d: 0.035, g: 0.1, filt: ['bandpass', 1100, 1100, 4] }),
            N('white', { a: 0.001, d: 0.005, g: 0.05, filt: ['highpass', 4000, 4000, 0.7] }),
        ],
    },
    // Results tally: one small blip per counted item; the player transposes it up.
    count: {
        dur: 0.07, prio: 0, gap: 0.025,
        layers: [O('sine', D5, { a: 0.001, d: 0.06, g: 0.09 }), O('triangle', D5 * 2, { a: 0.001, d: 0.03, g: 0.03 })],
    },
    // Results tally: a line of the tally lands.
    tallyLine: {
        dur: 0.14, prio: 0,
        layers: [O('triangle', A5, { a: 0.002, d: 0.11, g: 0.1, send: 0.2, filt: ['lowpass', 3000, 1500, 0.7] })],
    },
    // A face settles into the care box: a tiny soft landing.
    careLand: {
        dur: 0.11, prio: 0, gap: 0.05, queue: 3,
        layers: [O('sine', 1046, { fTo: 1318, fT: 0.05, a: 0.003, d: 0.09, g: 0.07, send: 0.2 })],
    },
    // A shop power-up fires: a quick sweep up and a ping.
    powerUp: {
        dur: 0.6,
        layers: [
            N('pink', { a: 0.04, d: 0.25, g: 0.07, filt: ['bandpass', 600, 4200, 2] }),
            O('triangle', 392, { fTo: 1174.66, fT: 0.22, a: 0.01, d: 0.26, g: 0.1, send: 0.3 }),
            ...bell(D6, { at: 0.22, g: 0.1, d: 0.34 }),
        ],
    },
    // Later planets (src/sim/mechanics.js). Test: a glass tube clink and a
    // short rising blip while the result comes in.
    test: {
        dur: 0.3,
        layers: [
            FM(2600, 3.5, 1.2, { indexTo: 0.1, a: 0.001, d: 0.08, g: 0.09, send: 0.3 }),
            O('sine', 660, { fTo: 990, fT: 0.12, at: 0.08, a: 0.01, d: 0.18, g: 0.1 }),
        ],
    },
    // Mask: a soft cloth flutter and a low settle.
    mask: {
        dur: 0.32,
        layers: [
            N('pink', { a: 0.01, d: 0.16, g: 0.14, filt: ['bandpass', 1400, 700, 1.2] }),
            O('sine', 330, { fTo: 262, fT: 0.15, at: 0.06, a: 0.01, d: 0.22, g: 0.1 }),
        ],
    },
});

export const SFX_NAMES = Object.freeze(Object.keys(SFX));

// Hard limits the tests hold every description to.
export const LAYER_GAIN_CEILING = 0.4; // one layer's peak
export const MIX_GAIN_CEILING = 0.9; // sum of the peaks of layers sounding together
export const MAX_SOURCES = 28; // sound sources allowed to overlap at any moment
const STEAL_S = 0.03; // fade time when a voice is cut to make room

const layerEnd = (l) => (l.at || 0) + (l.a || 0) + (l.h || 0) + (l.d || 0);

// Seconds until the last layer has finished.
export function sfxLength(desc) {
    return desc.layers.reduce((m, l) => Math.max(m, layerEnd(l)), 0);
}

// Worst case sum of layer peaks at any one moment (layers that overlap in time).
export function sfxPeak(desc) {
    let worst = 0;
    for (const l of desc.layers) {
        const t = l.at || 0;
        let sum = 0;
        for (const o of desc.layers) if ((o.at || 0) <= t && layerEnd(o) > t) sum += o.g || 0;
        worst = Math.max(worst, sum);
    }
    return worst;
}

// Small seeded generator (mulberry32) so a person's id always gives the
// same detune, and tests are repeatable.
export function seededRandom(seed = 1) {
    let s = (Math.floor(Number(seed) || 0) + 0x9e3779b9) >>> 0;
    return () => {
        s = (s + 0x6d2b79f5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// Most sources sounding together in a list of { start, end } spans.
export function peakOverlap(spans) {
    const marks = [];
    for (const s of spans) marks.push([s.start, 1], [s.end, -1]);
    marks.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    let now = 0;
    let peak = 0;
    for (const [, step] of marks) {
        now += step;
        if (now > peak) peak = now;
    }
    return peak;
}

// White, pink and brown noise, built once per context and looped.
export function makeNoiseBuffers(ctx, seconds = 1.5) {
    const rand = seededRandom(7);
    const len = Math.floor(ctx.sampleRate * seconds);
    const out = {};
    for (const colour of ['white', 'pink', 'brown']) {
        const buf = ctx.createBuffer(1, len, ctx.sampleRate);
        const d = buf.getChannelData(0);
        let b0 = 0, b1 = 0, b2 = 0, last = 0;
        for (let i = 0; i < len; i++) {
            const w = rand() * 2 - 1;
            if (colour === 'white') d[i] = w;
            else if (colour === 'pink') {
                // Paul Kellet's economy pink filter.
                b0 = 0.99765 * b0 + w * 0.099046;
                b1 = 0.963 * b1 + w * 0.2965164;
                b2 = 0.57 * b2 + w * 1.0526913;
                d[i] = Math.max(-1, Math.min(1, (b0 + b1 + b2 + w * 0.1848) * 0.15));
            } else {
                last = (last + 0.02 * w) / 1.02;
                d[i] = Math.max(-1, Math.min(1, last * 3.5));
            }
        }
        out[colour] = buf;
    }
    return out;
}

// Render one description. Returns { out, nodes, sources, end } where
// sources are { node, start, end } and `out` is the effect's own gain node,
// already connected to `dest`.
//   time   when to start (context clock)     gain   overall level
//   semis  transpose in semitones            seed   drives the `jit` detune
//   send   node that feeds the reverb        noise  { white, pink, brown } buffers
export function renderSfx(ctx, desc, { dest, send = null, time = ctx.currentTime, gain = 1, semis = 0, seed = 1, noise = null } = {}) {
    const rand = seededRandom(seed);
    const nodes = [];
    const sources = [];
    const make = (kind) => {
        const n = ctx[kind]();
        nodes.push(n);
        return n;
    };
    const out = make('createGain');
    out.gain.value = gain;
    out.connect(dest);
    const shift = Math.pow(2, semis / 12);
    for (const l of desc.layers) {
        const t0 = time + (l.at || 0);
        const end = time + layerEnd(l);
        const ratio = shift * (l.jit ? Math.pow(2, ((rand() * 2 - 1) * l.jit) / 1200) : 1);
        let src;
        if (l.src === 'noise') {
            src = make('createBufferSource');
            src.buffer = noise[l.colour || 'white'];
            src.loop = true;
            src.start(t0, rand() * 0.9);
        } else {
            src = make('createOscillator');
            src.type = l.src === 'fm' ? 'sine' : l.wave || 'sine';
            src.frequency.setValueAtTime(l.f * ratio, t0);
            if (l.fTo) src.frequency.exponentialRampToValueAtTime(l.fTo * ratio, t0 + (l.fT || end - t0));
            if (l.src === 'fm') {
                // Modulator -> depth -> carrier frequency. The depth decays, so
                // the strike is bright and the tail is pure.
                const mod = make('createOscillator');
                const depth = make('createGain');
                const mf = l.f * ratio * l.ratio;
                mod.frequency.setValueAtTime(mf, t0);
                depth.gain.setValueAtTime(mf * l.index, t0);
                depth.gain.exponentialRampToValueAtTime(Math.max(0.01, mf * (l.indexTo ?? l.index)), end);
                mod.connect(depth);
                depth.connect(src.frequency);
                mod.start(t0);
                mod.stop(end);
                sources.push({ node: mod, start: t0, end });
            }
            src.start(t0);
        }
        src.stop(end);
        sources.push({ node: src, start: t0, end });

        let tail = src;
        if (l.filt) {
            const [type, f0, f1, q] = l.filt;
            const f = make('createBiquadFilter');
            f.type = type;
            f.frequency.setValueAtTime(f0, t0);
            if (f1 && f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, end);
            f.Q.value = q ?? 0.7;
            tail.connect(f);
            tail = f;
        }
        const env = make('createGain');
        const peak = Math.max(0.0002, l.g || 0);
        env.gain.setValueAtTime(0.0001, t0);
        env.gain.linearRampToValueAtTime(peak, t0 + (l.a || 0.001));
        if (l.h) env.gain.setValueAtTime(peak, t0 + (l.a || 0.001) + l.h);
        env.gain.exponentialRampToValueAtTime(0.0001, end);
        tail.connect(env);
        tail = env;
        if (send && l.send) {
            const s = make('createGain');
            s.gain.value = l.send;
            env.connect(s);
            s.connect(send);
        }
        if (l.pan && ctx.createStereoPanner) {
            const p = make('createStereoPanner');
            p.pan.value = l.pan;
            tail.connect(p);
            tail = p;
        }
        tail.connect(out);
    }
    return { out, nodes, sources, end: sources.reduce((m, s) => Math.max(m, s.end), time) };
}

// Plays descriptions through one shared chain and keeps the phone safe:
// at most `maxSources` sources overlap, finished voices are disconnected,
// and repeated effects are spaced out or dropped.
export class SfxPlayer {
    constructor(ctx, dest, { maxSources = MAX_SOURCES, registry = SFX } = {}) {
        this.ctx = ctx;
        this.registry = registry;
        this.maxSources = maxSources;
        this.voices = [];
        this.lastStart = {};
        this.stats = { played: 0, dropped: 0, stolen: 0, nodes: 0 };
        this.noise = makeNoiseBuffers(ctx);

        // input -> soft saturation -> dest. Keeps stacked hits from clipping hard.
        this.input = ctx.createGain();
        let chain = this.input;
        if (ctx.createWaveShaper) {
            const shaper = ctx.createWaveShaper();
            const curve = new Float32Array(257);
            for (let i = 0; i < 257; i++) {
                const x = (i - 128) / 128;
                curve[i] = Math.tanh(1.4 * x) / Math.tanh(1.4);
            }
            shaper.curve = curve;
            chain.connect(shaper);
            chain = shaper;
        }
        chain.connect(dest);

        // A small room: three damped feedback combs. Built once and reused.
        this.send = null;
        if (ctx.createDelay) {
            this.send = ctx.createGain();
            const wet = ctx.createGain();
            wet.gain.value = 0.3;
            wet.connect(this.input);
            for (const time of [0.0297, 0.0371, 0.0411]) {
                const delay = ctx.createDelay(0.1);
                delay.delayTime.value = time;
                const damp = ctx.createBiquadFilter();
                damp.type = 'lowpass';
                damp.frequency.value = 2800;
                const fb = ctx.createGain();
                fb.gain.value = 0.76;
                this.send.connect(delay);
                delay.connect(damp);
                damp.connect(fb);
                fb.connect(delay);
                damp.connect(wet);
            }
        }
    }

    // Sources that are sounding (or scheduled) at context time `t`.
    activeSources(t = this.ctx.currentTime) {
        let n = 0;
        for (const v of this.voices) for (const s of v.sources) if (s.start <= t && s.end > t) n++;
        return n;
    }

    // Disconnect everything that has finished.
    sweep(now = this.ctx.currentTime) {
        this.voices = this.voices.filter((v) => {
            if (v.end > now) return true;
            this._release(v);
            return false;
        });
    }

    _release(v) {
        for (const n of v.nodes) {
            try { n.disconnect(); } catch (e) { /* already gone */ }
        }
    }

    // Fade a voice out quickly and stop it early (used when the cap is hit).
    _steal(v, now) {
        const cut = now + STEAL_S;
        try {
            v.out.gain.setTargetAtTime(0, now, 0.005);
            for (const s of v.sources) {
                if (s.end > cut) {
                    s.node.stop(cut);
                    s.end = cut;
                }
                if (s.start > cut) s.start = cut;
            }
            v.end = cut;
        } catch (e) { /* ignore */ }
        this.stats.stolen++;
    }

    // name: a key of the registry, or a description object.
    // opts: { delay, gain, semis, seed, dest, prio }
    play(name, opts = {}) {
        const desc = typeof name === 'string' ? this.registry[name] : name;
        if (!desc) return null;
        const ctx = this.ctx;
        const now = ctx.currentTime;
        this.sweep(now);
        let time = now + (opts.delay || 0);
        const key = typeof name === 'string' ? name : desc.key;
        if (key && desc.gap) {
            const next = (this.lastStart[key] ?? -Infinity) + desc.gap;
            if (next > time) {
                if (next - time > desc.gap * (desc.queue || 0)) {
                    this.stats.dropped++;
                    return null;
                }
                time = next;
            }
        }
        const prio = opts.prio ?? desc.prio ?? 1;
        const spansAt = (t) =>
            desc.layers.flatMap((l) => {
                const span = { start: t + (l.at || 0), end: t + layerEnd(l) };
                return l.src === 'fm' ? [span, span] : [span];
            });
        const others = () => this.voices.flatMap((v) => v.sources);
        while (peakOverlap([...others(), ...spansAt(time)]) > this.maxSources) {
            // Make room: the oldest voice of equal or lower priority goes.
            // It needs 30 ms to fade, so the new sound waits that long.
            const victim = this.voices.find((v) => v.prio <= prio && v.end > now + STEAL_S);
            if (!victim) {
                this.stats.dropped++;
                return null;
            }
            this._steal(victim, now);
            time = Math.max(time, now + STEAL_S);
        }
        const voice = renderSfx(ctx, desc, {
            dest: opts.dest || this.input,
            send: this.send,
            time,
            gain: opts.gain ?? 1,
            semis: opts.semis || 0,
            seed: opts.seed ?? this.stats.played + 1,
            noise: this.noise,
        });
        voice.prio = prio;
        voice.name = key || 'custom';
        if (key) this.lastStart[key] = time;
        this.voices.push(voice);
        this.stats.played++;
        this.stats.nodes += voice.nodes.length;
        // Real browsers: tidy up as soon as the last source ends.
        const last = voice.sources.reduce((a, b) => (b.end > a.end ? b : a));
        last.node.onended = () => this.sweep();
        return voice;
    }

    stopAll() {
        const now = this.ctx.currentTime;
        for (const v of this.voices) this._steal(v, now);
    }
}
