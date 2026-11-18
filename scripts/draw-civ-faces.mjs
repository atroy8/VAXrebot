// npm run art:civ (item 29 c): draws the citizens of every civilization on
// the journey (art/source/citizens.mjs OUTFITS) and writes game-ready 192 px
// palette PNGs to src/assets/faces-civ/<civ>/<state>-<frame>.png, through
// the same cut-out and checks as npm run art:import. Japan keeps the original
// set in src/assets/faces/, so it is skipped here.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { citizenSvg, FRAMES, CIV_IDS } from '../art/source/citizens.mjs';
import { processFace } from './art-import-lib.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let n = 0, bytes = 0;
for (const civ of CIV_IDS) {
    if (civ === 'japan') continue;
    const dir = join(root, 'src/assets/faces-civ', civ);
    mkdirSync(dir, { recursive: true });
    for (const [state, frames] of Object.entries(FRAMES)) {
        for (const frame of frames) {
            const png = await sharp(Buffer.from(citizenSvg(state, frame, { civ })), { density: 72 }).resize(1024, 1024).png().toBuffer();
            const out = await processFace(png);
            writeFileSync(join(dir, `${state}-${frame}.png`), out);
            n++;
            bytes += out.length;
        }
    }
}
console.log(`Wrote ${n} citizen frames to src/assets/faces-civ/ (${Math.round(bytes / 1024)} kB).`);
