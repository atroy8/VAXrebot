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
// Unlock state is DERIVED from completions + gating rules (src/progress.js),
// never stored, so the rules stay the single source of truth.
//
// Migration: version 1 saves (no powerups/openedChests) upgrade in place to
// version 2 with empty inventories. Corrupt or version-mismatched saves
// reset to a fresh save rather than crashing. resetSave() is exposed for a
// future settings-screen button.

export const SAVE_KEY = 'vaxrebot-save-v1';
export const SAVE_VERSION = 2;

const DEFAULT_CHARGES = { eureka: 0, blitz: 0, pay: 0 };

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
