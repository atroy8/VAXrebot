// How a contact line looks, as a pure function so it can be tested without
// WebGL. Used by network-view-3d.js every frame.
//
// kind: 'risk' (a sick, unisolated person touching someone who can catch it),
// 'blocked' (one end is protected) or 'normal'.
// severing: the Sever tool is selected.
//
// Playtest note (round 11): with Sever selected, every cuttable line used to
// turn thick orange, so the whole network became an orange tangle and the red
// lines the hint points at were the thinnest thing on screen. Now the red
// at-risk lines get bolder while Sever is selected, plain lines thicken just
// enough to show they can be cut, and protected lines fade back.

// Item 15 (round 20): every line about 1.5x thicker, so lines read on a
// phone and are easier to aim at. The view also scales them with people.
export const LINK_WIDTHS = Object.freeze({
    normal: 0.14,
    risk: 0.22,
    blocked: 0.12,
    severNormal: 0.16,
    severRisk: 0.34,
    severBlocked: 0.1,
});

export function linkStyle(kind, severing = false) {
    if (kind === 'risk') {
        return { color: 'risk', width: severing ? LINK_WIDTHS.severRisk : LINK_WIDTHS.risk, pulse: true, beads: true };
    }
    if (kind === 'blocked') {
        return { color: 'blocked', width: severing ? LINK_WIDTHS.severBlocked : LINK_WIDTHS.blocked, pulse: false, beads: false };
    }
    return { color: severing ? 'cuttable' : 'normal', width: severing ? LINK_WIDTHS.severNormal : LINK_WIDTHS.normal, pulse: false, beads: false };
}

// Wide audience: a cue that does not need colour. In greyscale the red
// at-risk line and a plain line are nearly the same grey, and people who
// cannot tell red from green see no warning at all. So an at-risk line also
// carries pale beads that run along it from the sick person toward the
// person in danger: the shape says "danger", the motion says which way.
// With reduced motion the beads stand still (still a shape cue).
export const RISK_BEADS = Object.freeze({
    spacing: 0.9, // world units between beads at person scale 1
    max: 5,
    periodMs: 1100, // time for a bead to travel one spacing
    size: 0.82, // bead radius as a share of the line's half width
    color: '#fff3d6',
});

// Beads on a line whose visible part is `span` world units long. `phase`
// (0 to 1) slides them from the sick end (u = 0) to the far end (u = 1).
// Each bead: u = where along the line, size = 0 to 1 (they swell in at the
// start and shrink out at the end, so nothing pops).
export function riskBeads(span, phase = 0.5, scale = 1) {
    if (!(span > 0)) return [];
    const n = Math.max(1, Math.min(RISK_BEADS.max, Math.round(span / (RISK_BEADS.spacing * Math.max(1, scale)))));
    const f = ((phase % 1) + 1) % 1;
    const out = [];
    for (let i = 0; i < n; i++) {
        const u = (i + f) / n;
        out.push({ u, size: Math.min(1, 2.4 * Math.sin(Math.PI * u)) });
    }
    return out;
}
