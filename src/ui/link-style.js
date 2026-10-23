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
        return { color: 'risk', width: severing ? LINK_WIDTHS.severRisk : LINK_WIDTHS.risk, pulse: true };
    }
    if (kind === 'blocked') {
        return { color: 'blocked', width: severing ? LINK_WIDTHS.severBlocked : LINK_WIDTHS.blocked, pulse: false };
    }
    return { color: severing ? 'cuttable' : 'normal', width: severing ? LINK_WIDTHS.severNormal : LINK_WIDTHS.normal, pulse: false };
}
