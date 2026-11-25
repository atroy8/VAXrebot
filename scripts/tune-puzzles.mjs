// Puzzle tuner and report (round 57).
//
//   node scripts/tune-puzzles.mjs                 report every level
//   node scripts/tune-puzzles.mjs report 60       report with 60 deals per level
//   node scripts/tune-puzzles.mjs tune            search tool counts for every
//                                                 level and write src/config/puzzle-tuning.js
//   node scripts/tune-puzzles.mjs tune mizuho-3 hanabi   only these levels or planets
//
// The report prints, for every level: the dealer's accept rate (share of
// candidate webs that pass the level's puzzle spec), mean time to deal and
// to solve one web, par cases and days, how deep the best play is, the share
// of simple plays (tools on red lines in any order) that reach 3 stars, and
// the win rates of the bots. See src/sim/puzzle-lab.js for the numbers.
import { writeFileSync, readFileSync } from 'node:fs';
import { LEVELS, REGIONS } from '../src/config/levels.js';
import { levelReport, tuneLevel, formatRow, REPORT_HEAD, planetSummary } from '../src/sim/puzzle-lab.js';
import { PUZZLE_TUNING } from '../src/config/puzzle-tuning.js';

const [mode = 'report', ...rest] = process.argv.slice(2);

const TABLE = new URL('../src/config/puzzle-tuning.js', import.meta.url);
function writeTable(table) {
    const body = LEVELS.filter((l) => table[l.id]).map((l) => `    '${l.id}': ${JSON.stringify(table[l.id]).replace(/"([a-zA-Z]+)":/g, '$1: ').replace(/,/g, ', ').replace(/\{/g, '{ ').replace(/\}/g, ' }')},`);
    writeFileSync(TABLE, `// Written by scripts/tune-puzzles.mjs. Do not edit by hand: rerun the script.\n// Per level: first cases, uses per day of each tool, and any tool day or\n// spec number the tuner moved (see src/config/puzzle-specs.js).\nexport const PUZZLE_TUNING = {\n${body.join('\n')}\n};\n`);
}

if (mode === 'tune') {
    // TUNE_PART=file: write this run's picks there as JSON instead of the
    // table, so planets can be tuned side by side and merged afterwards
    // (node scripts/tune-puzzles.mjs merge part1.json part2.json ...).
    const part = process.env.TUNE_PART || null;
    const wanted = rest.filter((x) => !/^\d+$/.test(x));
    const table = part ? {} : { ...PUZZLE_TUNING };
    const levels = LEVELS.filter((l) => !wanted.length || wanted.includes(l.id) || wanted.includes(l.regionId));
    for (const level of levels) {
        const t0 = Date.now();
        const pick = tuneLevel(level);
        if (pick) table[level.id] = pick.tuning;
        console.log(`${level.id.padEnd(12)} ${pick ? JSON.stringify(pick.tuning) : 'kept (hand set)'}  ${pick ? pick.note : ''}  ${((Date.now() - t0) / 1000).toFixed(1)}s`);
        if (part) writeFileSync(part, JSON.stringify(table));
        else writeTable(table);
    }
} else if (mode === 'merge') {
    const table = { ...PUZZLE_TUNING };
    for (const file of rest) Object.assign(table, JSON.parse(readFileSync(file, 'utf8')));
    writeTable(table);
    console.log(`merged ${rest.length} files, ${Object.keys(table).length} levels`);
} else {
    const deals = Number(rest.find((x) => /^\d+$/.test(x))) || 40;
    const wanted = rest.filter((x) => !/^\d+$/.test(x));
    console.log(`Puzzle report, ${deals} deals per level\n`);
    for (const region of REGIONS) {
        const levels = LEVELS.filter((l) => l.regionId === region.id && (!wanted.length || wanted.includes(l.id) || wanted.includes(l.regionId)));
        if (!levels.length) continue;
        console.log(`=== ${region.name} ===`);
        console.log(REPORT_HEAD);
        const rows = levels.map((l) => levelReport(l, { deals }));
        for (const row of rows) console.log(formatRow(row));
        console.log(planetSummary(rows));
        console.log('');
    }
}
