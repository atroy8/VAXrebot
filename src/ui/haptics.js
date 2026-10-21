// Haptic feedback, the buzz you feel when you snip a link or win a level.
//
// iPhone Safari has no navigator.vibrate, so before round 18 the "phone
// buzzes" part of the sever (backlog item 2) only worked on Android. In the
// App Store build the Capacitor bridge registers the @capacitor/haptics
// plugin as Capacitor.Plugins.Haptics, which drives the iPhone Taptic Engine.
// Like the AdMob adapter, the plugin is looked up through the bridge, so the
// web build needs no new dependency, and everything is injected for tests.
//
// Each game moment maps to one named cue, so the feel can be tuned in one
// table. Native cues use the plugin's impact and notification styles; the
// web fallback uses short vibration patterns (milliseconds).
//
// The player can turn vibration off in Settings. The choice is saved under
// its own key so it survives Reset progress.

export const HAPTICS_KEY = 'vaxrebot-haptics-v1';

export const HAPTIC_CUES = Object.freeze({
    // Snip a contact line: the signature move, a crisp medium knock.
    sever: { native: { kind: 'impact', style: 'MEDIUM' }, pattern: [18] },
    // Vaccinate or quarantine someone: a light tap.
    tool: { native: { kind: 'impact', style: 'LIGHT' }, pattern: [10] },
    // Isolate the super-spreader, or R falls below 1: a turning point.
    milestone: { native: { kind: 'notification', type: 'SUCCESS' }, pattern: [12, 40, 12] },
    // A day with a big jump in new cases: a heavy thud as a warning.
    spike: { native: { kind: 'impact', style: 'HEAVY' }, pattern: [30] },
    // The outbreak is contained.
    win: { native: { kind: 'notification', type: 'SUCCESS' }, pattern: [14, 50, 14, 50, 28] },
    // The outbreak got away.
    loss: { native: { kind: 'notification', type: 'ERROR' }, pattern: [40, 60, 40] },
});

function loadEnabled(storage) {
    try {
        const raw = storage?.getItem(HAPTICS_KEY);
        if (raw == null) return true; // on by default
        return JSON.parse(raw)?.enabled !== false;
    } catch {
        return true;
    }
}

export function createHaptics({ capacitor, navigator: nav, storage } = {}) {
    const plugin = capacitor?.Plugins?.Haptics ?? null;
    const canVibrate = typeof nav?.vibrate === 'function';
    let enabled = loadEnabled(storage);

    function isSupported() {
        return Boolean(plugin) || canVibrate;
    }

    // Fire a named cue. Returns how it was delivered ('native', 'vibrate')
    // or null when it was skipped. Never throws: feedback must not break play.
    function play(name) {
        const cue = HAPTIC_CUES[name];
        if (!enabled || !cue) return null;
        try {
            if (plugin) {
                const n = cue.native;
                const call = n.kind === 'impact' ? plugin.impact?.({ style: n.style }) : plugin.notification?.({ type: n.type });
                call?.catch?.(() => {});
                return 'native';
            }
            if (canVibrate) {
                nav.vibrate(cue.pattern.length === 1 ? cue.pattern[0] : cue.pattern);
                return 'vibrate';
            }
        } catch {
            // ignore: some browsers throw when vibrate is called without a gesture
        }
        return null;
    }

    function setEnabled(on) {
        enabled = Boolean(on);
        try {
            storage?.setItem(HAPTICS_KEY, JSON.stringify({ version: 1, enabled }));
        } catch {
            // storage full or blocked: keep the in-memory choice
        }
        if (enabled) play('tool'); // a little buzz confirms it is back on
    }

    return {
        play,
        setEnabled,
        isSupported,
        get enabled() {
            return enabled;
        },
    };
}
