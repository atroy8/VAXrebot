// Gameplay tests: failure state, protected-node spread rules, and the real
// pause gate. Sim math only (src/sim/*). No DOM, no D3, node environment.
import { describe, it, expect } from 'vitest';
import {
    simulateSpread,
    checkGameOver,
    canAdvanceDay,
    OVERWHELMED_DEATH_FRACTION,
} from '../src/sim/engine.js';
import { initGameState } from '../src/sim/state.js';
import { tools } from '../src/config/tools.js';

// rng stubs: () => 0 always rolls under any positive probability; () => 1 never rolls under p < 1.
const always = () => 0;

// Two linked nodes: node 0 is the spreader, node 1 has the given state.
// Uses object link refs, like D3's forceLink produces after init.
function pairNetwork(spreaderState, targetState) {
    const nodes = [
        { id: 0, state: spreaderState, daysInfected: 0, removed: false },
        { id: 1, state: targetState, daysInfected: 0, removed: false },
    ];
    const links = [{ source: nodes[0], target: nodes[1] }];
    return { nodes, links };
}

function stateWithDead(totalDead) {
    const state = initGameState(tools);
    state.stats.totalDead = totalDead;
    state.stats.initialPopulation = 100;
    state.day = 5;
    return state;
}

describe('checkGameOver loss state', () => {
    it('returns overwhelmed when deaths reach 20% of the initial population', () => {
        const state = stateWithDead(20);
        const network = pairNetwork('infected', 'healthy');
        expect(checkGameOver(state, network, 30)).toBe('overwhelmed');
    });

    it('stays null just under the threshold (19 of 100)', () => {
        const state = stateWithDead(19);
        const network = pairNetwork('infected', 'healthy');
        expect(checkGameOver(state, network, 30)).toBeNull();
    });

    it('exposes the 20% threshold as a named constant', () => {
        expect(OVERWHELMED_DEATH_FRACTION).toBe(0.2);
    });

    it('precedence: contained beats overwhelmed', () => {
        const state = stateWithDead(20);
        const network = pairNetwork('healthy', 'healthy'); // no active infected
        expect(checkGameOver(state, network, 30)).toBe('contained');
    });

    it('precedence: overwhelmed beats timeout', () => {
        const state = stateWithDead(20);
        state.day = 30; // at the clock
        const network = pairNetwork('infected', 'healthy'); // still spreading
        expect(checkGameOver(state, network, 30)).toBe('overwhelmed');
    });

    it('timeout still fires when deaths are below threshold', () => {
        const state = stateWithDead(19);
        state.day = 30;
        const network = pairNetwork('infected', 'healthy');
        expect(checkGameOver(state, network, 30)).toBe('timeout');
    });
});

describe('protected nodes stay visible and block spread', () => {
    it('a quarantined infected node cannot infect its contacts', () => {
        const state = initGameState(tools);
        const network = pairNetwork('quarantined', 'healthy');
        const { count } = simulateSpread(state, network, 1.0, always);
        expect(count).toBe(0);
        expect(network.nodes[1].state).toBe('healthy');
        // The quarantined node stays in the network (not removed).
        expect(network.nodes).toHaveLength(2);
    });

    it('a quarantined healthy node cannot become infected', () => {
        const state = initGameState(tools);
        const network = pairNetwork('infected', 'quarantined');
        const { count } = simulateSpread(state, network, 1.0, always);
        expect(count).toBe(0);
        expect(network.nodes[1].state).toBe('quarantined');
        expect(network.nodes).toHaveLength(2);
    });

    it('a vaccinated node stays immune', () => {
        const state = initGameState(tools);
        const network = pairNetwork('infected', 'vaccinated');
        const { count } = simulateSpread(state, network, 1.0, always);
        expect(count).toBe(0);
        expect(network.nodes[1].state).toBe('vaccinated');
    });

    it('sanity: an unprotected healthy contact still gets infected', () => {
        const state = initGameState(tools);
        const network = pairNetwork('infected', 'healthy');
        const { count } = simulateSpread(state, network, 1.0, always);
        expect(count).toBe(1);
        expect(network.nodes[1].state).toBe('infected');
    });
});

describe('real pause gate', () => {
    it('blocks day advance when paused', () => {
        const state = initGameState(tools);
        state.paused = true;
        expect(canAdvanceDay(state)).toBe(false);
    });

    it('blocks day advance when the game is over', () => {
        const state = initGameState(tools);
        state.gameOver = true;
        expect(canAdvanceDay(state)).toBe(false);
    });

    it('allows day advance in normal play', () => {
        const state = initGameState(tools);
        expect(canAdvanceDay(state)).toBe(true);
    });

    it('initGameState starts with outcome null', () => {
        const state = initGameState(tools);
        expect(state.outcome).toBeNull();
        expect(state.paused).toBe(false);
    });
});
