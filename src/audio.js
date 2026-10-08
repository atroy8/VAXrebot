// Web Audio: procedural SFX, the menu "spy theme" riff, and a generative
// adaptive music engine for gameplay. Everything is synthesized in code;
// no external audio files, no network requests.
//
// Public API consumed by src/game.js (kept with identical signatures):
//   initAudio(), setupThemeMusic(), playThemeMusic(), startThemeMusic(),
//   stopThemeMusic(), playSound(freq, dur, type), setVolume(v)
// New API (safe no-ops until init, or when music is disabled):
//   updateMood(stats), playStinger(name),
//   setMusicEnabled(bool), isMusicEnabled(),
//   startGameMusic(), stopGameMusic()

const MUSIC_ENABLED_KEY = 'vaxrebot_music_enabled';

// A-minor pentatonic across two octaves, used for ambient plucks.
const PENTATONIC = [220.0, 261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25, 784.0];
// Tension notes added when the outbreak is severe (minor 2nd / tritone color).
const TENSION_NOTES = [233.08, 311.13, 466.16]; // Bb3, Eb4, Bb4

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

        // Generative music state
        this.musicEnabled = this._readMusicPreference();
        this.musicLoopTimeout = null;
        this.padNodes = [];
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
        } catch (e) {
            console.error('Web Audio API is not supported in this browser');
        }
    }

    // ------------------------------------------------------------------
    // Existing SFX / theme API (unchanged signatures)
    // ------------------------------------------------------------------

    setupThemeMusic() {
        // Notes for a "spy theme" riff
        const note = (freq, dur) => ({ freq, dur });
        const rest = (dur) => ({ freq: 0, dur });
        const E3 = 164.81,
            F3 = 174.61,
            Fs3 = 185.0,
            G3 = 196.0;
        const eighth = 150;

        this.themeMusicSequence = [
            note(E3, eighth),
            note(F3, eighth),
            rest(eighth / 2),
            note(Fs3, eighth),
            note(G3, eighth * 2),
            rest(eighth / 2),
            note(E3, eighth),
            note(F3, eighth),
            rest(eighth / 2),
            note(Fs3, eighth),
            note(G3, eighth * 2),
            rest(eighth * 4),
        ];
    }

    playThemeMusic(noteIndex = 0) {
        if (this.getScreen() !== 'menu') return; // Stop if not on menu
        if (!this.musicEnabled) return; // Theme is music; respect the toggle

        const { freq, dur } = this.themeMusicSequence[noteIndex];
        if (freq > 0) {
            this.playSound(freq, dur / 1000, 'triangle');
        }

        const nextNoteIndex = (noteIndex + 1) % this.themeMusicSequence.length;
        this.themeMusicTimeout = setTimeout(() => this.playThemeMusic(nextNoteIndex), dur);
    }

    startThemeMusic() {
        if (this.themeMusicTimeout) clearTimeout(this.themeMusicTimeout);
        if (this.audioContext && this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }
        this.playThemeMusic();
    }

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
    // Safe no-op until init, or when music is disabled. Auto-starts the
    // ambient loop on first call so game.js only needs this one call per tick.
    updateMood(stats = {}) {
        try {
            if (!this.audioContext || !this.musicEnabled) return;
            const { infected = 0, dead = 0, totalInfected = 0, population = 1 } = stats;
            const pop = Math.max(1, population);
            const infectionPressure = Math.min(1, (infected / pop) * 12); // saturates ~8% active
            const mortalityPressure = Math.min(1, (dead / Math.max(1, totalInfected)) * 3); // saturates ~33% CFR
            this.mood = Math.max(0, Math.min(1, infectionPressure * 0.7 + mortalityPressure * 0.3));
            if (!this.musicLoopTimeout && !this.padNodes.length) {
                this.startGameMusic();
            }
        } catch (e) {
            // Never throw into the game loop.
        }
    }

    startGameMusic() {
        try {
            if (!this.audioContext || !this.musicEnabled) return;
            if (this.audioContext.state === 'suspended') {
                this.audioContext.resume();
            }
            if (this.musicLoopTimeout || this.padNodes.length) return; // already running
            this._startPads();
            this._schedulePluck();
        } catch (e) {
            // Never throw into the game loop.
        }
    }

    stopGameMusic() {
        if (this.musicLoopTimeout) {
            clearTimeout(this.musicLoopTimeout);
            this.musicLoopTimeout = null;
        }
        for (const node of this.padNodes) {
            try {
                node.stop();
            } catch (e) { /* already stopped */ }
            try {
                node.disconnect();
            } catch (e) { /* ignore */ }
        }
        this.padNodes = [];
    }

    // Slow detuned pad (root + fifth) through a breathing lowpass filter.
    _startPads() {
        const ctx = this.audioContext;
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 500;
        filter.Q.value = 0.8;

        const lfo = ctx.createOscillator();
        lfo.frequency.value = 0.06; // ~17s breathing cycle
        const lfoGain = ctx.createGain();
        lfoGain.gain.value = 260;
        lfo.connect(lfoGain);
        lfoGain.connect(filter.frequency);
        lfo.start();

        const padGain = ctx.createGain();
        padGain.gain.value = 0.12;
        filter.connect(padGain);
        padGain.connect(this.musicBus);

        for (const [freq, detune] of [[110.0, -4], [110.0, 4], [164.81, 0]]) {
            const osc = ctx.createOscillator();
            osc.type = 'sawtooth';
            osc.frequency.value = freq;
            osc.detune.value = detune;
            osc.connect(filter);
            osc.start();
            this.padNodes.push(osc);
        }
        this.padNodes.push(lfo);
    }

    // Sparse pluck scheduler; tempo and dissonance scale with this.mood.
    _schedulePluck() {
        this._pluckOnce();
        const interval = 2800 - this.mood * 1900; // ~2.8s calm, ~0.9s crisis
        this.musicLoopTimeout = setTimeout(() => this._schedulePluck(), interval);
    }

    _pluckOnce() {
        try {
            if (!this.audioContext) return;
            // Calm: frequent rests; crisis: nearly always a note.
            const playChance = 0.35 + this.mood * 0.65;
            if (Math.random() > playChance) return;

            let freq;
            if (this.mood > 0.55 && Math.random() < (this.mood - 0.55) * 2.2) {
                // Tension notes slip in as the outbreak worsens.
                freq = TENSION_NOTES[Math.floor(Math.random() * TENSION_NOTES.length)];
            } else {
                freq = PENTATONIC[Math.floor(Math.random() * PENTATONIC.length)];
            }

            const ctx = this.audioContext;
            const osc = ctx.createOscillator();
            osc.type = 'triangle';
            osc.frequency.value = freq;
            const gain = ctx.createGain();
            const now = ctx.currentTime;
            gain.gain.setValueAtTime(0.0001, now);
            gain.gain.exponentialRampToValueAtTime(0.22, now + 0.03);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.4);
            osc.connect(gain);
            gain.connect(this.musicBus);
            osc.start(now);
            osc.stop(now + 1.5);
        } catch (e) {
            // Never throw into the game loop.
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
            this.stopGameMusic();
        } else if (this.audioContext) {
            // Resume whatever music belongs to the current screen.
            if (this.getScreen() === 'menu') {
                this.startThemeMusic();
            }
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
