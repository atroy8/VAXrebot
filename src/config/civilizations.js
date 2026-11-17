// Item 29 (b), round 45: a building set per civilization. Each planet's
// journey (planet-journey.js) is split into three lands, and each land is
// drawn in the style of a real-world civilization: Japan, the West African
// Sahel, the Andes, Mughal India, the Nordic lands, the Maya and Persia.
// The lands cycle from planet to planet, so every civilization shows up on
// several planets and every one of them hosts a boss.
//
// Each civilization has a full building set, one building per kind of place
// (the same kinds buildings.js used for the Japanese set), its own wall,
// trim and stone colours, and one short line of real public health history
// that the level sheet shows, so the journey quietly teaches too.
//
// Pure data, no three.js. Tested in tests/round45-civilizations.test.js.

// The kinds of place a level can be (scenarioId in levels.js) plus the boss.
export const PLACE_KINDS = Object.freeze(['care', 'school', 'urban', 'festival', 'boss']);
// Spaceport levels borrow the busiest building in town.
const PLACE_ALIAS = { global: 'urban' };

export const CIVILIZATIONS = Object.freeze({
    japan: {
        name: 'Japan',
        land: 'the Japanese isles',
        set: { care: 'temple', school: 'teahouse', urban: 'pagoda', festival: 'torii', boss: 'castle' },
        // null keeps the theme's washi walls, vermilion trim and grey stone.
        colors: { wall: null, trim: null, stone: null },
        history: 'In 1849 doctors in Osaka opened a vaccination house and passed cowpox from arm to arm to protect children from smallpox.',
    },
    sahel: {
        name: 'the West African Sahel',
        land: 'the Sahel',
        set: { care: 'sahel-house', school: 'granary', urban: 'mud-tower', festival: 'toguna', boss: 'mud-palace' },
        colors: { wall: 0xc98f5a, trim: 0x7a5232, stone: 0xa8764c },
        history: 'Inoculation against smallpox was known in West Africa long ago. In 1721 Onesimus, a West African man in Boston, explained it, and it saved lives in the city\'s epidemic.',
    },
    andes: {
        name: 'the Andes',
        land: 'the Andes',
        set: { care: 'inca-house', school: 'kallanka', urban: 'terraces', festival: 'sun-gate', boss: 'inca-fortress' },
        colors: { wall: 0xa59d8c, trim: 0x6d6556, stone: 0x857d6d },
        history: 'Smallpox reached the Inca Empire in the 1520s, before the Spanish did, travelling along roads and trade routes faster than any army.',
    },
    mughal: {
        name: 'Mughal India',
        land: 'Mughal India',
        set: { care: 'chhatri', school: 'haveli', urban: 'minaret', festival: 'darwaza', boss: 'mughal-tomb' },
        colors: { wall: 0xf1e6d6, trim: 0xb5523b, stone: 0xc77f5e },
        history: 'In Bengal in the 1700s, travelling inoculators called tikadars protected people from smallpox with a tiny dose of it.',
    },
    nordic: {
        name: 'the Nordic lands',
        land: 'the Nordic lands',
        set: { care: 'longhouse', school: 'log-cabin', urban: 'stave-church', festival: 'midsummer-pole', boss: 'mead-hall' },
        colors: { wall: 0x8a5a3b, trim: 0x5a3a26, stone: 0x7d8288 },
        history: 'In 1749 Sweden began counting every birth and death in every parish, one of the first national health records. You cannot fight what you do not count.',
    },
    maya: {
        name: 'the Maya',
        land: 'the Maya lowlands',
        set: { care: 'maya-hut', school: 'maya-palace', urban: 'maya-temple', festival: 'ball-court', boss: 'maya-pyramid' },
        colors: { wall: 0xe0d6bf, trim: 0xa8432f, stone: 0xb9ad94 },
        history: 'Kaqchikel Maya writers recorded a terrible epidemic around 1520 in their annals, so its story was not lost.',
    },
    persia: {
        name: 'Persia',
        land: 'Persia',
        set: { care: 'caravanserai', school: 'badgir', urban: 'dome-hall', festival: 'garden-pavilion', boss: 'citadel' },
        colors: { wall: 0xd9c19a, trim: 0x2f6f8f, stone: 0xb89c72 },
        history: 'Around 1025 the Persian physician Ibn Sina wrote that some diseases pass from person to person, and advised keeping the sick apart.',
    },
});

// The order lands appear in along the journey, starting on the first planet.
export const CIV_ORDER = Object.freeze(['japan', 'sahel', 'andes', 'mughal', 'nordic', 'maya', 'persia']);
export const LANDS_PER_PLANET = 3;

// Which land (0, 1 or 2) a stop belongs to: 10 stops split 4, 3, 3, so the
// boss (the last stop) is always in the third land.
export function landOfStop(local, count = 10) {
    const n = Math.max(1, count);
    const k = Math.max(0, Math.min(n - 1, local));
    return Math.min(LANDS_PER_PLANET - 1, Math.floor((k * LANDS_PER_PLANET) / n));
}

export function civOfLand(planetIndex, land) {
    return CIV_ORDER[(planetIndex * LANDS_PER_PLANET + land) % CIV_ORDER.length];
}

// The civilization id for stop `local` of `count` on planet `planetIndex`.
export function civilizationFor(planetIndex, local, count = 10) {
    return civOfLand(planetIndex, landOfStop(local, count));
}

// The building for a level (levels.js) standing in civilization `civ`.
export function buildingForPlace(level, civ = 'japan') {
    const c = CIVILIZATIONS[civ] || CIVILIZATIONS.japan;
    if (level && level.variant && level.variant.boss) return c.set.boss;
    const kind = PLACE_ALIAS[level && level.scenarioId] || (level && level.scenarioId);
    return c.set[kind] || c.set.school;
}

// Every building type used by any civilization.
export function allCivBuildingTypes() {
    const out = new Set();
    for (const c of Object.values(CIVILIZATIONS)) for (const k of PLACE_KINDS) out.add(c.set[k]);
    return [...out];
}
