// Sound pass, part 1: the named effect library (src/audio-sfx.js).
// Nobody can hear a test, so these check structure on a recording fake
// AudioContext: every effect renders, starts on time, ends inside its
// declared length, stays under the gain ceilings, and the player never
// lets more than MAX_SOURCES sources overlap.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
    SFX, SFX_NAMES, SfxPlayer, renderSfx, sfxLength, sfxPeak, seededRandom, peakOverlap, makeNoiseBuffers,
    LAYER_GAIN_CEILING, MIX_GAIN_CEILING, MAX_SOURCES,
} from '../src/audio-sfx.js';
import { FakeAudioContext, peakSources } from './wide-audio-fake.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

const REQUIRED = [
    'snip', 'vaccinate', 'quarantine', 'cure', 'infection', 'dayStart', 'dayEnd', 'death', 'win', 'loss',
    'star', 'chestOpen', 'coin', 'tap', 'error', 'rBelowOne', 'tick',
];

describe('named effect registry', () => {
    it('has every effect the brief asks for, each with layers and a declared length', () => {
        for (const name of REQUIRED) {
            expect(SFX[name], name).toBeTruthy();
            expect(SFX[name].layers.length, name).toBeGreaterThan(0);
            expect(SFX[name].dur, name).toBeGreaterThan(0);
        }
    });

    it('descriptions are pure data (they survive a JSON round trip)', () => {
        expect(JSON.parse(JSON.stringify(SFX))).toEqual(SFX);
    });

    it('declared lengths are sane for what each effect is', () => {
        expect(SFX.snip.dur).toBeLessThan(0.25);
        for (const name of ['tap', 'tick', 'count']) expect(SFX[name].dur, name).toBeLessThan(0.12);
        for (const name of ['win', 'loss', 'rBelowOne', 'milestone']) expect(SFX[name].dur, name).toBeLessThan(2.5);
        expect(SFX.coin.dur).toBeLessThan(0.2);
        expect(SFX.error.dur).toBeLessThan(0.3);
        // The death bell is the one long sound: a tail, but not a drone.
        expect(SFX.death.dur).toBeGreaterThan(1.5);
        expect(SFX.death.dur).toBeLessThan(4);
        for (const name of SFX_NAMES) expect(SFX[name].dur, name).toBeLessThan(4);
    });

    it('no layer and no stack of layers is louder than the ceilings', () => {
        for (const name of SFX_NAMES) {
            for (const l of SFX[name].layers) expect(l.g, name).toBeLessThanOrEqual(LAYER_GAIN_CEILING);
            expect(sfxPeak(SFX[name]), name).toBeLessThanOrEqual(MIX_GAIN_CEILING);
        }
    });

    it('each effect is its own design, not a copy of another', () => {
        const seen = new Set(SFX_NAMES.map((n) => JSON.stringify(SFX[n].layers)));
        expect(seen.size).toBe(SFX_NAMES.length);
    });

    it('the snip is two blade clicks then a falling twang', () => {
        const [blade1, blade2] = SFX.snip.layers.filter((l) => l.src === 'noise');
        expect(blade1.at || 0).toBe(0);
        expect(blade2.at).toBeGreaterThan(0.01);
        expect(blade2.at).toBeLessThan(0.05);
        const twang = SFX.snip.layers.find((l) => l.src === 'osc' && l.wave === 'triangle');
        expect(twang.fTo).toBeLessThan(twang.f);
        expect(twang.at).toBeGreaterThan(blade2.at);
    });

    it('gentle where it matters: the error and the death bell use no harsh waves', () => {
        for (const name of ['error', 'death', 'loss', 'infection']) {
            for (const l of SFX[name].layers) expect(['square', 'sawtooth']).not.toContain(l.wave);
        }
    });

    it('the win fanfare is pentatonic (yo scale on D)', () => {
        const allowed = [2, 4, 7, 9, 11]; // D E G A B as pitch classes
        for (const l of SFX.win.layers) {
            if (l.src === 'noise') continue;
            const pc = ((Math.round(69 + 12 * Math.log2(l.f / 440)) % 12) + 12) % 12;
            expect(allowed).toContain(pc);
        }
    });
});

describe('renderSfx on a fake AudioContext', () => {
    for (const name of SFX_NAMES) {
        it(`${name}: renders, starts on time, ends inside its declared length`, () => {
            const ctx = new FakeAudioContext();
            ctx.currentTime = 12.5;
            const noise = makeNoiseBuffers(ctx, 0.1);
            const dest = ctx.createGain();
            const send = ctx.createGain();
            const voice = renderSfx(ctx, SFX[name], { dest, send, noise, seed: 3 });
            const sources = ctx.sources();
            expect(sources.length).toBeGreaterThan(0);
            expect(sources.length).toBe(voice.sources.length);
            for (const s of sources) {
                expect(s.startTime).toBeGreaterThanOrEqual(ctx.currentTime);
                expect(s.stopTime).not.toBeNull();
                expect(s.stopTime).toBeGreaterThan(s.startTime);
                expect(s.stopTime).toBeLessThanOrEqual(ctx.currentTime + SFX[name].dur + 1e-9);
            }
            expect(sfxLength(SFX[name])).toBeLessThanOrEqual(SFX[name].dur);
            // Every envelope starts and ends silent, and peaks under the ceiling.
            const envs = ctx.nodes.filter((n) => n.kind === 'gain' && n.gain.events.some((e) => e.kind === 'linear'));
            expect(envs.length).toBe(SFX[name].layers.length);
            for (const g of envs) {
                expect(g.gain.events[0].value).toBeLessThan(0.001);
                expect(g.gain.events[g.gain.events.length - 1].value).toBeLessThan(0.001);
                expect(g.gain.peak()).toBeLessThanOrEqual(LAYER_GAIN_CEILING);
            }
            // The effect reaches the destination through its own output gain.
            expect(voice.out.outputs).toContain(dest);
        });
    }

    it('seeded detune: the same seed repeats, another seed differs', () => {
        const freq = (seed) => {
            const ctx = new FakeAudioContext();
            renderSfx(ctx, SFX.infection, { dest: ctx.createGain(), noise: makeNoiseBuffers(ctx, 0.1), seed });
            return ctx.sources().find((s) => s.kind === 'oscillator').frequency.events[0].value;
        };
        expect(freq(5)).toBe(freq(5));
        expect(freq(5)).not.toBe(freq(6));
        // Never more than the declared range (180 cents) from the written pitch.
        for (let seed = 1; seed < 40; seed++) {
            const cents = Math.abs(1200 * Math.log2(freq(seed) / 230));
            expect(cents).toBeLessThanOrEqual(180);
        }
    });

    it('semis transposes: three stars climb', () => {
        const freq = (semis) => {
            const ctx = new FakeAudioContext();
            renderSfx(ctx, SFX.star, { dest: ctx.createGain(), noise: makeNoiseBuffers(ctx, 0.1), semis });
            return ctx.sources()[0].frequency.events[0].value;
        };
        expect(freq(4)).toBeGreaterThan(freq(0));
        expect(freq(7)).toBeGreaterThan(freq(4));
    });
});

describe('SfxPlayer', () => {
    const setup = () => {
        const ctx = new FakeAudioContext();
        const player = new SfxPlayer(ctx, ctx.destination);
        const fixed = ctx.nodes.length; // shaper, reverb combs: built once
        return { ctx, player, fixed };
    };

    it('builds its saturation and reverb chain once and reuses it', () => {
        const { ctx, player } = setup();
        expect(ctx.count('waveShaper')).toBe(1);
        expect(ctx.count('delay')).toBe(3);
        for (let i = 0; i < 10; i++) {
            ctx.currentTime += 1;
            player.play('snip');
        }
        expect(ctx.count('waveShaper')).toBe(1);
        expect(ctx.count('delay')).toBe(3);
    });

    it('survives a context with no shaper, delay or panner (old browsers)', () => {
        const ctx = new FakeAudioContext();
        ctx.createWaveShaper = undefined;
        ctx.createDelay = undefined;
        ctx.createStereoPanner = undefined;
        const player = new SfxPlayer(ctx, ctx.destination);
        for (const name of SFX_NAMES) expect(() => player.play(name)).not.toThrow();
    });

    it('unknown names are ignored', () => {
        const { player } = setup();
        expect(player.play('no-such-sound')).toBeNull();
        expect(player.stats.played).toBe(0);
    });

    it('holds the polyphony cap when 30 effects fire in one frame', () => {
        const { ctx, player } = setup();
        for (let i = 0; i < 30; i++) player.play(SFX_NAMES[i % SFX_NAMES.length], { seed: i });
        expect(peakSources(ctx)).toBeLessThanOrEqual(MAX_SOURCES);
        expect(player.stats.played).toBeGreaterThan(5);
        // And again with the single busiest effect, repeated.
        const b = setup();
        for (let i = 0; i < 30; i++) b.player.play({ layers: SFX.win.layers }, { seed: i });
        expect(peakSources(b.ctx)).toBeLessThanOrEqual(MAX_SOURCES);
    });

    it('a signature sound is never dropped for decoration', () => {
        const { ctx, player } = setup();
        for (let i = 0; i < 40; i++) player.play({ layers: SFX.chestOpen.layers }, { prio: 0 });
        const before = player.stats.played;
        expect(player.play('snip')).not.toBeNull();
        expect(player.stats.played).toBe(before + 1);
        expect(peakSources(ctx)).toBeLessThanOrEqual(MAX_SOURCES);
    });

    it('a big night is a run, not a wall: repeats are spaced out, then dropped', () => {
        const { ctx, player } = setup();
        const voices = [];
        for (let i = 0; i < 30; i++) voices.push(player.play('infection', { seed: i }));
        const played = voices.filter(Boolean);
        expect(played.length).toBeLessThanOrEqual(SFX.infection.queue + 1);
        expect(played.length).toBeGreaterThan(3);
        const starts = played.map((v) => Math.min(...v.sources.map((s) => s.start)));
        for (let i = 1; i < starts.length; i++) expect(starts[i] - starts[i - 1]).toBeGreaterThanOrEqual(SFX.infection.gap - 1e-9);
        expect(player.stats.dropped).toBe(30 - played.length);
        expect(ctx.sources().every((s) => s.startTime >= 0)).toBe(true);
    });

    it('disconnects every node of a finished effect', () => {
        const { ctx, player, fixed } = setup();
        player.play('snip');
        player.play('cure');
        const made = ctx.nodes.slice(fixed);
        expect(made.some((n) => n.disconnected)).toBe(false);
        ctx.currentTime += 5;
        player.sweep();
        expect(made.every((n) => n.disconnected)).toBe(true);
        expect(player.voices.length).toBe(0);
        expect(player.activeSources()).toBe(0);
    });

    it('stopAll stops everything still sounding', () => {
        const { ctx, player } = setup();
        player.play('death');
        player.play('win');
        player.stopAll();
        for (const s of ctx.sources()) expect(s.stopTime).toBeLessThanOrEqual(ctx.currentTime + 0.05);
    });
});

describe('helpers', () => {
    it('seededRandom is repeatable and stays in 0..1', () => {
        const a = seededRandom(42);
        const b = seededRandom(42);
        for (let i = 0; i < 50; i++) {
            const v = a();
            expect(v).toBe(b());
            expect(v).toBeGreaterThanOrEqual(0);
            expect(v).toBeLessThan(1);
        }
    });

    it('peakOverlap counts spans that touch end to start as separate', () => {
        expect(peakOverlap([{ start: 0, end: 1 }, { start: 1, end: 2 }])).toBe(1);
        expect(peakOverlap([{ start: 0, end: 1 }, { start: 0.5, end: 2 }, { start: 0.9, end: 3 }])).toBe(3);
    });

    it('noise buffers stay inside -1..1', () => {
        const ctx = new FakeAudioContext();
        const noise = makeNoiseBuffers(ctx, 0.5);
        for (const colour of ['white', 'pink', 'brown']) {
            const d = noise[colour].getChannelData(0);
            let max = 0;
            for (const v of d) max = Math.max(max, Math.abs(v));
            expect(max, colour).toBeLessThanOrEqual(1);
            expect(max, colour).toBeGreaterThan(0.05);
        }
    });
});

describe('house rules', () => {
    it('no long dash in the new sound files', () => {
        const dash = String.fromCharCode(0x2014);
        for (const f of ['../src/audio-sfx.js', '../src/audio-ambience.js', '../src/audio-voices.js', '../src/audio.js', './wide-audio-fake.js']) {
            expect(read(f).includes(dash), f).toBe(false);
        }
    });
});
