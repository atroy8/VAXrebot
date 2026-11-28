// Which extra results buttons to show (round 59). Show best play only when
// 3 stars were missed. Retry this web likewise: after a 3 star result the
// web is solved, and next to Replay (a new web) a second replay button only
// made a perfect win harder to read. Pure, so it is unit tested.
export function dealActionsShown({ hasDeal = false, hasPar = false, stars = 0 } = {}) {
    const missed = !(stars >= 3);
    return { best: hasDeal && hasPar && missed, retry: hasDeal && missed };
}
