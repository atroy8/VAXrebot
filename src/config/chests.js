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

export const CHESTS = [
    {
        id: 'chest-a',
        afterLevelIndex: 0, // Greenfield Care Home (Hometown region)
        gives: { blitz: 1 },
        lat: 20,
        lng: -30,
    },
    {
        id: 'chest-b',
        afterLevelIndex: 3, // Sunfield Music Festival (National Response region)
        gives: { eureka: 1 },
        lat: 30,
        lng: 100,
    },
    {
        id: 'chest-c',
        afterLevelIndex: 6, // Metro Eastside (Global Frontline region)
        gives: { pay: 2 },
        lat: -30,
        lng: -120,
    },
];

export function chestById(id) {
    return CHESTS.find((c) => c.id === id) || null;
}

// Id-keyed lookup for consumers (e.g. src/economy.js) that address chests by
// id rather than scanning the array. Same definitions, keyed for lookup.
export const CHEST_MAP = Object.fromEntries(CHESTS.map((c) => [c.id, c]));
