// A quiet generative soundscape per planet, plus a tension layer that
// follows the outbreak. Everything is data: a planet lists a few looping
// beds (filtered noise for water, wind or rain, or a thin tone for
// crickets), one or two soft drones, sparse pentatonic plucks and the odd
// far-off event (a firework, thunder, a bubble). AmbienceEngine turns one
// definition into a handful of long-lived nodes and crossfades to the next
// when the planet changes.
//
// The tension layer is the same for every planet, tuned to its root: a low
// throb whose filter opens as cases approach the case cap. When live R is
// under 1 the throb backs off and the bed brightens, so the player can hear
// the outbreak turning.
import { bell, pluck, seededRandom } from './audio-sfx.js';

const O = (wave, f, o = {}) => ({ src: 'osc', wave, f, ...o });
const N = (colour, o = {}) => ({ src: 'noise', colour, ...o });

// Five-note scales, as semitones above the root.
export const SCALES = Object.freeze({
    yo: [0, 2, 5, 7, 9], // bright folk pentatonic
    in: [0, 1, 5, 7, 8], // the darker koto scale
    hirajoshi: [0, 2, 3, 7, 8],
    ryukyu: [0, 4, 5, 7, 11], // island scale, for the coral world
    major: [0, 2, 4, 7, 9],
});

// Note voices: f -> layers.
export const PLUCK_VOICES = Object.freeze({
    koto: (f) => pluck(f, { g: 0.07, d: 0.9, send: 0.5 }),
    bell: (f) => bell(f, { g: 0.05, d: 1.6, send: 0.6 }),
    drip: (f) => [O('sine', f, { fTo: f * 1.35, fT: 0.05, a: 0.002, d: 0.12, g: 0.06, send: 0.5 })],
    flute: (f) => [
        O('sine', f, { a: 0.12, h: 0.3, d: 0.6, g: 0.05, send: 0.5 }),
        N('pink', { a: 0.1, d: 0.5, g: 0.012, filt: ['bandpass', f * 2, f * 2, 3] }),
    ],
    marimba: (f) => [O('sine', f, { a: 0.002, d: 0.35, g: 0.07, send: 0.3 }), O('sine', f * 4, { a: 0.001, d: 0.06, g: 0.02 })],
    glass: (f) => [
        { src: 'fm', f, ratio: 3.01, index: 0.6, indexTo: 0.05, a: 0.004, d: 1.8, g: 0.035, send: 0.6 },
        O('sine', f * 2, { a: 0.004, d: 1.0, g: 0.012 }),
    ],
    ping: (f) => [O('sine', f, { a: 0.05, h: 0.1, d: 0.5, g: 0.035, send: 0.5 })],
    taiko: (f) => [
        O('sine', f, { fTo: f * 0.6, fT: 0.12, a: 0.003, d: 0.3, g: 0.12, send: 0.3 }),
        N('brown', { a: 0.002, d: 0.08, g: 0.1, filt: ['lowpass', 500, 500, 0.7] }),
    ],
});

// Unpitched far-off events.
export const EVENT_VOICES = Object.freeze({
    firework: () => [
        N('brown', { a: 0.01, d: 0.7, g: 0.16, send: 0.4, filt: ['lowpass', 260, 130, 0.7] }),
        O('sine', 190, { fTo: 110, a: 0.005, d: 0.4, g: 0.08 }),
        N('white', { at: 0.25, a: 0.2, d: 1.0, g: 0.012, filt: ['highpass', 5000, 5000, 0.7] }),
    ],
    thunder: () => [
        N('brown', { a: 0.25, d: 3.2, g: 0.22, filt: ['lowpass', 320, 150, 0.7] }),
        N('pink', { at: 0.2, a: 0.3, d: 2.0, g: 0.05, filt: ['lowpass', 520, 220, 0.7] }),
    ],
    bubble: () => [
        O('sine', 500, { fTo: 1100, fT: 0.09, a: 0.005, d: 0.1, g: 0.04, send: 0.4 }),
        O('sine', 600, { fTo: 1300, fT: 0.08, at: 0.12, a: 0.005, d: 0.09, g: 0.03, send: 0.4 }),
    ],
    gust: () => [N('pink', { a: 0.9, d: 1.6, g: 0.05, filt: ['bandpass', 400, 900, 1] })],
});

// Bed layer: { src: 'noise', colour, filt: [type, Hz, Q], g, lfo } or
// { src: 'tone', wave, f, g, lfo }. lfo: [rate Hz, depth, 'freq' | 'gain'].
// root is a MIDI note. plucks: { voice, every: [min s, max s], oct: [lo, hi] }.
export const PLANET_AMBIENCE = Object.freeze({
    // Water fields: slow lapping water, drips, a koto now and then.
    mizuho: {
        root: 62, scale: 'yo',
        beds: [
            { src: 'noise', colour: 'pink', filt: ['lowpass', 700, 0.5], g: 0.05, lfo: [0.13, 250, 'freq'] },
            { src: 'noise', colour: 'white', filt: ['bandpass', 2600, 1.2], g: 0.008, lfo: [0.21, 0.006, 'gain'] },
        ],
        drones: [{ semis: -12, wave: 'triangle', g: 0.02 }, { semis: -5, wave: 'sine', g: 0.015 }],
        plucks: [{ voice: 'drip', every: [1.5, 4], oct: [1, 2] }, { voice: 'koto', every: [6, 12], oct: [0, 1] }],
    },
    // Fireworks: warm night air, a koto, and festival booms far away.
    hanabi: {
        root: 67, scale: 'yo',
        beds: [{ src: 'noise', colour: 'brown', filt: ['lowpass', 420, 0.5], g: 0.05, lfo: [0.08, 120, 'freq'] }],
        drones: [{ semis: -12, wave: 'triangle', g: 0.02 }, { semis: -5, wave: 'sine', g: 0.015 }],
        plucks: [{ voice: 'koto', every: [3, 7], oct: [0, 1] }],
        events: [{ voice: 'firework', every: [6, 14] }],
    },
    // Moon viewing: very still. Crickets, a slow fifth, a low bell.
    tsukimi: {
        root: 62, scale: 'in',
        beds: [
            { src: 'tone', wave: 'sine', f: 4200, g: 0.004, lfo: [16, 0.004, 'gain'] },
            { src: 'noise', colour: 'pink', filt: ['lowpass', 500, 0.5], g: 0.025 },
        ],
        drones: [{ semis: -12, wave: 'sine', g: 0.03 }, { semis: -5, wave: 'sine', g: 0.02 }],
        plucks: [{ voice: 'bell', every: [5, 10], oct: [-1, 0] }],
    },
    // Cloud road: wind that swells and thins, a breathy flute.
    kumoji: {
        root: 69, scale: 'yo',
        beds: [
            { src: 'noise', colour: 'pink', filt: ['bandpass', 500, 0.8], g: 0.06, lfo: [0.09, 300, 'freq'] },
            { src: 'noise', colour: 'white', filt: ['bandpass', 1800, 0.6], g: 0.01, lfo: [0.17, 0.008, 'gain'] },
        ],
        drones: [{ semis: -12, wave: 'sine', g: 0.02 }],
        plucks: [{ voice: 'flute', every: [4, 9], oct: [0, 1] }],
        events: [{ voice: 'gust', every: [8, 16] }],
    },
    // Coral: underwater hush, bubbles, a soft marimba in the island scale.
    sango: {
        root: 60, scale: 'ryukyu',
        beds: [{ src: 'noise', colour: 'brown', filt: ['lowpass', 320, 0.5], g: 0.08, lfo: [0.11, 120, 'freq'] }],
        drones: [{ semis: -12, wave: 'sine', g: 0.03 }, { semis: -5, wave: 'sine', g: 0.015 }],
        plucks: [{ voice: 'marimba', every: [2.5, 6], oct: [0, 1] }],
        events: [{ voice: 'bubble', every: [2, 6] }],
    },
    // Snow viewing: a faint hiss of falling snow and glassy high notes.
    yukimi: {
        root: 64, scale: 'hirajoshi',
        beds: [
            { src: 'noise', colour: 'white', filt: ['bandpass', 2400, 0.5], g: 0.008, lfo: [0.07, 0.004, 'gain'] },
            { src: 'noise', colour: 'pink', filt: ['lowpass', 350, 0.5], g: 0.03 },
        ],
        drones: [{ semis: -12, wave: 'sine', g: 0.02 }, { semis: -5, wave: 'sine', g: 0.015 }],
        plucks: [{ voice: 'glass', every: [5, 11], oct: [1, 2] }],
    },
    // Fireflies: a summer night, two cricket choirs, soft glowing pings.
    hotaru: {
        root: 65, scale: 'major',
        beds: [
            { src: 'tone', wave: 'sine', f: 3900, g: 0.004, lfo: [19, 0.004, 'gain'] },
            { src: 'tone', wave: 'sine', f: 4600, g: 0.003, lfo: [13, 0.003, 'gain'] },
            { src: 'noise', colour: 'pink', filt: ['lowpass', 450, 0.5], g: 0.03 },
        ],
        drones: [{ semis: -12, wave: 'triangle', g: 0.02 }],
        plucks: [{ voice: 'ping', every: [1.2, 3.5], oct: [1, 2] }],
    },
    // Thunder: steady rain, a low drum, thunder rolling a long way off.
    kaminari: {
        root: 57, scale: 'in',
        beds: [
            { src: 'noise', colour: 'white', filt: ['bandpass', 1500, 0.5], g: 0.035, lfo: [0.15, 0.012, 'gain'] },
            { src: 'noise', colour: 'white', filt: ['highpass', 5000, 0.7], g: 0.01 },
        ],
        drones: [{ semis: -12, wave: 'triangle', g: 0.025 }, { semis: -5, wave: 'sine', g: 0.015 }],
        plucks: [{ voice: 'taiko', every: [5, 10], oct: [0, 0] }],
        events: [{ voice: 'thunder', every: [9, 20] }],
    },
});

export const DEFAULT_PLANET = 'mizuho';
export const CROSSFADE_S = 2.5;
const midiToFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);

// How tense the level is, 0..1. Rises with cases / cap (nothing below a
// quarter of the cap, full at the cap) and drops to about a third once
// live R is under 1. No cap means no tension.
export function tensionLevel({ cases = 0, cap = Infinity, r = null } = {}) {
    if (!Number.isFinite(cap) || cap <= 0) return 0;
    const ratio = Math.max(0, Math.min(1, cases / cap));
    const base = ratio <= 0.25 ? 0 : Math.pow((ratio - 0.25) / 0.75, 1.3);
    return r != null && r < 1 ? base * 0.35 : base;
}

export function isRelaxed(r) {
    return r != null && r < 1;
}

// What the nodes should do for a tension level.
export function ambienceTargets(tension = 0, relaxed = false) {
    const t = Math.max(0, Math.min(1, tension));
    return {
        pulseGain: 0.16 * t, // the low throb fades in
        pulseHz: 0.9 + 0.8 * t, // and quickens a little
        pulseCutoff: 280 + 620 * t, // its filter opens
        brightness: relaxed ? 1.6 : 1, // bed filter multiplier: R under 1 brightens
        pluckRate: relaxed ? 1.4 : 1 - 0.3 * t, // notes thin out under pressure
    };
}

// The note a pluck plays: scale degree and octave picked by `rand`.
export function pickNote(def, spec, rand) {
    const scale = SCALES[def.scale] || SCALES.yo;
    const [lo, hi] = spec.oct || [0, 0];
    const oct = lo + Math.floor(rand() * (hi - lo + 1));
    return midiToFreq(def.root + scale[Math.floor(rand() * scale.length)] + 12 * oct);
}

export class AmbienceEngine {
    // player: an SfxPlayer (plucks and events share its polyphony cap).
    // canPlay: () => boolean, false while muted or switched off.
    constructor(ctx, dest, { player, canPlay = () => true, defs = PLANET_AMBIENCE } = {}) {
        this.ctx = ctx;
        this.dest = dest;
        this.player = player;
        this.canPlay = canPlay;
        this.defs = defs;
        this.scene = null;
        this.planet = null;
        this.tension = 0;
        this.relaxed = false;
        this.timer = null;
        this.nodesCreated = 0;
        this.rand = seededRandom(Date.now() % 100000);
    }

    // Start (or crossfade to) a planet's bed. Unknown ids get the default.
    start(planetId) {
        const id = this.defs[planetId] ? planetId : DEFAULT_PLANET;
        if (this.scene && this.planet === id) return;
        this._fadeOut(this.scene, CROSSFADE_S);
        this.planet = id;
        this.scene = this._build(this.defs[id]);
        this._apply(0.05);
        if (!this.timer) this.timer = setInterval(() => this.tick(), 400);
    }

    stop(fadeS = 1.2) {
        this._fadeOut(this.scene, fadeS);
        this.scene = null;
        this.planet = null;
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
    }

    setTension(level, relaxed = false) {
        this.tension = Math.max(0, Math.min(1, level || 0));
        this.relaxed = !!relaxed;
        this._apply(1.5);
    }

    _build(def) {
        const ctx = this.ctx;
        const t = ctx.currentTime;
        const nodes = [];
        const sources = [];
        const make = (kind, ...args) => {
            const n = ctx[kind](...args);
            nodes.push(n);
            this.nodesCreated++;
            return n;
        };
        const osc = (wave, f) => {
            const o = make('createOscillator');
            o.type = wave;
            o.frequency.value = f;
            o.start(t);
            sources.push(o);
            return o;
        };
        const out = make('createGain');
        out.gain.setValueAtTime(0.0001, t);
        out.gain.exponentialRampToValueAtTime(1, t + CROSSFADE_S);
        out.connect(this.dest);
        // Every bed and drone passes through one tone filter: the "brightness".
        const tone = make('createBiquadFilter');
        tone.type = 'lowpass';
        tone.frequency.value = 3200;
        tone.Q.value = 0.5;
        tone.connect(out);

        for (const bed of def.beds || []) {
            const g = make('createGain');
            g.gain.value = bed.g;
            g.connect(tone);
            let filter = null;
            if (bed.src === 'noise') {
                const src = make('createBufferSource');
                src.buffer = this.player.noise[bed.colour || 'white'];
                src.loop = true;
                filter = make('createBiquadFilter');
                filter.type = bed.filt[0];
                filter.frequency.value = bed.filt[1];
                filter.Q.value = bed.filt[2] ?? 0.7;
                src.connect(filter);
                filter.connect(g);
                src.start(t, this.rand());
                sources.push(src);
            } else {
                osc(bed.wave || 'sine', bed.f).connect(g);
            }
            if (bed.lfo) {
                const [rate, depth, target] = bed.lfo;
                const amount = make('createGain');
                amount.gain.value = depth;
                osc('sine', rate).connect(amount);
                amount.connect(target === 'freq' && filter ? filter.frequency : g.gain);
            }
        }
        for (const d of def.drones || []) {
            const g = make('createGain');
            g.gain.value = d.g;
            const f = midiToFreq(def.root + d.semis);
            const lp = make('createBiquadFilter');
            lp.type = 'lowpass';
            lp.frequency.value = f * 4;
            osc(d.wave || 'sine', f).connect(lp);
            lp.connect(g);
            g.connect(tone);
        }
        // Tension: a sawtooth an octave or two under the root (kept between
        // about 62 and 125 Hz so its harmonics reach a phone speaker), through
        // a low-pass that opens, throbbing at heartbeat speed.
        let pf = midiToFreq(def.root);
        while (pf > 125) pf /= 2;
        const pulseFilter = make('createBiquadFilter');
        pulseFilter.type = 'lowpass';
        pulseFilter.frequency.value = 280;
        const throb = make('createGain');
        throb.gain.value = 0.5;
        const throbDepth = make('createGain');
        throbDepth.gain.value = 0.5;
        const pulseLfo = osc('sine', 0.9);
        pulseLfo.connect(throbDepth);
        throbDepth.connect(throb.gain);
        const pulseGain = make('createGain');
        pulseGain.gain.value = 0;
        osc('sawtooth', pf).connect(pulseFilter);
        pulseFilter.connect(throb);
        throb.connect(pulseGain);
        pulseGain.connect(out);

        const next = (spec) => t + 1 + this.rand() * spec.every[1];
        return {
            def, out, tone, pulseFilter, pulseGain, pulseLfo, nodes, sources,
            plucks: (def.plucks || []).map((spec) => ({ spec, at: next(spec) })),
            events: (def.events || []).map((spec) => ({ spec, at: next(spec) })),
        };
    }

    _apply(timeConstant) {
        const s = this.scene;
        if (!s) return;
        const t = this.ctx.currentTime;
        const k = ambienceTargets(this.tension, this.relaxed);
        s.pulseGain.gain.setTargetAtTime(k.pulseGain, t, timeConstant);
        s.pulseFilter.frequency.setTargetAtTime(k.pulseCutoff, t, timeConstant);
        s.pulseLfo.frequency.setTargetAtTime(k.pulseHz, t, timeConstant);
        s.tone.frequency.setTargetAtTime(3200 * k.brightness, t, timeConstant);
    }

    // Schedules any pluck or event that has come due. Called on a timer;
    // public so tests can drive it.
    tick() {
        const s = this.scene;
        if (!s || !this.player) return;
        const now = this.ctx.currentTime;
        const rate = ambienceTargets(this.tension, this.relaxed).pluckRate;
        const wait = (spec) => (spec.every[0] + this.rand() * (spec.every[1] - spec.every[0])) / rate;
        const audible = this.canPlay();
        for (const p of s.plucks) {
            if (now < p.at) continue;
            p.at = now + wait(p.spec);
            if (!audible) continue;
            const layers = PLUCK_VOICES[p.spec.voice](pickNote(s.def, p.spec, this.rand));
            this.player.play({ layers }, { dest: s.out, prio: 0, gain: this.relaxed ? 1.2 : 1 });
        }
        for (const e of s.events) {
            if (now < e.at) continue;
            e.at = now + wait(e.spec);
            if (!audible) continue;
            this.player.play({ layers: EVENT_VOICES[e.spec.voice]() }, { dest: s.out, prio: 0 });
        }
    }

    _fadeOut(scene, fadeS) {
        if (!scene) return;
        const t = this.ctx.currentTime;
        try {
            scene.out.gain.cancelScheduledValues(t);
            scene.out.gain.setTargetAtTime(0, t, fadeS / 4);
            for (const src of scene.sources) src.stop(t + fadeS + 0.1);
        } catch (e) { /* ignore */ }
        setTimeout(() => {
            for (const n of scene.nodes) {
                try { n.disconnect(); } catch (e) { /* ignore */ }
            }
        }, (fadeS + 0.3) * 1000);
    }
}
