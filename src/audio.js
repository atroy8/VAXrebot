// Web Audio: procedural sounds and the menu "spy theme" riff.
// Method names and behavior are unchanged from the original EpidemicSimulator
// audio methods; call signatures are preserved. A later track expands this
// into a fuller music engine.

export class AudioEngine {
    // getScreen: () => current screen name, used to stop the theme when leaving the menu.
    constructor(getScreen = () => null) {
        this.audioContext = null;
        this.masterGain = null;
        this.themeMusicTimeout = null;
        this.themeMusicSequence = [];
        this.getScreen = getScreen;
    }

    initAudio() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.masterGain = this.audioContext.createGain();
            this.masterGain.gain.value = 0.3; // Default volume
            this.masterGain.connect(this.audioContext.destination);
            this.setupThemeMusic();
        } catch (e) {
            console.error('Web Audio API is not supported in this browser');
        }
    }

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
        gainNode.connect(this.masterGain);

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
}
