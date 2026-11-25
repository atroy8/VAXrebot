import { describe, it, expect } from 'vitest';

import { moveReason as reasonForMerge, hintLine as lineForMerge } from '../src/sim/hint.js';
describe('hints name the later planet tools (merge fix)', () => {
    it('says test and mask, never vaccinate, for those moves', () => {
        const network = { nodes: [{ id: 0, state: 'infected' }, { id: 1, state: 'healthy' }], links: [{ source: 0, target: 1 }] };
        const mk = (toolId, id) => ({ toolId, node: network.nodes[id] });
        expect(lineForMerge({ reason: reasonForMerge(mk('test', 1), network) })).toMatch(/testing/);
        expect(lineForMerge({ reason: reasonForMerge(mk('mask', 0), network) })).toMatch(/masking this sick/);
        expect(lineForMerge({ reason: reasonForMerge(mk('mask', 1), network) })).toMatch(/masking this person/);
        expect(lineForMerge({ reason: reasonForMerge(mk('vaccinate', 1), network) })).toMatch(/vaccinating/);
    });
});
