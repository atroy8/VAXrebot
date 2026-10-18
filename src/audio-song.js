// The game's theme song as pure data plus scheduling math. No Web Audio here,
// so everything is unit tested (tests/audio-song.test.js); src/audio.js turns
// the events into sound.
//
// The song: "Starlight Response", A natural minor, 100 BPM, 4/4, an 8 bar loop
// on a 16th note grid. Progression Am F C G | Am F G G (i VI III VII, the
// classic hopeful space adventure lift). One song, two arrangements:
//   menu  - calm: soft pad, slow bass, bell melody, a few airy hats
//   level - driving: everything in menu plus an arpeggio, eighth note bass,
//           kick, snare and busier hats; outbreak pressure (mood 0..1) adds
//           sixteenth hats and opens the lead filter.

export const STEPS_PER_BAR = 16;

export const SONG = Object.freeze({
    title: 'Starlight Response',
    bpm: 100,
    key: 'A minor',
    // Pitch classes of A natural minor: A B C D E F G (C = 0).
    scale: Object.freeze([9, 11, 0, 2, 4, 5, 7]),
    bars: 8,
    // One chord per bar: root MIDI note (bass octave) and triad tones.
    chords: Object.freeze([
        { name: 'Am', root: 45, tones: [57, 60, 64] },
        { name: 'F', root: 41, tones: [53, 57, 60] },
        { name: 'C', root: 48, tones: [55, 60, 64] },
        { name: 'G', root: 43, tones: [55, 59, 62] },
        { name: 'Am', root: 45, tones: [57, 60, 64] },
        { name: 'F', root: 41, tones: [53, 57, 60] },
        { name: 'G', root: 43, tones: [55, 59, 62] },
        { name: 'G', root: 43, tones: [55, 59, 62] },
    ]),
    // Lead melody: [bar, step, midi, length in steps].
    melody: Object.freeze([
        [0, 0, 76, 4], [0, 4, 74, 2], [0, 6, 72, 2], [0, 8, 69, 6], [0, 14, 64, 2],
        [1, 0, 65, 2], [1, 2, 69, 2], [1, 4, 72, 4], [1, 8, 69, 4], [1, 12, 72, 4],
        [2, 0, 67, 4], [2, 4, 76, 4], [2, 8, 74, 2], [2, 10, 72, 2], [2, 12, 74, 4],
        [3, 0, 71, 6], [3, 6, 67, 2], [3, 8, 74, 8],
        [4, 0, 76, 4], [4, 4, 74, 2], [4, 6, 72, 2], [4, 8, 69, 4], [4, 12, 72, 4],
        [5, 0, 77, 4], [5, 4, 76, 4], [5, 8, 72, 4], [5, 12, 69, 4],
        [6, 0, 71, 4], [6, 4, 74, 4], [6, 8, 79, 4], [6, 12, 77, 2], [6, 14, 76, 2],
        [7, 0, 74, 8], [7, 8, 71, 4],
    ]),
});

export const LOOP_STEPS = SONG.bars * STEPS_PER_BAR;

// Layer mix per arrangement (0 = silent). The audio engine crossfades these
// gains when the screen changes.
export const ARRANGEMENTS = Object.freeze({
    menu: Object.freeze({ pad: 1, bass: 0.7, melody: 0.8, arp: 0, kick: 0, snare: 0, hat: 0.5 }),
    level: Object.freeze({ pad: 0.8, bass: 1, melody: 1, arp: 0.7, kick: 1, snare: 0.8, hat: 1 }),
});

export const LAYERS = Object.freeze(['pad', 'bass', 'melody', 'arp', 'kick', 'snare', 'hat']);

// Which arrangement a screen gets. In a level the song drives; everywhere
// else (start page, map, briefing, results) it stays calm.
export function arrangementForScreen(screen) {
    return screen === 'game' ? 'level' : 'menu';
}

export function midiToFreq(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
}

export function stepSeconds(bpm = SONG.bpm) {
    return 60 / bpm / 4;
}

// Patterns per layer for one bar, written for both arrangements. Each entry:
// { step, len, midi?, vel }. `variant` is 'menu' or 'level'.
function barEvents(layer, bar, variant, mood) {
    const chord = SONG.chords[bar];
    const out = [];
    const ev = (step, len, midi, vel) => out.push({ layer, step, len, midi, vel });
    switch (layer) {
        case 'pad':
            // Whole bar triad, slightly overlapping into the next bar.
            for (const m of chord.tones) ev(0, STEPS_PER_BAR, m, 0.6);
            break;
        case 'bass':
            if (variant === 'menu') {
                ev(0, 8, chord.root, 0.8);
                ev(8, 8, chord.root + 7, 0.6);
            } else {
                const pattern = [0, 0, 7, 0, 0, 12, 7, 0];
                pattern.forEach((iv, i) => ev(i * 2, 2, chord.root + iv, i % 2 ? 0.6 : 0.9));
            }
            break;
        case 'melody':
            for (const [b, step, midi, len] of SONG.melody) if (b === bar) ev(step, len, midi, 0.8);
            break;
        case 'arp': {
            // Up and down the triad an octave up, sixteenths.
            const notes = [...chord.tones, chord.tones[0] + 12, ...chord.tones.slice(1).reverse()].map((m) => m + 12);
            for (let s = 0; s < STEPS_PER_BAR; s++) ev(s, 1, notes[s % notes.length], s % 4 === 0 ? 0.6 : 0.4);
            break;
        }
        case 'kick':
            for (const s of [0, 8]) ev(s, 2, null, 1);
            if (bar % 2 === 1) ev(14, 2, null, 0.6);
            break;
        case 'snare':
            for (const s of [4, 12]) ev(s, 2, null, 0.8);
            break;
        case 'hat':
            if (variant === 'menu') {
                for (const s of [2, 6, 10, 14]) ev(s, 1, null, 0.5);
            } else {
                const every = mood > 0.5 ? 1 : 2;
                for (let s = 0; s < STEPS_PER_BAR; s += every) ev(s, 1, null, s % 4 === 2 ? 0.8 : 0.45);
            }
            break;
        default:
            break;
    }
    return out;
}

// Every event in one full loop for an arrangement, with loop-relative steps,
// sorted by step. Layers silent in the arrangement are left out.
export function loopEvents(arrangement = 'menu', mood = 0) {
    const mix = ARRANGEMENTS[arrangement] || ARRANGEMENTS.menu;
    const variant = arrangement === 'level' ? 'level' : 'menu';
    const out = [];
    for (const layer of LAYERS) {
        if (!(mix[layer] > 0)) continue;
        for (let bar = 0; bar < SONG.bars; bar++) {
            for (const e of barEvents(layer, bar, variant, mood)) {
                out.push({ ...e, step: bar * STEPS_PER_BAR + e.step });
            }
        }
    }
    return out.sort((a, b) => a.step - b.step);
}

// Lookahead scheduler on an absolute step counter, so every step is
// scheduled exactly once no matter how often tick() runs. The caller passes
// the audio clock (AudioContext.currentTime); events whose start falls before
// now + lookahead are handed to onEvent(event, time).
export function createScheduler({ startTime, bpm = SONG.bpm, lookahead = 0.2, getEvents }) {
    const dt = stepSeconds(bpm);
    let step = 0; // absolute step index since start
    let nextTime = startTime;
    let cache = null; // { key, byStep }

    function eventsAt(loopStep) {
        const events = getEvents();
        if (!cache || cache.events !== events) {
            const byStep = new Map();
            for (const e of events) {
                if (!byStep.has(e.step)) byStep.set(e.step, []);
                byStep.get(e.step).push(e);
            }
            cache = { events, byStep };
        }
        return cache.byStep.get(loopStep) || [];
    }

    return {
        get step() {
            return step;
        },
        get nextTime() {
            return nextTime;
        },
        stepSeconds: dt,
        // Returns the list of { event, time, step } emitted this tick.
        tick(now, onEvent = () => {}) {
            const emitted = [];
            // If the clock jumped ahead (tab was hidden), skip stale steps
            // instead of firing a burst of late notes.
            if (nextTime < now - 0.1) {
                const skip = Math.ceil((now - nextTime) / dt);
                step += skip;
                nextTime += skip * dt;
            }
            while (nextTime < now + lookahead) {
                const loopStep = step % LOOP_STEPS;
                for (const event of eventsAt(loopStep)) {
                    emitted.push({ event, time: nextTime, step });
                    onEvent(event, nextTime, step);
                }
                step += 1;
                nextTime += dt;
            }
            return emitted;
        },
    };
}

// Both arrangements in one event list, each event tagged with the
// arrangement (its bus). The engine schedules this list and crossfades the
// two buses, so a screen change blends one arrangement into the other on
// the beat instead of cutting. Cached per mood bucket so the scheduler sees
// a stable list between changes.
const mixedCache = new Map();
export function moodBucket(mood) {
    return Math.max(0, Math.min(1, mood)) > 0.5 ? 1 : 0;
}
export function mixedEvents(mood = 0) {
    const key = moodBucket(mood);
    if (!mixedCache.has(key)) {
        const tag = (arr) => loopEvents(arr, key).map((e) => ({ ...e, bus: arr }));
        mixedCache.set(key, [...tag('menu'), ...tag('level')].sort((a, b) => a.step - b.step));
    }
    return mixedCache.get(key);
}

// Target gain for each bus when an arrangement is active.
export function busTargets(arrangement) {
    return arrangement === 'level' ? { menu: 0, level: 1 } : { menu: 1, level: 0 };
}

// Seconds the crossfade takes (time constant for setTargetAtTime is a third).
export const CROSSFADE_S = 1.8;
