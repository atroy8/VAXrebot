// Web Audio: procedural SFX, stingers and the looping theme song. Everything
// is synthesized in code; no external audio files, no network requests.
//
// Public API consumed by src/game.js (signatures unchanged):
//   initAudio(), setupThemeMusic(), playThemeMusic(), startThemeMusic(),
//   stopThemeMusic(), playSound(freq, dur, type), playSnip(), setVolume(v),
//   updateMood(stats), playStinger(name), setMusicEnabled(bool),
//   isMusicEnabled(), startGameMusic(), stopGameMusic()
// Added for the sound pass (named effects, planet ambience, crowd voices):
//   sfx(name, opts), setScene(screen, planetId), countdown(leftMs),
//   getSoundPrefs(), setSoundPref(key, on), debug
//
// Music (round 14): one song, "Starlight Response" (src/audio-song.js), in
// two arrangements. Calm on the start page, map, briefing and results;
// driving in a level. A lookahead scheduler on the AudioContext clock plays
// both arrangements into two buses and crossfades them when the screen
// changes. Nothing plays before the first user gesture.
import { mixedEvents, createScheduler, arrangementForScreen, busTargets, midiToFreq, ARRANGEMENTS, CROSSFADE_S, SONG } from './audio-song.js';

import { SfxPlayer, SFX } from './audio-sfx.js';
import { AmbienceEngine, tensionLevel, isRelaxed } from './audio-ambience.js';
import { voiceDesc, createVoiceLimiter } from './audio-voices.js';

// Effects, Ambience and Voices switches (Settings), saved together.
export const SOUND_PREFS_KEY = 'vaxrebot_sound_prefs';
export const SOUND_PREF_DEFAULTS = Object.freeze({ effects: true, ambience: true, voices: true });

export function readSoundPrefs(storage) {
    try {
        const saved = JSON.parse(storage.getItem(SOUND_PREFS_KEY) || '{}') || {};
        const out = { ...SOUND_PREF_DEFAULTS };
        for (const k of Object.keys(out)) if (typeof saved[k] === 'boolean') out[k] = saved[k];
        return out;
    } catch (e) {
        return { ...SOUND_PREF_DEFAULTS };
    }
}

// In a level the planet's ambience is the bed and the song ducks under it
// (to this share of its usual level) instead of stopping.
export const MUSIC_BUS_GAIN = 0.45;
export const MUSIC_DUCK = 0.4;
const AMBIENCE_BUS_GAIN = 1;
const VOICE_GAIN = 2.2; // formant filters eat level, so voices are lifted to sit just under the effects

// Old stinger names map onto named effects.
const STINGERS = { spike: 'spike', milestone: 'milestone', win: 'win', loss: 'loss' };
const STAR_STEPS = [0, 4, 7]; // G, B, D: three stars climb a major triad
const COUNT_SCALE = [0, 2, 5, 7, 9]; // the tally climbs the yo scale
// Controls that get the soft tap sound.
const TAP_SELECTOR = 'button, .tool-item, .level-card, [role="button"], a.settings-row, input[type="checkbox"]';

const MUSIC_ENABLED_KEY = 'vaxrebot_music_enabled';

// Per layer loudness inside the music bus. Music sits well under SFX
// (playSound peaks at 0.1 on the SFX bus; the music bus is at 0.45).
const LAYER_VOL = { pad: 0.035, bass: 0.07, melody: 0.06, arp: 0.022, kick: 0.16, snare: 0.05, hat: 0.025 };
const TICK_MS = 25;
const LOOKAHEAD_S = 0.2;

export class AudioEngine {
    // getScreen: () => current screen name, used to stop the theme when leaving the menu.
    constructor(getScreen = () => null) {
        this.audioContext = null;
        this.masterGain = null;
        this.sfxBus = null;
        this.musicBus = null;

        this.themeMusicTimeout = null;
        this.themeMusicSequence = [];
        this.getScreen = getScreen;

        // Song state
        this.musicEnabled = this._readMusicPreference();
        this.song = null; // { scheduler, timer, buses: { menu, level }, arrangement }
        this.songWanted = false; // asked to play, waiting for a user gesture
        this.resumeAfterResults = false; // stopGameMusic at a level's end: come back on the map
        this.hadGesture = false;
        this.watchTimer = null;
        this.noiseBuffer = null;
        this.mood = 0; // 0 = calm, 1 = full outbreak crisis
        this.toggleButton = null;

        // Sound pass: named effects, planet ambience, crowd voices.
        this.sfxPlayer = null;
        this.ambience = null;
        this.ambienceBus = null;
        this.soundPrefs = readSoundPrefs(typeof localStorage === 'undefined' ? null : localStorage);
        this.voiceLimiter = createVoiceLimiter();
        this.scene = { screen: null, planetId: null };
        this.nightBurst = { at: -10, count: 0 };
        this.endedAt = -10;
        this.lastCount = null;
    }

    initAudio() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.masterGain = this.audioContext.createGain();
            this.masterGain.gain.value = 0.3; // Default volume
            this.masterGain.connect(this.audioContext.destination);

            // Separate buses so music can sit at a modest level under SFX.
            this.sfxBus = this.audioContext.createGain();
            this.sfxBus.gain.value = 1.0;
            this.sfxBus.connect(this.masterGain);

            this.musicBus = this.audioContext.createGain();
            this.musicBus.gain.value = MUSIC_BUS_GAIN; // Modest: music supports, never shouts
            this.musicBus.connect(this.masterGain);

            this.ambienceBus = this.audioContext.createGain();
            this.ambienceBus.gain.value = AMBIENCE_BUS_GAIN;
            this.ambienceBus.connect(this.masterGain);
            this.sfxPlayer = new SfxPlayer(this.audioContext, this.sfxBus);
            this.ambience = new AmbienceEngine(this.audioContext, this.ambienceBus, {
                player: this.sfxPlayer,
                canPlay: () => this._audible() && this.soundPrefs.ambience,
            });

            this.setupThemeMusic();
            this._injectMusicToggle();
            this._listenForGesture();
        } catch (e) {
            console.error('Web Audio API is not supported in this browser');
        }
    }

    // ------------------------------------------------------------------
    // Existing SFX / theme API (unchanged signatures)
    // ------------------------------------------------------------------

    // The old menu riff is now part of the theme song; kept for callers.
    setupThemeMusic() {
        this.themeMusicSequence = [];
    }

    playThemeMusic() {
        this.startThemeMusic();
    }

    // Menu screens get the calm arrangement of the same song.
    startThemeMusic() {
        this._startSong();
    }

    // The song keeps playing across screens (it crossfades instead), so this
    // only clears the legacy timer.
    stopThemeMusic() {
        if (this.themeMusicTimeout) {
            clearTimeout(this.themeMusicTimeout);
            this.themeMusicTimeout = null;
        }
    }

    // Thin fallback for callers without a named effect. Prefer sfx(name).
    playSound(frequency, duration, type = 'sine') {
        if (!this._audible() || !this.soundPrefs.effects) return;
        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(this.sfxBus || this.masterGain);

        oscillator.type = type;
        oscillator.frequency.setValueAtTime(frequency, this.audioContext.currentTime);
        gainNode.gain.setValueAtTime(0.1, this.audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + duration);

        oscillator.start(this.audioContext.currentTime);
        oscillator.stop(this.audioContext.currentTime + duration);
    }

    // Sever "snip": the signature effect, see SFX.snip in src/audio-sfx.js.
    playSnip() {
        this.sfx('snip');
    }

    // Master volume (0..1). Replaces the old direct masterGain access.
    setVolume(value) {
        if (this.masterGain) {
            this.masterGain.gain.value = Number(value) || 0;
        }
    }

    // ------------------------------------------------------------------
    // Sound pass: named effects, crowd voices, planet ambience
    // ------------------------------------------------------------------

    // True once the player has touched the screen and the volume is up.
    _audible() {
        return Boolean(this.audioContext && this.masterGain && this.hadGesture && Number(this.masterGain.gain.value) !== 0);
    }

    // Play a named effect (src/audio-sfx.js). Unknown names are ignored.
    // opts: { id } seeds per person detune and picks the crowd voice,
    //       { step } transposes 'star' and 'count', { delay } seconds.
    // A few names also drive the crowd and the ambience, so game.js needs
    // one call per moment: 'infection' coughs (and the crowd gasps on the
    // third case of a night), 'cure' cheers, 'win' sighs with relief.
    sfx(name, opts = {}) {
        try {
            const player = this.sfxPlayer;
            if (!player || !this._audible()) return null;
            const ctx = this.audioContext;
            if (ctx.state === 'suspended') ctx.resume();
            const now = ctx.currentTime;
            const id = Number(opts.id) || 0;
            let semis = 0;
            if (name === 'infection') {
                const burst = this.nightBurst;
                burst.count = now - burst.at < 0.4 ? burst.count + 1 : 1;
                burst.at = now;
                if (burst.count === 3) this._voice('gasp', id + 101, 0.12);
                this._voice('cough', id);
            } else if (name === 'cure') {
                this._voice('cheer', id);
            } else if (name === 'win') {
                this.endedAt = now;
                this._voice('cheer', id + 7, 0.35);
                this._voice('sigh', id + 3, 0.9);
                this.ambience?.setTension(0, true);
            } else if (name === 'loss') {
                this.endedAt = now;
            } else if (name === 'rBelowOne') {
                this.ambience?.setTension(this.ambience.tension * 0.35, true);
            } else if (name === 'dayStart') {
                // The night passes: clappers now, the morning bell a moment
                // later. Skipped when the level has just ended.
                if (now - this.endedAt < 0.5) return null;
                if (this.soundPrefs.effects) player.play('dayEnd');
                opts = { ...opts, delay: 0.32 };
            } else if (name === 'star') {
                semis = STAR_STEPS[Math.max(0, Math.min(2, opts.step || 0))];
            } else if (name === 'count') {
                const i = Math.max(0, Math.min(14, opts.step || 0));
                semis = 12 * Math.floor(i / 5) + COUNT_SCALE[i % 5];
            }
            if (!this.soundPrefs.effects || !SFX[name]) return null;
            return player.play(name, { delay: opts.delay || 0, semis, seed: opts.id });
        } catch (e) {
            return null; // Never throw into the game loop.
        }
    }

    // One wordless crowd reaction, pitched by the person's id and rate limited.
    _voice(kind, id, delay = 0) {
        if (!this.soundPrefs.voices) return;
        const now = this.audioContext.currentTime;
        const at = this.voiceLimiter.schedule(now + delay);
        if (at == null) return;
        this.sfxPlayer.play(voiceDesc(kind, id), { delay: at - now, gain: VOICE_GAIN, seed: id });
    }

    // Called from showScreen: a level gets its planet's ambience and the
    // song ducks under it; every other screen fades the ambience out.
    setScene(screen, planetId = null) {
        try {
            this.scene = { screen, planetId };
            if (!this.ambience) return;
            const on = screen === 'game' && this.soundPrefs.ambience && this.hadGesture;
            if (on) {
                if (this.ambience.planet == null) this.ambience.setTension(0, false);
                this.ambience.start(planetId);
            } else {
                this.ambience.stop();
            }
            this.musicBus.gain.setTargetAtTime(MUSIC_BUS_GAIN * (on ? MUSIC_DUCK : 1), this.audioContext.currentTime, 0.6);
        } catch (e) { /* never throw into the game loop */ }
    }

    // Auto-advance countdown: one wood tick each time the whole second
    // changes. leftMs null means the countdown is gone.
    countdown(leftMs) {
        const n = leftMs == null ? null : Math.ceil(leftMs / 1000);
        if (n === this.lastCount) return;
        this.lastCount = n;
        if (n != null && n > 0) this.sfx('tick');
    }

    getSoundPrefs() {
        return { ...this.soundPrefs };
    }

    // key: 'effects' | 'ambience' | 'voices'
    setSoundPref(key, on) {
        if (!(key in SOUND_PREF_DEFAULTS)) return;
        this.soundPrefs[key] = !!on;
        try {
            localStorage.setItem(SOUND_PREFS_KEY, JSON.stringify(this.soundPrefs));
        } catch (e) { /* storage unavailable; keep in-memory value */ }
        if (key === 'ambience') this.setScene(this.scene.screen, this.scene.planetId);
    }

    // Counters for tests and the browser check: audio nodes built so far.
    get debug() {
        const s = this.sfxPlayer ? this.sfxPlayer.stats : { played: 0, dropped: 0, stolen: 0, nodes: 0 };
        const amb = this.ambience;
        return { ...s, nodes: s.nodes + (amb ? amb.nodesCreated : 0), ambience: amb ? amb.planet : null, tension: amb ? amb.tension : 0 };
    }

    // ------------------------------------------------------------------
    // Adaptive generative music
    // ------------------------------------------------------------------

    // stats: { day, infected, dead, totalInfected, population }
    // Safe no-op until init, or when music is disabled. Starts the song on
    // the first call so game.js only needs this one call per day.
    // extra: { cap, r } (case cap and live R) drives the ambience tension.
    updateMood(stats = {}, extra = {}) {
        try {
            if (this.ambience && this.ambience.planet) {
                const r = extra.r ?? null;
                this.ambience.setTension(tensionLevel({ cases: stats.totalInfected, cap: extra.cap, r }), isRelaxed(r));
            }
            if (!this.audioContext || !this.musicEnabled) return;
            const { infected = 0, dead = 0, totalInfected = 0, population = 1 } = stats;
            const pop = Math.max(1, population);
            const infectionPressure = Math.min(1, (infected / pop) * 12); // saturates ~8% active
            const mortalityPressure = Math.min(1, (dead / Math.max(1, totalInfected)) * 3); // saturates ~33% CFR
            this.mood = Math.max(0, Math.min(1, infectionPressure * 0.7 + mortalityPressure * 0.3));
            if (!this.song) this._startSong();
        } catch (e) {
            // Never throw into the game loop.
        }
    }

    startGameMusic() {
        this._startSong();
    }

    // Called when a level ends (results get the stingers) and when the old
    // menu screen opens. Fades the song out; it comes back calm once the
    // player is on the map again.
    stopGameMusic() {
        this.resumeAfterResults = this.musicEnabled;
        this._stopSong(0.6);
    }

    // ---- Song engine ----------------------------------------------------

    _listenForGesture() {
        if (typeof document === 'undefined') return;
        const onGesture = () => {
            this.hadGesture = true;
            document.removeEventListener('pointerdown', onGesture, true);
            document.removeEventListener('keydown', onGesture, true);
            if (this.songWanted) this._startSong();
            this._startWatch();
        };
        // iOS only unlocks audio on touchend or click, and suspends it again
        // after a call or the lock screen, so keep resuming on real taps.
        const unlock = (e) => {
            try {
                if (this.audioContext && this.audioContext.state !== 'running') this.audioContext.resume();
                if (e.type === 'click' && e.target?.closest?.(TAP_SELECTOR)) this.sfx('tap');
            } catch (err) { /* ignore */ }
        };
        document.addEventListener('touchend', unlock, true);
        document.addEventListener('click', unlock, true);
        document.addEventListener('pointerdown', onGesture, true);
        document.addEventListener('keydown', onGesture, true);
        document.addEventListener('visibilitychange', () => {
            if (!this.audioContext) return;
            try {
                if (document.hidden) this.audioContext.suspend();
                else if (this.hadGesture) this.audioContext.resume();
            } catch (e) { /* ignore */ }
        });
    }

    // Light watcher: brings the song back after a level's results, once the
    // player leaves the results screen.
    _startWatch() {
        if (this.watchTimer) return;
        this.watchTimer = setInterval(() => {
            try {
                if (this.song || !this.resumeAfterResults || !this.musicEnabled) return;
                const screen = this.getScreen();
                if (screen !== 'game' && screen !== 'game-over') this._startSong();
            } catch (e) { /* ignore */ }
        }, 800);
    }

    _startSong() {
        try {
            if (!this.audioContext || !this.musicEnabled) return;
            if (!this.hadGesture) {
                this.songWanted = true;
                return;
            }
            this.songWanted = false;
            this.resumeAfterResults = false;
            const ctx = this.audioContext;
            if (ctx.state === 'suspended') ctx.resume();
            if (this.song) return; // already playing

            const arrangement = arrangementForScreen(this.getScreen());
            const targets = busTargets(arrangement);
            const master = ctx.createGain();
            master.gain.setValueAtTime(0.0001, ctx.currentTime);
            master.gain.exponentialRampToValueAtTime(1, ctx.currentTime + 1.2);
            master.connect(this.musicBus);
            const buses = {};
            for (const name of ['menu', 'level']) {
                const g = ctx.createGain();
                g.gain.value = targets[name];
                g.connect(master);
                buses[name] = g;
            }
            // Warm lowpass on the lead (one per bus), opened up by outbreak pressure.
            const leadFilters = {};
            for (const name of ['menu', 'level']) {
                const f = ctx.createBiquadFilter();
                f.type = 'lowpass';
                f.frequency.value = 2400;
                f.Q.value = 0.7;
                f.connect(buses[name]);
                leadFilters[name] = f;
            }
            const scheduler = createScheduler({
                startTime: ctx.currentTime + 0.1,
                lookahead: LOOKAHEAD_S,
                getEvents: () => mixedEvents(this.mood),
            });
            this.song = { scheduler, master, buses, leadFilters, arrangement, switchedAt: ctx.currentTime, timer: null };
            const tick = () => this._songTick();
            tick();
            this.song.timer = setInterval(tick, TICK_MS);
        } catch (e) {
            // Never throw into the game loop.
        }
    }

    _stopSong(fadeS = 0.6) {
        const song = this.song;
        if (!song) {
            this.songWanted = false;
            return;
        }
        this.song = null;
        clearInterval(song.timer);
        try {
            const t = this.audioContext.currentTime;
            song.master.gain.cancelScheduledValues(t);
            song.master.gain.setValueAtTime(Math.max(0.0001, song.master.gain.value), t);
            song.master.gain.exponentialRampToValueAtTime(0.0001, t + fadeS);
            setTimeout(() => {
                try {
                    song.master.disconnect();
                } catch (e) { /* ignore */ }
            }, (fadeS + LOOKAHEAD_S + 0.5) * 1000);
        } catch (e) { /* ignore */ }
    }

    _songTick() {
        const song = this.song;
        if (!song || !this.audioContext) return;
        const ctx = this.audioContext;
        // Crossfade the buses when the screen asks for the other arrangement.
        const arrangement = arrangementForScreen(this.getScreen());
        if (arrangement !== song.arrangement) {
            song.arrangement = arrangement;
            song.switchedAt = ctx.currentTime;
            const targets = busTargets(arrangement);
            for (const name of ['menu', 'level']) {
                song.buses[name].gain.setTargetAtTime(targets[name], ctx.currentTime, CROSSFADE_S / 3);
            }
        }
        song.leadFilters.level.frequency.setTargetAtTime(2400 + this.mood * 2600, ctx.currentTime, 0.5);
        if (this.masterGain && this.masterGain.gain.value === 0) {
            // Muted: keep time moving without building voices.
            song.scheduler.tick(ctx.currentTime);
            return;
        }
        song.scheduler.tick(ctx.currentTime, (event, time) => {
            const target = busTargets(song.arrangement)[event.bus];
            // Skip the silent bus once its fade has finished.
            if (target === 0 && ctx.currentTime - song.switchedAt > CROSSFADE_S * 1.5) return;
            const mix = ARRANGEMENTS[event.bus][event.layer] || 0;
            if (mix <= 0) return;
            this._playVoice(event, time, event.bus, mix * LAYER_VOL[event.layer] * (event.vel || 1));
        });
    }

    _noise() {
        if (!this.noiseBuffer) {
            const ctx = this.audioContext;
            const len = Math.floor(ctx.sampleRate * 0.4);
            const buf = ctx.createBuffer(1, len, ctx.sampleRate);
            const d = buf.getChannelData(0);
            for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
            this.noiseBuffer = buf;
        }
        return this.noiseBuffer;
    }

    // One note or drum hit, scheduled at `t` on the audio clock.
    _playVoice(event, t, busName, vol) {
        const ctx = this.audioContext;
        const bus = this.song.buses[busName];
        const step = 60 / SONG.bpm / 4;
        const dur = Math.max(step, (event.len || 1) * step);
        const env = (g, attack, peak, release) => {
            g.gain.setValueAtTime(0.0001, t);
            g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
            g.gain.exponentialRampToValueAtTime(0.0001, t + attack + release);
        };
        const osc = (type, freq, dest, detune = 0) => {
            const o = ctx.createOscillator();
            o.type = type;
            o.frequency.setValueAtTime(freq, t);
            o.detune.value = detune;
            o.connect(dest);
            return o;
        };
        switch (event.layer) {
            case 'pad': {
                const g = ctx.createGain();
                const lp = ctx.createBiquadFilter();
                lp.type = 'lowpass';
                lp.frequency.value = 900;
                lp.connect(g).connect(bus);
                g.gain.setValueAtTime(0.0001, t);
                g.gain.linearRampToValueAtTime(vol, t + 0.6);
                g.gain.setValueAtTime(vol, t + dur - 0.2);
                g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.5);
                for (const d of [-7, 7]) {
                    const o = osc('sawtooth', midiToFreq(event.midi), lp, d);
                    o.start(t);
                    o.stop(t + dur + 0.6);
                }
                break;
            }
            case 'bass': {
                const g = ctx.createGain();
                const lp = ctx.createBiquadFilter();
                lp.type = 'lowpass';
                lp.frequency.value = 420;
                lp.connect(g).connect(bus);
                env(g, 0.01, vol, Math.min(dur, 0.9));
                const o = osc('triangle', midiToFreq(event.midi), lp);
                o.start(t);
                o.stop(t + dur + 0.1);
                break;
            }
            case 'melody': {
                // Soft bell: sine plus a quiet octave, through the lead filter.
                const g = ctx.createGain();
                g.connect(this.song.leadFilters[busName]);
                env(g, 0.015, vol, dur + 0.4);
                const f = midiToFreq(event.midi);
                const o1 = osc('triangle', f, g);
                const g2 = ctx.createGain();
                g2.gain.value = 0.25;
                g2.connect(g);
                const o2 = osc('sine', f * 2, g2);
                for (const o of [o1, o2]) {
                    o.start(t);
                    o.stop(t + dur + 0.5);
                }
                break;
            }
            case 'arp': {
                const g = ctx.createGain();
                g.connect(bus);
                env(g, 0.005, vol, 0.18);
                const o = osc('square', midiToFreq(event.midi), g);
                o.start(t);
                o.stop(t + 0.22);
                break;
            }
            case 'kick': {
                const g = ctx.createGain();
                g.connect(bus);
                env(g, 0.004, vol, 0.28);
                const o = ctx.createOscillator();
                o.type = 'sine';
                o.frequency.setValueAtTime(130, t);
                o.frequency.exponentialRampToValueAtTime(45, t + 0.18);
                o.connect(g);
                o.start(t);
                o.stop(t + 0.32);
                break;
            }
            case 'snare':
            case 'hat': {
                const src = ctx.createBufferSource();
                src.buffer = this._noise();
                const f = ctx.createBiquadFilter();
                f.type = event.layer === 'hat' ? 'highpass' : 'bandpass';
                f.frequency.value = event.layer === 'hat' ? 7000 : 1800;
                const g = ctx.createGain();
                src.connect(f).connect(g).connect(bus);
                const len = event.layer === 'hat' ? 0.05 : 0.16;
                env(g, 0.002, vol, len);
                src.start(t, Math.random() * 0.2);
                src.stop(t + len + 0.05);
                break;
            }
            default:
                break;
        }
    }

    // ------------------------------------------------------------------
    // Event stingers: short, distinct, tasteful. No-op when disabled/uninit.
    // ------------------------------------------------------------------

    // name: 'spike' | 'milestone' | 'win' | 'loss'. These are named effects
    // now (src/audio-sfx.js), so they follow the Effects switch.
    playStinger(name) {
        if (STINGERS[name]) this.sfx(STINGERS[name]);
    }

    // ------------------------------------------------------------------
    // Music toggle (persisted)
    // ------------------------------------------------------------------

    setMusicEnabled(enabled) {
        this.musicEnabled = !!enabled;
        this._writeMusicPreference();
        this._refreshToggleButton();
        if (!this.musicEnabled) {
            this.stopThemeMusic();
            this.resumeAfterResults = false;
            this._stopSong(0.3);
        } else if (this.audioContext) {
            // The song picks the arrangement for the current screen itself.
            this._startSong();
        }
    }

    isMusicEnabled() {
        return this.musicEnabled;
    }

    _readMusicPreference() {
        try {
            const raw = localStorage.getItem(MUSIC_ENABLED_KEY);
            return raw === null ? true : raw === 'true'; // default ON
        } catch (e) {
            return true;
        }
    }

    _writeMusicPreference() {
        try {
            localStorage.setItem(MUSIC_ENABLED_KEY, String(this.musicEnabled));
        } catch (e) { /* storage unavailable; keep in-memory value */ }
    }

    // Injects a music toggle button into the game footer. index.html and
    // styles.css are untouched; styling is minimal and inline.
    _injectMusicToggle() {
        try {
            const footer = document.querySelector('.game-footer');
            if (!footer || document.getElementById('music-toggle')) return;
            const btn = document.createElement('button');
            btn.id = 'music-toggle';
            btn.type = 'button';
            btn.style.cssText =
                'margin-left: 8px; padding: 4px 10px; border-radius: 6px; ' +
                'border: 1px solid #4a5568; background: #2d3748; color: #e2e8f0; ' +
                'cursor: pointer; font-size: 13px;';
            btn.addEventListener('click', () => this.setMusicEnabled(!this.musicEnabled));
            this.toggleButton = btn;
            this._refreshToggleButton();
            footer.appendChild(btn);
        } catch (e) {
            // Footer missing or DOM unavailable; game still runs.
        }
    }

    _refreshToggleButton() {
        if (!this.toggleButton) return;
        const on = this.musicEnabled;
        this.toggleButton.textContent = on ? 'Music: On' : 'Music: Off';
        this.toggleButton.setAttribute('aria-pressed', String(on));
    }
}
