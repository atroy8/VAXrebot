// Item 29 (c), round 46: citizens dressed for their land. Every civilization
// on the journey (src/config/civilizations.js) has its own 21 face frames,
// drawn by npm run art:civ from art/source/citizens.mjs: same faces and
// state cues everywhere, with that land's hair, headwear, clothes and skin
// tone. Japan keeps the original set in src/assets/faces/.
//
// Only URLs are bundled here (Vite turns each PNG into a hashed file), so
// the entry bundle stays small and a level loads just its own land's frames.
const baseFaces = import.meta.glob('../assets/faces/*/*.png', { eager: true, query: '?url', import: 'default' });
const civFaces = import.meta.glob('../assets/faces-civ/*/*.png', { eager: true, query: '?url', import: 'default' });

export const DEFAULT_CIV = 'japan';

export function hasCivFaces(civ) {
    if (civ === DEFAULT_CIV) return true;
    const prefix = `../assets/faces-civ/${civ}/`;
    return Object.keys(civFaces).some((k) => k.startsWith(prefix));
}

// URL of one frame (file name without .png, for example 'idle' or 'cough')
// for a state in a civilization. Falls back to the land's idle frame, then
// to the original Japanese frame, so a person never shows up blank.
export function citizenFaceUrl(civ, state, frame) {
    if (civ && civ !== DEFAULT_CIV) {
        const url = civFaces[`../assets/faces-civ/${civ}/${state}-${frame}.png`] || civFaces[`../assets/faces-civ/${civ}/${state}-idle.png`];
        if (url) return url;
    }
    return baseFaces[`../assets/faces/${state}/${frame}.png`] || baseFaces[`../assets/faces/${state}/idle.png`] || '';
}
