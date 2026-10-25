// Cloisonne planets (item 18). Each planet looks like a Japanese cloisonne
// enamel ball (shippo-yaki): thin gold wires (cloisons) outline little cells,
// and every cell is filled with one flat enamel colour taken straight from the
// planet's Sanzo Wada combination. The clear coat on the planet material in
// globe-view.js gives the fired glaze its shine.
//
// Pure: cloisonnePlan() decides colours and motif, paintCloisonne() draws onto
// any 2D canvas context (a real one in the game, a recording fake in
// tests/cloisonne.test.js). No DOM access here.
//
// Texture layout (equirectangular, 1024 x 512, wraps left to right):
//   north cap      chrysanthemum petals (kiku) that pinch into a rosette at the pole
//   gold band      double wire
//   main field     the planet's motif: shippo circles, kikko hexagons or seigaiha waves
//   medallions     four round flower panels on the equator, spaced around the ball
//   gold band, south cap (mirror of the north)
import { THEME } from '../config/theme.js';
import { lightness } from '../config/planet-palettes.js';

export const TEXTURE_W = 1024;
export const TEXTURE_H = 512;

// Shippo (overlapping circles, the pattern cloisonne is named after in
// Japanese), kikko (tortoise shell hexagons), seigaiha (blue sea waves).
export const MOTIFS = Object.freeze(['shippo', 'kikko', 'seigaiha']);

// Gold wire: a body colour and a thin bright edge, from the ai and gold theme.
export const WIRE = Object.freeze({ body: THEME.kin400, edge: THEME.kin100, shade: 'rgba(0,0,0,0.28)' });
export const WIRE_WIDTH = 4.5;

const CAP_H = 66; // height of each polar cap, texture px
const BAND_H = 14; // gold band between a cap and the main field
const PETALS = 32; // petals around each cap (1024 / 32 = 32 px each)

function hash2(i, j, seed) {
    let h = (seed ^ Math.imul(i + 0x9e37, 0x85ebca6b) ^ Math.imul(j + 0x7f4a, 0xc2b2ae35)) >>> 0;
    h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
    h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
    return (h ^ (h >>> 15)) >>> 0;
}

// Colours and motif for one planet. combo = a Wada combination
// ({ id, colors: [[name, hex, L], ...] }). Every enamel colour is one of the
// combination's own colours, unblended.
export function cloisonnePlan({ combo, seed = 0, index = null }) {
    const hexes = combo.colors.map((c) => c[1].toLowerCase());
    const sorted = [...new Set(hexes)].sort((a, b) => lightness(a) - lightness(b));
    const ground = sorted[0];
    let fills = sorted.slice(1);
    if (fills.length === 0) fills = [ground];
    const motif = MOTIFS[(index ?? seed) % MOTIFS.length];
    return {
        motif,
        seed: seed >>> 0,
        ground,
        fills,
        // Every colour enamel may use; the test checks paint only uses these.
        enamel: [ground, ...fills],
        // Medallion petals use the lightest colour, centres the liveliest.
        petal: sorted[sorted.length - 1],
        heart: fills[0],
    };
}

// Colour for motif cell (i, j). Neighbours never share a colour when the
// combination has 2 or more fills; a few cells show the ground for rhythm.
export function cellColor(plan, i, j) {
    const n = plan.fills.length;
    if (n === 1) return (i + j) % 2 === 0 ? plan.fills[0] : plan.ground;
    const h = hash2(i, j, plan.seed);
    if (h % 7 === 0) return plan.ground;
    return plan.fills[(i + j * 2 + (h % 2) * (n > 2 ? 1 : 0)) % n];
}

// Wires are collected per layer and stroked in three passes (shadow, gold,
// bright edge) over one combined path, so a planet costs a few dozen strokes
// instead of thousands. Path builders add subpaths only (no beginPath).
function wireLayer(ctx) {
    const paths = [];
    return {
        add(path) {
            paths.push(path);
        },
        flush() {
            if (!paths.length) return;
            ctx.lineJoin = 'round';
            ctx.lineCap = 'round';
            for (const [style, width] of [[WIRE.shade, WIRE_WIDTH + 2.5], [WIRE.body, WIRE_WIDTH], [WIRE.edge, 1.2]]) {
                ctx.strokeStyle = style;
                ctx.lineWidth = width;
                ctx.beginPath();
                for (const path of paths) path();
                ctx.stroke();
            }
            paths.length = 0;
        },
    };
}

function fillPath(ctx, color, path) {
    ctx.fillStyle = color;
    ctx.beginPath();
    path();
    ctx.fill();
}

function circlePath(ctx, x, y, r) {
    return () => {
        ctx.moveTo(x + r, y);
        ctx.arc(x, y, r, 0, Math.PI * 2);
    };
}

// ---- polar caps ---------------------------------------------------------------
function paintCap(ctx, plan, north) {
    const w = TEXTURE_W;
    const y0 = north ? 0 : TEXTURE_H - CAP_H;
    const pw = w / PETALS;
    const wires = wireLayer(ctx);
    ctx.fillStyle = plan.ground;
    ctx.fillRect(0, y0, w, CAP_H);
    // Petals: strips from the pole with a rounded tip toward the equator. On
    // the sphere they pinch together into a chrysanthemum at the pole.
    const tipY = north ? CAP_H - 10 - pw / 2 : TEXTURE_H - CAP_H + 10 + pw / 2;
    const baseY = north ? 0 : TEXTURE_H;
    for (let k = 0; k < PETALS; k++) {
        const x = k * pw;
        const path = () => {
            ctx.moveTo(x + 3, baseY);
            ctx.lineTo(x + 3, tipY);
            ctx.arc(x + pw / 2, tipY, pw / 2 - 3, Math.PI, 0, !north);
            ctx.lineTo(x + pw - 3, baseY);
            ctx.closePath();
        };
        fillPath(ctx, plan.fills[k % plan.fills.length], path);
        wires.add(path);
    }
    // Gold band between the cap and the field: two wires with ground between.
    const by = north ? CAP_H : TEXTURE_H - CAP_H - BAND_H;
    ctx.fillStyle = plan.ground;
    ctx.fillRect(0, by, w, BAND_H);
    for (const y of [by + 2, by + BAND_H - 2]) {
        wires.add(() => {
            ctx.moveTo(-4, y);
            ctx.lineTo(w + 4, y);
        });
    }
    wires.flush();
}

// ---- main field motifs -------------------------------------------------------------
const FIELD_Y0 = CAP_H + BAND_H;
const FIELD_Y1 = TEXTURE_H - CAP_H - BAND_H;

function paintShippo(ctx, plan) {
    // Filled circles on a grid of spacing 2R, then a second grid of wire
    // circles offset by R, so the wires form the classic interlocking rings.
    const R = 32;
    const wires = wireLayer(ctx);
    for (let j = 0, y = FIELD_Y0 + R; y - R < FIELD_Y1; j++, y += 2 * R) {
        for (let i = 0, x = 0; x <= TEXTURE_W; i++, x += 2 * R) {
            fillPath(ctx, cellColor(plan, i % (TEXTURE_W / (2 * R)), j), circlePath(ctx, x, y, R));
        }
    }
    for (let y = FIELD_Y0; y - R < FIELD_Y1 + R; y += R) {
        const off = Math.round((y - FIELD_Y0) / R) % 2 ? R : 0;
        for (let x = off; x <= TEXTURE_W + R; x += 2 * R) wires.add(circlePath(ctx, x, y, R));
    }
    wires.flush();
}

function hexPath(ctx, cx, cy, s) {
    return () => {
        for (let k = 0; k < 6; k++) {
            const a = Math.PI / 6 + (k * Math.PI) / 3;
            const px = cx + s * Math.cos(a);
            const py = cy + s * Math.sin(a);
            if (k === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.closePath();
    };
}

function paintKikko(ctx, plan) {
    // Pointy-top hexagons, 16 across so the pattern wraps cleanly, each with
    // kikko's inner hexagon as a second wire.
    const cols = 16;
    const dx = TEXTURE_W / cols;
    const s = dx / Math.sqrt(3);
    const dy = s * 1.5;
    const wires = wireLayer(ctx);
    for (let j = 0, y = FIELD_Y0; y - s < FIELD_Y1; j++, y += dy) {
        const off = j % 2 ? dx / 2 : 0;
        for (let i = -1; i <= cols; i++) {
            const x = i * dx + off;
            const outer = hexPath(ctx, x, y, s);
            fillPath(ctx, cellColor(plan, (i + cols) % cols, j), outer);
            wires.add(outer);
            wires.add(hexPath(ctx, x, y, s * 0.55));
        }
    }
    wires.flush();
}

function paintSeigaiha(ctx, plan) {
    // Rows of fan-shaped wave scales, each three nested arcs; later rows
    // overlap earlier ones like roof tiles, so wires are flushed per row.
    // 12 scales across, big enough to read on a small planet.
    const R = TEXTURE_W / 24;
    const wires = wireLayer(ctx);
    for (let j = 0, y = FIELD_Y0 + R * 0.6; y - R < FIELD_Y1 + R; j++, y += R * 0.5) {
        const off = j % 2 ? R : 0;
        for (let i = -1, x = off - 2 * R; x <= TEXTURE_W + R; i++, x += 2 * R) {
            const col = ((i % 12) + 12) % 12;
            for (let k = 0; k < 3; k++) {
                const r = R * (1 - k * 0.3);
                fillPath(ctx, k === 1 ? plan.ground : cellColor(plan, col, j + k), () => {
                    ctx.moveTo(x - r, y);
                    ctx.arc(x, y, r, Math.PI, Math.PI * 2);
                    ctx.closePath();
                });
                wires.add(() => {
                    ctx.moveTo(x - r, y);
                    ctx.arc(x, y, r, Math.PI, Math.PI * 2);
                });
            }
        }
        wires.flush();
    }
}

// ---- medallions: round flower panels, as on real cloisonne balls ----------------------
export const MEDALLIONS = 4;
const MED_R = 46;

function paintMedallion(ctx, plan, cx, cy) {
    const wires = wireLayer(ctx);
    const rim = circlePath(ctx, cx, cy, MED_R);
    fillPath(ctx, plan.ground, rim);
    // Eight petals (a simple bellflower crest).
    for (let k = 0; k < 8; k++) {
        const a = (k * Math.PI) / 4;
        const px = cx + Math.cos(a) * MED_R * 0.5;
        const py = cy + Math.sin(a) * MED_R * 0.5;
        const rx = MED_R * 0.36;
        const petal = () => {
            ctx.moveTo(px + rx * Math.cos(a), py + rx * Math.sin(a));
            ctx.ellipse(px, py, rx, MED_R * 0.2, a, 0, Math.PI * 2);
        };
        fillPath(ctx, k % 2 ? plan.petal : plan.fills[(k >> 1) % plan.fills.length], petal);
        wires.add(petal);
    }
    const heart = circlePath(ctx, cx, cy, MED_R * 0.2);
    fillPath(ctx, plan.heart, heart);
    wires.add(heart);
    wires.add(rim);
    wires.add(circlePath(ctx, cx, cy, MED_R - 6));
    wires.flush();
}

// Medallion centres in texture px, spread evenly around the equator.
export function medallionCentres() {
    const out = [];
    for (let k = 0; k < MEDALLIONS; k++) out.push({ x: (k + 0.5) * (TEXTURE_W / MEDALLIONS), y: TEXTURE_H / 2 });
    return out;
}

// Paint a whole planet. ctx: a CanvasRenderingContext2D of TEXTURE_W x TEXTURE_H.
export function paintCloisonne(ctx, plan) {
    ctx.fillStyle = plan.ground;
    ctx.fillRect(0, 0, TEXTURE_W, TEXTURE_H);
    if (plan.motif === 'shippo') paintShippo(ctx, plan);
    else if (plan.motif === 'kikko') paintKikko(ctx, plan);
    else paintSeigaiha(ctx, plan);
    for (const { x, y } of medallionCentres()) {
        paintMedallion(ctx, plan, x, y);
        // Repeat across the seam so a panel cut by the edge stays whole.
        if (x - MED_R < 0) paintMedallion(ctx, plan, x + TEXTURE_W, y);
        if (x + MED_R > TEXTURE_W) paintMedallion(ctx, plan, x - TEXTURE_W, y);
    }
    paintCap(ctx, plan, true);
    paintCap(ctx, plan, false);
}
