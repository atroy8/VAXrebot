// Small marks the view draws on a person for the mechanics of later
// planets (src/sim/mechanics.js). Pure data and one pure function, so the
// rule for who gets which mark is tested without WebGL. The view
// (network-view-3d.js) turns each spec into a little round sprite, the same
// way it draws the super-spreader crown and the Envoy star.
//
// Every mark reads only what the player is allowed to know: a mask they put
// on, a test they ran today, a hub the briefing pointed out. Nothing here
// may ever read node.incubating (the hidden truth).
//
//   mask   the person wears a mask (node.masked), bottom right
//   clear  tested clear today (node.testedClear), top left, gone at dawn
//   hub    the place that must stay open (node.hub), top right
//   travel a traveller, who swaps a contact each night (node.traveller), bottom left

export const NODE_MARKS = Object.freeze({
    mask: {
        bg: '#2563eb',
        fg: '#ffffff',
        pos: [0.52, -0.5],
        // A face mask: a rounded band with two ear loops.
        path: (g) => {
            g.moveTo(34, 50);
            g.quadraticCurveTo(64, 38, 94, 50);
            g.lineTo(94, 72);
            g.quadraticCurveTo(64, 96, 34, 72);
            g.closePath();
            g.rect(22, 54, 12, 6);
            g.rect(94, 54, 12, 6);
        },
    },
    clear: {
        bg: '#0d9488',
        fg: '#ffffff',
        pos: [-0.52, 0.56],
        // A tick.
        path: (g) => {
            g.moveTo(34, 66);
            g.lineTo(44, 54);
            g.lineTo(58, 68);
            g.lineTo(86, 38);
            g.lineTo(96, 50);
            g.lineTo(58, 90);
            g.closePath();
        },
    },
    hub: {
        bg: '#b45309',
        fg: '#ffffff',
        pos: [0.52, 0.56],
        // A little house: the school or market that must stay open.
        path: (g) => {
            g.moveTo(64, 30);
            g.lineTo(100, 60);
            g.lineTo(90, 60);
            g.lineTo(90, 94);
            g.lineTo(38, 94);
            g.lineTo(38, 60);
            g.lineTo(28, 60);
            g.closePath();
        },
    },
    travel: {
        bg: '#7c3aed',
        fg: '#ffffff',
        pos: [-0.52, -0.5],
        // An arrow pointing right: on the move.
        path: (g) => {
            g.moveTo(28, 56);
            g.lineTo(66, 56);
            g.lineTo(66, 38);
            g.lineTo(102, 64);
            g.lineTo(66, 90);
            g.lineTo(66, 72);
            g.lineTo(28, 72);
            g.closePath();
        },
    },
});

// Which marks a person shows right now, in a fixed order.
export function nodeMarks(node) {
    if (!node || node.removed) return [];
    const out = [];
    if (node.masked) out.push('mask');
    if (node.testedClear && node.state === 'healthy') out.push('clear');
    if (node.hub) out.push('hub');
    if (node.traveller) out.push('travel');
    return out;
}

// A line with a masked person on it spreads less, so it is drawn thinner
// and paler. Returns the factors the view applies to linkStyle's result.
export const MASKED_LINE = Object.freeze({ width: 0.65, pale: 0.28 });
export function maskedEnds(link) {
    return (link && link.source && link.source.masked ? 1 : 0) + (link && link.target && link.target.masked ? 1 : 0);
}

// linkStyle's result for a line with `masks` masked ends (0 leaves it as is).
export function maskedLine(style, masks) {
    return masks ? { ...style, width: style.width * MASKED_LINE.width } : style;
}
