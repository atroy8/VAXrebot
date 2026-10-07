// EpidemicSimulator: orchestration only. Sim math lives in src/sim/*,
// rendering in src/ui/*, audio in src/audio.js. Still exposed as window.game.
import { scenarios } from './config/scenarios.js';
import { difficulties } from './config/difficulties.js';
import { tools } from './config/tools.js';
import { generateNetwork } from './sim/network.js';
import { initGameState } from './sim/state.js';
import {
    simulateSpread,
    updateOutcomes,
    checkGameOver as resolveGameOver,
    canUseTool,
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
import { populateMenus, fillBriefing, markDifficultySelected } from './ui/briefing.js';
import { AudioEngine } from './audio.js';

export class EpidemicSimulator {
    constructor() {
        this.currentScreen = 'welcome';
        this.currentScenario = null;
        this.selectedDifficulty = 'medium';
        this.gameState = null;
        this.network = { nodes: [], links: [] };
        this.selectedTool = null;

        this.scenarios = scenarios;
        this.difficulties = difficulties;
        this.tools = tools;

        this.audio = new AudioEngine(() => this.currentScreen);
        this.view = new NetworkView();

        this.init();
    }

    init() {
        this.audio.initAudio();
        populateMenus(this.scenarios, this.difficulties);
        this.bindEvents();
        this.showScreen('welcome');
    }

    bindEvents() {
        document.getElementById('start-game-btn').addEventListener('click', () => this.showScreen('menu'));

        document.querySelector('.scenario-grid').addEventListener('click', (e) => {
            const card = e.target.closest('.scenario-card');
            if (card) this.selectScenario(card.dataset.scenario);
        });

        document.querySelector('.difficulty-grid').addEventListener('click', (e) => {
            const card = e.target.closest('.difficulty-card');
            if (card) this.selectDifficulty(card.dataset.difficulty);
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
            this.audio.startThemeMusic();
        } else {
            this.audio.stopThemeMusic();
        }
    }

    selectScenario(scenarioId) {
        this.currentScenario = this.scenarios[scenarioId];
        fillBriefing(this.currentScenario);
        this.selectDifficulty('medium'); // Default to medium
        this.showScreen('briefing');
    }

    selectDifficulty(difficultyId) {
        this.selectedDifficulty = difficultyId;
        markDifficultySelected(difficultyId, this.difficulties[difficultyId].R0);
    }

    startGame() {
        this.gameState = initGameState(this.tools);
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
        if (toolId === 'vaccinate') {
            node.state = 'vaccinated';
            this.gameState.stats.totalProtected++;
            logMessage = `Person ${node.id} has been vaccinated.`;
        } else if (toolId === 'quarantine') {
            node.state = 'quarantined';
            this.gameState.stats.totalProtected++;
            logMessage = `Person ${node.id} has been quarantined.`;
        }

        node.removed = true;
        this.audio.playSound(800, 0.2, 'sine');

        this.network.nodes = this.network.nodes.filter((n) => !n.removed);
        this.network.links = this.network.links.filter((l) => !l.source.removed && !l.target.removed);

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
    }

    checkGameOver() {
        const result = resolveGameOver(this.gameState, this.network, this.currentScenario.duration);
        if (result) {
            this.gameState.gameOver = true;
            this.audio.playSound(261, 1.0, 'sine');
            setTimeout(() => this.showGameOver(), 1000);
        }
    }

    showGameOver() {
        const success = this.network.nodes.filter((n) => n.state === 'infected').length === 0;
        renderGameOver({ success, stats: this.gameState.stats, difficultyId: this.selectedDifficulty });
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
            scenarioName: this.currentScenario.name,
            difficultyName: difficulty.name,
            difficultyId: this.selectedDifficulty,
            day: this.gameState.day,
            infected: this.network.nodes.filter((n) => n.state === 'infected').length,
            protected: this.gameState.stats.totalProtected,
            population: this.network.nodes.length,
        });
        renderTools(this.tools, difficulty, this.gameState.day, this.gameState.dailyUsage);
    }

    togglePause() {
        this.gameState.paused = !this.gameState.paused;
        document.getElementById('pause-game').innerHTML = this.gameState.paused ? '▶️ Resume' : '⏸️ Pause';
        this.view.setPaused(this.gameState.paused);
    }
}
