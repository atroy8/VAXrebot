// Sound pass, part 2: planet ambience and its tension layer, crowd voices,
// the AudioEngine wiring (gesture unlock, mute, switches) and the call
// sites in src/game.js. Structure only: see wide-audio-fake.js.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { PLANET_DEFS } from '../src/config/campaign.js';
import { SFX, SfxPlayer, sfxPeak, sfxLength, seededRandom, LAYER_GAIN_CEILING, MIX_GAIN_CEILING, MAX_SOURCES } from '../src/audio-sfx.js';
import {
    PLANET_AMBIENCE, SCALES, PLUCK_VOICES, EVENT_VOICES, AmbienceEngine, tensionLevel, isRelaxed, ambienceTargets, pickNote, CROSSFADE_S,
} from '../src/audio-ambience.js';
import { voiceDesc, voiceProfile, createVoiceLimiter, VOICE_KINDS } from '../src/audio-voices.js';
import { AudioEngine, readSoundPrefs, SOUND_PREFS_KEY, SOUND_PREF_DEFAULTS, MUSIC_BUS_GAIN, MUSIC_DUCK } from '../src/audio.js';
import { settingsMarkup, SOUND_SWITCHES } from '../src/ui/settings.js';
import { FakeAudioContext, peakSources } from './wide-audio-fake.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

describe('planet ambience definitions', () => {
    it('every planet in the campaign has one', () => {
        expect(PLANET_DEFS.length).toBe(8);
        for (const planet of PLANET_DEFS) expect(PLANET_AMBIENCE[planet.id], planet.id).toBeTruthy();
    });

    it('each is a quiet bed, a drone, and sparse notes from a five note scale', () => {
        for (const [id, def] of Object.entries(PLANET_AMBIENCE)) {
            expect(SCALES[def.scale], id).toHaveLength(5);
            expect(def.beds.length, id).toBeGreaterThan(0);
            expect(def.beds.length + def.drones.length, id).toBeLessThanOrEqual(6);
            for (const bed of def.beds) expect(bed.g, id).toBeLessThanOrEqual(0.08);
            for (const d of def.drones) expect(d.g, id).toBeLessThanOrEqual(0.03);
            expect(def.plucks.length, id).toBeGreaterThan(0);
            for (const p of def.plucks) {
                expect(PLUCK_VOICES[p.voice], `${id} ${p.voice}`).toBeTypeOf('function');
                expect(p.every[0], id).toBeGreaterThanOrEqual(1); // sparse
                expect(p.every[1], id).toBeGreaterThan(p.every[0]);
            }
            for (const e of def.events || []) expect(EVENT_VOICES[e.voice], `${id} ${e.voice}`).toBeTypeOf('function');
        }
    });

    it('no two planets share a bed', () => {
        const beds = Object.values(PLANET_AMBIENCE).map((d) => JSON.stringify([d.beds, d.plucks, d.events]));
        expect(new Set(beds).size).toBe(beds.length);
    });

    it('pluck and event voices stay under the gain ceilings and end', () => {
        const all = [...Object.values(PLUCK_VOICES).map((v) => v(440)), ...Object.values(EVENT_VOICES).map((v) => v())];
        for (const layers of all) {
            for (const l of layers) expect(l.g).toBeLessThanOrEqual(LAYER_GAIN_CEILING);
            expect(sfxPeak({ layers })).toBeLessThanOrEqual(MIX_GAIN_CEILING);
            expect(sfxLength({ layers })).toBeLessThan(4.5);
        }
    });

    it('pickNote stays in the planet scale', () => {
        const def = PLANET_AMBIENCE.sango;
        const rand = seededRandom(9);
        for (let i = 0; i < 60; i++) {
            const f = pickNote(def, { oct: [0, 1] }, rand);
            const semis = Math.round(12 * Math.log2(f / (440 * Math.pow(2, (def.root - 69) / 12))));
            expect(SCALES.ryukyu).toContain(((semis % 12) + 12) % 12);
        }
    });
});

describe('tension follows the outbreak', () => {
    it('is monotonic in cases / cap', () => {
        let last = -1;
        for (let cases = 0; cases <= 20; cases++) {
            const t = tensionLevel({ cases, cap: 20, r: 1.8 });
            expect(t).toBeGreaterThanOrEqual(last);
            expect(t).toBeGreaterThanOrEqual(0);
            expect(t).toBeLessThanOrEqual(1);
            last = t;
        }
        expect(tensionLevel({ cases: 2, cap: 20 })).toBe(0);
        expect(tensionLevel({ cases: 20, cap: 20 })).toBe(1);
        expect(tensionLevel({ cases: 40, cap: 20 })).toBe(1);
    });

    it('falls when R goes below 1, at every case count', () => {
        for (let cases = 6; cases <= 20; cases++) {
            expect(tensionLevel({ cases, cap: 20, r: 0.8 })).toBeLessThan(tensionLevel({ cases, cap: 20, r: 1.2 }));
        }
        expect(isRelaxed(0.9)).toBe(true);
        expect(isRelaxed(1.1)).toBe(false);
        expect(isRelaxed(null)).toBe(false);
    });

    it('is zero when a level has no case cap or bad numbers', () => {
        expect(tensionLevel({ cases: 50, cap: Infinity })).toBe(0);
        expect(tensionLevel({ cases: 5, cap: 0 })).toBe(0);
        expect(tensionLevel()).toBe(0);
    });

    it('targets: the pulse fades in and its filter opens; R under 1 brightens the bed', () => {
        const calm = ambienceTargets(0, false);
        const tense = ambienceTargets(1, false);
        expect(calm.pulseGain).toBe(0);
        expect(tense.pulseGain).toBeGreaterThan(0);
        expect(tense.pulseGain).toBeLessThanOrEqual(0.2);
        expect(tense.pulseCutoff).toBeGreaterThan(calm.pulseCutoff);
        expect(tense.pulseHz).toBeGreaterThan(calm.pulseHz);
        expect(tense.pluckRate).toBeLessThan(calm.pluckRate);
        const relaxed = ambienceTargets(0.2, true);
        expect(relaxed.brightness).toBeGreaterThan(ambienceTargets(0.2, false).brightness);
        expect(relaxed.pluckRate).toBeGreaterThan(calm.pluckRate);
        let last = -1;
        for (let t = 0; t <= 1.001; t += 0.1) {
            expect(ambienceTargets(t).pulseGain).toBeGreaterThanOrEqual(last);
            last = ambienceTargets(t).pulseGain;
        }
    });
});

describe('AmbienceEngine on a fake AudioContext', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    const setup = (canPlay = () => true) => {
        const ctx = new FakeAudioContext();
        const player = new SfxPlayer(ctx, ctx.destination);
        const bus = ctx.createGain();
        const amb = new AmbienceEngine(ctx, bus, { player, canPlay });
        return { ctx, player, bus, amb };
    };

    it('builds every planet without throwing, from a handful of long-lived sources', () => {
        for (const id of Object.keys(PLANET_AMBIENCE)) {
            const { ctx, amb } = setup();
            const before = ctx.sources().length;
            expect(() => amb.start(id)).not.toThrow();
            expect(amb.planet).toBe(id);
            const made = ctx.sources().length - before;
            expect(made, id).toBeGreaterThan(2);
            expect(made, id).toBeLessThanOrEqual(12);
            // It fades in from silence.
            expect(amb.scene.out.gain.events[0].value).toBeLessThan(0.001);
            amb.stop();
        }
    });

    it('starting the same planet twice builds nothing new; unknown ids get the default', () => {
        const { ctx, amb } = setup();
        amb.start('hotaru');
        const n = ctx.nodes.length;
        amb.start('hotaru');
        expect(ctx.nodes.length).toBe(n);
        amb.stop();
        amb.start('nowhere');
        expect(amb.planet).toBe('mizuho');
        amb.stop();
    });

    it('crossfades on a planet change: old sources stop and are disconnected', () => {
        const { ctx, amb } = setup();
        amb.start('mizuho');
        const old = amb.scene;
        amb.start('kaminari');
        expect(amb.planet).toBe('kaminari');
        for (const s of old.sources) expect(s.stopTime).toBeLessThanOrEqual(ctx.currentTime + CROSSFADE_S + 0.2);
        expect(old.out.gain.last).toBe(0);
        vi.advanceTimersByTime((CROSSFADE_S + 1) * 1000);
        expect(old.nodes.every((n) => n.disconnected)).toBe(true);
        expect(amb.scene.nodes.some((n) => n.disconnected)).toBe(false);
        amb.stop();
    });

    it('stop ends every source and clears the timer', () => {
        const { ctx, amb } = setup();
        amb.start('sango');
        const scene = amb.scene;
        amb.stop(1);
        expect(amb.planet).toBeNull();
        expect(amb.timer).toBeNull();
        for (const s of scene.sources) expect(s.stopTime).not.toBeNull();
        vi.advanceTimersByTime(3000);
        expect(scene.nodes.every((n) => n.disconnected)).toBe(true);
        expect(ctx.sources().filter((s) => s.stopTime == null).length).toBe(0);
    });

    it('setTension moves the pulse, its filter and the bed brightness', () => {
        const { amb } = setup();
        amb.start('tsukimi');
        amb.setTension(0, false);
        expect(amb.scene.pulseGain.gain.last).toBe(0);
        const calmTone = amb.scene.tone.frequency.last;
        const calmCut = amb.scene.pulseFilter.frequency.last;
        amb.setTension(0.9, false);
        expect(amb.scene.pulseGain.gain.last).toBeGreaterThan(0.1);
        expect(amb.scene.pulseFilter.frequency.last).toBeGreaterThan(calmCut);
        amb.setTension(0.2, true);
        expect(amb.scene.tone.frequency.last).toBeGreaterThan(calmTone);
        expect(amb.scene.pulseGain.gain.last).toBeLessThan(0.05);
        amb.stop();
    });

    it('plucks are sparse, share the polyphony cap, and stay silent while muted', () => {
        const a = setup();
        a.amb.start('hotaru');
        for (let i = 0; i < 600; i++) {
            a.ctx.currentTime += 0.4;
            a.amb.tick();
        }
        // 240 s of fireflies: some notes, but far fewer than one a second.
        expect(a.player.stats.played).toBeGreaterThan(20);
        expect(a.player.stats.played).toBeLessThan(240);
        expect(peakSources(a.ctx)).toBeLessThanOrEqual(MAX_SOURCES);
        a.amb.stop();

        const b = setup(() => false);
        b.amb.start('hotaru');
        for (let i = 0; i < 200; i++) {
            b.ctx.currentTime += 0.4;
            b.amb.tick();
        }
        expect(b.player.stats.played).toBe(0);
        b.amb.stop();
    });
});

describe('crowd voices', () => {
    it('every kind is a short effect under the gain ceilings', () => {
        for (const kind of VOICE_KINDS) {
            for (const id of [0, 1, 7, 23]) {
                const desc = voiceDesc(kind, id);
                expect(sfxLength(desc), kind).toBeLessThanOrEqual(desc.dur + 1e-9);
                expect(desc.dur, kind).toBeLessThanOrEqual(1.2);
                expect(sfxPeak(desc), kind).toBeLessThanOrEqual(MIX_GAIN_CEILING);
                // A voice is shaped by band-pass formants, never a bare oscillator.
                for (const l of desc.layers) expect(l.filt[0], kind).toBe('bandpass');
            }
        }
    });

    it('renders on the fake context', () => {
        const ctx = new FakeAudioContext();
        const player = new SfxPlayer(ctx, ctx.destination);
        for (const kind of VOICE_KINDS) expect(player.play(voiceDesc(kind, 4), { seed: 4 })).not.toBeNull();
    });

    it('a person always sounds the same, and the crowd is different people', () => {
        expect(voiceProfile(5)).toEqual(voiceProfile(5));
        const pitches = new Set();
        for (let id = 0; id < 32; id++) {
            const p = voiceProfile(id);
            expect(p.f0).toBeGreaterThan(95);
            expect(p.f0).toBeLessThan(340);
            expect(p.formant).toBeGreaterThan(0.8);
            expect(p.formant).toBeLessThan(1.3);
            pitches.add(Math.round(p.f0));
        }
        expect(pitches.size).toBeGreaterThan(20);
        // Low and high voices both turn up in a level sized crowd.
        const all = [...Array(32).keys()].map((id) => voiceProfile(id).f0);
        expect(Math.min(...all)).toBeLessThan(150);
        expect(Math.max(...all)).toBeGreaterThan(230);
        // Smaller people have higher voices and higher formants.
        const sorted = [...Array(32).keys()].map(voiceProfile).sort((a, b) => a.f0 - b.f0);
        expect(sorted[31].formant).toBeGreaterThan(sorted[0].formant);
    });

    it('the limiter spreads a big night out and then says no', () => {
        const lim = createVoiceLimiter({ minGap: 0.14, burst: 4, window: 1.6 });
        const times = [];
        for (let i = 0; i < 20; i++) times.push(lim.schedule(10));
        const ok = times.filter((t) => t != null);
        expect(ok).toHaveLength(4);
        for (let i = 1; i < ok.length; i++) expect(ok[i] - ok[i - 1]).toBeGreaterThanOrEqual(0.14 - 1e-9);
        // Quiet again later.
        expect(lim.schedule(13)).toBe(13);
    });
});

// ---- AudioEngine with a fake window, document and storage ----------------

function fakeBrowser({ prefs = null, withAudio = true } = {}) {
    const listeners = {};
    const store = new Map();
    if (prefs) store.set(SOUND_PREFS_KEY, JSON.stringify(prefs));
    const ctxs = [];
    globalThis.window = withAudio
        ? { AudioContext: class extends FakeAudioContext { constructor() { super(); ctxs.push(this); } } }
        : {};
    globalThis.document = {
        hidden: false,
        addEventListener: (type, fn) => (listeners[type] ||= []).push(fn),
        removeEventListener: (type, fn) => { listeners[type] = (listeners[type] || []).filter((f) => f !== fn); },
        querySelector: () => null,
        getElementById: () => null,
        createElement: () => ({ style: {}, addEventListener() {}, setAttribute() {} }),
    };
    globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) };
    const fire = (type, e = { type, target: null }) => (listeners[type] || []).slice().forEach((fn) => fn(e));
    return { listeners, store, ctxs, fire };
}

describe('AudioEngine', () => {
    let browser;
    let errors;
    beforeEach(() => {
        vi.useFakeTimers();
        errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    });
    afterEach(() => {
        vi.useRealTimers();
        errors.mockRestore();
        delete globalThis.window;
        delete globalThis.document;
        delete globalThis.localStorage;
    });

    const boot = (opts) => {
        browser = fakeBrowser(opts);
        const engine = new AudioEngine(() => 'game');
        engine.initAudio();
        return engine;
    };
    const sounding = () => browser.ctxs[0].sources().length;

    it('never throws when AudioContext is missing', () => {
        const engine = boot({ withAudio: false });
        expect(engine.audioContext).toBeNull();
        expect(() => {
            engine.sfx('snip');
            engine.playSnip();
            engine.playSound(440, 0.1);
            engine.playStinger('win');
            engine.setScene('game', 'mizuho');
            engine.updateMood({ totalInfected: 3 }, { cap: 8, r: 1.2 });
            engine.countdown(3000);
            engine.setVolume(0.5);
            engine.setSoundPref('effects', false);
        }).not.toThrow();
        expect(engine.debug.nodes).toBe(0);
    });

    it('stays silent until the first gesture, then plays', () => {
        const engine = boot();
        const before = sounding();
        engine.sfx('snip');
        engine.playSound(440, 0.1);
        engine.playStinger('win');
        engine.setScene('game', 'mizuho');
        engine.countdown(3000);
        expect(sounding()).toBe(before);
        expect(engine.debug.nodes).toBe(0);
        expect(engine.debug.ambience).toBeNull();

        browser.fire('pointerdown');
        expect(engine.sfx('snip')).not.toBeNull();
        expect(sounding()).toBeGreaterThan(before);
        expect(engine.debug.nodes).toBeGreaterThan(0);
        expect(engine.debug.played).toBe(1);
    });

    it('plays nothing when the master volume is zero (the slider sends a string)', () => {
        const engine = boot();
        browser.fire('pointerdown');
        engine.setVolume('0');
        const before = sounding();
        for (const name of Object.keys(SFX)) expect(engine.sfx(name, { id: 3 })).toBeNull();
        engine.playSound(440, 0.1);
        engine.playSnip();
        engine.playStinger('milestone');
        expect(sounding()).toBe(before);
        engine.setVolume('0.3');
        expect(engine.masterGain.gain.value).toBe(0.3);
        expect(engine.sfx('tap')).not.toBeNull();
    });

    it('every name game.js can send plays, and unknown names are ignored', () => {
        const engine = boot();
        browser.fire('pointerdown');
        const ctx = browser.ctxs[0];
        for (const name of Object.keys(SFX)) {
            ctx.currentTime += 5;
            expect(engine.sfx(name, { id: 2, step: 1 }), name).not.toBeNull();
        }
        expect(engine.sfx('severLink')).toBeNull();
        expect(engine.sfx(undefined)).toBeNull();
        // The old entry points still work and land on named effects.
        ctx.currentTime += 5;
        const played = engine.debug.played;
        engine.playSnip();
        ctx.currentTime += 5;
        engine.playStinger('win');
        engine.playStinger('nonsense');
        expect(engine.debug.played).toBeGreaterThanOrEqual(played + 2);
    });

    it('the Effects switch silences effects but not voices; Voices silences the crowd', () => {
        const engine = boot();
        browser.fire('pointerdown');
        const ctx = browser.ctxs[0];
        engine.setSoundPref('effects', false);
        expect(engine.sfx('snip')).toBeNull();
        let before = sounding();
        engine.playSound(440, 0.1);
        expect(sounding()).toBe(before);
        engine.sfx('infection', { id: 4 }); // the cough still happens
        expect(sounding()).toBeGreaterThan(before);

        engine.setSoundPref('voices', false);
        ctx.currentTime += 10;
        before = sounding();
        engine.sfx('infection', { id: 5 });
        engine.sfx('cure', { id: 5 });
        expect(sounding()).toBe(before);
        expect(JSON.parse(browser.store.get(SOUND_PREFS_KEY))).toEqual({ effects: false, ambience: true, voices: false });
    });

    it('a night of many cases: staggered blips, a few coughs, one gasp, under the cap', () => {
        const engine = boot();
        browser.fire('pointerdown');
        const ctx = browser.ctxs[0];
        const kinds = [];
        const play = engine.sfxPlayer.play.bind(engine.sfxPlayer);
        engine.sfxPlayer.play = (name, opts) => {
            const v = play(name, opts);
            if (v && typeof name !== 'string') kinds.push(name.dur);
            return v;
        };
        for (let id = 0; id < 12; id++) engine.sfx('infection', { id });
        expect(kinds.length).toBeLessThanOrEqual(4); // voices are rate limited
        expect(kinds.filter((d) => d === voiceDesc('gasp', 0).dur)).toHaveLength(1);
        expect(kinds.filter((d) => d === voiceDesc('cough', 0).dur).length).toBeGreaterThanOrEqual(2);
        expect(peakSources(ctx)).toBeLessThanOrEqual(MAX_SOURCES);
        // Two cases only: no gasp.
        ctx.currentTime += 20;
        kinds.length = 0;
        engine.sfx('infection', { id: 1 });
        engine.sfx('infection', { id: 2 });
        expect(kinds.filter((d) => d === voiceDesc('gasp', 0).dur)).toHaveLength(0);
    });

    it('a level gets its planet ambience and ducks the song; leaving restores both', () => {
        const engine = boot();
        browser.fire('pointerdown');
        engine.setScene('game', 'yukimi');
        expect(engine.debug.ambience).toBe('yukimi');
        expect(engine.musicBus.gain.last).toBeCloseTo(MUSIC_BUS_GAIN * MUSIC_DUCK);
        engine.setScene('game-over', 'yukimi');
        expect(engine.debug.ambience).toBeNull();
        expect(engine.musicBus.gain.last).toBeCloseTo(MUSIC_BUS_GAIN);
        // Switched off in Settings: no bed, and the song is not ducked.
        engine.setSoundPref('ambience', false);
        engine.setScene('game', 'yukimi');
        expect(engine.debug.ambience).toBeNull();
        expect(engine.musicBus.gain.last).toBeCloseTo(MUSIC_BUS_GAIN);
        // Switched back on mid level: it starts for the current planet.
        engine.setSoundPref('ambience', true);
        expect(engine.debug.ambience).toBe('yukimi');
        engine.setScene('welcome');
    });

    it('updateMood drives the tension; R below 1 and a win relax it', () => {
        const engine = boot();
        browser.fire('pointerdown');
        engine.setMusicEnabled(false); // tension must not depend on the music switch
        engine.setScene('game', 'hanabi');
        engine.updateMood({ totalInfected: 2 }, { cap: 10, r: 1.5 });
        const low = engine.debug.tension;
        engine.updateMood({ totalInfected: 8 }, { cap: 10, r: 1.5 });
        const high = engine.debug.tension;
        expect(high).toBeGreaterThan(low);
        engine.sfx('rBelowOne');
        expect(engine.debug.tension).toBeLessThan(high);
        expect(engine.ambience.relaxed).toBe(true);
        engine.updateMood({ totalInfected: 8 }, { cap: 10, r: 1.5 });
        expect(engine.debug.tension).toBe(high);
        engine.sfx('win');
        expect(engine.debug.tension).toBe(0);
        engine.setScene('game-over');
    });

    it('the day turn is clappers then a bell, and is skipped when the level just ended', () => {
        const engine = boot();
        browser.fire('pointerdown');
        const ctx = browser.ctxs[0];
        ctx.currentTime = 30;
        engine.sfx('dayStart');
        const starts = engine.sfxPlayer.voices.map((v) => Math.min(...v.sources.map((s) => s.start)));
        expect(starts).toHaveLength(2);
        expect(starts[1] - starts[0]).toBeGreaterThan(0.2);
        ctx.currentTime = 60;
        engine.sfx('loss');
        const played = engine.debug.played;
        expect(engine.sfx('dayStart')).toBeNull();
        expect(engine.debug.played).toBe(played);
    });

    it('countdown ticks once per whole second', () => {
        const engine = boot();
        browser.fire('pointerdown');
        const ctx = browser.ctxs[0];
        for (let left = 3000; left >= 0; left -= 100) {
            ctx.currentTime += 0.1;
            engine.countdown(left);
        }
        expect(engine.debug.played).toBe(3);
        engine.countdown(null);
        expect(engine.debug.played).toBe(3);
    });

    it('buttons get the tap sound from one document listener; taps resume a suspended context', () => {
        const engine = boot();
        browser.fire('pointerdown');
        const ctx = browser.ctxs[0];
        const hit = { type: 'click', target: { closest: (sel) => (sel.includes('button') ? {} : null) } };
        const miss = { type: 'click', target: { closest: () => null } };
        browser.fire('click', miss);
        expect(engine.debug.played).toBe(0);
        browser.fire('click', hit);
        expect(engine.debug.played).toBe(1);
        ctx.state = 'suspended';
        browser.fire('touchend', { type: 'touchend', target: null });
        expect(ctx.resumed).toBeGreaterThan(0);
    });
});

describe('sound switches in Settings', () => {
    it('prefs default to on and old or broken saves still load', () => {
        const storage = (v) => ({ getItem: () => v });
        expect(readSoundPrefs(storage(null))).toEqual(SOUND_PREF_DEFAULTS);
        expect(readSoundPrefs(storage('not json'))).toEqual(SOUND_PREF_DEFAULTS);
        expect(readSoundPrefs(null)).toEqual(SOUND_PREF_DEFAULTS);
        expect(readSoundPrefs(storage('{"voices":false,"junk":1,"effects":"no"}'))).toEqual({ effects: true, ambience: true, voices: false });
    });

    it('the sheet shows Music, Sound effects, Planet ambience and Crowd voices', () => {
        expect(settingsMarkup({ adsRemoved: false })).not.toContain('data-act="sound"');
        const html = settingsMarkup({ adsRemoved: false, sound: { music: true, effects: true, ambience: false, voices: true } });
        expect(SOUND_SWITCHES.map((s) => s[0])).toEqual(['music', 'effects', 'ambience', 'voices']);
        for (const [key, label] of SOUND_SWITCHES) {
            expect(html).toContain(label);
            expect(html).toContain(`data-sound="${key}"`);
        }
        expect(html).toMatch(/data-sound="ambience"\s*>/);
        expect(html).toMatch(/data-sound="voices" checked>/);
    });

    it('the sheet is wired to the audio engine', () => {
        const src = read('../src/ui/settings.js');
        expect(src).toContain('audio?.setSoundPref(key, e.target.checked)');
        expect(src).toContain('audio?.setMusicEnabled(e.target.checked)');
        expect(read('../src/game.js')).toMatch(/mountSettings\(\{[^}]*audio: this\.audio/s);
    });
});

describe('call sites in src/game.js', () => {
    const game = read('../src/game.js');

    it('every playSound left is intentional', () => {
        const left = game.split('\n').filter((l) => l.includes('playSound'));
        // 1: the fallback if playSnip is missing. 2: the power-up hook's key
        // (src/economy.js calls gameApi.playSound), now a named effect.
        expect(left.map((l) => l.trim())).toEqual([
            "else this.audio.playSound(400, 0.15, 'sawtooth');",
            "playSound: () => this.audio.sfx('powerUp'),",
        ]);
    });

    it('every named effect it asks for exists', () => {
        const names = [...game.matchAll(/\.sfx\('(\w+)'/g)].map((m) => m[1]);
        expect(names.length).toBeGreaterThanOrEqual(12);
        for (const name of names) expect(SFX[name], name).toBeTruthy();
        for (const name of ['careLand', 'infection', 'cure', 'death', 'dayStart', 'error', 'count', 'tallyLine', 'star', 'coin', 'powerUp', 'rBelowOne']) {
            expect(names, name).toContain(name);
        }
        // Tools play their own effect by id.
        expect(game).toContain('this.audio.sfx(toolId, { id: node.id })');
        expect(SFX.vaccinate && SFX.quarantine).toBeTruthy();
        // Old stinger names still resolve.
        for (const m of game.matchAll(/playStinger\?\.\('(\w+)'\)/g)) expect(['milestone', 'spike', 'win', 'loss']).toContain(m[1]);
    });

    it('fits the existing hooks: showScreen, updateMood, the countdown', () => {
        expect(game).toContain('this.audio.setScene?.(screenName, this.currentLevel?.regionId)');
        expect(game).toContain('this.audio.updateMood?.(this.gameState.stats, { cap: caseCapFor(this.gameState, this.currentScenario), r: this.lastR })');
        expect(game).toContain('this.audio.countdown?.(leftMs)');
    });

    it('haptics are untouched', () => {
        for (const cue of ['sever', 'tool', 'milestone', 'spike']) expect(game).toContain(`this.haptics.play('${cue}')`);
    });

    it('the prize box plays its sound when it opens', () => {
        expect(read('../src/ui/globe-view.js')).toContain("window.game?.audio?.sfx?.('chestOpen')");
    });
});
