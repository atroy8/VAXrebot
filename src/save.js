// Save system: versioned persistence behind a tiny storage interface.
//
// The storage backend mirrors the localStorage API ({ getItem, setItem,
// removeItem }) so a Capacitor Preferences wrapper can be swapped in later
// without touching anything else: just pass it to loadSave/writeSave.
// On web we use localStorage; when it is unavailable (private mode, tests)
// we fall back to an in-memory backend so the game never crashes.
//
// Save schema (version 2):
// {
//   version: 2,
//   funding: number,          // grant funding balance (spends on power-up charges)
//   livesSaved: number,       // cumulative lives saved across wins
//   levels: {
//     [levelId]: { stars: 0-3, completed: boolean, bestDeaths: number }
//   },
//   powerups: { eureka: number, blitz: number, pay: number },  // charge inventory
//   openedChests: string[]    // supply chest ids already claimed (each opens once)
// }
// Wide audience round (still version 2, every field optional in old saves
// and filled with a default on load, see META_DEFAULTS):
//   settings: { gentle: boolean }     // Gentle mode switch
//   upgrades: string[]                // permanent shop upgrades owned
//   goals: { [levelId]: string[] }    // bonus goals ever completed per level
//   daily: { lastDate, streak, best, last }   // Daily puzzle streak
//   lossStreak: { levelId, count }    // losses in a row on one level
//   levels[levelId] may also carry standardClear / gentleClear: true
// Unlock state is DERIVED from completions + gating rules (src/progress.js),
// never stored, so the rules stay the single source of truth.
//
// Migration: version 1 saves (no powerups/openedChests) upgrade in place to
// version 2 with empty inventories. Corrupt or version-mismatched saves
// reset to a fresh save rather than crashing. resetSave() is exposed for a
// future settings-screen button.

// Upgrade ids replaced over time, old to new. Mirrors UPGRADE_RENAMES in
// src/config/upgrades.js (kept here so the save has no imports; a test
// checks they agree).
const UPGRADE_RENAMES = { earlyWarning: 'rapidResponse' };

export const SAVE_KEY = 'vaxrebot-save-v1';
export const SAVE_VERSION = 2;

const DEFAULT_CHARGES = { eureka: 0, blitz: 0, pay: 0 };

// Defaults for the meta-game fields. A function, so nobody shares objects.
export function metaDefaults() {
    return {
        settings: { gentle: false },
        upgrades: [],
        goals: {},
        daily: { lastDate: null, streak: 0, best: 0, last: null },
        lossStreak: { levelId: null, count: 0 },
    };
}

const isObject = (x) => !!x && typeof x === 'object' && !Array.isArray(x);

// Fill the meta-game fields of a loaded save, keeping whatever is valid.
export function withMetaDefaults(data) {
    const d = metaDefaults();
    return {
        settings: { ...d.settings, ...(isObject(data.settings) ? data.settings : {}) },
        // Round 57: Early warning became Rapid response; a save that owns the
        // old upgrade owns the new one (never twice).
        upgrades: Array.isArray(data.upgrades) ? [...new Set(data.upgrades.filter((x) => typeof x === 'string').map((x) => UPGRADE_RENAMES[x] || x))] : d.upgrades,
        goals: isObject(data.goals) ? data.goals : d.goals,
        daily: { ...d.daily, ...(isObject(data.daily) ? data.daily : {}) },
        lossStreak: { ...d.lossStreak, ...(isObject(data.lossStreak) ? data.lossStreak : {}) },
    };
}

export function createMemoryBackend() {
    const store = new Map();
    return {
        getItem: (key) => (store.has(key) ? store.get(key) : null),
        setItem: (key, value) => store.set(key, String(value)),
        removeItem: (key) => store.delete(key),
    };
}

export function createLocalStorageBackend() {
    try {
        const probe = '__vaxrebot_probe__';
        window.localStorage.setItem(probe, '1');
        window.localStorage.removeItem(probe);
        return window.localStorage;
    } catch {
        return null;
    }
}

// Preferred backend for the current environment. Swap the localStorage line
// for a Capacitor Preferences wrapper when going native; everything else
// keeps working because the interface is identical.
export function createStorage() {
    if (typeof window !== 'undefined') {
        const ls = createLocalStorageBackend();
        if (ls) return ls;
    }
    return createMemoryBackend();
}

export function freshSave() {
    return {
        version: SAVE_VERSION,
        funding: 0,
        livesSaved: 0,
        levels: {},
        powerups: { ...DEFAULT_CHARGES },
        openedChests: [],
        ...metaDefaults(),
    };
}

function isValidSave(data) {
    return (
        data &&
        typeof data === 'object' &&
        (data.version === 1 || data.version === SAVE_VERSION) &&
        typeof data.funding === 'number' &&
        typeof data.livesSaved === 'number' &&
        data.levels &&
        typeof data.levels === 'object'
    );
}

// Normalize a loaded save to the current schema: v1 saves gain empty
// charge inventory and chest lists; any save missing the new fields gets
// defaults filled in so readers never have to null-check.
function normalizeSave(data) {
    return {
        ...data,
        version: SAVE_VERSION,
        powerups: { ...DEFAULT_CHARGES, ...(data.powerups || {}) },
        openedChests: Array.isArray(data.openedChests) ? data.openedChests : [],
        ...withMetaDefaults(data),
    };
}

export function loadSave(storage) {
    try {
        const raw = storage.getItem(SAVE_KEY);
        if (!raw) return freshSave();
        const data = JSON.parse(raw);
        if (!isValidSave(data)) return freshSave();
        return normalizeSave(data);
    } catch {
        // Corrupt JSON or unreadable storage: start fresh, never crash.
        return freshSave();
    }
}

export function writeSave(storage, save) {
    try {
        storage.setItem(SAVE_KEY, JSON.stringify(save));
        return true;
    } catch {
        return false;
    }
}

export function resetSave(storage) {
    const fresh = freshSave();
    writeSave(storage, fresh);
    return fresh;
}
