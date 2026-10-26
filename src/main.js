import './styles.css';
import '@fontsource/fredoka/500.css';
import '@fontsource/fredoka/700.css';
import { EpidemicSimulator } from './game.js';
import { mountGlobeHome } from './ui/screens.js';

        document.addEventListener('DOMContentLoaded', () => {
            window.game = new EpidemicSimulator();
            // The 3D globe replaces the video intro as the home/start screen.
            // Level taps route through the existing briefing flow. If the
            // globe cannot start, the static Start button is restored and
            // routes through the normal menu flow.
            mountGlobeHome({
                onPlayLevel: (levelId) => window.game.selectLevel(levelId),
                onStartFallback: () => window.game.showScreen('menu'),
            });
        });
import('./ui/onboarding.js').then((m) => m.maybeShowOnboarding());
