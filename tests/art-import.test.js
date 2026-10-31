// Art pipeline: ArtCraft picks in art/inbox/ become game-ready faces and
// prologue paintings (scripts/art-import-lib.mjs, art/ARTCRAFT.md).
import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { readdirSync, existsSync } from 'node:fs';
import { classifyInboxName, processFace, processPrologue, contactSheet, FACE_FRAMES, FACE_SIZE, PROLOGUE_SIZE, PROLOGUE_MAX_BYTES } from '../scripts/art-import-lib.mjs';
import { tokenSvg, STATE_GUIDE } from '../art/reference/citizen-guide.mjs';

const svg = (s) => Buffer.from(s);
// A guide token drawn off-centre on a slightly off-white, noisy-free canvas,
// the way a generator might frame it.
async function render(state = 'healthy', { shiftX = 0, bg = '#fdfcf9', size = 1024 } = {}) {
    const token = await sharp(svg(tokenSvg(state).replace('fill="#ffffff"/>', 'fill="none"/>'))).resize(820).png().toBuffer();
    return sharp({ create: { width: size, height: size, channels: 4, background: bg } })
        .composite([{ input: token, left: 102 + shiftX, top: 90 }])
        .png()
        .toBuffer();
}
const alphaAt = async (buf, x, y) => {
    const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
    return data[(y * info.width + x) * 4 + 3];
};

describe('inbox names', () => {
    it('maps faces and prologue files to the paths the game loads', () => {
        expect(classifyInboxName('faces-infected-cough.png')).toMatchObject({ kind: 'face', out: 'src/assets/faces/infected/cough.png' });
        expect(classifyInboxName('faces-healthy-reaction.jpg').out).toBe('src/assets/faces/healthy/reaction.png');
        expect(classifyInboxName('prologue-peace.png')).toMatchObject({ kind: 'prologue', out: 'src/assets/prologue/peace.webp' });
    });
    it('rejects names the game would never load, with a reason', () => {
        expect(classifyInboxName('faces-healthy-cough.png').error).toMatch(/idle, blink, reaction/);
        expect(classifyInboxName('faces-zombie-idle.png').error).toMatch(/unknown state/);
        expect(classifyInboxName('prologue-ending.png').error).toMatch(/unknown story card/);
        expect(classifyInboxName('IMG_0042.png').error).toMatch(/name it/);
        expect(classifyInboxName('notes.txt').error).toMatch(/not an image/);
    });
    it('covers exactly the 21 frames the renderer loads', () => {
        const n = Object.values(FACE_FRAMES).reduce((a, f) => a + f.length, 0);
        expect(n).toBe(21);
        for (const [state, frames] of Object.entries(FACE_FRAMES)) {
            for (const f of frames) expect(existsSync(new URL(`../src/assets/faces/${state}/${f}.png`, import.meta.url)), `${state}/${f}`).toBe(true);
        }
    });
});

describe('face processing', () => {
    it('cuts the token out: square, transparent corners, opaque centre and rim', async () => {
        const out = await processFace(await render('healthy', { shiftX: 40 }));
        const meta = await sharp(out).metadata();
        expect([meta.width, meta.height, meta.channels]).toEqual([FACE_SIZE, FACE_SIZE, 4]);
        expect(await alphaAt(out, 2, 2)).toBe(0);
        expect(await alphaAt(out, FACE_SIZE - 3, FACE_SIZE - 3)).toBe(0);
        expect(await alphaAt(out, FACE_SIZE / 2, FACE_SIZE / 2)).toBe(255);
        expect(await alphaAt(out, FACE_SIZE / 2, 4)).toBeGreaterThan(200); // the gold rim reaches the edge
    });
    it('keeps white details inside the ring (the quarantine mask)', async () => {
        const out = await processFace(await render('quarantined'));
        // mask sits around 55% down the token
        expect(await alphaAt(out, FACE_SIZE / 2, Math.round(FACE_SIZE * 0.56))).toBe(255);
    });
    it('works for every state guide', async () => {
        for (const s of Object.keys(STATE_GUIDE)) await expect(processFace(await render(s))).resolves.toBeInstanceOf(Buffer);
    });
    it('rejects pictures that are not one round token', async () => {
        const wide = await sharp({ create: { width: 1024, height: 1024, channels: 4, background: '#ffffff' } })
            .composite([{ input: await sharp({ create: { width: 800, height: 300, channels: 4, background: '#cc3344' } }).png().toBuffer(), left: 100, top: 360 }])
            .png().toBuffer();
        await expect(processFace(wide)).rejects.toThrow(/not round/);
        const blank = await sharp({ create: { width: 512, height: 512, channels: 4, background: '#ffffff' } }).png().toBuffer();
        await expect(processFace(blank)).rejects.toThrow(/nothing left/);
        const square = await sharp({ create: { width: 1024, height: 1024, channels: 4, background: '#ffffff' } })
            .composite([{ input: await sharp({ create: { width: 800, height: 800, channels: 4, background: '#3366cc' } }).png().toBuffer(), left: 112, top: 112 }])
            .png().toBuffer();
        await expect(processFace(square)).rejects.toThrow(/fill a circle/);
    });
});

describe('prologue processing', () => {
    it('makes a square WebP inside the byte budget', async () => {
        const painting = await sharp(svg(`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1280"><defs><radialGradient id="g"><stop offset="0" stop-color="#ecd27e"/><stop offset="1" stop-color="#051230"/></radialGradient></defs><rect width="1024" height="1280" fill="url(#g)"/>${Array.from({ length: 300 }, (_, i) => `<circle cx="${(i * 97) % 1024}" cy="${(i * 211) % 1280}" r="${2 + (i % 5)}" fill="#fff"/>`).join('')}</svg>`)).png().toBuffer();
        const { buffer } = await processPrologue(painting);
        const meta = await sharp(buffer).metadata();
        expect(meta.format).toBe('webp');
        expect([meta.width, meta.height]).toEqual([PROLOGUE_SIZE, PROLOGUE_SIZE]);
        expect(buffer.length).toBeLessThanOrEqual(PROLOGUE_MAX_BYTES);
    });
});

describe('contact sheet', () => {
    it('renders faces at 96 px and at 44 px', async () => {
        const face = await processFace(await render('infected'));
        const sheet = await contactSheet({ 'infected/idle': face });
        const meta = await sharp(sheet).metadata();
        expect(meta.width).toBeGreaterThan(500);
    });
});

describe('repo hygiene', () => {
    it('raw inbox renders are not committed', () => {
        const ignore = readdirSync(new URL('..', import.meta.url)).includes('.gitignore');
        expect(ignore).toBe(true);
    });
});
