// Round 26: the "Spread stopped!" card sat at the bottom of the web, where the
// phone toasts (a death, R below 1) landed on top of it. It now covers the
// idle tool tray during wrap-up, below the toasts.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

describe('wrap-up card placement (round 26)', () => {
    it('mounts the card in the tool tray, with the web as a fallback', () => {
        const game = read('src/game.js');
        expect(game).toContain("(document.getElementById('tool-tray') || document.querySelector('.network-container'))?.appendChild(card)");
        expect(read('index.html')).toContain('id="tool-tray"');
    });

    it('centres the card over the tray and fades only the tray contents', () => {
        const css = read('src/ui/game-screen.css');
        expect(css).toMatch(/\.tools-panel > \.wrapup-card \{[^}]*top: 50%/);
        expect(css).toContain('.wrapping-up .tools-panel > :not(.wrapup-card) { opacity: 0.2;');
        expect(css).not.toContain('.wrapping-up .tools-panel { opacity');
    });

    it('phone toasts stay above the tray', () => {
        expect(read('src/ui/game-screen.css')).toMatch(/#notification-container \{ top: auto; bottom: calc\(176px/);
    });
});
