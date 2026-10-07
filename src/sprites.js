// Node-state sprite map for the network graph.
// Uses Vite-friendly asset URLs (new URL(..., import.meta.url)) so the PNGs
// are bundled into dist and served fully offline (App Store requirement:
// zero external network requests).
const SPRITES = {
    healthy: new URL('./assets/sprites/healthy.png', import.meta.url).href,
    infected: new URL('./assets/sprites/infected.png', import.meta.url).href,
    recovered: new URL('./assets/sprites/recovered.png', import.meta.url).href,
    vaccinated: new URL('./assets/sprites/vaccinated.png', import.meta.url).href,
    quarantined: new URL('./assets/sprites/quarantined.png', import.meta.url).href,
    dead: new URL('./assets/sprites/dead.png', import.meta.url).href,
    // Reserved for a future exposed/presymptomatic state; not used by the sim yet.
    exposed: new URL('./assets/sprites/exposed.png', import.meta.url).href,
};

// Returns the sprite URL for a node state. Unknown states fall back to healthy.
export function spriteFor(state) {
    return SPRITES[state] || SPRITES.healthy;
}

// Warm the image cache at import time so sprites are ready before the first
// frame needs them (avoids pop-in on the network graph).
for (const url of Object.values(SPRITES)) {
    const img = new Image();
    img.src = url;
}
