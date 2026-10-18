// Web Audio: procedural SFX, stingers and the looping theme song. Everything
// is synthesized in code; no external audio files, no network requests.
//
// Public API consumed by src/game.js (signatures unchanged):
//   initAudio(), setupThemeMusic(), playThemeMusic(), startThemeMusic(),
//   stopThemeMusic(), playSound(freq, dur, type), playSnip(), setVolume(v),
//   updateMood(stats), playStinger(name), setMusicEnabled(bool),
//   isMusicEnabled(), startGameMusic(), stopGameMusic()
//
// Music (round 14): one song, "Starlight Response" (src/audio-song.js), in
// two arrangements. Calm on the start page, map, briefing and results;
// driving in a level. A lookahead scheduler on the AudioContext clock plays
// both arrangements into two buses and crossfades them when the screen
// changes. Nothing plays before the first user gesture.
import { mixedEvents, createScheduler, arrangementForScreen, busTargets, midiToFreq, ARRANGEMENTS, CROSSFADE_S, SONG } from './audio-song.js';

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
            this.musicBus.gain.value = 0.45; // Modest: music supports, never shouts
            this.musicBus.connect(this.masterGain);

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

    playSound(frequency, duration, type = 'sine') {
        if (!this.audioContext || this.masterGain.gain.value === 0) return;
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

    // Sever "snip": a crisp scissor click (filtered noise), a bright pitch
    // drop like a snapped cable, and a soft low thump for weight.
    playSnip() {
        if (!this.audioContext || this.masterGain.gain.value === 0) return;
        const ctx = this.audioContext;
        if (ctx.state === 'suspended') ctx.resume();
        const t = ctx.currentTime;
        const out = this.sfxBus || this.masterGain;

        const len = Math.floor(ctx.sampleRate * 0.05);
        const buf = ctx.createBuffer(1, len, ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
        const noise = ctx.createBufferSource();
        noise.buffer = buf;
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 3500;
        const ng = ctx.createGain();
        ng.gain.value = 0.35;
        noise.connect(hp).connect(ng).connect(out);
        noise.start(t);

        const twang = ctx.createOscillator();
        const tg = ctx.createGain();
        twang.type = 'triangle';
        twang.frequency.setValueAtTime(1800, t);
        twang.frequency.exponentialRampToValueAtTime(420, t + 0.16);
        tg.gain.setValueAtTime(0.16, t);
        tg.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
        twang.connect(tg).connect(out);
        twang.start(t);
        twang.stop(t + 0.22);

        const thump = ctx.createOscillator();
        const hg = ctx.createGain();
        thump.type = 'sine';
        thump.frequency.setValueAtTime(140, t + 0.02);
        thump.frequency.exponentialRampToValueAtTime(55, t + 0.18);
        hg.gain.setValueAtTime(0.0001, t);
        hg.gain.exponentialRampToValueAtTime(0.22, t + 0.03);
        hg.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
        thump.connect(hg).connect(out);
        thump.start(t);
        thump.stop(t + 0.25);
    }

    // Master volume (0..1). Replaces the old direct masterGain access.
    setVolume(value) {
        if (this.masterGain) {
            this.masterGain.gain.value = value;
        }
    }

    // ------------------------------------------------------------------
    // Adaptive generative music
    // ------------------------------------------------------------------

    // stats: { day, infected, dead, totalInfected, population }
    // Safe no-op until init, or when music is disabled. Starts the song on
    // the first call so game.js only needs this one call per day.
    updateMood(stats = {}) {
        try {
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

    // name: 'spike' | 'milestone' | 'win' | 'loss'
    playStinger(name) {
        try {
            if (!this.audioContext || !this.musicEnabled) return;
            if (this.audioContext.state === 'suspended') {
                this.audioContext.resume();
            }
            switch (name) {
                case 'spike':
                    this._stingerSequence([[622.25, 0.12, 'sawtooth'], [659.25, 0.18, 'sawtooth']], 0, 0.09);
                    break;
                case 'milestone':
                    this._stingerSequence([[523.25, 0.2, 'sine'], [659.25, 0.2, 'sine'], [783.99, 0.35, 'sine']], 0.09, 0.16);
                    break;
                case 'win':
                    this._stingerSequence(
                        [[523.25, 0.18, 'triangle'], [587.33, 0.18, 'triangle'], [659.25, 0.18, 'triangle'], [783.99, 0.5, 'triangle']],
                        0.12, 0.2
                    );
                    break;
                case 'loss':
                    this._stingerSequence([[392.0, 0.3, 'sine'], [311.13, 0.3, 'sine'], [233.08, 0.6, 'sine']], 0.22, 0.3);
                    break;
                default:
                    break; // unknown names are ignored, never throw
            }
        } catch (e) {
            // Never throw into the game loop.
        }
    }

    // notes: [freq, dur, type][]; gap seconds between note starts; vol per note.
    _stingerSequence(notes, gap, vol) {
        const ctx = this.audioContext;
        notes.forEach(([freq, dur, type], i) => {
            const startAt = ctx.currentTime + i * (gap + dur * 0.55);
            const osc = ctx.createOscillator();
            osc.type = type;
            osc.frequency.value = freq;
            const gain = ctx.createGain();
            gain.gain.setValueAtTime(0.0001, startAt);
            gain.gain.exponentialRampToValueAtTime(vol, startAt + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, startAt + dur);
            osc.connect(gain);
            gain.connect(this.musicBus);
            osc.start(startAt);
            osc.stop(startAt + dur + 0.05);
        });
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
