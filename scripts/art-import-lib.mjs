// Art import pipeline (pure parts, tested in tests/art-import.test.js).
// Takes ArtCraft picks from art/inbox/ and turns them into game assets:
//   faces-<state>-<frame>.png -> src/assets/faces/<state>/<frame>.png (192 px, transparent outside the ring)
//   prologue-<card>.png       -> src/assets/prologue/<card>.webp (640 px square, at most 160 kB)
import sharp from 'sharp';

export const FACE_SIZE = 192;
export const PROLOGUE_SIZE = 640;
export const PROLOGUE_MAX_BYTES = 160 * 1024;

// Frames the game loads per state (see src/ui/network-view-3d.js REACTION_FRAME).
export const FACE_FRAMES = {
    healthy: ['idle', 'blink', 'reaction'],
    exposed: ['idle', 'blink', 'cough'],
    infected: ['idle', 'blink', 'cough'],
    quarantined: ['idle', 'blink', 'sleepy'],
    vaccinated: ['idle', 'blink', 'happy'],
    recovered: ['idle', 'blink', 'happy'],
    dead: ['idle', 'blink', 'reaction'],
};
export const PROLOGUE_CARD_IDS = ['peace', 'blight', 'dark', 'hope', 'tools', 'begin'];

// What an inbox file is for, or { error } when its name is not one we use.
export function classifyInboxName(name) {
    const base = name.replace(/\.(png|jpe?g|webp)$/i, '');
    if (base === name) return { error: `${name}: not an image (use .png, .jpg or .webp)` };
    let m = base.match(/^faces-([a-z]+)-([a-z]+)$/);
    if (m) {
        const [, state, frame] = m;
        if (!FACE_FRAMES[state]) return { error: `${name}: unknown state "${state}"` };
        if (!FACE_FRAMES[state].includes(frame)) {
            return { error: `${name}: ${state} has frames ${FACE_FRAMES[state].join(', ')}, not "${frame}"` };
        }
        return { kind: 'face', state, frame, out: `src/assets/faces/${state}/${frame}.png` };
    }
    m = base.match(/^prologue-([a-z-]+)$/);
    if (m) {
        if (!PROLOGUE_CARD_IDS.includes(m[1])) return { error: `${name}: unknown story card "${m[1]}"` };
        return { kind: 'prologue', card: m[1], out: `src/assets/prologue/${m[1]}.webp` };
    }
    return { error: `${name}: name it faces-<state>-<frame>.png or prologue-<card>.png` };
}

const dist2 = (d, i, c) => (d[i] - c[0]) ** 2 + (d[i + 1] - c[1]) ** 2 + (d[i + 2] - c[2]) ** 2;

// Median colour of the image border: the flat background ArtCraft painted.
export function borderColor(data, w, h) {
    const rs = [], gs = [], bs = [];
    const take = (x, y) => {
        const i = (y * w + x) * 4;
        rs.push(data[i]); gs.push(data[i + 1]); bs.push(data[i + 2]);
    };
    for (let x = 0; x < w; x += 2) { take(x, 0); take(x, h - 1); }
    for (let y = 0; y < h; y += 2) { take(0, y); take(w - 1, y); }
    const med = (a) => a.sort((p, q) => p - q)[a.length >> 1];
    return [med(rs), med(gs), med(bs)];
}

// Clears every pixel connected to the border that is close to the
// background colour (flood fill, so white highlights inside the token stay).
// Mutates RGBA `data`. Returns the number of cleared pixels.
export function floodClearBackground(data, w, h, tol = 48) {
    const bg = borderColor(data, w, h);
    const t2 = tol * tol;
    const seen = new Uint8Array(w * h);
    const stack = [];
    const push = (x, y) => {
        const p = y * w + x;
        if (seen[p]) return;
        seen[p] = 1;
        if (data[p * 4 + 3] === 0 || dist2(data, p * 4, bg) <= t2) stack.push(p);
    };
    for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
    for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
    let cleared = 0;
    while (stack.length) {
        const p = stack.pop();
        data[p * 4 + 3] = 0;
        cleared++;
        const x = p % w, y = (p / w) | 0;
        if (x > 0) push(x - 1, y);
        if (x < w - 1) push(x + 1, y);
        if (y > 0) push(x, y - 1);
        if (y < h - 1) push(x, y + 1);
    }
    return cleared;
}

// Bounding box of opaque pixels, or null when nothing is left.
export function opaqueBox(data, w, h, minAlpha = 128) {
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            if (data[(y * w + x) * 4 + 3] >= minAlpha) {
                if (x < x0) x0 = x;
                if (x > x1) x1 = x;
                if (y < y0) y0 = y;
                if (y > y1) y1 = y;
            }
        }
    }
    return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

// Cuts a token out of an ArtCraft render and returns a FACE_SIZE PNG buffer
// with a clean anti-aliased round edge. Throws with a plain reason when the
// picture does not look like one round token.
export async function processFace(input, { size = FACE_SIZE } = {}) {
    const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const { width: w, height: h } = info;
    floodClearBackground(data, w, h);
    const box = opaqueBox(data, w, h);
    if (!box) throw new Error('nothing left after removing the background');
    const aspect = box.w / box.h;
    if (aspect < 0.9 || aspect > 1.1) throw new Error(`token is not round (${box.w}x${box.h}); keep the whole ring in frame on a plain background`);
    if (box.w < Math.min(w, h) * 0.4) throw new Error('token is too small in the frame; fill about 85% of the picture');
    // Fill share inside the box: a disc covers about 78.5%.
    let solid = 0;
    for (let y = box.y; y < box.y + box.h; y++) {
        for (let x = box.x; x < box.x + box.w; x++) if (data[(y * w + x) * 4 + 3] >= 128) solid++;
    }
    const fill = solid / (box.w * box.h);
    if (fill < 0.68 || fill > 0.9) throw new Error(`token does not fill a circle (${Math.round(fill * 100)}%); check for stray shapes or a busy background`);
    const side = Math.max(box.w, box.h);
    const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
    const left = Math.round(cx - side / 2), top = Math.round(cy - side / 2);
    // Pad first (sharp runs extract before extend inside one pipeline), so a
    // token touching the edge still gets a full square.
    const padded = await sharp(data, { raw: { width: w, height: h, channels: 4 } })
        .extend({ top: side, bottom: side, left: side, right: side, background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .raw()
        .toBuffer();
    const cut = await sharp(padded, { raw: { width: w + 2 * side, height: h + 2 * side, channels: 4 } })
        .extract({ left: left + side, top: top + side, width: side, height: side })
        .resize(size, size, { kernel: 'lanczos3' })
        .raw()
        .toBuffer();
    // Round mask with a 1 px soft edge, so leftover background in the
    // corners never shows and the rim is smooth at any scale.
    const r = size / 2 - 0.5;
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const d = Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2);
            const k = Math.max(0, Math.min(1, r - d + 0.5));
            const i = (y * size + x) * 4 + 3;
            cut[i] = Math.round(cut[i] * k);
        }
    }
    return sharp(cut, { raw: { width: size, height: size, channels: 4 } }).png({ compressionLevel: 9 }).toBuffer();
}

// Square-crops a painting to PROLOGUE_SIZE WebP, lowering quality until it
// fits the byte budget.
export async function processPrologue(input, { size = PROLOGUE_SIZE, maxBytes = PROLOGUE_MAX_BYTES } = {}) {
    const square = sharp(input).resize(size, size, { fit: 'cover', position: 'attention' });
    for (const quality of [82, 74, 66, 58, 50]) {
        const buf = await square.clone().webp({ quality, effort: 5 }).toBuffer();
        if (buf.length <= maxBytes) return { buffer: buf, quality };
    }
    throw new Error(`painting stays over ${Math.round(maxBytes / 1024)} kB even at quality 50; simplify it`);
}

// Contact sheet: every face at 96 px and at the 44 px minimum, on cream.
export async function contactSheet(faces) {
    const cell = 120;
    const states = Object.keys(FACE_FRAMES);
    const width = cell * 3 + 70 * 3 + 40, height = cell * states.length + 20;
    const comps = [];
    for (const [row, state] of states.entries()) {
        for (const [col, frame] of FACE_FRAMES[state].entries()) {
            const buf = faces[`${state}/${frame}`];
            if (!buf) continue;
            comps.push({ input: await sharp(buf).resize(96).toBuffer(), left: 20 + col * cell, top: 20 + row * cell });
            comps.push({ input: await sharp(buf).resize(44).toBuffer(), left: 20 + 3 * cell + col * 70, top: 46 + row * cell });
        }
    }
    return sharp({ create: { width, height, channels: 4, background: '#f6efe0' } }).composite(comps).png().toBuffer();
}
