// EpidemicSimulator: orchestration only. Sim math lives in src/sim/*,
// rendering in src/ui/*, audio in src/audio.js. Still exposed as window.game.
import { scenarios } from './config/scenarios.js';
import { difficulties } from './config/difficulties.js';
import { tools } from './config/tools.js';
import { LEVELS, REGIONS, levelById } from './config/levels.js';
import { createStorage, loadSave, writeSave } from './save.js';
import {
    isLevelUnlocked,
    calculateStars,
    fundingAward,
    livesSavedForRun,
    recordCompletion,
} from './progress.js';
import { generateNetwork } from './sim/network.js';
import { initGameState } from './sim/state.js';
import {
    simulateSpread,
    updateOutcomes,
    checkGameOver as resolveGameOver,
    canUseTool,
    canAdvanceDay,
} from './sim/engine.js';
import { showScreen as renderScreen } from './ui/screens.js';
import { NetworkView } from './ui/network-view.js';
import {
    renderHeader,
    renderTools,
    addLogEntry,
    showNotification,
    renderGameOver,
} from './ui/panels.js';
import { populateDifficulties, fillBriefing, setFixedDifficulty } from './ui/briefing.js';
import { renderLevelSelect } from './ui/level-select.js';
import { AudioEngine } from './audio.js';
import introVideoUrl from './assets/intro.mp4';

// Music-hook thresholds (stingers are implemented by the audio track; every
// call below uses optional chaining so nothing breaks if they land later):
// - 'spike': a single day produces SPIKE_INFECTION_THRESHOLD or more new infections
// - 'milestone': totalProtected crosses any MILESTONE_THRESHOLDS value
// - 'win' / 'loss': game ends contained (win) or overwhelmed/timeout (loss)
const SPIKE_INFECTION_THRESHOLD = 8;
const MILESTONE_THRESHOLDS = [25, 50, 75];

export class EpidemicSimulator {
    constructor() {
        this.currentScreen = 'welcome';
        this.currentScenario = null;
        this.currentLevel = null;
        this.selectedDifficulty = 'medium';
        this.gameState = null;
        this.network = { nodes: [], links: [] };
        this.selectedTool = null;

        this.scenarios = scenarios;
        this.difficulties = difficulties;
        this.tools = tools;

        // Progression: versioned save behind a swappable storage backend.
        this.storage = createStorage();
        this.save = loadSave(this.storage);

        this.audio = new AudioEngine(() => this.currentScreen);
        this.view = new NetworkView();

        this.init();
    }

    init() {
        this.audio.initAudio();
        populateDifficulties(this.difficulties);
        this.refreshLevelSelect();
        this.bindEvents();
        this.setupIntro();
        this.showScreen('welcome');
    }

    refreshLevelSelect() {
        renderLevelSelect({ save: this.save, levels: LEVELS, regions: REGIONS });
    }

    // Looping video intro: bundled MP4 (fully offline), title as HTML
    // overlay, screen holds until the player taps Start. Browsers block
    // audio before the first user gesture, so the ambient loop starts on
    // the first pointer interaction with the intro screen. startGameMusic
    // is a safe no-op when the music toggle is off.
    setupIntro() {
        const video = document.getElementById('intro-video');
        if (video) video.src = introVideoUrl;
        const welcome = document.getElementById('welcome-screen');
        if (welcome) {
            welcome.addEventListener('pointerdown', () => this.audio.startGameMusic(), { once: true });
        }
    }

    bindEvents() {
        document.getElementById('start-game-btn').addEventListener('click', () => this.showScreen('menu'));

        document.getElementById('level-grid').addEventListener('click', (e) => {
            const card = e.target.closest('.level-card');
            if (card && !card.classList.contains('locked')) this.selectLevel(card.dataset.level);
        });

        document.getElementById('back-to-menu').addEventListener('click', () => this.showScreen('menu'));
        document.getElementById('start-simulation').addEventListener('click', () => this.startGame());
        document.getElementById('next-day').addEventListener('click', () => this.nextDay());
        document.getElementById('pause-game').addEventListener('click', () => this.togglePause());
        document.getElementById('tools-list').addEventListener('click', (e) => {
            const toolItem = e.target.closest('.tool-item');
            if (toolItem && !toolItem.classList.contains('disabled')) {
                this.selectTool(toolItem.dataset.tool);
            }
        });
        document.getElementById('play-again').addEventListener('click', () => this.startGame());
        document.getElementById('try-different-scenario').addEventListener('click', () => this.showScreen('menu'));

        // Volume control
        document.getElementById('master-volume').addEventListener('input', (e) => {
            this.audio.setVolume(e.target.value);
        });
    }

    showScreen(screenName) {
        renderScreen(screenName);
        this.currentScreen = screenName;

        if (screenName === 'menu') {
            this.refreshLevelSelect();
            this.audio.stopGameMusic(); // intro ambient loop yields to the menu theme
            this.audio.startThemeMusic();
        } else {
            this.audio.stopThemeMusic();
        }
    }

    selectLevel(levelId) {
        if (!isLevelUnlocked(this.save, LEVELS, REGIONS, levelId)) return;
        const level = levelById(levelId);
        if (!level) return;
        this.currentLevel = level;
        this.currentScenario = this.scenarios[level.scenarioId];
        this.selectedDifficulty = level.difficultyId;
        // Briefing shows the mission name; the disease profile still comes
        // from the underlying scenario.
        fillBriefing({ ...this.currentScenario, name: level.name, description: level.blurb });
        setFixedDifficulty(level.difficultyId, this.difficulties);
        this.showScreen('briefing');
    }

    startGame() {
        // Population varies per scenario: pick uniformly from the scenario's
        // range so each run feels different. The 8%-or-5-deaths loss rule
        // keeps the math fair at any size.
        const [popMin, popMax] = this.currentScenario.populationRange;
        const population = popMin + Math.floor(Math.random() * (popMax - popMin + 1));
        this.gameState = initGameState(this.tools, population);
        this.createNetwork();
        this.view.setup({
            onNodeClick: (event, node) => this.handleNodeClick(event, node),
            onLinkClick: (event, link) => this.handleLinkClick(event, link),
        });
        this.view.update(this.network.nodes, this.network.links, true);
        this.updateUI();
        this.showScreen('game');
        addLogEntry(this.gameState.day, `Simulation started for ${this.currentScenario.name}.`, true);
    }

    createNetwork() {
        const n = this.gameState.stats.initialPopulation;
        const nodes = Array.from({ length: n }, (_, i) => ({ id: i, state: 'healthy', daysInfected: 0, removed: false }));
        const { links } = generateNetwork(this.currentScenario.networkType, n);

        // Infect initial nodes
        for (let i = 0; i < this.currentScenario.initialInfected; i++) {
            let node;
            do {
                node = nodes[Math.floor(Math.random() * n)];
            } while (node.state === 'infected');
            node.state = 'infected';
            this.gameState.stats.totalInfected++;
        }

        this.network = { nodes, links };
    }

    handleNodeClick(event, node) {
        if (this.selectedTool === 'severLink') return; // Sever tool only works on links
        if (!this.selectedTool || node.removed) return;

        const { allowed, reason } = canUseTool(
            this.gameState,
            this.tools,
            this.selectedTool,
            this.difficulties[this.selectedDifficulty],
            node
        );
        if (!allowed) {
            showNotification(reason, 'error');
            return;
        }
        this.applyToolToNode(this.selectedTool, node);
    }

    handleLinkClick(event, link) {
        if (this.selectedTool !== 'severLink') return;
        const { allowed, reason } = canUseTool(
            this.gameState,
            this.tools,
            'severLink',
            this.difficulties[this.selectedDifficulty]
        );
        if (!allowed) {
            showNotification(reason, 'error');
            return;
        }
        this.applyToolToLink(link);
    }

    applyToolToNode(toolId, node) {
        this.gameState.dailyUsage[toolId]++;
        if (this.tools[toolId].oncePerPerson) this.gameState.usedOnPeople.add(`${toolId}-${node.id}`);

        let logMessage = '';
        if (toolId === 'vaccinate' || toolId === 'quarantine') {
            // Protected nodes stay visible: re-state the node instead of
            // removing it. The network view renders node.state to its CSS
            // class, so .node.vaccinated / .node.quarantined styling applies.
            // Quarantining a sick node is isolation, not a cure: it keeps the
            // flag so the sim keeps ticking its illness and counts it active.
            const prevProtected = this.gameState.stats.totalProtected;
            if (toolId === 'vaccinate') {
                node.state = 'vaccinated';
            } else {
                node.sickWhileQuarantined = node.state === 'infected';
                node.state = 'quarantined';
            }
            this.gameState.stats.totalProtected++;
            logMessage =
                toolId === 'vaccinate'
                    ? `Person ${node.id} has been vaccinated.`
                    : `Person ${node.id} has been quarantined.`;
            // Music hook: milestone stinger each time totalProtected crosses
            // 25, 50, or 75. Called with optional chaining; safe if the audio
            // track has not landed yet.
            if (MILESTONE_THRESHOLDS.some((m) => prevProtected < m && this.gameState.stats.totalProtected >= m)) {
                this.audio.playStinger?.('milestone');
            }
        }

        this.audio.playSound(800, 0.2, 'sine');

        showNotification(logMessage, 'success');
        addLogEntry(this.gameState.day, logMessage);
        this.updateUI();
        this.view.update(this.network.nodes, this.network.links);
    }

    applyToolToLink(linkToRemove) {
        this.gameState.dailyUsage.severLink++;
        this.gameState.stats.linksSevered++;

        this.network.links = this.network.links.filter((l) => l !== linkToRemove);

        const logMessage = `Connection between ${linkToRemove.source.id} and ${linkToRemove.target.id} severed.`;
        showNotification(logMessage, 'success');
        addLogEntry(this.gameState.day, logMessage);
        this.audio.playSound(400, 0.15, 'sawtooth');
        this.updateUI();
        this.view.update(this.network.nodes, this.network.links);
    }

    nextDay() {
        if (this.gameState.gameOver) return;
        if (!canAdvanceDay(this.gameState)) {
            showNotification('The game is paused. Resume to advance the day.', 'info');
            return;
        }
        this.gameState.day++;
        Object.keys(this.gameState.dailyUsage).forEach((tool) => (this.gameState.dailyUsage[tool] = 0));

        const transmissionRate =
            this.currentScenario.baseTransmissionRate * this.difficulties[this.selectedDifficulty].transmissionMultiplier;
        const { events, count } = simulateSpread(this.gameState, this.network, transmissionRate);
        for (const { source, target } of events) {
            this.view.animateVirus(source, target);
            this.audio.playSound(150, 0.2, 'triangle');
        }
        if (count > 0) addLogEntry(this.gameState.day, `${count} new infections reported.`, true);
        // Music hook: spike stinger when a day produces 8+ new infections.
        if (count >= SPIKE_INFECTION_THRESHOLD) {
            this.audio.playStinger?.('spike');
        }

        const difficulty = this.difficulties[this.selectedDifficulty];
        const outcomes = updateOutcomes(this.gameState, this.network, difficulty.recoveryTime, difficulty.fatalityRate);
        for (const { node, outcome } of outcomes) {
            addLogEntry(
                this.gameState.day,
                outcome === 'died' ? `Person ${node.id} has died from the infection.` : `Person ${node.id} has recovered.`
            );
        }
        if (outcomes.some((o) => o.outcome === 'died')) {
            this.view.update(this.network.nodes, this.network.links);
        }

        this.checkGameOver();

        this.audio.playSound(600, 0.1, 'sine');
        addLogEntry(this.gameState.day, `Day ${this.gameState.day} begins.`, true);
        this.updateUI();
        this.view.update(this.network.nodes, this.network.links);
        // Music hook: let the audio track adjust the mood after each day.
        this.audio.updateMood?.(this.gameState.stats);
    }

    checkGameOver() {
        const result = resolveGameOver(this.gameState, this.network, this.currentScenario.duration);
        if (result) {
            this.gameState.gameOver = true;
            this.gameState.outcome = result;
            this.audio.playSound(261, 1.0, 'sine');
            // Music hook: 'win' for contained, 'loss' for overwhelmed or timeout.
            this.audio.playStinger?.(result === 'contained' ? 'win' : 'loss');
            this.audio.stopGameMusic?.();
            setTimeout(() => this.showGameOver(), 1000);
        }
    }

    showGameOver() {
        const outcome = this.gameState.outcome;
        const stats = this.gameState.stats;
        // Progression: record stars, funding, and lives saved, then persist.
        // recordCompletion only banks rewards on a 'contained' win.
        const stars = calculateStars(outcome, stats);
        const fundingEarned = fundingAward(stars);
        const livesSaved = livesSavedForRun(outcome, stats);
        if (this.currentLevel) {
            this.save = recordCompletion(this.save, this.currentLevel.id, outcome, stats);
            writeSave(this.storage, this.save);
        }
        renderGameOver({
            outcome,
            stats,
            difficultyId: this.selectedDifficulty,
            stars,
            fundingEarned,
            livesSaved,
        });
        this.showScreen('game-over');
    }

    selectTool(toolId) {
        this.selectedTool = this.selectedTool === toolId ? null : toolId;
        document.querySelectorAll('.tool-item').forEach((item) => {
            item.classList.toggle('selected', item.dataset.tool === this.selectedTool);
        });
    }

    updateUI() {
        const difficulty = this.difficulties[this.selectedDifficulty];
        renderHeader({
            scenarioName: this.currentLevel ? this.currentLevel.name : this.currentScenario.name,
            difficultyName: difficulty.name,
            difficultyId: this.selectedDifficulty,
            day: this.gameState.day,
            infected: this.network.nodes.filter((n) => n.state === 'infected').length,
            protected: this.gameState.stats.totalProtected,
            population: this.network.nodes.length,
            paused: this.gameState.paused,
        });
        renderTools(this.tools, difficulty, this.gameState.day, this.gameState.dailyUsage);
        // Real pause: the Next Day button is disabled while paused (nextDay()
        // also early-returns via canAdvanceDay as a second layer).
        const nextDayBtn = document.getElementById('next-day');
        if (nextDayBtn) nextDayBtn.disabled = this.gameState.paused;
    }

    togglePause() {
        this.gameState.paused = !this.gameState.paused;
        document.getElementById('pause-game').innerHTML = this.gameState.paused ? '▶️ Resume' : '⏸️ Pause';
        // D3 side: NetworkView exposes its force simulation through
        // setPaused(), which calls .stop() / .restart() internally.
        this.view.setPaused(this.gameState.paused);
        this.updateUI();
    }
}
