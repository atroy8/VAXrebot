import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { cloisonnePlan, paintCloisonne, cellColor, MOTIFS, WIRE, TEXTURE_W, TEXTURE_H, medallionCentres } from '../src/ui/cloisonne.js';
import { comboFor } from '../src/config/planet-palettes.js';
import { PLANET_DEFS } from '../src/config/levels.js';
import { WADA_COMBINATIONS } from '../src/config/wada-palettes.js';
import * as theme from '../src/config/theme.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

// A fake 2D context that records every colour used to fill a shape.
function recordingCtx() {
    const fills = [];
    const strokes = [];
    const ctx = {
        fills,
        strokes,
        fillStyle: '#000000',
        strokeStyle: '#000000',
        lineWidth: 1,
        fillRect() { fills.push(ctx.fillStyle); },
        fill() { fills.push(ctx.fillStyle); },
        stroke() { strokes.push({ style: ctx.strokeStyle, width: ctx.lineWidth }); },
    };
    for (const m of ['beginPath', 'closePath', 'moveTo', 'lineTo', 'arc', 'ellipse', 'save', 'restore']) ctx[m] = () => {};
    return ctx;
}

const planetPlans = PLANET_DEFS.map((def, i) => cloisonnePlan({ combo: comboFor(def), seed: i * 977, index: i }));

describe('cloisonne planets (item 18)', () => {
    it('every enamel colour on every planet comes from its Wada combination, unblended', () => {
        PLANET_DEFS.forEach((def, i) => {
            const combo = comboFor(def).colors.map((c) => c[1].toLowerCase());
            const plan = planetPlans[i];
            for (const c of plan.enamel) expect(combo).toContain(c);
            const ctx = recordingCtx();
            paintCloisonne(ctx, plan);
            for (const f of ctx.fills) expect(combo).toContain(f);
            // Each planet uses at least two of its combination's colours.
            expect(new Set(ctx.fills).size).toBeGreaterThanOrEqual(2);
        });
    });

    it('works for every combination in the dictionary, even 2 colour pairs', () => {
        for (const combo of WADA_COMBINATIONS) {
            const plan = cloisonnePlan({ combo, seed: combo.id });
            const ctx = recordingCtx();
            paintCloisonne(ctx, plan);
            const hexes = combo.colors.map((c) => c[1].toLowerCase());
            for (const f of ctx.fills) expect(hexes).toContain(f);
        }
    });

    it('wires are gold, from the theme, and only the wire uses stroke', () => {
        const ctx = recordingCtx();
        paintCloisonne(ctx, planetPlans[0]);
        // Wires are batched per layer: three passes each, a few dozen strokes in all.
        expect(ctx.strokes.length).toBeGreaterThanOrEqual(9);
        expect(ctx.strokes.length).toBeLessThan(200);
        const styles = new Set(ctx.strokes.map((s) => s.style));
        expect([...styles].sort()).toEqual([WIRE.body, WIRE.edge, WIRE.shade].sort());
        expect(WIRE.body).toBe(theme.THEME.kin400);
    });

    it('the ground is the darkest colour and neighbouring cells differ when there are fills to spare', () => {
        for (const plan of planetPlans) {
            expect(plan.enamel[0]).toBe(plan.ground);
            if (plan.fills.length < 2) continue;
            let same = 0;
            let total = 0;
            for (let i = 0; i < 16; i++) {
                for (let j = 0; j < 8; j++) {
                    const a = cellColor(plan, i, j);
                    const b = cellColor(plan, i + 1, j);
                    if (a !== plan.ground && b !== plan.ground) {
                        total++;
                        if (a === b) same++;
                    }
                }
            }
            expect(same / total).toBeLessThan(0.35);
        }
    });

    it('planets rotate through all three motifs', () => {
        expect(new Set(planetPlans.map((p) => p.motif))).toEqual(new Set(MOTIFS));
        expect(MOTIFS).toEqual(['shippo', 'kikko', 'seigaiha']);
    });

    it('painting is deterministic, so a planet looks the same every session', () => {
        const a = recordingCtx();
        const b = recordingCtx();
        paintCloisonne(a, planetPlans[2]);
        paintCloisonne(b, cloisonnePlan({ combo: comboFor(PLANET_DEFS[2]), seed: 2 * 977, index: 2 }));
        expect(a.fills).toEqual(b.fills);
    });

    it('medallions sit on the equator, spread evenly around the ball', () => {
        const m = medallionCentres();
        expect(m).toHaveLength(4);
        for (const c of m) expect(c.y).toBe(TEXTURE_H / 2);
        expect(m[1].x - m[0].x).toBe(TEXTURE_W / 4);
    });

    it('no sprinkle or flake code is left on the map', () => {
        const globe = read('src/ui/globe-view.js');
        expect(globe).toMatch(/paintCloisonne\(/);
        expect(globe).not.toMatch(/sprinkle|flake/i);
        expect(read('src/config/theme.js')).not.toMatch(/sprinkle|FLAKES/);
        expect(theme.FLAKES).toBeUndefined();
        for (const css of ['src/ui/globe-candy.css', 'src/ui/start-page.css']) expect(read(css)).not.toMatch(/sprinkle/i);
    });
});
