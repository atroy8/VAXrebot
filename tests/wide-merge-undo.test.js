import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { takeSnapshot, restoreSnapshot, NODE_FIELDS } from '../src/sim/undo.js';

describe('undo covers the later planet mechanics (merge fix)', () => {
    it('brings back masks and hidden carrier fields', () => {
        const state = { day: 2, gameOver: false, stats: {}, dailyUsage: { mask: 0 }, usedOnPeople: new Set() };
        const network = { nodes: [{ id: 0, state: 'healthy', incubating: 1 }], links: [] };
        const snap = takeSnapshot(state, network);
        network.nodes[0].masked = true;
        state.dailyUsage.mask = 1;
        expect(restoreSnapshot(state, network, snap)).toBe(true);
        expect(network.nodes[0].masked).toBeUndefined();
        expect(network.nodes[0].incubating).toBe(1);
        expect(state.dailyUsage.mask).toBe(0);
        for (const f of ['incubating', 'knownCase', 'testedClear', 'masked']) expect(NODE_FIELDS).toContain(f);
    });

    it('a test result is never undone', () => {
        const src = readFileSync(new URL('../src/game.js', import.meta.url), 'utf8');
        expect(src).toContain("if (toolId === 'test') this.undoSnap = null;");
    });
});
