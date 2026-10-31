// Renders the ArtCraft reference sheets in art/reference/ (npm run art:guides).
import sharp from 'sharp';
import { tokenSvg, stateSheetSvg, STATE_GUIDE } from '../art/reference/citizen-guide.mjs';

const out = new URL('../art/reference/', import.meta.url);
await sharp(Buffer.from(tokenSvg('healthy'))).png().toFile(new URL('citizen-guide.png', out).pathname);
await sharp(Buffer.from(stateSheetSvg())).png().toFile(new URL('state-guide.png', out).pathname);
for (const s of Object.keys(STATE_GUIDE)) {
    await sharp(Buffer.from(tokenSvg(s))).resize(512).png().toFile(new URL(`guide-${s}.png`, out).pathname);
}
console.log('Wrote art/reference/citizen-guide.png, state-guide.png and guide-<state>.png');
