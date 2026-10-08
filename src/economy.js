// VAXrebot economy: power-up charges, supply chests, and funding purchases.
//
// All numbers live here and in src/progress.js so balance stays legible.
// Everything works offline; persistence goes through src/save.js.
//
// POWER-UPS (consumable charges, bought with funding or granted by chests)
// -----------------------------------------------------------------------
// id       name            cost (funding)   effect
// eureka   Eureka!         100 (priciest)   Cure every infected person to recovered, instantly.
// pay      Stay Home Pay    60              Quarantine every infected person (isolation; they stay sick while quarantined).
// blitz    Vax Blitz        40              Vaccinate the 5 most-connected healthy people.
//
// Cost rationale: a contained win earns 75/100/125 funding (see
// src/progress.js fundingAward), so one solid win buys a Eureka! or a
// couple of smaller charges. Eureka is the run-saver, hence most expensive.
//
// EFFECTS (applied through the game's tool system, not by touching the sim)
// -----------------------------------------------------------------------
// usePowerUp(id, gameApi) decrements one charge and mutates the live
// network via gameApi:
//
//   gameApi = {
//     network:   { nodes, links }            // nodes: {id, state, removed?, sickWhileQuarantined?}
//                                             // links: {source, target} as ids or node refs
//     gameState,                              // .stats mutated (totalRecovered / totalProtected / powerUpsUsed)
//     log(day, msg, important?),              // addLogEntry style
//     notify(msg, type?),                     // showNotification style
//     refreshUI(),                            // re-render tools/HUD
//     updateView(),                           // re-render the network view
//     checkGameOver(),                        // eureka can contain the outbreak outright
//     playSound?(freq, dur, type),            // optional audio hook
//   }
//
// State names follow the sim engine: healthy, infected, recovered,
// vaccinated, quarantined, dead. The engine has no 'exposed' state, so
// Stay Home Pay targets infected nodes (including quarantined-but-sick).
// Each use also bumps stats.powerUpsUsed, which feeds the scoring penalty
// in src/progress.js (power-ups are easy mode).
//
// SUPPLY CHESTS
// -----------------------------------------------------------------------
// Chest definitions live in src/config/chests.js (owned by the globe
// worker; this module only reads it). Expected contract (array shape):
//
//   export const CHESTS = [
//     { id: 'chest-a', afterLevelIndex: 0, gives: { blitz: 1 }, lat, lng },
//     ...
//   ]
//   - id: chest id used by openChest()/getChestState()
//   - afterLevelIndex: index into LEVELS. The chest unlocks once the player
//     has earned at least 1 star on that level.
//   - gives: power-up ids -> charge counts granted on open
//
// (A map keyed by chest id is also accepted.) Live lineup: chest-a after
// level 0 gives { blitz: 1 }, chest-b after level 3 gives { eureka: 1 },
// chest-c after level 6 gives { pay: 2 }.
// openChest() verifies >= 1 star on the linked level via src/progress.js
// levelRecord(), grants the charges, and records the chest id in
// save.openedChests so each chest opens once. getChestState() returns
// 'locked' | 'ready' | 'opened'. Both are async because chests.js is
// loaded lazily; if it is missing they fail closed (locked / not ok).

import { createStorage, loadSave, writeSave } from './save.js';
import { levelRecord } from './progress.js';
import { LEVELS } from './config/levels.js';

export const POWER_UPS = {
    eureka: {
        id: 'eureka',
        name: 'Eureka!',
        emoji: '💡',
        cost: 100,
        color: '#FFB03A',
        tagline: 'The breakthrough moment',
        effect: 'Cure every infected person at once. They recover immediately.',
    },
    pay: {
        id: 'pay',
        name: 'Stay Home Pay',
        emoji: '🏠',
        cost: 60,
        color: '#FF6FB5',
        tagline: 'Paid sick leave for all',
        effect: 'Send every infected person home to quarantine. Isolation keeps them from spreading it.',
    },
    blitz: {
        id: 'blitz',
        name: 'Vax Blitz',
        emoji: '⚡',
        cost: 40,
        color: '#2EC4B6',
        tagline: 'Superspreader shutdown',
        effect: 'Vaccinate the 5 most connected healthy people before the virus reaches them.',
    },
};

export const POWER_UP_IDS = Object.keys(POWER_UPS);

export function isPowerUp(id) {
    return Object.prototype.hasOwnProperty.call(POWER_UPS, id);
}

// Storage is created lazily so tests can inject a memory backend via
// setEconomyStorage() before any call. On web this resolves to the same
// localStorage the game uses, so the save is always read fresh.
let storage = null;
function getStorage() {
    if (!storage) storage = createStorage();
    return storage;
}
export function setEconomyStorage(s) {
    storage = s;
}

function defaultCharges() {
    return { eureka: 0, blitz: 0, pay: 0 };
}

function normalizeSave(save) {
    save.powerups = { ...defaultCharges(), ...(save.powerups || {}) };
    if (!Array.isArray(save.openedChests)) save.openedChests = [];
    return save;
}

export function readSave() {
    return normalizeSave(loadSave(getStorage()));
}

function persist(save) {
    writeSave(getStorage(), save);
    return save;
}

export function getCharges() {
    return { ...readSave().powerups };
}

export function getFunding() {
    return readSave().funding;
}

// Spend funding on one charge of a power-up. Returns { ok, reason?, save }.
export function buyCharge(id) {
    if (!isPowerUp(id)) return { ok: false, reason: 'Unknown power-up.', save: readSave() };
    const save = readSave();
    const cost = POWER_UPS[id].cost;
    if (save.funding < cost) {
        return { ok: false, reason: `Not enough funding. ${POWER_UPS[id].name} costs ${cost}.`, save };
    }
    save.funding -= cost;
    save.powerups[id] = (save.powerups[id] || 0) + 1;
    persist(save);
    return { ok: true, save };
}

// --- Chest config (lazy; chests.js is owned by the globe worker) ---

let chestConfigOverride = null;
// Test seam / globe-worker hook: inject a chest config instead of
// importing src/config/chests.js.
export function setChestConfig(config) {
    chestConfigOverride = config;
}

async function loadChestConfig() {
    if (chestConfigOverride) return chestConfigOverride;
    try {
        // The specifier is a variable (not a literal) so the bundler leaves
        // this import fully dynamic: chests.js is owned by the globe lane
        // and may not exist in every checkout. A missing module rejects at
        // runtime and we fail closed below.
        const specifier = './config/chests.js';
        const mod = await import(/* @vite-ignore */ specifier);
        return mod.CHESTS ?? mod.default ?? {};
    } catch {
        return {};
    }
}

function chestDefFor(config, chestId) {
    // Accept both shapes: an array of {id, afterLevelIndex, gives, ...}
    // (the globe worker's src/config/chests.js) or a map keyed by chestId.
    const def = Array.isArray(config)
        ? config.find((c) => c && c.id === chestId)
        : config[chestId];
    if (!def || typeof def.afterLevelIndex !== 'number') return null;
    return def;
}

// 'locked'  : prerequisite not met (or unknown chest)
// 'ready'   : >= 1 star on the linked level, not yet opened
// 'opened'  : already claimed
export async function getChestState(chestId) {
    const config = await loadChestConfig();
    const def = chestDefFor(config, chestId);
    if (!def) return 'locked';
    const save = readSave();
    if (save.openedChests.includes(chestId)) return 'opened';
    const level = LEVELS[def.afterLevelIndex];
    if (!level) return 'locked';
    return levelRecord(save, level.id).stars >= 1 ? 'ready' : 'locked';
}

// Grant the chest's charges after verifying the star prerequisite.
// Returns { ok, reason?, gives?, save }.
export async function openChest(chestId) {
    const config = await loadChestConfig();
    const def = chestDefFor(config, chestId);
    const save = readSave();
    if (!def) return { ok: false, reason: 'Unknown chest.', save };
    if (save.openedChests.includes(chestId)) return { ok: false, reason: 'Chest already opened.', save };
    if ((await getChestState(chestId)) !== 'ready') {
        const level = LEVELS[def.afterLevelIndex];
        const need = level ? `Earn at least 1 star on "${level.name}" to unlock it.` : 'It is not unlocked yet.';
        return { ok: false, reason: `Chest is locked. ${need}`, save };
    }
    const gives = {};
    for (const id of POWER_UP_IDS) {
        const n = def.gives && def.gives[id] ? Math.max(0, Math.floor(def.gives[id])) : 0;
        if (n > 0) {
            save.powerups[id] = (save.powerups[id] || 0) + n;
            gives[id] = n;
        }
    }
    save.openedChests.push(chestId);
    persist(save);
    return { ok: true, gives, save };
}

// --- Power-up use (in-run, through the game's tool system) ---

function nodeId(ref) {
    return ref && typeof ref === 'object' ? ref.id : ref;
}

function applyEureka(gameApi) {
    const { nodes } = gameApi.network;
    let cured = 0;
    for (const node of nodes) {
        if (node.removed) continue;
        const sick = node.state === 'infected' || (node.state === 'quarantined' && node.sickWhileQuarantined);
        if (!sick) continue;
        node.state = 'recovered';
        node.sickWhileQuarantined = false;
        cured++;
    }
    gameApi.gameState.stats.totalRecovered += cured;
    return cured;
}

function applyPay(gameApi) {
    const { nodes } = gameApi.network;
    let sent = 0;
    for (const node of nodes) {
        if (node.removed || node.state === 'quarantined' || node.state === 'dead') continue;
        if (node.state !== 'infected') continue;
        // Isolation, not a cure: the node keeps its illness flag so the
        // sim keeps ticking it and counts it as active while quarantined.
        node.sickWhileQuarantined = true;
        node.state = 'quarantined';
        sent++;
    }
    gameApi.gameState.stats.totalProtected += sent;
    return sent;
}

function applyBlitz(gameApi) {
    const { nodes, links } = gameApi.network;
    const degree = new Map();
    for (const link of links || []) {
        const a = nodeId(link.source);
        const b = nodeId(link.target);
        degree.set(a, (degree.get(a) || 0) + 1);
        degree.set(b, (degree.get(b) || 0) + 1);
    }
    const pool = nodes
        .filter((n) => !n.removed && n.state === 'healthy')
        .sort((a, b) => (degree.get(b.id) || 0) - (degree.get(a.id) || 0));
    const targets = pool.slice(0, 5);
    for (const node of targets) node.state = 'vaccinated';
    gameApi.gameState.stats.totalProtected += targets.length;
    return targets.length;
}

const EFFECTS = { eureka: applyEureka, pay: applyPay, blitz: applyBlitz };
const USE_MESSAGES = {
    eureka: (n) => `EUREKA! ${n} ${n === 1 ? 'person' : 'people'} cured instantly.`,
    pay: (n) => `STAY HOME! ${n} ${n === 1 ? 'person' : 'people'} sent home to quarantine.`,
    blitz: (n) => `VAX BLITZ! ${n} highly connected ${n === 1 ? 'person' : 'people'} vaccinated.`,
};

// Use one charge of a power-up during a run. Returns { ok, reason?, save }.
// Decrements the charge, applies the effect through gameApi, then lets the
// game refresh UI, re-render the view, and check for game over.
export function usePowerUp(id, gameApi) {
    if (!isPowerUp(id)) return { ok: false, reason: 'Unknown power-up.', save: readSave() };
    const save = readSave();
    if ((save.powerups[id] || 0) < 1) {
        gameApi.notify?.('No charges left. Open a supply crate or buy more in the shop.', 'error');
        return { ok: false, reason: 'No charges left.', save };
    }
    save.powerups[id] -= 1;
    const affected = EFFECTS[id](gameApi);
    const stats = gameApi.gameState.stats;
    stats.powerUpsUsed = (stats.powerUpsUsed || 0) + 1;

    const day = gameApi.gameState.day;
    const message = USE_MESSAGES[id](affected);
    gameApi.log?.(day, `${POWER_UPS[id].name} used: ${message.toLowerCase()}`, true);
    gameApi.notify?.(message, 'success');
    gameApi.playSound?.(id === 'eureka' ? 880 : id === 'pay' ? 520 : 660, 0.3, 'sine');

    persist(save);
    gameApi.updateView?.();
    gameApi.refreshUI?.();
    gameApi.checkGameOver?.();
    return { ok: true, save };
}
