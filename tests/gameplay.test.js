// Gameplay tests: failure state, protected-node spread rules, and the real
// pause gate. Sim math only (src/sim/*). No DOM, no D3, node environment.
import { describe, it, expect } from 'vitest';
import {
    simulateSpread,
    updateOutcomes,
    checkGameOver,
    canAdvanceDay,
    OVERWHELMED_DEATH_FRACTION,
    OVERWHELMED_DEATH_FLOOR,
} from '../src/sim/engine.js';
import { initGameState } from '../src/sim/state.js';
import { tools } from '../src/config/tools.js';
import { scenarios } from '../src/config/scenarios.js';

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
    it('returns overwhelmed when deaths reach 8% of the initial population', () => {
        const state = stateWithDead(8);
        const network = pairNetwork('infected', 'healthy');
        expect(checkGameOver(state, network, 30)).toBe('overwhelmed');
    });

    it('stays null just under the threshold (7 of 100)', () => {
        const state = stateWithDead(7);
        const network = pairNetwork('infected', 'healthy');
        expect(checkGameOver(state, network, 30)).toBeNull();
    });

    it('exposes the 8% threshold as a named constant', () => {
        expect(OVERWHELMED_DEATH_FRACTION).toBe(0.08);
    });

    it('applies a 5-death floor for small populations (5 of 40 overwhelms)', () => {
        const state = stateWithDead(5);
        state.stats.initialPopulation = 40; // 8% of 40 is 3.2, floor wins
        const network = pairNetwork('infected', 'healthy');
        expect(checkGameOver(state, network, 30)).toBe('overwhelmed');
    });

    it('stays null under the floor (4 of 40)', () => {
        const state = stateWithDead(4);
        state.stats.initialPopulation = 40;
        const network = pairNetwork('infected', 'healthy');
        expect(checkGameOver(state, network, 30)).toBeNull();
    });

    it('exposes the death floor as a named constant', () => {
        expect(OVERWHELMED_DEATH_FLOOR).toBe(5);
    });

    it('precedence: contained beats overwhelmed', () => {
        const state = stateWithDead(8);
        state.stats.totalProtected = 4; // player intervened, so this is a real win
        const network = pairNetwork('healthy', 'healthy'); // no active infected
        expect(checkGameOver(state, network, 30)).toBe('contained');
    });

    it('precedence: overwhelmed beats timeout', () => {
        const state = stateWithDead(8);
        state.day = 30; // at the clock
        const network = pairNetwork('infected', 'healthy'); // still spreading
        expect(checkGameOver(state, network, 30)).toBe('overwhelmed');
    });

    it('timeout still fires when deaths are below threshold', () => {
        const state = stateWithDead(7);
        state.day = 30;
        const network = pairNetwork('infected', 'healthy');
        expect(checkGameOver(state, network, 30)).toBe('timeout');
    });
});

describe('quarantined sick nodes stay sick (exploit regression)', () => {
    // A quarantined node that was infected when isolated: ticks daysInfected,
    // resolves via updateOutcomes, and counts as active until resolved.
    function sickQuarantineNetwork() {
        const nodes = [
            { id: 0, state: 'quarantined', sickWhileQuarantined: true, daysInfected: 0, removed: false },
            { id: 1, state: 'healthy', daysInfected: 0, removed: false },
        ];
        const links = [{ source: nodes[0], target: nodes[1] }];
        return { nodes, links };
    }

    it('quarantining every infected node does NOT win the game', () => {
        const state = initGameState(tools);
        const network = sickQuarantineNetwork();
        // No plain 'infected' nodes left, but the quarantined-sick one is active.
        expect(checkGameOver(state, network, 30)).toBeNull();
    });

    it('a quarantined sick node still ticks daysInfected', () => {
        const state = initGameState(tools);
        const network = sickQuarantineNetwork();
        simulateSpread(state, network, 0, always);
        expect(network.nodes[0].daysInfected).toBe(1);
    });

    it('a quarantined sick node resolves (dies with fatality 1)', () => {
        const state = initGameState(tools);
        const network = sickQuarantineNetwork();
        network.nodes[0].daysInfected = 7;
        const outcomes = updateOutcomes(state, network, 7, 1.0, always);
        expect(outcomes).toHaveLength(1);
        expect(outcomes[0].outcome).toBe('died');
        expect(state.stats.totalDead).toBe(1);
    });

    it('a quarantined sick node resolves (recovers with fatality 0)', () => {
        const state = initGameState(tools);
        const network = sickQuarantineNetwork();
        network.nodes[0].daysInfected = 7;
        const outcomes = updateOutcomes(state, network, 7, 0.0, always);
        expect(outcomes).toHaveLength(1);
        expect(outcomes[0].outcome).toBe('recovered');
        expect(network.nodes[0].state).toBe('recovered');
        expect(network.nodes[0].sickWhileQuarantined).toBe(false);
    });

    it('a quarantined HEALTHY node never ticks or resolves', () => {
        const state = initGameState(tools);
        const network = pairNetwork('infected', 'quarantined');
        simulateSpread(state, network, 0, always);
        expect(network.nodes[1].daysInfected).toBe(0);
        const outcomes = updateOutcomes(state, network, 0, 1.0, always);
        // Only node 0 (infected, daysInfected 1 >= recoveryTime 0) resolves.
        expect(outcomes.map((o) => o.node.id)).toEqual([0]);
    });
});

describe('variable populations', () => {
    it('initGameState accepts a custom population', () => {
        const state = initGameState(tools, 60);
        expect(state.stats.initialPopulation).toBe(60);
    });

    it('initGameState defaults to 100 when no population given', () => {
        const state = initGameState(tools);
        expect(state.stats.initialPopulation).toBe(100);
    });

    it('every scenario defines a sane population range', () => {
        for (const [id, s] of Object.entries(scenarios)) {
            expect(Array.isArray(s.populationRange), `${id} has a range`).toBe(true);
            const [lo, hi] = s.populationRange;
            expect(lo, `${id} min`).toBeGreaterThanOrEqual(20);
            expect(hi, `${id} max`).toBeGreaterThan(lo);
        }
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
