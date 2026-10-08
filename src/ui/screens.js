// Screen manager: toggles the .active screen. Theme-music start/stop lives in
// game.js (it owns the current screen), not here.

export function showScreen(screenName) {
    document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
    document.getElementById(`${screenName}-screen`).classList.add('active');
}

// Welcome-flow section: the 3D globe is the home/start screen, replacing the
// looping video intro (intro.mp4 stays in the repo, unwired). The globe
// rebuilds #welcome-screen in place, so game.js's setupIntro finds no video
// element and its first-tap ambient music listener keeps working. Tapping an
// unlocked level node calls onPlayLevel, which main.js wires to
// game.selectLevel, so levels start through the existing briefing flow.
let globeMounted = false;
export function mountGlobeHome({ onPlayLevel } = {}) {
    const screen = document.getElementById('welcome-screen');
    if (!screen || globeMounted) return Promise.resolve();
    globeMounted = true;
    // Lazy import: keeps three.js out of the initial bundle path.
    return import('./globe-view.js').then((m) => m.initGlobeView(screen, { onPlayLevel }));
}
