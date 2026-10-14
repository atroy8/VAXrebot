// EpidemicSimulator: orchestration only. Sim math lives in src/sim/*,
// rendering in src/ui/*, audio in src/audio.js. Still exposed as window.game.
import { scenarios } from './config/scenarios.js';
import { difficulties } from './config/difficulties.js';
import { tools } from './config/tools.js';
import { LEVELS, REGIONS, levelById } from './config/levels.js';
import { createStorage, loadSave, writeSave, resetSave } from './save.js';
import { createMonetization } from './monetization/monetization.js';
import { createWebAdProvider } from './monetization/ad-provider-web.js';
import { mountSettings } from './ui/settings.js';
import {
    isLevelUnlocked,
    calculateStars,
    fundingAward,
    livesSavedForRun,
    recordCompletion,
} from './progress.js';
import { isPowerUp, usePowerUp, getCharges, getFunding } from './economy.js';
import './ui/game-screen.css';
import { toolHint, dayBanner } from './ui/game-screen-model.js';
import { mountShop, renderShop } from './ui/shop.js';
import { generateNetwork } from './sim/network.js';
import { initGameState } from './sim/state.js';
import { checkGameOver as resolveGameOver, canUseTool, canAdvanceDay } from './sim/engine.js';
import {
    applyNodeTool,
    severLink,
    advanceDay,
    allActionsSpent,
    actionsRemaining,
    caseCapFor,
    effectiveR,
} from './sim/actions.js';
import { levelRules } from './config/level-rules.js';
import { createAutoAdvance } from './ui/auto-advance.js';
import { showScreen as renderScreen } from './ui/screens.js';
import { createViewLoader } from './ui/view-loader.js';
import { lessonFor, debriefLine } from './config/lessons.js';
import {
    renderHeader,
    renderTools,
    renderLegend,
    addLogEntry,
    showNotification,
    showToolHint,
    showDayBanner,
    renderGameOver,
} from './ui/panels.js';
import { populateDifficulties, fillBriefing, setFixedDifficulty, fillLessonCard } from './ui/briefing.js';
import { renderLevelSelect } from './ui/level-select.js';
import { AudioEngine } from './audio.js';

// Music-hook thresholds (stingers are implemented by the audio track; every
// call below uses optional chaining so nothing breaks if they land later):
// - 'spike': a single day produces SPIKE_INFECTION_THRESHOLD or more new infections
// - 'milestone': totalProtected crosses any MILESTONE_THRESHOLDS value
// - 'win' / 'loss': game ends contained (win) or overwhelmed/timeout (loss)
const SPIKE_INFECTION_THRESHOLD = 8;
const MILESTONE_THRESHOLDS = [25, 50, 75];
// Auto-advance: once every daily action is spent the day ends on its own
// after this delay (the player can Hold, use power-ups, or tap Next day).
const AUTO_ADVANCE_MS = 3000;

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

        // Monetization: Remove Ads entitlement plus between-level ad pacing.
        // The web build uses a labeled sample ad; the App Store build swaps
        // in AdMob behind the same provider contract.
        this.monetization = createMonetization({
            storage: this.storage,
            provider: createWebAdProvider({ onRemoveAds: () => this.settings?.open() }),
        });

        this.audio = new AudioEngine(() => this.currentScreen);
        // The 3D network view (and three.js) loads on demand: see view-loader.js.
        this.view = null;
        this.viewLoader = createViewLoader(() => import('./ui/network-view-3d.js'));
        this.activeDifficulty = null; // level difficulty with tuning applied
        this.lastR = null;
        this.autoAdvance = createAutoAdvance({
            delayMs: AUTO_ADVANCE_MS,
            onTick: (left, progress) => this.renderCountdown(left, progress),
            onFire: () => this.nextDay(),
            onStop: () => this.renderCountdown(null),
        });

        this.init();
    }

    init() {
        this.audio.initAudio();
        populateDifficulties(this.difficulties);
        this.refreshLevelSelect();
        this.bindEvents();
        this.setupIntro();
        this.settings = mountSettings({
            monetization: this.monetization,
            notify: (msg) => showNotification(msg, 'info'),
            onResetProgress: () => {
                this.save = resetSave(this.storage);
                window.location.reload();
            },
        });
        renderLegend();
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
        // The globe home screen owns first-gesture audio now; keep the
        // welcome-screen tap listener as a fallback music starter.
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
        document.getElementById('hold-advance').addEventListener('click', () => this.autoAdvance.hold());
        document.getElementById('pause-game').addEventListener('click', () => this.togglePause());
        document.getElementById('resume-game').addEventListener('click', () => this.togglePause());
        const tray = document.getElementById('tools-list');
        tray.addEventListener('scroll', () => {
            tray.classList.toggle('at-end', tray.scrollLeft + tray.clientWidth >= tray.scrollWidth - 4);
        }, { passive: true });
        document.getElementById('shop-sheet').addEventListener('click', (e) => {
            if (e.target.closest('[data-shop-close]')) this.closeShop();
        });
        // Onboarding re-entry: reopen the How to play overlay on demand.
        // Lazy import keeps it out of the initial bundle path.
        document.getElementById('how-to-play').addEventListener('click', () => {
            import('./ui/onboarding.js').then((m) => m.showOnboarding());
        });
        document.getElementById('tools-list').addEventListener('click', (e) => {
            const toolItem = e.target.closest('.tool-item');
            if (!toolItem || !this.gameState) return;
            const toolId = toolItem.dataset.tool;
            if (toolId === 'shop' || toolItem.classList.contains('empty')) {
                this.openShop();
                return;
            }
            // Locked or spent tools explain themselves instead of doing nothing.
            if (toolItem.classList.contains('disabled')) {
                const { reason } = canUseTool(this.gameState, this.tools, toolId, this.difficulty);
                if (reason) showNotification(reason.replace(/^[^A-Za-z]+/, ''), 'info');
                return;
            }
            // Power-ups are instant consumables: route through the economy
            // module, which spends one charge and applies the effect through
            // the game's tool system. Everything else selects as before.
            if (isPowerUp(toolId)) {
                this.usePowerUpFlow(toolId);
            } else {
                this.selectTool(toolId);
            }
        });
        // Leaving the results screen is the only place an ad may show.
        document.getElementById('play-again').addEventListener('click', () => this.leaveResults(() => this.startGame()));
        document
            .getElementById('try-different-scenario')
            .addEventListener('click', () => this.leaveResults(() => this.showScreen('menu')));

        // Volume control
        document.getElementById('master-volume').addEventListener('input', (e) => {
            this.audio.setVolume(e.target.value);
        });
    }

    // The rules in force: the level's tuned difficulty when a level is
    // selected, otherwise the shared difficulty config.
    get difficulty() {
        return this.activeDifficulty || this.difficulties[this.selectedDifficulty];
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
        // Level tuning (starting cases, spread, case cap, daily caps) is
        // applied on top of the shared scenario and difficulty configs.
        const rules = levelRules(level);
        this.currentScenario = rules.scenario;
        this.activeDifficulty = rules.difficulty;
        this.selectedDifficulty = level.difficultyId;
        // Briefing shows the mission name; the disease profile still comes
        // from the underlying scenario.
        fillBriefing({ ...this.currentScenario, name: level.name, description: level.blurb });
        setFixedDifficulty(level.difficultyId, this.difficulties);
        const lesson = lessonFor(level.id);
        fillLessonCard('briefing-lesson', lesson?.title, lesson?.brief);
        // Start fetching the network view while the player reads the briefing.
        this.viewLoader.prefetch();
        this.showScreen('briefing');
    }

    async startGame() {
        if (this.startingGame) return;
        if (!this.view) {
            this.startingGame = true;
            try {
                const { NetworkView } = await this.viewLoader.load();
                this.view = new NetworkView();
            } catch (err) {
                showNotification('Could not load the map. Tap Begin Containment to try again.', 'info');
                return;
            } finally {
                this.startingGame = false;
            }
        }
        // Population varies per scenario: pick uniformly from the scenario's
        // range so each run feels different. The 8%-or-5-deaths loss rule
        // keeps the math fair at any size.
        const [popMin, popMax] = this.currentScenario.populationRange;
        const population = popMin + Math.floor(Math.random() * (popMax - popMin + 1));
        this.autoAdvance.cancel();
        this.lastR = null;
        this.gameState = initGameState(this.tools, population);
        this.createNetwork();
        this.selectedTool = null;
        showToolHint('');
        this.closeShop();
        document.getElementById('game-screen').classList.remove('is-paused');
        document.getElementById('pause-game').setAttribute('aria-pressed', 'false');
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
            this.difficulty,
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
            this.difficulty
        );
        if (!allowed) {
            showNotification(reason, 'error');
            return;
        }
        this.applyToolToLink(link);
    }

    applyToolToNode(toolId, node) {
        let logMessage = '';
        if (toolId === 'vaccinate' || toolId === 'quarantine') {
            // Shared pure action (src/sim/actions.js): the balance bot runs
            // the same code. Quarantining a sick node is isolation, not a
            // cure; it keeps ticking and counts as active until it resolves.
            const prevProtected = this.gameState.stats.totalProtected;
            applyNodeTool(this.gameState, this.tools, toolId, node);
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

        addLogEntry(this.gameState.day, logMessage);
        this.updateUI();
        this.view.update(this.network.nodes, this.network.links);
        this.afterAction();
    }

    applyToolToLink(linkToRemove) {
        // Snip effect first, while both ends still exist in the view.
        this.view.animateSever?.(linkToRemove);
        severLink(this.gameState, this.network, linkToRemove);

        const logMessage = `Connection between ${linkToRemove.source.id} and ${linkToRemove.target.id} severed.`;
        addLogEntry(this.gameState.day, logMessage);
        if (this.audio.playSnip) this.audio.playSnip();
        else this.audio.playSound(400, 0.15, 'sawtooth');
        // Haptic tick on phones (Capacitor Haptics replaces this natively).
        if (navigator.vibrate) navigator.vibrate(18);
        this.updateUI();
        this.view.update(this.network.nodes, this.network.links);
        this.afterAction();
    }

    // After every action: when no daily actions are left, start the
    // auto-advance countdown. Power-ups and Next day stay available.
    afterAction() {
        if (!this.gameState || this.gameState.gameOver || this.gameState.paused) return;
        if (allActionsSpent(this.gameState, this.tools, this.difficulty)) this.autoAdvance.start();
    }

    // Countdown display on the Next day button; null clears it.
    renderCountdown(leftMs, progress = 0) {
        const btn = document.getElementById('next-day');
        const hold = document.getElementById('hold-advance');
        if (!btn) return;
        if (leftMs == null) {
            btn.classList.remove('counting');
            btn.style.removeProperty('--progress');
            btn.textContent = 'Next day';
            if (hold) hold.hidden = true;
            return;
        }
        btn.classList.add('counting');
        btn.style.setProperty('--progress', String(progress));
        btn.textContent = `Next day in ${Math.ceil(leftMs / 1000)}`;
        if (hold) hold.hidden = false;
    }

    nextDay() {
        if (this.gameState.gameOver) return;
        if (!canAdvanceDay(this.gameState)) {
            showNotification('The game is paused. Resume to advance the day.', 'info');
            return;
        }
        this.autoAdvance.cancel();
        const difficulty = this.difficulty;
        const { spread, outcomes, result, activeBefore } = advanceDay(this.gameState, this.network, {
            scenario: this.currentScenario,
            difficulty,
        });
        const { events, count } = spread;
        // Smooth day-to-day noise: blend today's R with yesterday's.
        const rToday = effectiveR(count, activeBefore, difficulty.recoveryTime);
        this.lastR = rToday == null ? this.lastR : this.lastR == null ? rToday : 0.5 * rToday + 0.5 * this.lastR;
        for (const { source, target } of events) {
            this.view.animateVirus(source, target);
            this.audio.playSound(150, 0.2, 'triangle');
        }
        if (count > 0) addLogEntry(this.gameState.day, `${count} new infections reported.`, true);
        // Music hook: spike stinger when a day produces 8+ new infections.
        if (count >= SPIKE_INFECTION_THRESHOLD) {
            this.audio.playStinger?.('spike');
        }

        for (const { node, outcome } of outcomes) {
            addLogEntry(
                this.gameState.day,
                outcome === 'died' ? `Person ${node.id} has died from the infection.` : `Person ${node.id} has recovered.`
            );
        }
        const died = outcomes.filter((o) => o.outcome === 'died').length;
        if (!result) {
            showDayBanner(dayBanner({ day: this.gameState.day - 1, newCases: count, recovered: outcomes.length - died, died }));
        }
        if (died > 0) {
            this.view.update(this.network.nodes, this.network.links);
        }

        if (result) this.finishGame(result);

        this.audio.playSound(600, 0.1, 'sine');
        addLogEntry(this.gameState.day, `Day ${this.gameState.day} begins.`, true);
        this.updateUI();
        this.view.update(this.network.nodes, this.network.links);
        // Music hook: let the audio track adjust the mood after each day.
        this.audio.updateMood?.(this.gameState.stats);
    }

    // Mid-day check (power-ups can end the outbreak outright).
    checkGameOver() {
        const result = resolveGameOver(
            this.gameState,
            this.network,
            this.currentScenario.duration,
            caseCapFor(this.gameState, this.currentScenario)
        );
        if (result) this.finishGame(result);
    }

    finishGame(result) {
        if (this.gameState.gameOver) return;
        this.autoAdvance.cancel();
        this.gameState.gameOver = true;
        this.gameState.outcome = result;
        this.audio.playSound(261, 1.0, 'sine');
        // Music hook: 'win' for contained, 'loss' for everything else
        // (overwhelmed, timeout, burnout: none of them are victories).
        this.audio.playStinger?.(result === 'contained' ? 'win' : 'loss');
        this.audio.stopGameMusic?.();
        setTimeout(() => this.showGameOver(), 1000);
    }

    // Between levels: maybe show an interstitial (free version only, at most
    // one per two levels), then continue. Never blocks if the ad fails.
    async leaveResults(next) {
        if (this.leavingResults) return;
        this.leavingResults = true;
        try {
            await this.monetization.maybeShowInterstitial({ inLevel: false });
        } finally {
            this.leavingResults = false;
            next();
        }
    }

    showGameOver() {
        const outcome = this.gameState.outcome;
        const stats = this.gameState.stats;
        // Progression: record stars, funding, and lives saved, then persist.
        // recordCompletion only banks rewards on a 'contained' win.
        // Points-to-stars scoring needs the run length and the level target.
        stats.daysUsed = this.gameState.day;
        const stars = calculateStars(outcome, stats, this.currentLevel);
        const fundingEarned = fundingAward(stars);
        const livesSaved = livesSavedForRun(outcome, stats);
        if (this.currentLevel) {
            this.save = recordCompletion(this.save, this.currentLevel.id, outcome, stats);
            writeSave(this.storage, this.save);
        }
        // Toasts from the last day should not cover the results.
        document.getElementById('notification-container')?.replaceChildren();
        showToolHint('');
        this.monetization.onLevelFinished();
        renderGameOver({
            outcome,
            stats,
            difficultyId: this.selectedDifficulty,
            stars,
            fundingEarned,
            livesSaved,
            caseCap: caseCapFor(this.gameState, this.currentScenario),
        });
        const lesson = this.currentLevel ? lessonFor(this.currentLevel.id) : null;
        fillLessonCard('game-over-lesson', lesson?.title, debriefLine(lesson, outcome));
        this.showScreen('game-over');
    }

    selectTool(toolId) {
        this.selectedTool = this.selectedTool === toolId ? null : toolId;
        this.view.setToolMode?.(this.selectedTool);
        document.querySelectorAll('.tool-item').forEach((item) => {
            const on = item.dataset.tool === this.selectedTool;
            item.classList.toggle('selected', on);
            item.setAttribute('aria-pressed', String(on));
        });
        showToolHint(this.selectedTool ? toolHint(this.selectedTool, this.tools) : '');
    }

    // Power-up flow: hand the economy module the gameApi it needs, spend
    // one charge, and sync the persisted save back onto this.save.
    usePowerUpFlow(powerUpId) {
        const gameApi = {
            network: this.network,
            gameState: this.gameState,
            log: (day, message, important) => addLogEntry(day, message, important),
            notify: (message, type) => showNotification(message, type),
            refreshUI: () => this.updateUI(),
            updateView: () => this.view.update(this.network.nodes, this.network.links),
            checkGameOver: () => this.checkGameOver(),
            playSound: (freq, dur, type) => this.audio.playSound(freq, dur, type),
        };
        const result = usePowerUp(powerUpId, gameApi);
        if (result.save) this.save = result.save;
        this.updateUI();
    }

    // Power-up shop: a bottom sheet opened from the Shop chip, or by tapping
    // a power-up that has no charges left.
    refreshShop() {
        if (!this.shopEl || !document.getElementById('powerup-shop')) {
            this.shopEl = mountShop();
            document.getElementById('shop-sheet-body')?.appendChild(this.shopEl);
        }
        renderShop(this.shopEl, {
            onPurchase: ({ save }) => {
                if (save) this.save = save;
                this.updateUI();
            },
        });
    }

    openShop() {
        this.refreshShop();
        const sheet = document.getElementById('shop-sheet');
        if (sheet) sheet.hidden = false;
    }

    closeShop() {
        const sheet = document.getElementById('shop-sheet');
        if (sheet) sheet.hidden = true;
    }

    updateUI() {
        const difficulty = this.difficulty;
        renderHeader({
            scenarioName: this.currentLevel ? this.currentLevel.name : this.currentScenario.name,
            difficultyName: difficulty.name,
            difficultyId: this.selectedDifficulty,
            day: this.gameState.day,
            infected: this.network.nodes.filter((n) => n.state === 'infected').length,
            protected: this.gameState.stats.totalProtected,
            population: this.network.nodes.length,
            paused: this.gameState.paused,
            cases: this.gameState.stats.totalInfected,
            caseCap: caseCapFor(this.gameState, this.currentScenario),
            r: this.lastR,
            actionsLeft: actionsRemaining(this.gameState, this.tools, this.difficulty),
        });
        renderTools(this.tools, difficulty, this.gameState.day, this.gameState.dailyUsage, {
            charges: getCharges(),
            funding: getFunding(),
            selected: this.selectedTool,
        });
        if (!document.getElementById('shop-sheet')?.hidden) this.refreshShop();
        // Real pause: the Next Day button is disabled while paused (nextDay()
        // also early-returns via canAdvanceDay as a second layer).
        const nextDayBtn = document.getElementById('next-day');
        if (nextDayBtn) nextDayBtn.disabled = this.gameState.paused;
    }

    togglePause() {
        this.gameState.paused = !this.gameState.paused;
        const pauseBtn = document.getElementById('pause-game');
        pauseBtn.setAttribute('aria-pressed', String(this.gameState.paused));
        pauseBtn.setAttribute('aria-label', this.gameState.paused ? 'Resume' : 'Pause');
        document.getElementById('game-screen').classList.toggle('is-paused', this.gameState.paused);
        // D3 side: NetworkView exposes its force simulation through
        // setPaused(), which calls .stop() / .restart() internally.
        this.view.setPaused(this.gameState.paused);
        if (this.gameState.paused) this.autoAdvance.cancel();
        else this.afterAction();
        this.updateUI();
    }
}
