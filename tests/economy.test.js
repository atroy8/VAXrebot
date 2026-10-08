// Economy tests: power-up charges, purchases, effects, and supply chests.
// Pure logic with the memory storage backend; no DOM, node environment.
import { describe, it, expect, beforeEach } from 'vitest';
import { createMemoryBackend, freshSave, writeSave } from '../src/save.js';
import { recordCompletion } from '../src/progress.js';
import {
    POWER_UPS,
    isPowerUp,
    getCharges,
    getFunding,
    buyCharge,
    usePowerUp,
    getChestState,
    openChest,
    setEconomyStorage,
    setChestConfig,
} from '../src/economy.js';

function winStats(overrides = {}) {
    return { initialPopulation: 100, totalDead: 2, totalInfected: 20, totalRecovered: 30, totalProtected: 5, ...overrides };
}

// Minimal fake of the gameApi the economy module expects.
function fakeGame(nodes, links = []) {
    const calls = { log: 0, notify: 0, refreshUI: 0, updateView: 0, checkGameOver: 0 };
    return {
        calls,
        api: {
            network: { nodes, links },
            gameState: { day: 5, stats: { ...winStats(), totalRecovered: 0, totalProtected: 0 } },
            log: () => calls.log++,
            notify: () => calls.notify++,
            refreshUI: () => calls.refreshUI++,
            updateView: () => calls.updateView++,
            checkGameOver: () => calls.checkGameOver++,
        },
    };
}

function seedSave(patch = {}) {
    const storage = createMemoryBackend();
    setEconomyStorage(storage);
    writeSave(storage, { ...freshSave(), ...patch });
    return storage;
}

beforeEach(() => {
    seedSave();
    setChestConfig([
        { id: 'chest-a', afterLevelIndex: 0, gives: { blitz: 1 } },
        { id: 'chest-b', afterLevelIndex: 3, gives: { eureka: 1 } },
    ]);
});

describe('power-up catalog', () => {
    it('defines exactly eureka, blitz, and pay with eureka priciest', () => {
        expect(isPowerUp('eureka')).toBe(true);
        expect(isPowerUp('blitz')).toBe(true);
        expect(isPowerUp('pay')).toBe(true);
        expect(isPowerUp('vaccinate')).toBe(false);
        expect(POWER_UPS.eureka.cost).toBeGreaterThan(POWER_UPS.pay.cost);
        expect(POWER_UPS.pay.cost).toBeGreaterThan(POWER_UPS.blitz.cost);
    });
});

describe('buyCharge', () => {
    it('refuses when funding is short', () => {
        const result = buyCharge('eureka');
        expect(result.ok).toBe(false);
        expect(result.reason).toMatch(/funding/i);
        expect(getCharges().eureka).toBe(0);
    });

    it('spends funding and grants a charge', () => {
        seedSave({ funding: 200 });
        const result = buyCharge('eureka');
        expect(result.ok).toBe(true);
        expect(getFunding()).toBe(200 - POWER_UPS.eureka.cost);
        expect(getCharges().eureka).toBe(1);
    });

    it('rejects unknown power-ups', () => {
        expect(buyCharge('nuke').ok).toBe(false);
    });
});

describe('usePowerUp', () => {
    it('eureka cures every infected node to recovered', () => {
        seedSave({ powerups: { eureka: 1, blitz: 0, pay: 0 } });
        const nodes = [
            { id: 0, state: 'infected' },
            { id: 1, state: 'infected' },
            { id: 2, state: 'quarantined', sickWhileQuarantined: true },
            { id: 3, state: 'healthy' },
            { id: 4, state: 'dead' },
        ];
        const { api, calls } = fakeGame(nodes);
        const result = usePowerUp('eureka', api);
        expect(result.ok).toBe(true);
        expect(nodes[0].state).toBe('recovered');
        expect(nodes[1].state).toBe('recovered');
        expect(nodes[2].state).toBe('recovered');
        expect(nodes[3].state).toBe('healthy');
        expect(nodes[4].state).toBe('dead');
        expect(api.gameState.stats.totalRecovered).toBe(3);
        expect(api.gameState.stats.powerUpsUsed).toBe(1);
        expect(getCharges().eureka).toBe(0);
        expect(calls.updateView).toBe(1);
        expect(calls.checkGameOver).toBe(1);
    });

    it('pay quarantines every infected node', () => {
        seedSave({ powerups: { eureka: 0, blitz: 0, pay: 1 } });
        const nodes = [
            { id: 0, state: 'infected' },
            { id: 1, state: 'infected' },
            { id: 2, state: 'healthy' },
        ];
        const { api } = fakeGame(nodes);
        const result = usePowerUp('pay', api);
        expect(result.ok).toBe(true);
        expect(nodes[0].state).toBe('quarantined');
        expect(nodes[0].sickWhileQuarantined).toBe(true);
        expect(nodes[1].state).toBe('quarantined');
        expect(nodes[2].state).toBe('healthy');
        expect(api.gameState.stats.totalProtected).toBe(2);
        expect(getCharges().pay).toBe(0);
    });

    it('blitz vaccinates the 5 most connected healthy nodes', () => {
        seedSave({ powerups: { eureka: 0, blitz: 1, pay: 0 } });
        // Node 0 is the hub (degree 5); nodes 1-5 have degree 1; node 6 is isolated.
        const nodes = Array.from({ length: 7 }, (_, i) => ({ id: i, state: 'healthy' }));
        nodes[6].state = 'infected'; // not eligible
        const links = [1, 2, 3, 4, 5].map((i) => ({ source: 0, target: i }));
        const { api } = fakeGame(nodes, links);
        const result = usePowerUp('blitz', api);
        expect(result.ok).toBe(true);
        expect(nodes[0].state).toBe('vaccinated');
        expect([1, 2, 3, 4].every((i) => nodes[i].state === 'vaccinated')).toBe(true);
        expect(nodes[5].state).toBe('healthy'); // only 5 charges worth: hub + 4
        expect(nodes[6].state).toBe('infected');
        expect(api.gameState.stats.totalProtected).toBe(5);
    });

    it('refuses when no charges remain', () => {
        const { api, calls } = fakeGame([{ id: 0, state: 'infected' }]);
        const result = usePowerUp('eureka', api);
        expect(result.ok).toBe(false);
        expect(calls.updateView).toBe(0);
    });
});

describe('supply chests', () => {
    function oneStarSave() {
        const storage = createMemoryBackend();
        setEconomyStorage(storage);
        const save = recordCompletion(freshSave(), 'r1-care-home', 'contained', winStats({ totalDead: 5 }));
        writeSave(storage, save);
        return storage;
    }

    it('is locked before 1 star on the linked level', async () => {
        expect(await getChestState('chest-a')).toBe('locked');
        expect((await openChest('chest-a')).ok).toBe(false);
    });

    it('opens once the linked level has a star, granting charges', async () => {
        oneStarSave();
        expect(await getChestState('chest-a')).toBe('ready');
        const result = await openChest('chest-a');
        expect(result.ok).toBe(true);
        expect(result.gives).toEqual({ blitz: 1 });
        expect(getCharges().blitz).toBe(1);
        expect(await getChestState('chest-a')).toBe('opened');
        expect((await openChest('chest-a')).ok).toBe(false);
    });

    it('a later chest stays locked until its own level is starred', async () => {
        oneStarSave(); // only level 0 starred; chest-b needs level 3
        expect(await getChestState('chest-b')).toBe('locked');
    });

    it('unknown chests fail closed', async () => {
        expect(await getChestState('nope')).toBe('locked');
        expect((await openChest('nope')).ok).toBe(false);
    });
});
