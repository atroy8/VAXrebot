// Hand-off from the results screen to the world map: "open this prize box
// when you get there". Pure (no DOM), unit tested in tests/prize-flow.test.js.
//
// game.js calls requestChestOpen(id) when the player taps "Prize box
// unlocked!" on the award screen, then shows the map; the map calls
// takeChestRequest() on its next refresh, flies to the box's planet and
// opens it. A request is used once.

let pending = null;

export function requestChestOpen(chestId) {
    pending = chestId ? String(chestId) : null;
}

export function takeChestRequest() {
    const id = pending;
    pending = null;
    return id;
}

export function peekChestRequest() {
    return pending;
}

// Where a box lives on the map: its planet and the level it follows.
// Returns null for an unknown box.
export function chestDestination(chestId, { chests, levels, planets }) {
    const chest = chests.find((c) => c.id === chestId);
    if (!chest) return null;
    const level = levels[chest.afterLevelIndex];
    if (!level) return null;
    const planetIndex = planets.findIndex((p) => p.regionId === level.regionId);
    if (planetIndex < 0) return null;
    return { chest, level, levelIndex: chest.afterLevelIndex, planetIndex };
}
