// Dev tool: `node scripts/r0-table.mjs` prints the briefing's "R0 here" for
// every level and the average per planet, worked out the same way the game
// does (src/sim/r0.js, with the level's rolled rules at a middling threat).
// Use it after a retune to check that R0 climbs from the third planet on.
import { LEVELS, REGIONS } from '../src/config/levels.js';
import { rollLevelRules } from '../src/config/difficulty-roll.js';
import { levelR0Range, formatR0 } from '../src/sim/r0.js';
import { mulberry32 } from '../src/sim/balance.js';

export function levelR0(level, samples = 60) {
    const { scenario, difficulty } = rollLevelRules(level, () => 0.5);
    const r = levelR0Range({
        networkType: scenario.networkType,
        populationRange: scenario.populationRange,
        transmissionRate: scenario.baseTransmissionRate * difficulty.transmissionMultiplier,
        recoveryTime: difficulty.recoveryTime,
        rules: difficulty,
        degree: scenario.webDegree,
        samples,
        rng: mulberry32(7),
    });
    return { ...r, mid: (r.lo + r.hi) / 2, text: formatR0(r.lo, r.hi) };
}

export function planetR0(regionId) {
    const mids = LEVELS.filter((l) => l.regionId === regionId).map((l) => levelR0(l).mid);
    return mids.reduce((a, b) => a + b, 0) / mids.length;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
    for (const region of REGIONS) {
        const levels = LEVELS.filter((l) => l.regionId === region.id);
        console.log(`${region.name.padEnd(9)} R0 here, average ${planetR0(region.id).toFixed(2)}   ${levels.map((l) => levelR0(l).mid.toFixed(1)).join(' ')}`);
    }
}
