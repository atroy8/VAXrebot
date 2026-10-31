// npm run art:draw: draws the vector citizens and prologue paintings
// (art/source/*.mjs), saves editable SVGs to art/source/svg/ (open them in
// VectorCraft to refine), and renders 1024 px PNGs into art/inbox/ named the
// way `npm run art:import` expects. Pass --only=<name-prefix> to redraw some.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { citizenSvg, FRAMES } from '../art/source/citizens.mjs';
import { paintingSvg, PAINTINGS } from '../art/source/prologue.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const svgDir = join(root, 'art/source/svg');
const inbox = join(root, 'art/inbox');
mkdirSync(svgDir, { recursive: true });
mkdirSync(inbox, { recursive: true });
const only = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7);

const jobs = [];
for (const [state, frames] of Object.entries(FRAMES)) {
    for (const frame of frames) jobs.push({ name: `faces-${state}-${frame}`, svg: citizenSvg(state, frame) });
}
for (const card of Object.keys(PAINTINGS)) jobs.push({ name: `prologue-${card}`, svg: paintingSvg(card) });

let n = 0;
for (const { name, svg } of jobs) {
    if (only && !name.startsWith(only)) continue;
    writeFileSync(join(svgDir, `${name}.svg`), svg);
    await sharp(Buffer.from(svg), { density: 72 }).resize(1024, 1024).png().toFile(join(inbox, `${name}.png`));
    n++;
}
console.log(`Drew ${n} images: SVGs in art/source/svg/, PNGs in art/inbox/. Next: npm run art:import`);
