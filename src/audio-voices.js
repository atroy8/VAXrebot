// Wordless crowd voices: tiny synthesised reactions so the web sounds like
// people, not tokens. A voice is an ordinary effect description (see
// src/audio-sfx.js) built for one person: their id seeds the pitch and the
// size of the mouth (formant scale), so the crowd is many different people
// and the same person always sounds the same.
//
// A vowel is a buzzy source (sawtooth) or breath (noise) pushed through two
// band-pass filters at the vowel's formant frequencies. Moving the filters
// moves the mouth: "oo" to "ah" is a little cheer, a rising hiss is a gasp.
import { seededRandom } from './audio-sfx.js';

export const VOICE_KINDS = Object.freeze(['cough', 'cheer', 'gasp', 'sigh']);

// Who is speaking: pitch from a low adult (about 105 Hz) to a child (about
// 310 Hz), and a matching mouth size. Pure and stable per id.
export function voiceProfile(id) {
    const rand = seededRandom(Number(id) * 7919 + 13 || 13);
    const size = rand(); // 0 = big adult, 1 = small child
    return {
        f0: 105 * Math.pow(2, size * 1.56 + (rand() - 0.5) * 0.12),
        formant: 0.86 + size * 0.38 + (rand() - 0.5) * 0.06,
        pan: (rand() * 2 - 1) * 0.6,
    };
}

const bp = (f0, f1, q) => ['bandpass', f0, f1, q];

// kind: 'cough' | 'cheer' | 'gasp' | 'sigh'. Returns an effect description.
export function voiceDesc(kind, id = 0) {
    const { f0, formant: k, pan } = voiceProfile(id);
    const noise = (colour, o) => ({ src: 'noise', colour, pan, ...o });
    const buzz = (f, o) => ({ src: 'osc', wave: 'sawtooth', f, pan, ...o });
    switch (kind) {
        case 'cough': {
            // Two quick bursts of breath through an open "uh", a small grunt under each.
            const burst = (at, g) => [
                noise('white', { at, a: 0.004, d: 0.07, g: 0.2 * g, filt: bp(720 * k, 560 * k, 3) }),
                noise('white', { at, a: 0.004, d: 0.05, g: 0.12 * g, filt: bp(1900 * k, 1500 * k, 4) }),
                buzz(f0 * 1.15, { fTo: f0 * 0.75, at, a: 0.006, d: 0.08, g: 0.1 * g, filt: bp(620 * k, 520 * k, 2.5) }),
            ];
            return { key: 'voice', dur: 0.26, prio: 0, layers: [...burst(0, 1), ...burst(0.13, 0.6)] };
        }
        case 'cheer':
            // "Ooh!" rising and opening toward "ah".
            return {
                key: 'voice', dur: 0.5, prio: 0,
                layers: [
                    buzz(f0 * 1.5, { fTo: f0 * 2.1, fT: 0.22, a: 0.05, h: 0.12, d: 0.3, g: 0.13, send: 0.3, filt: bp(380 * k, 680 * k, 4) }),
                    buzz(f0 * 1.5, { fTo: f0 * 2.1, fT: 0.22, a: 0.05, h: 0.12, d: 0.26, g: 0.08, filt: bp(900 * k, 1180 * k, 5) }),
                    noise('pink', { a: 0.06, d: 0.3, g: 0.04, filt: bp(2400 * k, 2400 * k, 1) }),
                ],
            };
        case 'gasp':
            // A sharp breath in: hiss that swells and rises, then stops.
            return {
                key: 'voice', dur: 0.36, prio: 0,
                layers: [
                    noise('pink', { a: 0.14, d: 0.2, g: 0.2, filt: bp(900 * k, 2600 * k, 2.5) }),
                    noise('white', { a: 0.14, d: 0.16, g: 0.06, filt: bp(3200 * k, 4200 * k, 2) }),
                    { src: 'osc', wave: 'triangle', f: f0 * 2, fTo: f0 * 2.7, pan, a: 0.12, d: 0.16, g: 0.04, filt: bp(700 * k, 1100 * k, 2) },
                ],
            };
        case 'sigh':
        default:
            // A long breath out, falling, with a little voice in it.
            return {
                key: 'voice', dur: 1.1, prio: 0,
                layers: [
                    noise('pink', { a: 0.15, d: 0.9, g: 0.14, send: 0.3, filt: bp(1400 * k, 500 * k, 1.2) }),
                    buzz(f0 * 1.4, { fTo: f0 * 0.9, fT: 0.9, a: 0.12, d: 0.8, g: 0.06, filt: bp(650 * k, 450 * k, 2) }),
                ],
            };
    }
}

// Keeps voices a texture: they are spread at least `minGap` seconds apart,
// and at most `burst` start in any `window` seconds. schedule(now) returns
// the time the next voice may start, or null when the crowd is loud enough.
export function createVoiceLimiter({ minGap = 0.14, burst = 4, window = 1.6 } = {}) {
    let times = [];
    return {
        schedule(now) {
            times = times.filter((t) => t > now - window);
            if (times.length >= burst) return null;
            const at = times.length ? Math.max(now, times[times.length - 1] + minGap) : now;
            times.push(at);
            return at;
        },
        reset() {
            times = [];
        },
    };
}
