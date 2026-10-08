// Screen manager: toggles the .active screen. Theme-music start/stop lives in
// game.js (it owns the current screen), not here.

export function showScreen(screenName) {
    document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
    document.getElementById(`${screenName}-screen`).classList.add('active');
}
