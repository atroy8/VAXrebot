// Wide audience: a person's state has a SHAPE cue as well as a colour, so
// sick and healthy can be told apart in greyscale and by people who cannot
// tell red from green. Faces are rendered the way the game draws them
// (citizenSvg at phone size) and compared as grey pixels.
import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { citizenSvg, castForLand, seededRandom, STATE_CUES, STATES, FRAMES, LAND_PEOPLE } from '../art/source/citizens.mjs';

const PX = 48; // about the size of a person on a 390 px phone
const PAPER = '#f3ecdc';
const STATE_IDS = Object.keys(STATES);

async function render(state, look, frame = 'idle') {
    const svg = Buffer.from(citizenSvg(state, frame, { look, background: null, size: PX }));
    const grey = await sharp(svg).flatten({ background: PAPER }).greyscale().raw().toBuffer();
    const alpha = await sharp(svg).ensureAlpha().extractChannel(3).raw().toBuffer();
    return { grey, alpha };
}

// Pixel indexes picked by a test on (r, x, y): r = distance from the centre
// as a share of the half size.
function region(pick) {
    const idx = [];
    for (let y = 0; y < PX; y++) {
        for (let x = 0; x < PX; x++) {
            const r = Math.hypot(x + 0.5 - PX / 2, y + 0.5 - PX / 2) / (PX / 2);
            if (pick(r, x, y)) idx.push(y * PX + x);
        }
    }
    return idx;
}
// The gold ring and everything outside it. The enamel ground (the colour)
// ends at 0.797, so nothing in here is the state colour itself.
const RING = region((r) => r >= 0.8 && r <= 1);
// Where the germ badge sits (lower right).
const BADGE = region((r, x, y) => Math.hypot(x + 0.5 - (806 / 1024) * PX, y + 0.5 - (806 / 1024) * PX) <= (124 / 1024) * PX);
// Mean difference between two renders over a region, 0 (same) to 1.
const diff = (a, b, idx) => idx.reduce((s, i) => s + Math.abs(a[i] - b[i]), 0) / idx.length / 255;

const LOOKS = [castForLand('sahel', 10, seededRandom(9))[9], castForLand('japan', 10, seededRandom(3))[3], castForLand('nordic', 10, seededRandom(4))[2]];

describe('every state has its own shape cue', () => {
    it('names a ring, a mark and a ground for every state the faces draw', () => {
        expect(Object.keys(STATE_CUES).sort()).toEqual([...STATE_IDS].sort());
        expect(Object.keys(STATE_CUES).sort()).toEqual(Object.keys(FRAMES).sort());
    });

    it('no two states share a ring treatment, and none share a mark', () => {
        const rings = STATE_IDS.map((s) => STATE_CUES[s].ring);
        const marks = STATE_IDS.map((s) => STATE_CUES[s].mark);
        expect(new Set(rings).size).toBe(STATE_IDS.length);
        expect(new Set(marks).size).toBe(STATE_IDS.length);
    });

    it('healthy is the plain one and sick is the loud one', () => {
        expect(STATE_CUES.healthy).toEqual({ ring: 'plain', mark: 'none', ground: 'waves' });
        expect(STATE_CUES.infected).toEqual({ ring: 'spiked', mark: 'germ', ground: 'rays' });
    });

    it('the drawing carries each cue, in every land and every frame', () => {
        for (const civ of Object.keys(LAND_PEOPLE)) {
            for (const state of STATE_IDS) {
                for (const frame of FRAMES[state]) {
                    const svg = citizenSvg(state, frame, { civ });
                    const ring = STATE_CUES[state].ring;
                    if (ring === 'plain') expect(svg).not.toContain('data-ring=');
                    else expect(svg).toContain(`data-ring="${ring}"`);
                    expect(svg.includes('data-mark="germ"')).toBe(state === 'infected');
                    expect(svg.includes('data-ground="rays"')).toBe(state === 'infected');
                }
            }
        }
        // The marks that were already there stay: mask, shield, leaf, flower, drop.
        expect(citizenSvg('quarantined', 'idle')).toContain('#fbf7ee');
        expect(citizenSvg('vaccinated', 'idle')).toContain('M640 770 l62 -22');
        expect(citizenSvg('recovered', 'idle')).toContain('#5fa84a');
        expect(citizenSvg('dead', 'idle')).toContain('translate(512 800)');
        expect(citizenSvg('exposed', 'idle')).toContain('#7cc4f0');
    });

    it('a healthy face is drawn exactly as before', () => {
        const svg = citizenSvg('healthy', 'idle');
        expect(svg).toContain('stroke="url(#goldRing)" stroke-width="38"');
        expect(svg).not.toMatch(/data-(ring|mark|ground)=/);
    });
});

describe('sick and healthy differ in shape at 48 px, in greyscale', () => {
    it('the ring region differs a lot between healthy and infected', async () => {
        for (const look of LOOKS) {
            const healthy = await render('healthy', look);
            const sick = await render('infected', look);
            // The same state on a different person: what "no difference" measures.
            const other = await render('healthy', LOOKS[(LOOKS.indexOf(look) + 1) % LOOKS.length]);
            const noise = diff(healthy.grey, other.grey, RING);
            const d = diff(healthy.grey, sick.grey, RING);
            expect(noise).toBeLessThan(0.01);
            expect(d).toBeGreaterThan(0.15);
            expect(d).toBeGreaterThan(noise * 20);
        }
    });

    it('the outline differs: a sick token has teeth where a healthy one is round', async () => {
        const healthy = await render('healthy', LOOKS[0]);
        const sick = await render('infected', LOOKS[0]);
        const outside = region((r) => r > 0.89 && r <= 0.99);
        const covered = (im) => outside.filter((i) => im.alpha[i] > 128).length / outside.length;
        expect(covered(healthy)).toBeLessThan(0.05);
        expect(covered(sick)).toBeGreaterThan(0.25);
        // Not a solid bigger disc either: teeth with gaps between them.
        expect(covered(sick)).toBeLessThan(0.85);
    });

    it('the germ badge is a dark spot with a pale heart only the sick carry', async () => {
        for (const look of LOOKS) {
            const healthy = await render('healthy', look);
            const sick = await render('infected', look);
            expect(diff(healthy.grey, sick.grey, BADGE)).toBeGreaterThan(0.2);
            const lum = BADGE.map((i) => sick.grey[i]);
            // Both dark enamel and the pale germ are in there.
            expect(Math.min(...lum)).toBeLessThan(70);
            expect(Math.max(...lum)).toBeGreaterThan(150);
        }
    });

    it('holds in every frame the game shows (idle, blink, cough)', async () => {
        const healthy = await render('healthy', LOOKS[1]);
        for (const frame of FRAMES.infected) {
            const sick = await render('infected', LOOKS[1], frame);
            expect(diff(healthy.grey, sick.grey, RING)).toBeGreaterThan(0.15);
        }
    });

    it('every pair of states differs in the ring region, far above the noise', async () => {
        const look = LOOKS[2];
        const im = {};
        for (const s of STATE_IDS) im[s] = await render(s, look);
        for (let i = 0; i < STATE_IDS.length; i++) {
            for (let j = i + 1; j < STATE_IDS.length; j++) {
                const d = diff(im[STATE_IDS[i]].grey, im[STATE_IDS[j]].grey, RING);
                expect(d, `${STATE_IDS[i]} vs ${STATE_IDS[j]}`).toBeGreaterThan(0.02);
            }
        }
    });
});
