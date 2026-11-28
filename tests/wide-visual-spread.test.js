// Wide audience: (1) at-risk lines carry a cue that does not need colour,
// and (2) a new infection is shown travelling along its line before the new
// case flips, so cause and effect are obvious.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { linkStyle, riskBeads, RISK_BEADS, LINK_WIDTHS } from '../src/ui/link-style.js';
import { SPREAD, spreadPlan, spreadEase, shownState } from '../src/ui/spread-anim.js';
import { WEB_INK } from '../src/ui/web-backdrop.js';
import { contrast } from '../src/ui/planet-tint.js';

const view = readFileSync(new URL('../src/ui/network-view-3d.js', import.meta.url), 'utf8');

describe('at-risk lines read without colour', () => {
    it('in greyscale the red line and a plain line are nearly the same grey, so colour alone is not enough', () => {
        // This is the problem the beads solve: under 1.5 to 1 is invisible.
        expect(contrast(WEB_INK.risk2d, WEB_INK.normal2d)).toBeLessThan(1.6);
    });

    it('only at-risk lines carry beads, with or without the Sever tool', () => {
        for (const severing of [false, true]) {
            expect(linkStyle('risk', severing).beads).toBe(true);
            expect(linkStyle('normal', severing).beads).toBe(false);
            expect(linkStyle('blocked', severing).beads).toBe(false);
        }
        // The cues that were already there stay: wider, and pulsing.
        expect(linkStyle('risk').width).toBeGreaterThan(linkStyle('normal').width * 1.5);
        expect(linkStyle('risk').pulse).toBe(true);
        expect(LINK_WIDTHS.risk).toBe(linkStyle('risk').width);
    });

    it('the beads are pale, so they stand out from the red line and from a plain line', () => {
        expect(contrast(RISK_BEADS.color, WEB_INK.risk2d)).toBeGreaterThan(4);
        expect(contrast(RISK_BEADS.color, WEB_INK.risk)).toBeGreaterThan(2.5);
        expect(contrast(RISK_BEADS.color, WEB_INK.normal2d)).toBeGreaterThan(3);
    });

    it('a line gets a bead about every 0.9 units, at least one and at most five', () => {
        expect(riskBeads(0)).toEqual([]);
        expect(riskBeads(-1)).toEqual([]);
        expect(riskBeads(0.3)).toHaveLength(1);
        expect(riskBeads(2.7)).toHaveLength(3);
        expect(riskBeads(50)).toHaveLength(RISK_BEADS.max);
        // Bigger people get beads spaced further apart.
        expect(riskBeads(2.7, 0.5, 2).length).toBeLessThan(riskBeads(2.7, 0.5, 1).length);
    });

    it('beads stay on the line, run from the sick end to the far end, and never pop', () => {
        for (const phase of [0, 0.25, 0.5, 0.99, 7.3, -0.4]) {
            const beads = riskBeads(4, phase);
            for (const b of beads) {
                expect(b.u).toBeGreaterThanOrEqual(0);
                expect(b.u).toBeLessThanOrEqual(1);
                expect(b.size).toBeGreaterThanOrEqual(0);
                expect(b.size).toBeLessThanOrEqual(1);
            }
        }
        // Later phase: further along (toward the person at risk).
        expect(riskBeads(4, 0.6)[0].u).toBeGreaterThan(riskBeads(4, 0.1)[0].u);
        // Small where they appear and vanish, full size in the middle.
        expect(riskBeads(1, 0.02)[0].size).toBeLessThan(0.2);
        expect(riskBeads(1, 0.5)[0].size).toBe(1);
        // Reduced motion uses a fixed phase: the beads stand still, at full size.
        expect(riskBeads(3, 0.5)).toEqual(riskBeads(3, 0.5));
        expect(riskBeads(3, 0.5).every((b) => b.size > 0.9)).toBe(true);
    });

    it('the view draws the beads over the lines, under the faces, from the sick person outward', () => {
        expect(view).toContain("import { linkStyle, LINK_WIDTHS, RISK_BEADS, riskBeads } from './link-style.js';");
        expect(view).toContain('new THREE.InstancedMesh(beadGeometry, beadMaterial, count * RISK_BEADS.max)');
        expect(view).toContain('if (style.beads && span && w > 0 && this.beadMesh)');
        expect(view).toContain("const fromA = link.source && shownOf(link.source) === 'infected';");
        expect(view).toContain('const beadPhase = this.reduceMotion ? 0.5 : now / RISK_BEADS.periodMs;');
        const order = Number(view.match(/BEAD_RENDER_ORDER = (-?[\d.]+)/)[1]);
        const overlay = Number(view.match(/RISK_OVERLAY_RENDER_ORDER = (-?[\d.]+)/)[1]);
        const face = Number(view.match(/FACE_RENDER_ORDER = (-?[\d.]+)/)[1]);
        expect(order).toBeGreaterThan(overlay);
        expect(order).toBeLessThan(face);
    });
});

describe('show the spread', () => {
    it('fits the budget so turns stay fast', () => {
        const plan = spreadPlan(false);
        expect(plan.moving).toBe(true);
        expect(plan.totalMs).toBeLessThanOrEqual(SPREAD.budgetMs);
        expect(SPREAD.budgetMs).toBeLessThanOrEqual(900);
        // Long enough to follow with the eye.
        expect(plan.travelMs).toBeGreaterThanOrEqual(350);
        // Effect follows cause: the face flips when the germ lands, not before.
        expect(plan.flipAtMs).toBe(plan.travelMs);
        expect(plan.pulseMs).toBeGreaterThanOrEqual(250);
    });

    it('with reduced motion nothing travels: the face flips at once and a still ring fades', () => {
        const plan = spreadPlan(true);
        expect(plan.moving).toBe(false);
        expect(plan.travelMs).toBe(0);
        expect(plan.flipAtMs).toBe(0);
        expect(plan.totalMs).toBeLessThanOrEqual(SPREAD.budgetMs);
    });

    it('the germ leaves quickly and arrives gently, start to end', () => {
        expect(spreadEase(0)).toBe(0);
        expect(spreadEase(1)).toBe(1);
        expect(spreadEase(-3)).toBe(0);
        expect(spreadEase(9)).toBe(1);
        expect(spreadEase(0.5)).toBeGreaterThan(0.5);
        let last = 0;
        for (let t = 0; t <= 1.0001; t += 0.05) {
            expect(spreadEase(t)).toBeGreaterThanOrEqual(last);
            last = spreadEase(t);
        }
    });

    it('a person keeps the face they had until the germ lands', () => {
        expect(shownState('infected', 'healthy', 1000, 400)).toBe('healthy');
        expect(shownState('infected', 'healthy', 1000, 1000)).toBe('infected');
        expect(shownState('infected', 'healthy', 1000, 1600)).toBe('infected');
        expect(shownState('infected', null, 1000, 400)).toBe('infected');
        expect(shownState('vaccinated', undefined, undefined, 5)).toBe('vaccinated');
    });

    it('the view holds the flip, draws lines from shown states, and lands with a pulse', () => {
        expect(view).toContain("import { SPREAD, spreadPlan, spreadEase, shownState } from './spread-anim.js';");
        // animateVirus marks the target; update() holds the flip; tick() lands it.
        expect(view).toContain('b.incomingUntil = start + plan.flipAtMs;');
        expect(view).toContain("if (node.state === 'infected' && obj.incomingUntil > now && !obj.heldState) {");
        expect(view).toContain('if (obj.heldState && now >= obj.holdUntil) this.landInfection(obj, now);');
        expect(view).toContain('const kind = this.linkKind(link, shownOf);');
        expect(view).toContain('this.pulseRing(obj, now, SPREAD.pulseMs, true);');
        expect(view).toContain('obj.anim.bounceUntil = now + SPREAD.bounceMs;');
        // Any other change (isolated, died) is never held back.
        expect(view).toMatch(/else if \(node\.state !== 'infected'\) \{\s*obj\.heldState = null;/);
        // Taps and tools still read the real state.
        expect(view).toContain('const kind = this.linkKind(link);');
        expect(view).toContain('if (valid && !valid.includes(obj.node.state)) continue;');
    });

    it('reduced motion is respected in the view', () => {
        expect(view).toContain('const plan = spreadPlan(this.reduceMotion);');
        expect(view).toMatch(/if \(!plan\.moving\) \{[\s\S]*?this\.pulseRing\(b, start, plan\.pulseMs, false\);\s*return;/);
        expect(view).toContain("this.reduceMotion = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;");
    });

    it('the game still calls animateVirus for each new infection before it redraws', () => {
        const game = readFileSync(new URL('../src/game.js', import.meta.url), 'utf8');
        const at = game.indexOf('this.view.animateVirus(source, target);');
        expect(at).toBeGreaterThan(0);
        expect(game.indexOf('this.view.update(this.network.nodes, this.network.links);', at)).toBeGreaterThan(at);
    });
});
