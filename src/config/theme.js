// Ai and kin: the classic Japanese indigo (ai-iro) and gold leaf (kinpaku)
// palette, with washi paper for light surfaces and a touch of vermilion (shu)
// for warnings. One source for the 3D home screen; the same values live as
// CSS custom properties in src/ui/theme-ai-gold.css.
//
// Adam's call (round 12): keep the glossy candy layering and motion, swap
// the pastel candy colours for indigo and gold.

export const THEME = Object.freeze({
    ai900: '#0b1838',
    ai800: '#13265a',
    ai700: '#1b3a7a',
    ai600: '#234c9c',
    ai500: '#3565b8',
    ai400: '#5b82c8',
    ai200: '#c7d6f0',
    ai100: '#e8eef8',
    kin700: '#8a6417',
    kin600: '#a9801f',
    kin500: '#c9a227',
    kin400: '#ddb94a',
    kin300: '#ecd27e',
    kin100: '#f8eecb',
    washi: '#f7f2e4',
    washiEdge: '#e7dcc0',
    shu: '#c8432f',
});

// Hex string to the 0xRRGGBB number Three.js colours take.
export function hexNum(hex) {
    return parseInt(hex.replace('#', ''), 16);
}

// Gold flakes and paper specks scattered on the land (were candy sprinkles).
export const FLAKES = [THEME.kin100, THEME.kin300, '#ffffff', THEME.kin400, THEME.ai200];

// Confetti for prize boxes: gold, paper, indigo, sky and one vermilion.
export const CONFETTI = [THEME.kin400, THEME.kin100, '#ffffff', THEME.ai500, THEME.ai200, THEME.shu].map(hexNum);
