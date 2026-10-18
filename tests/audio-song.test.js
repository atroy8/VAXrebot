import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
    SONG,
    STEPS_PER_BAR,
    LOOP_STEPS,
    ARRANGEMENTS,
    LAYERS,
    loopEvents,
    mixedEvents,
    createScheduler,
    stepSeconds,
    arrangementForScreen,
    busTargets,
    midiToFreq,
} from '../src/audio-song.js';

const pc = (midi) => ((midi % 12) + 12) % 12;

describe('theme song data (round 14)', () => {
    it('tempo is a relaxed 90 to 110 BPM in 4/4 on a 16th grid', () => {
        expect(SONG.bpm).toBeGreaterThanOrEqual(90);
        expect(SONG.bpm).toBeLessThanOrEqual(110);
        expect(STEPS_PER_BAR).toBe(16);
        expect(stepSeconds(100)).toBeCloseTo(0.15, 5);
    });

    it('has one chord per bar and an 8 bar loop', () => {
        expect(SONG.bars).toBe(8);
        expect(SONG.chords).toHaveLength(SONG.bars);
        expect(LOOP_STEPS).toBe(SONG.bars * STEPS_PER_BAR);
    });

    it('every melody, chord and bass note fits the song key', () => {
        const scale = new Set(SONG.scale);
        for (const [, , midi] of SONG.melody) expect(scale.has(pc(midi)), `melody ${midi}`).toBe(true);
        for (const c of SONG.chords) {
            expect(scale.has(pc(c.root))).toBe(true);
            for (const m of c.tones) expect(scale.has(pc(m)), `${c.name} ${m}`).toBe(true);
        }
        for (const arr of ['menu', 'level']) {
            for (const e of loopEvents(arr)) if (e.midi != null) expect(scale.has(pc(e.midi)), `${arr} ${e.layer} ${e.midi}`).toBe(true);
        }
    });

    it('melody notes on beat 1 belong to that bar chord (it follows the progression)', () => {
        for (const [bar, step, midi] of SONG.melody) {
            if (step !== 0) continue;
            const tones = SONG.chords[bar].tones.map(pc);
            expect(tones, `bar ${bar}`).toContain(pc(midi));
        }
    });

    it('patterns are whole bars: nothing starts or runs past the end of its bar', () => {
        for (const [, step, , len] of SONG.melody) {
            expect(step).toBeGreaterThanOrEqual(0);
            expect(step + len).toBeLessThanOrEqual(STEPS_PER_BAR);
        }
        for (const arr of ['menu', 'level']) {
            for (const e of loopEvents(arr)) {
                expect(e.step).toBeGreaterThanOrEqual(0);
                expect(e.step).toBeLessThan(LOOP_STEPS);
                expect((e.step % STEPS_PER_BAR) + e.len).toBeLessThanOrEqual(STEPS_PER_BAR);
            }
        }
    });

    it('menu is calm and the level arrangement adds driving layers', () => {
        const layersOf = (arr) => new Set(loopEvents(arr).map((e) => e.layer));
        const menu = layersOf('menu');
        const level = layersOf('level');
        for (const l of ['kick', 'snare', 'arp']) {
            expect(menu.has(l)).toBe(false);
            expect(level.has(l)).toBe(true);
        }
        for (const l of menu) expect(level.has(l)).toBe(true);
        expect(loopEvents('level').length).toBeGreaterThan(loopEvents('menu').length * 1.5);
        // Only the pad is fuller in the calm mix; every rhythmic layer is louder in a level.
        for (const l of LAYERS.filter((x) => x !== 'pad')) expect(ARRANGEMENTS.menu[l]).toBeLessThanOrEqual(ARRANGEMENTS.level[l]);
    });

    it('outbreak pressure busies the hats in a level only', () => {
        const hats = (arr, mood) => loopEvents(arr, mood).filter((e) => e.layer === 'hat').length;
        expect(hats('level', 1)).toBeGreaterThan(hats('level', 0));
        expect(hats('menu', 1)).toBe(hats('menu', 0));
    });

    it('levels drive, every other screen stays calm, and buses crossfade', () => {
        expect(arrangementForScreen('game')).toBe('level');
        for (const s of ['welcome', 'menu', 'briefing', 'game-over', null]) expect(arrangementForScreen(s)).toBe('menu');
        expect(busTargets('level')).toEqual({ menu: 0, level: 1 });
        expect(busTargets('menu')).toEqual({ menu: 1, level: 0 });
        const buses = new Set(mixedEvents(0).map((e) => e.bus));
        expect([...buses].sort()).toEqual(['level', 'menu']);
    });

    it('midi to frequency is concert pitch', () => {
        expect(midiToFreq(69)).toBeCloseTo(440, 6);
        expect(midiToFreq(57)).toBeCloseTo(220, 6);
    });
});

describe('lookahead scheduler', () => {
    const events = () => loopEvents('level');

    it('schedules only inside the lookahead window, on the beat grid', () => {
        const s = createScheduler({ startTime: 1, lookahead: 0.2, getEvents: events });
        const out = s.tick(1.0);
        expect(out.length).toBeGreaterThan(0);
        for (const { time } of out) {
            expect(time).toBeGreaterThanOrEqual(1);
            expect(time).toBeLessThan(1.2);
            const k = (time - 1) / stepSeconds();
            expect(Math.abs(k - Math.round(k))).toBeLessThan(1e-6);
        }
    });

    it('never schedules a step twice however often it ticks', () => {
        const s = createScheduler({ startTime: 0, lookahead: 0.2, getEvents: events });
        const seen = new Set();
        let count = 0;
        for (let now = 0; now < 30; now += 0.025) {
            for (const { event, step } of s.tick(now)) {
                const key = `${step}:${event.layer}:${event.midi}`;
                expect(seen.has(key), key).toBe(false);
                seen.add(key);
                count++;
            }
        }
        // 30 s at 100 BPM is 200 steps, a bit over 1.5 loops.
        expect(s.step).toBeGreaterThan(200);
        expect(count).toBeGreaterThan(events().length);
    });

    it('loops seamlessly: loop 2 repeats loop 1 exactly', () => {
        const s = createScheduler({ startTime: 0, lookahead: 0.2, getEvents: events });
        const all = [];
        for (let now = 0; now < LOOP_STEPS * stepSeconds() * 2 + 1; now += 0.05) all.push(...s.tick(now));
        const loop1 = all.filter((x) => x.step < LOOP_STEPS).map((x) => `${x.step}:${x.event.layer}:${x.event.midi}`);
        const loop2 = all
            .filter((x) => x.step >= LOOP_STEPS && x.step < 2 * LOOP_STEPS)
            .map((x) => `${x.step - LOOP_STEPS}:${x.event.layer}:${x.event.midi}`);
        expect(loop2).toEqual(loop1);
    });

    it('skips stale steps after a clock jump instead of bursting late notes', () => {
        const s = createScheduler({ startTime: 0, lookahead: 0.2, getEvents: events });
        s.tick(0);
        const out = s.tick(60);
        for (const { time } of out) expect(time).toBeGreaterThanOrEqual(59.9);
    });
});

describe('audio engine wiring', () => {
    const src = readFileSync(new URL('../src/audio.js', import.meta.url), 'utf8');
    it('keeps the public API game.js uses', () => {
        for (const m of ['initAudio()', 'startThemeMusic()', 'stopThemeMusic()', 'playSound(', 'playSnip()', 'setVolume(', 'updateMood(', 'playStinger(', 'setMusicEnabled(', 'isMusicEnabled()', 'startGameMusic()', 'stopGameMusic()']) {
            expect(src, m).toContain(m);
        }
    });
    it('waits for a user gesture and uses the audio clock, not timers, for notes', () => {
        expect(src).toContain('hadGesture');
        expect(src).toContain('createScheduler');
        expect(src).not.toContain('PENTATONIC');
    });
    it('has no em dashes', () => {
        expect(src).not.toContain('—');
        expect(readFileSync(new URL('../src/audio-song.js', import.meta.url), 'utf8')).not.toContain('—');
    });
});
