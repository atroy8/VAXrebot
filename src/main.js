import './styles.css';
import { EpidemicSimulator } from './game.js';

        document.addEventListener('DOMContentLoaded', () => {
            window.game = new EpidemicSimulator();
        });
