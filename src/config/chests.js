// Supply crate definitions shared with the economy worker.
// One crate per region, positioned apart on the globe home screen.
//
// Shape contract (shared with src/ui/globe-view.js and src/economy.js):
//   { id, afterLevelIndex, gives, lat, lng }
//   - afterLevelIndex: index into LEVELS (src/config/levels.js). The crate
//     becomes openable once the player has earned at least 1 star on that
//     level.
//   - gives: power-up ids from the economy lane, e.g. eureka / blitz / pay.
//   - lat / lng: globe marker position in degrees.

// Round 14: two prize boxes on every planet, after its 5th level and its
// boss (10th) level, 16 in all. The per-play threat climbs toward each box
// (src/config/difficulty-roll.js), so bosses play at high threat. What they hold rotates so every power-up turns up often.
const GIFTS = [{ blitz: 1 }, { eureka: 1 }, { blitz: 2 }, { pay: 1 }];
const LEVELS_PER_PLANET = 10;
const PLANET_COUNT = 8;
export const CHESTS = [];
for (let p = 0; p < PLANET_COUNT; p++) {
    for (const [j, slot] of [4, 9].entries()) {
        const n = CHESTS.length;
        CHESTS.push({
            id: `chest-${p + 1}${j === 0 ? 'a' : 'b'}`,
            afterLevelIndex: p * LEVELS_PER_PLANET + slot,
            gives: GIFTS[n % GIFTS.length],
            lat: 0,
            lng: 0,
        });
    }
}

export function chestById(id) {
    return CHESTS.find((c) => c.id === id) || null;
}

// Id-keyed lookup for consumers (e.g. src/economy.js) that address chests by
// id rather than scanning the array. Same definitions, keyed for lookup.
export const CHEST_MAP = Object.fromEntries(CHESTS.map((c) => [c.id, c]));
