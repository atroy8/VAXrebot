import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHaptics, HAPTIC_CUES, HAPTICS_KEY } from '../src/ui/haptics.js';
import { createMemoryBackend } from '../src/save.js';
import { settingsMarkup } from '../src/ui/settings.js';

function fakePlugin() {
    return {
        impact: vi.fn(() => Promise.resolve()),
        notification: vi.fn(() => Promise.resolve()),
    };
}

describe('haptics (round 18)', () => {
    it('uses the native Taptic plugin through the Capacitor bridge when present', () => {
        const Haptics = fakePlugin();
        const vibrate = vi.fn();
        const h = createHaptics({ capacitor: { Plugins: { Haptics } }, navigator: { vibrate } });
        expect(h.play('sever')).toBe('native');
        expect(Haptics.impact).toHaveBeenCalledWith({ style: 'MEDIUM' });
        expect(h.play('win')).toBe('native');
        expect(Haptics.notification).toHaveBeenCalledWith({ type: 'SUCCESS' });
        expect(h.play('loss')).toBe('native');
        expect(Haptics.notification).toHaveBeenLastCalledWith({ type: 'ERROR' });
        expect(vibrate).not.toHaveBeenCalled();
    });

    it('falls back to navigator.vibrate in a browser', () => {
        const vibrate = vi.fn();
        const h = createHaptics({ navigator: { vibrate } });
        expect(h.play('sever')).toBe('vibrate');
        expect(vibrate).toHaveBeenLastCalledWith(18);
        h.play('win');
        expect(vibrate).toHaveBeenLastCalledWith(HAPTIC_CUES.win.pattern);
    });

    it('does nothing (and never throws) where there is no vibration at all, like iPhone Safari', () => {
        const h = createHaptics({ navigator: {} });
        expect(h.isSupported()).toBe(false);
        expect(h.play('sever')).toBeNull();
        expect(h.play('not-a-cue')).toBeNull();
    });

    it('never lets a failing plugin break play', async () => {
        const Haptics = { impact: vi.fn(() => Promise.reject(new Error('no engine'))), notification: vi.fn(() => { throw new Error('boom'); }) };
        const h = createHaptics({ capacitor: { Plugins: { Haptics } } });
        expect(() => h.play('sever')).not.toThrow();
        expect(() => h.play('win')).not.toThrow();
        await Promise.resolve();
    });

    it('every cue has a native style and a short web pattern', () => {
        for (const [name, cue] of Object.entries(HAPTIC_CUES)) {
            expect(['impact', 'notification'], name).toContain(cue.native.kind);
            if (cue.native.kind === 'impact') expect(['LIGHT', 'MEDIUM', 'HEAVY']).toContain(cue.native.style);
            else expect(['SUCCESS', 'WARNING', 'ERROR']).toContain(cue.native.type);
            const total = cue.pattern.reduce((a, b) => a + b, 0);
            expect(total, name).toBeLessThanOrEqual(200);
        }
    });

    it('the off switch is saved and survives a restart', () => {
        const storage = createMemoryBackend();
        const vibrate = vi.fn();
        const h = createHaptics({ navigator: { vibrate }, storage });
        expect(h.enabled).toBe(true);
        h.setEnabled(false);
        expect(h.play('sever')).toBeNull();
        expect(JSON.parse(storage.getItem(HAPTICS_KEY)).enabled).toBe(false);
        const again = createHaptics({ navigator: { vibrate }, storage });
        expect(again.enabled).toBe(false);
        again.setEnabled(true);
        expect(vibrate).toHaveBeenCalledTimes(1); // the confirmation buzz
        expect(createHaptics({ storage }).enabled).toBe(true);
    });

    it('a corrupt saved value falls back to on', () => {
        const storage = createMemoryBackend();
        storage.setItem(HAPTICS_KEY, '{not json');
        expect(createHaptics({ storage }).enabled).toBe(true);
    });

    it('settings shows a Vibration switch that reflects the saved choice', () => {
        expect(settingsMarkup({ adsRemoved: false })).not.toContain('Vibration');
        const on = settingsMarkup({ adsRemoved: false, haptics: { enabled: true } });
        expect(on).toContain('Vibration');
        expect(on).toMatch(/data-act="haptics" checked/);
        const off = settingsMarkup({ adsRemoved: false, haptics: { enabled: false } });
        expect(off).not.toMatch(/data-act="haptics" checked/);
    });

    it('the game plays a cue for the sever, tools, turning points, spikes, and the result', () => {
        const src = readFileSync(new URL('../src/game.js', import.meta.url), 'utf8');
        for (const cue of ["'sever'", "'tool'", "'milestone'", "'spike'", "'win' : 'loss'"]) {
            expect(src).toContain(`this.haptics.play(${cue === "'win' : 'loss'" ? "result === 'contained' ? 'win' : 'loss'" : cue})`);
        }
        expect(src).not.toContain('navigator.vibrate(');
    });
});
