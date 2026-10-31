// npm run art:import: turns ArtCraft picks in art/inbox/ into game assets.
// See art/ARTCRAFT.md. Pass --dry to check files without writing.
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyInboxName, processFace, processPrologue, contactSheet, FACE_FRAMES } from './art-import-lib.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const inbox = join(root, 'art/inbox');
const dry = process.argv.includes('--dry');
const names = readdirSync(inbox).filter((n) => !n.startsWith('.') && !/\.(txt|md)$/i.test(n)).sort();
const faces = {};
const problems = [];
let wrote = 0;

for (const name of names) {
    const job = classifyInboxName(name);
    if (job.error) { problems.push(job.error); continue; }
    try {
        const input = readFileSync(join(inbox, name));
        let buf, note = '';
        if (job.kind === 'face') {
            buf = await processFace(input);
            faces[`${job.state}/${job.frame}`] = buf;
        } else {
            const r = await processPrologue(input);
            buf = r.buffer;
            note = ` (quality ${r.quality}, ${Math.round(buf.length / 1024)} kB)`;
        }
        if (!dry) {
            mkdirSync(dirname(join(root, job.out)), { recursive: true });
            writeFileSync(join(root, job.out), buf);
        }
        wrote++;
        console.log(`ok   ${name} -> ${job.out}${note}`);
    } catch (e) {
        problems.push(`${name}: ${e.message}`);
    }
}

const faceCount = Object.keys(faces).length;
if (faceCount) {
    mkdirSync(join(root, 'art/out'), { recursive: true });
    writeFileSync(join(root, 'art/out/contact-sheet.png'), await contactSheet(faces));
    console.log('Contact sheet: art/out/contact-sheet.png');
    const missing = Object.entries(FACE_FRAMES).flatMap(([s, fs]) => fs.map((f) => `${s}/${f}`)).filter((k) => !faces[k]);
    if (missing.length && missing.length < 21) console.log(`Still using old art for: ${missing.join(', ')}`);
}
console.log(`${wrote} processed${dry ? ' (dry run, nothing written)' : ''}, ${problems.length} rejected`);
for (const p of problems) console.log(`skip ${p}`);
process.exitCode = problems.length ? 1 : 0;
