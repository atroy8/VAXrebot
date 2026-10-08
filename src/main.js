import './styles.css';
import '@fontsource/fredoka/500.css';
import '@fontsource/fredoka/700.css';
import { EpidemicSimulator } from './game.js';
import { mountGlobeHome } from './ui/screens.js';

        document.addEventListener('DOMContentLoaded', () => {
            window.game = new EpidemicSimulator();
            // The 3D globe replaces the video intro as the home/start screen.
            // Level taps route through the existing briefing flow.
            mountGlobeHome({ onPlayLevel: (levelId) => window.game.selectLevel(levelId) });
        });
import('./ui/onboarding.js').then((m) => m.maybeShowOnboarding());
