// EpidemicSimulator: orchestration only. Sim math lives in src/sim/*,
// rendering in src/ui/*, audio in src/audio.js. Still exposed as window.game.
import { scenarios } from './config/scenarios.js';
import { difficulties } from './config/difficulties.js';
import { tools } from './config/tools.js';
import { LEVELS, REGIONS, levelById } from './config/levels.js';
import { createStorage, loadSave, writeSave, resetSave } from './save.js';
import { createMonetization } from './monetization/monetization.js';
import { createWebAdProvider } from './monetization/ad-provider-web.js';
import { pickAdProvider } from './monetization/ad-provider-admob.js';
import { careBonus, newlyUnlockedChests } from './rewards.js';
import { playResultsTally } from './ui/results-tally.js';
import { CHESTS } from './config/chests.js';
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
import './ui/averted.css';
import './ui/variants.css';
import { toolHint, dayBanner, rFellBelowOne, R_BELOW_ONE_TEXT } from './ui/game-screen-model.js';
import { renderCareBox, flyToCareBox } from './ui/care-box.js';
import { mountShop, renderShop } from './ui/shop.js';
import { buildOutbreak } from './sim/setup.js';
import { initGameState } from './sim/state.js';
import { checkGameOver as resolveGameOver, canUseTool, canAdvanceDay, spreadIsOver } from './sim/engine.js';
import {
    applyNodeTool,
    severLink,
    advanceDay,
    allActionsSpent,
    actionsRemaining,
    caseCapFor,
    effectiveR,
} from './sim/actions.js';
import { rollLevelRules, threatLine } from './config/difficulty-roll.js';
import { createAutoAdvance } from './ui/auto-advance.js';
import { showScreen as renderScreen, refreshGlobeHome } from './ui/screens.js';
import { requestChestOpen } from './ui/pending-chest.js';
import { createViewLoader } from './ui/view-loader.js';
import { lessonFor, debriefLine } from './config/lessons.js';
import { snapshotNetwork, noResponseCases, avertedSummary } from './sim/counterfactual.js';
import { renderAverted } from './ui/averted.js';
import {
    renderHeader,
    renderTools,
    renderLegend,
    addLogEntry,
    showNotification,
    showToolHint,
    showDayBanner,
    renderGameOver,
    openRCard,
    closeRCard,
    isRCardOpen,
} from './ui/panels.js';
import { fillBriefing, showThreat, fillLessonCard, showVariantCallout } from './ui/briefing.js';
import { variantCallout } from './sim/variants.js';
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
// Wrap-up: once the outbreak cannot spread, a pause to read why, then
// one day every WRAP_UP_DAY_MS until the last patients resolve.
const WRAP_UP_FIRST_MS = 2200;
const WRAP_UP_DAY_MS = 700;

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
        this.adProvider = pickAdProvider({
            capacitor: typeof window !== 'undefined' ? window.Capacitor : undefined,
            web: createWebAdProvider({ onRemoveAds: () => this.settings?.open() }),
        });
        this.monetization = createMonetization({
            storage: this.storage,
            provider: this.adProvider,
        });
        if (!this.monetization.adsRemoved) this.adProvider.init?.();

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

        document.getElementById('back-to-menu').addEventListener('click', () => this.showScreen('welcome'));
        document.getElementById('start-simulation').addEventListener('click', () => this.startGame());
        document.getElementById('next-day').addEventListener('click', () => this.nextDay());
        document.getElementById('hold-advance').addEventListener('click', () => this.autoAdvance.hold());
        // R card (round 16): tap R to learn what today's number means.
        document.getElementById('r-stat')?.addEventListener('click', () => this.toggleRCard());
        document.getElementById('r-card')?.addEventListener('click', (e) => {
            if (e.target.closest('.r-card-close')) closeRCard();
        });
        document.addEventListener('pointerdown', (e) => {
            if (!isRCardOpen()) return;
            if (e.target.closest('#r-card, #r-stat')) return;
            closeRCard();
        });
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
        document.getElementById('play-again').addEventListener('click', () =>
            this.leaveResults(() => {
                if (this.currentLevel) this.rollThreat(); // a replay rolls a fresh threat
                this.startGame();
            })
        );
        document
            .getElementById('try-different-scenario')
            .addEventListener('click', () => this.leaveResults(() => this.showScreen('welcome')));
        // A prize box on the award screen: back to the map, which flies to
        // the box and opens it (the same exit path, so ad pacing still applies).
        document.getElementById('results-tally')?.addEventListener('click', (e) => {
            const card = e.target.closest?.('[data-chest-id]');
            if (!card) return;
            e.stopPropagation();
            const chestId = card.dataset.chestId;
            this.leaveResults(() => {
                requestChestOpen(chestId);
                this.showScreen('welcome');
            });
        });

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
        closeRCard();
        renderScreen(screenName);
        this.currentScreen = screenName;

        if (screenName === 'welcome') refreshGlobeHome(); // back on the candy planet
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
        this.selectedDifficulty = level.difficultyId;
        this.rollThreat();
        // Briefing shows the mission name; the disease profile still comes
        // from the underlying scenario.
        fillBriefing({ ...this.currentScenario, name: level.name, description: level.blurb });
        this.currentR0 = this.difficulties[level.difficultyId]?.R0 || '';
        showThreat({ pips: this.threat.pips, line: threatLine(this.threat.value), r0: this.currentR0 });
        const lesson = lessonFor(level.id);
        fillLessonCard('briefing-lesson', lesson?.title, lesson?.brief);
        showVariantCallout(variantCallout(level.variant));
        // Start fetching the network view while the player reads the briefing.
        this.viewLoader.prefetch();
        this.showScreen('briefing');
    }

    // No difficulty picker: every play rolls its own threat, rising toward
    // the next prize box (src/config/difficulty-roll.js).
    rollThreat() {
        const rules = rollLevelRules(this.currentLevel);
        this.currentScenario = rules.scenario;
        this.activeDifficulty = rules.difficulty;
        this.threat = { value: rules.threat, pips: rules.pips };
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
        this.endWrapUp();
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
            // Isolated, in treatment or cured: faces fly to the care box.
            onBoxed: (leaving) => {
                flyToCareBox(leaving, { onLand: () => this.audio.playSound(1046, 0.08, 'sine') });
            },
        });
        this.view.update(this.network.nodes, this.network.links, true);
        this.updateUI();
        this.showScreen('game');
        addLogEntry(this.gameState.day, `Simulation started for ${this.currentScenario.name}.`, true);
    }

    createNetwork() {
        // Shared with the balance bots (src/sim/setup.js), so puzzle levels
        // (super-spreader, Envoy) are set up the same way everywhere.
        const out = buildOutbreak({
            scenario: this.currentScenario,
            population: this.gameState.stats.initialPopulation,
            variant: this.currentLevel?.variant || null,
        });
        this.gameState.stats.totalInfected += out.initialCases;
        this.gameState.envoyId = out.envoyId;
        this.gameState.superSpreaderId = out.superSpreaderId;
        this.network = { nodes: out.nodes, links: out.links };
        // Opening snapshot for the no-response baseline on the results screen.
        this.openingSnapshot = snapshotNetwork(this.network);
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
            if (toolId === 'quarantine' && node.superSpreader) {
                showNotification('Carrier isolated! The super-spreader cannot pass it on now.', 'success');
                this.audio.playStinger?.('milestone');
            }
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
        if (!this.gameState || this.gameState.gameOver) return;
        this.maybeWrapUp();
        if (this.wrapUp || this.gameState.paused) return;
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

    // R card: open it (holding any auto-advance countdown so there is time
    // to read), or close it if it is already open.
    toggleRCard() {
        if (isRCardOpen()) {
            closeRCard();
            return;
        }
        if (this.autoAdvance.isRunning()) this.autoAdvance.hold();
        openRCard({ r: this.lastR, r0: this.currentR0 });
    }

    nextDay() {
        if (this.gameState.gameOver) return;
        if (!canAdvanceDay(this.gameState)) {
            showNotification('The game is paused. Resume to advance the day.', 'info');
            return;
        }
        this.autoAdvance.cancel();
        const difficulty = this.difficulty;
        // Coaching: count actions left unused when a day ends by choice.
        if (!this.wrapUp) {
            const left = actionsRemaining(this.gameState, this.tools, difficulty);
            this.gameState.stats.unusedActions = (this.gameState.stats.unusedActions || 0) + left;
        }
        const { spread, outcomes, result, activeBefore } = advanceDay(this.gameState, this.network, {
            scenario: this.currentScenario,
            difficulty,
        });
        const { events, count } = spread;
        // Smooth day-to-day noise: blend today's R with yesterday's.
        const rToday = effectiveR(count, activeBefore, difficulty.recoveryTime);
        const prevR = this.lastR;
        this.lastR = rToday == null ? this.lastR : this.lastR == null ? rToday : 0.5 * rToday + 0.5 * this.lastR;
        // Round 16: the first day R drops under 1 is the turning point of an
        // outbreak, so mark it (once per level) with a toast and a chime.
        if (!result && !this.gameState.stats.rBelowOneDay && rFellBelowOne(prevR, this.lastR)) {
            this.gameState.stats.rBelowOneDay = this.gameState.day - 1;
            showNotification(R_BELOW_ONE_TEXT, 'success');
            this.audio.playStinger?.('milestone');
            document.getElementById('r-stat')?.classList.add('r-celebrate');
            setTimeout(() => document.getElementById('r-stat')?.classList.remove('r-celebrate'), 1600);
        }
        if (isRCardOpen()) openRCard({ r: this.lastR, r0: this.currentR0 });
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
        this.maybeWrapUp();
    }

    // When no sick person is in contact with anyone who could still catch
    // it, no move can change the outcome. Say so, then fast-forward the last
    // days while the remaining patients recover (or not), and end the round.
    maybeWrapUp() {
        if (!this.gameState || this.gameState.gameOver || this.wrapUp) return;
        if (!spreadIsOver(this.network)) return;
        // Nobody sick at all: that is already a result.
        this.checkGameOver();
        if (this.gameState.gameOver) return;
        this.autoAdvance.cancel();
        if (this.selectedTool) this.selectTool(this.selectedTool); // deselect
        this.closeShop();
        const screen = document.getElementById('game-screen');
        screen.classList.add('wrapping-up');
        const card = document.createElement('div');
        card.className = 'wrapup-card';
        card.setAttribute('role', 'status');
        card.innerHTML = `
            <strong class="wrapup-title">Spread stopped!</strong>
            <span class="wrapup-text">No sick person is in contact with anyone who can catch it. Fast-forwarding while the last patients recover.</span>`;
        document.querySelector('.network-container')?.appendChild(card);
        this.audio.playStinger?.('milestone');
        const step = () => {
            if (!this.wrapUp || !this.gameState || this.gameState.gameOver) return this.endWrapUp();
            if (!this.gameState.paused) this.nextDay();
            if (this.gameState.gameOver) return this.endWrapUp();
            this.wrapUp.timer = setTimeout(step, WRAP_UP_DAY_MS);
        };
        this.wrapUp = { card, timer: setTimeout(step, WRAP_UP_FIRST_MS) };
    }

    endWrapUp() {
        if (!this.wrapUp) return;
        clearTimeout(this.wrapUp.timer);
        const card = this.wrapUp.card;
        this.wrapUp = null;
        // Leave the card up until the results slide in.
        setTimeout(() => card?.remove(), 1200);
        setTimeout(() => {
            if (!this.wrapUp) document.getElementById('game-screen')?.classList.remove('wrapping-up');
        }, 1200);
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
        closeRCard();
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
        // Care bonus for the people looked after (wins only), paid on top.
        const bonus = careBonus(outcome, stats, this.currentLevel);
        let chests = [];
        if (this.currentLevel) {
            const before = this.save;
            this.save = recordCompletion(this.save, this.currentLevel.id, outcome, stats);
            this.save = { ...this.save, funding: this.save.funding + bonus.total };
            chests = newlyUnlockedChests({ chests: CHESTS, levels: LEVELS, levelId: this.currentLevel.id, saveBefore: before, saveAfter: this.save });
            writeSave(this.storage, this.save);
        }
        const showTally = outcome === 'contained';
        // Toasts from the last day should not cover the results.
        document.getElementById('notification-container')?.replaceChildren();
        showToolHint('');
        this.monetization.onLevelFinished();
        renderGameOver({
            outcome,
            stats,
            difficultyId: this.selectedDifficulty,
            threatPips: this.threat?.pips ?? null,
            stars,
            fundingEarned,
            livesSaved,
            caseCap: caseCapFor(this.gameState, this.currentScenario),
            tally: showTally,
        });
        if (showTally) {
            playResultsTally(document.getElementById('results-tally'), {
                bins: { treatment: stats.treated || 0, isolated: stats.isolated || 0, cured: stats.totalRecovered || 0 },
                bonus,
                stars,
                baseFunding: fundingEarned,
                chests,
                sound: (kind, i = 0) => this.playTallySound(kind, i),
            });
        }
        const lesson = this.currentLevel ? lessonFor(this.currentLevel.id) : null;
        fillLessonCard('game-over-lesson', lesson?.title, debriefLine(lesson, outcome, { unusedActions: stats.unusedActions ?? 0 }));
        this.renderAvertedCard(outcome, stats);
        this.showScreen('game-over');
    }

    // Cases averted: the player's outbreak against a no-response baseline
    // simulated from the opening snapshot (about 41 tiny runs, a few ms).
    renderAvertedCard(outcome, stats) {
        const el = document.getElementById('averted');
        if (!el) return;
        let data = { summary: null };
        try {
            if (this.openingSnapshot) {
                const d = this.difficulty;
                const baseline = noResponseCases(this.openingSnapshot, {
                    transmissionRate: this.currentScenario.baseTransmissionRate * d.transmissionMultiplier,
                    recoveryTime: d.recoveryTime,
                    fatalityRate: d.fatalityRate,
                });
                const population = stats.initialPopulation;
                const actual = stats.totalInfected;
                data = { summary: avertedSummary({ actual, baseline, population, outcome }), actual, baseline, population };
            }
        } catch (err) {
            data = { summary: null }; // never block the results screen
        }
        renderAverted(el, data);
    }

    // Little rising blips for the tally; pitch climbs as a bin fills.
    playTallySound(kind, i = 0) {
        const a = this.audio;
        if (kind === 'tick') a.playSound(660 + Math.min(i, 20) * 30, 0.06, 'sine');
        else if (kind === 'line') a.playSound(880, 0.1, 'triangle');
        else if (kind === 'star') a.playSound(1046 + i * 262, 0.25, 'sine');
        else if (kind === 'coin') a.playSound(1568, 0.05, 'square');
        else if (kind === 'prize') a.playStinger ? a.playStinger('milestone') : a.playSound(1318, 0.4, 'sine');
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
        this.maybeWrapUp();
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
            threatPips: this.threat?.pips ?? null,
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
        renderCareBox(this.network.nodes);
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
