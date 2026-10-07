// Engine unit tests: sim math only (src/sim/*). No DOM, no D3, node environment.
import { describe, it, expect } from 'vitest';
import {
    simulateSpread,
    updateOutcomes,
    checkGameOver,
    canUseTool,
    toolDailyLimit,
} from '../src/sim/engine.js';
import { initGameState } from '../src/sim/state.js';
import {
    generateScaleFreeNetwork,
    generateSmallWorldNetwork,
    generateRandomNetwork,
    generateNetwork,
} from '../src/sim/network.js';
import { difficulties } from '../src/config/difficulties.js';
import { tools } from '../src/config/tools.js';

// rng stubs: () => 0 always rolls under any positive probability; () => 1 never rolls under p < 1.
const always = () => 0;
const never = () => 1;

// Small chain network: 0 - 1 - 2 - 3 - 4, node 0 infected.
// Uses object link refs, like D3's forceLink produces after init.
function chainNetwork(infectedIds = [0]) {
    const nodes = [0, 1, 2, 3, 4].map((id) => ({
        id,
        state: infectedIds.includes(id) ? 'infected' : 'healthy',
        daysInfected: 0,
        removed: false,
    }));
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const links = [
        [0, 1],
        [1, 2],
        [2, 3],
        [3, 4],
    ].map(([a, b]) => ({ source: byId.get(a), target: byId.get(b) }));
    return { nodes, links };
}

function freshState() {
    const state = initGameState(tools);
    state.day = 5; // past all tool day-gates
    return state;
}

describe('simulateSpread', () => {
    it('infects nothing at zero transmission rate', () => {
        const state = freshState();
        const network = chainNetwork();
        const { events, count } = simulateSpread(state, network, 0, always);
        expect(count).toBe(0);
        expect(events).toEqual([]);
        expect(network.nodes.filter((n) => n.state === 'infected')).toHaveLength(1);
        expect(state.stats.totalInfected).toBe(0);
    });

    it('infects every healthy neighbor at rate 1', () => {
        const state = freshState();
        const network = chainNetwork();
        const { events, count } = simulateSpread(state, network, 1, always);
        // Only node 1 touches node 0, and the spreader set is snapshotted before the pass.
        expect(count).toBe(1);
        expect(events[0].target.id).toBe(1);
        expect(state.stats.totalInfected).toBe(1);
    });

    it('spreads across multiple links from one infected node', () => {
        const state = freshState();
        const nodes = [0, 1, 2].map((id) => ({
            id,
            state: id === 0 ? 'infected' : 'healthy',
            daysInfected: 0,
            removed: false,
        }));
        const byId = new Map(nodes.map((n) => [n.id, n]));
        const network = {
            nodes,
            links: [
                { source: byId.get(0), target: byId.get(1) },
                { source: byId.get(0), target: byId.get(2) },
            ],
        };
        const { count } = simulateSpread(state, network, 1, always);
        expect(count).toBe(2);
        expect(state.stats.totalInfected).toBe(2);
    });

    it('never infects non-healthy nodes', () => {
        const state = freshState();
        const network = chainNetwork();
        network.nodes[1].state = 'recovered';
        network.nodes[2].state = 'vaccinated';
        const { count } = simulateSpread(state, network, 1, always);
        expect(count).toBe(0);
    });

    it('increments daysInfected for all infected, including the newly infected', () => {
        const state = freshState();
        const network = chainNetwork();
        network.nodes[0].daysInfected = 3;
        simulateSpread(state, network, 1, always);
        expect(network.nodes[0].daysInfected).toBe(4);
        expect(network.nodes[1].daysInfected).toBe(1);
        expect(network.nodes[2].daysInfected).toBe(0);
    });

    it('handles numeric link refs (pre-forceLink shape)', () => {
        const state = freshState();
        const nodes = [0, 1].map((id) => ({
            id,
            state: id === 0 ? 'infected' : 'healthy',
            daysInfected: 0,
            removed: false,
        }));
        const { count } = simulateSpread(state, { nodes, links: [{ source: 0, target: 1 }] }, 1, always);
        expect(count).toBe(1);
    });
});

describe('updateOutcomes', () => {
    function sickNetwork(daysInfected = 7) {
        const nodes = [0, 1, 2].map((id) => ({ id, state: 'infected', daysInfected, removed: false }));
        const byId = new Map(nodes.map((n) => [n.id, n]));
        return { nodes, links: [{ source: byId.get(0), target: byId.get(1) }] };
    }

    it('recovers everyone at zero fatality rate', () => {
        const state = freshState();
        const network = sickNetwork();
        const outcomes = updateOutcomes(state, network, 7, 0, always);
        expect(outcomes).toHaveLength(3);
        expect(outcomes.every((o) => o.outcome === 'recovered')).toBe(true);
        expect(state.stats.totalRecovered).toBe(3);
        expect(state.stats.totalDead).toBe(0);
        // Recovered nodes stay in the network.
        expect(network.nodes).toHaveLength(3);
        expect(network.nodes.every((n) => n.state === 'recovered')).toBe(true);
    });

    it('kills everyone at fatality rate 1 and removes them from the network', () => {
        const state = freshState();
        const network = sickNetwork();
        const outcomes = updateOutcomes(state, network, 7, 1, always);
        expect(outcomes.every((o) => o.outcome === 'died')).toBe(true);
        expect(state.stats.totalDead).toBe(3);
        expect(state.stats.totalRecovered).toBe(0);
        expect(network.nodes).toHaveLength(0);
        expect(network.links).toHaveLength(0);
    });

    it('leaves nodes alone before their recovery time', () => {
        const state = freshState();
        const network = sickNetwork(3); // medium recoveryTime is 7
        const outcomes = updateOutcomes(state, network, 7, 1, never);
        expect(outcomes).toHaveLength(0);
        expect(network.nodes).toHaveLength(3);
        expect(state.stats.totalDead).toBe(0);
    });

    it('mixed rolls split deaths and recoveries', () => {
        const state = freshState();
        const network = sickNetwork();
        const rolls = [0.01, 0.99, 0.02]; // fatality 0.03: die, live, die
        let i = 0;
        const outcomes = updateOutcomes(state, network, 7, 0.03, () => rolls[i++]);
        expect(outcomes.filter((o) => o.outcome === 'died')).toHaveLength(2);
        expect(outcomes.filter((o) => o.outcome === 'recovered')).toHaveLength(1);
        expect(state.stats.totalDead).toBe(2);
        expect(state.stats.totalRecovered).toBe(1);
    });
});

describe('checkGameOver', () => {
    it('returns contained when no active infections remain (win)', () => {
        const state = freshState();
        const network = chainNetwork([]);
        expect(checkGameOver(state, network, 14)).toBe('contained');
    });

    it('returns timeout when the day reaches the scenario duration', () => {
        const state = freshState();
        state.day = 14;
        const network = chainNetwork([0, 2]);
        expect(checkGameOver(state, network, 14)).toBe('timeout');
    });

    it('returns null while infections remain and time is left', () => {
        const state = freshState();
        state.day = 5;
        const network = chainNetwork([1]);
        expect(checkGameOver(state, network, 14)).toBeNull();
    });

    it('win takes precedence over timeout on the final day', () => {
        const state = freshState();
        state.day = 14;
        const network = chainNetwork([]);
        expect(checkGameOver(state, network, 14)).toBe('contained');
    });
});

describe('toolDailyLimit', () => {
    it('floors base limit times the difficulty multiplier', () => {
        expect(toolDailyLimit(tools.vaccinate, difficulties.easy)).toBe(7); // 5 * 1.5
        expect(toolDailyLimit(tools.vaccinate, difficulties.medium)).toBe(5); // 5 * 1.0
        expect(toolDailyLimit(tools.vaccinate, difficulties.hard)).toBe(3); // 5 * 0.7 floored
        expect(toolDailyLimit(tools.quarantine, difficulties.easy)).toBe(4); // 3 * 1.5 floored
        expect(toolDailyLimit(tools.severLink, difficulties.hard)).toBe(2); // 3 * 0.7 floored
    });
});

describe('canUseTool', () => {
    const node = (stateName, id = 0) => ({ id, state: stateName, daysInfected: 0, removed: false });

    it('blocks tools before their available day', () => {
        const state = initGameState(tools); // day 1
        const r = canUseTool(state, tools, 'vaccinate', difficulties.medium, node('healthy'));
        expect(r.allowed).toBe(false);
        expect(r.reason).toBe('💉 Vaccinate available on Day 2.');
    });

    it('blocks when the daily limit is reached', () => {
        const state = freshState();
        state.dailyUsage.vaccinate = 5;
        const r = canUseTool(state, tools, 'vaccinate', difficulties.medium, node('healthy'));
        expect(r.allowed).toBe(false);
        expect(r.reason).toBe('Daily limit for 💉 Vaccinate reached.');
    });

    it('respects the difficulty multiplier on the limit', () => {
        const state = freshState();
        state.dailyUsage.vaccinate = 5; // at the medium cap, under the easy cap of 7
        expect(canUseTool(state, tools, 'vaccinate', difficulties.easy, node('healthy')).allowed).toBe(true);
        expect(canUseTool(state, tools, 'vaccinate', difficulties.medium, node('healthy')).allowed).toBe(false);
    });

    it('blocks once-per-person reuse', () => {
        const state = freshState();
        state.usedOnPeople.add('vaccinate-3');
        const r = canUseTool(state, tools, 'vaccinate', difficulties.medium, node('healthy', 3));
        expect(r.allowed).toBe(false);
        expect(r.reason).toBe('💉 Vaccinate already used on this person.');
    });

    it('blocks vaccinating non-healthy people with the original message', () => {
        const state = freshState();
        const r = canUseTool(state, tools, 'vaccinate', difficulties.medium, node('infected'));
        expect(r.allowed).toBe(false);
        expect(r.reason).toBe('Vaccine only works on healthy individuals.');
    });

    it('blocks already-protected people', () => {
        const state = freshState();
        const r = canUseTool(state, tools, 'quarantine', difficulties.medium, node('vaccinated'));
        expect(r.allowed).toBe(false);
        expect(r.reason).toBe('Person is already protected.');
    });

    it('allows quarantine on healthy, infected, and recovered nodes', () => {
        const state = freshState();
        for (const s of ['healthy', 'infected', 'recovered']) {
            expect(canUseTool(state, tools, 'quarantine', difficulties.medium, node(s)).allowed).toBe(true);
        }
    });

    it('allows severLink without a target node', () => {
        const state = freshState();
        expect(canUseTool(state, tools, 'severLink', difficulties.medium).allowed).toBe(true);
    });
});

describe('initGameState', () => {
    it('builds a fresh per-run state object', () => {
        const state = initGameState(tools);
        expect(state.day).toBe(1);
        expect(state.paused).toBe(false);
        expect(state.gameOver).toBe(false);
        expect(state.dailyUsage).toEqual({ vaccinate: 0, quarantine: 0, severLink: 0 });
        expect(state.usedOnPeople).toBeInstanceOf(Set);
        expect(state.stats.initialPopulation).toBe(100);
        expect(state).not.toHaveProperty('log');
    });
});

describe('network generators', () => {
    it('scale-free attaches each new node to m=4 earlier nodes', () => {
        const { links } = generateScaleFreeNetwork(100, 4);
        expect(links).toHaveLength((100 - 4) * 4);
        for (const l of links) {
            expect(l.target).toBeLessThan(l.source);
        }
    });

    it('small-world builds a ring lattice with k=8 neighbors', () => {
        const { links } = generateSmallWorldNetwork(100, 8, 0);
        expect(links).toHaveLength(100 * 4);
    });

    it('random returns no links at p=0 and valid ids at p=0.08', () => {
        expect(generateRandomNetwork(100, 0).links).toHaveLength(0);
        const { links } = generateRandomNetwork(100, 0.08);
        expect(links.length).toBeGreaterThan(0);
        for (const l of links) {
            expect(l.source).toBeLessThan(l.target);
            expect(l.target).toBeLessThan(100);
        }
    });

    it('generateNetwork dispatches on scenario network type', () => {
        expect(generateNetwork('scale-free', 100).links).toHaveLength((100 - 4) * 4);
        expect(generateNetwork('small-world', 100).links).toHaveLength(100 * 4);
        expect(generateNetwork('random', 100).links.length).toBeGreaterThan(0);
        expect(generateNetwork('unknown-type', 100).links.length).toBeGreaterThan(0);
    });
});
