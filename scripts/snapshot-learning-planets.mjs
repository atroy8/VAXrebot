// Dev tool: `node scripts/snapshot-learning-planets.mjs` rewrites
// tests/wide-mechanics-planets12.snapshot.json, the frozen rules and seeded
// bot results of the two learning planets (Mizuho and Hanabi). New mechanics
// start on planet 3, so tests/wide-mechanics-learning-planets.test.js checks
// these levels still compose and play exactly as they did. Rerun this only
// when the learning planets are meant to change.
import { writeFileSync } from 'node:fs';
import { learningPlanetSnapshot } from '../src/sim/learning-snapshot.js';

const out = new URL('../tests/wide-mechanics-planets12.snapshot.json', import.meta.url);
writeFileSync(out, JSON.stringify(learningPlanetSnapshot(), null, 1) + '\n');
console.log(`wrote ${out.pathname}`);
