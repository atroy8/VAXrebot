// EpidemicSimulator: orchestration only. Sim math lives in src/sim/*,
// rendering in src/ui/*, audio in src/audio.js. Still exposed as window.game.
import { levelR0Range, formatR0 } from './sim/r0.js';
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
import { starProgress } from './ui/star-meter.js';
import { CHESTS } from './config/chests.js';
import { mountSettings } from './ui/settings.js';
import { createHaptics } from './ui/haptics.js';
import {
    isLevelUnlocked,
    calculateStars,
    fundingAward,
    goldAward,
    calculateScore,
    POINTS_PER_GOLD,
    livesSavedForRun,
    recordCompletion,
    speedParDays,
} from './progress.js';
import { isPowerUp, usePowerUp, getCharges, getFunding, powerUpLockedLine } from './economy.js';
import { nextStepTarget, markNextStep } from './ui/next-step.js';
import { shouldSkipToCare, CARE_SKIP_MS } from './ui/care-skip.js';
import './ui/buttons.css';
import './ui/game-screen.css';
import './ui/planet-tint.css';
import './ui/averted.css';
import './ui/variants.css';
import './ui/app-shell.css'; // last: safe areas and native touch feel (round 18)
import { toolHint, dayBanner, rFellBelowOne, rTick, R_BELOW_ONE_TEXT, shouldAutoPause, toolChips, autoToolForTap, noToolTapHint, idleTapMode, usedUpNudge, spentToolLine, careNudgeStep } from './ui/game-screen-model.js';
import { renderCareBox, flyToCareBox } from './ui/care-box.js';
import { mountShop, renderShop } from './ui/shop.js';
import { checkGameOver as resolveGameOver, canUseTool, canAdvanceDay, spreadIsOver, resolveAftermath, LOSS_RESULTS, careStillHelps } from './sim/engine.js';
import { deathToast, resultsDeathLines, realR0NoteFor } from './ui/deaths.js';
import { storyBriefing, storyResults } from './ui/story.js';
import {
    applyNodeTool,
    severLink,
    advanceDay,
    allActionsSpent,
    actionsRemaining,
    caseCapFor,
    liveR,
} from './sim/actions.js';
import { threatLine } from './config/difficulty-roll.js';
import { createAutoAdvance } from './ui/auto-advance.js';
import { showScreen as renderScreen, refreshGlobeHome } from './ui/screens.js';
import { requestChestOpen } from './ui/pending-chest.js';
import { createViewLoader } from './ui/view-loader.js';
import { lessonFor, debriefLine } from './config/lessons.js';
import { noResponseCases, avertedSummary } from './sim/counterfactual.js';
import { renderAverted } from './ui/averted.js';
import { resultsActions } from './ui/results-actions.js';
import { resultsHeadline } from './ui/results-headline.js';
import { resultsLeadSlots } from './ui/results-lead.js';
import { civilizationForLevel } from './config/civilizations.js';
import { setFaceCivilization } from './ui/face-token.js';
import { castLevel, personFor } from './ui/people.js';
import { applyPlanetTint } from './ui/planet-tint.js';
import { guardScreenTaps } from './ui/tap-guard.js';
import {
    renderHeader,
    renderTools,
    renderLegend,
    addLogEntry,
    showNotification,
    dismissToast,
    dismissTapToasts,
    showToolHint,
    showDayBanner,
    renderGameOver,
    openRCard,
    closeRCard,
    isRCardOpen,
} from './ui/panels.js';
import { fillBriefing, showThreat, fillLessonCard, showVariantCallout, showToolkit } from './ui/briefing.js';
import { variantCallout } from './sim/variants.js';
import { mechanicToolFeedback, onsetToast, mechanicsResultsLine, dayLabel, HUB_LOCKED_TEXT } from './ui/mechanics-text.js';
import { linkLocked } from './sim/mechanics.js';
import { renderLevelSelect } from './ui/level-select.js';
import { AudioEngine } from './audio.js';
import { metaMethods } from './game-meta.js';
import { dealMethods } from './game-deal.js';

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
        // Round 18: Taptic Engine on iPhone through the Capacitor bridge,
        // navigator.vibrate elsewhere, off switch in Settings.
        this.haptics = createHaptics({
            capacitor: typeof window !== 'undefined' ? window.Capacitor : undefined,
            navigator: typeof navigator !== 'undefined' ? navigator : undefined,
            storage: this.storage,
        });

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
            haptics: this.haptics,
            gentle: this.gentleSetting(),
            audio: this.audio,
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
        // Round 40: a tap already on its way when a screen opens (a late Next
        // day tap as the level ends) must not press the button that appears
        // under the thumb (src/ui/tap-guard.js).
        this.screenGuards = {
            'game-over': guardScreenTaps(document.getElementById('game-over-screen')),
            briefing: guardScreenTaps(document.getElementById('briefing-screen')),
        };
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
        // Round 18: leaving the app mid-level pauses the game (see shouldAutoPause).
        document.addEventListener('visibilitychange', () => {
            if (shouldAutoPause({ hidden: document.hidden, screen: this.currentScreen, gameState: this.gameState, wrapUp: this.wrapUp })) {
                this.togglePause();
            }
        });
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
            if (!toolItem || !this.gameState || this.demo) return;
            const toolId = toolItem.dataset.tool;
            if (toolId === 'shop' || toolItem.classList.contains('empty')) {
                this.openShop();
                return;
            }
            // Locked or spent tools explain themselves instead of doing nothing.
            // Round 38: a used-up tool says the same line a red line tap
            // would (spentToolLine), so the two never stack as two toasts.
            if (toolItem.classList.contains('disabled')) {
                // Round 55: a power-up before day 3 says when it opens.
                if (isPowerUp(toolId)) {
                    showNotification(powerUpLockedLine(), 'info');
                    return;
                }
                const chips = this.currentChips();
                const chip = chips.find((c) => c.id === toolId);
                if (chip && chip.state === 'spent') {
                    showNotification(spentToolLine(toolId, chips, this.tapContext()), 'info');
                    return;
                }
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
                // Round 57: a replay deals a new web (Retry this web keeps it).
                if (this.currentLevel) {
                    this.rollThreat();
                    this.beginDeal();
                }
                this.startGame();
            })
        );
        document
            .getElementById('try-different-scenario')
            .addEventListener('click', () => this.leaveResults(() => this.showScreen('welcome')));
        // Round 34: a win goes straight on to the next level's briefing.
        document.getElementById('next-level')?.addEventListener('click', () => {
            const nextId = this.nextLevelId;
            if (!nextId) return;
            this.leaveResults(() => this.selectLevel(nextId));
        });
        // A prize box on the award screen: back to the map, which flies to
        // the box and opens it (the same exit path, so ad pacing still applies).
        document.getElementById('results-lead')?.addEventListener('click', (e) => {
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
        this.bindMeta(); // Hint, Undo, Gentle offer, Daily share (src/game-meta.js)
        this.bindDeal(); // Retry this web, Show best play (src/game-deal.js)
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
        this.audio.setScene?.(screenName, this.currentLevel?.regionId); // planet ambience in a level
        this.screenGuards?.[screenName]?.arm();

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
        this.daily = null; // a campaign level, not the Daily puzzle
        this.currentLevel = level;
        this.selectedDifficulty = level.difficultyId;
        this.rollThreat();
        // Briefing shows the mission name; the disease profile still comes
        // from the underlying scenario.
        fillBriefing({ ...this.currentScenario, name: level.name, description: level.blurb });
        // Round 52: R₀ here comes from this play's own rules (src/sim/r0.js),
        // so the HUD's day 1 R lands near it instead of far above a fixed label.
        const r0 = levelR0Range({
            networkType: this.currentScenario.networkType,
            populationRange: this.currentScenario.populationRange,
            degree: this.currentScenario.webDegree,
        });
        this.currentR0 = formatR0(r0.lo, r0.hi);
        showThreat({ pips: this.threat.pips, line: threatLine(this.threat.value), r0: this.currentR0 });
        // Round 57: deal this play's web now, while the briefing is read.
        // The star line says what 3 stars means on it as soon as it is known.
        this.beginDeal();
        const lesson = lessonFor(level.id);
        fillLessonCard('briefing-lesson', lesson?.title, lesson?.brief);
        showVariantCallout(variantCallout(level.variant));
        // Later planets: the level's new idea joins the callout (planet-mechanics.js).
        if (level.mechanics) showVariantCallout(variantCallout(level.variant, level.mechanics));
        showToolkit(level.toolkit, this.difficulty.toolDays || level.variant?.toolDays);
        storyBriefing(level); // the mentor's line
        // Start fetching the network view while the player reads the briefing.
        this.viewLoader.prefetch();
        this.refreshMetaBriefing(); // bonus goals, Gentle tag
        this.showScreen('briefing');
    }

    // No difficulty picker: every play rolls its own threat, rising toward
    // the next prize box (src/config/difficulty-roll.js).
    rollThreat() {
        // Gentle mode and shop upgrades are applied on top of the roll (src/game-meta.js).
        const rules = this.rollMetaRules();
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
        this.beginMetaRun(); // fresh hint and undo state
        this.autoAdvance.cancel();
        this.endWrapUp();
        this.lastR = null;
        // Round 57: the web, its first cases and its par come from the deal
        // made while the briefing was up (src/game-deal.js). Retry this web
        // and Show best play open the same deal again.
        this.createNetwork();
        this.selectedTool = null;
        showToolHint('');
        this.closeShop();
        document.getElementById('game-screen').classList.remove('is-paused');
        document.getElementById('pause-game').setAttribute('aria-pressed', 'false');
        // Item 29 (c): the people wear the clothes of the level's land.
        const civ = civilizationForLevel(this.currentLevel);
        // Round 53: a new crowd of different people for this play.
        castLevel(civ);
        this.view.setCivilization?.(civ);
        setFaceCivilization(civ);
        // Wide audience: the planet's colours tint the HUD, sky and tray too.
        applyPlanetTint(document.getElementById('game-screen'), this.currentLevel?.regionId);
        // Item 22: the scene behind the web comes from the level's planet. The
        // view chunk (loaded lazily) holds the palette code, so the entry
        // bundle stays small.
        this.view.paintBackdrop?.(this.currentLevel?.regionId);
        this.view.setup({
            onNodeClick: (event, node) => this.handleNodeClick(event, node),
            onLinkClick: (event, link) => this.handleLinkClick(event, link),
            idleTapMode: () => (this.gameState ? idleTapMode(this.currentChips()) : null),
            // Isolated, in treatment or cured: faces fly to the care box.
            onBoxed: (leaving) => {
                flyToCareBox(leaving, { onLand: () => this.audio.sfx('careLand') });
            },
        });
        this.view.update(this.network.nodes, this.network.links, true);
        this.updateUI();
        this.showScreen('game');
        this.refreshTravelPlan(); // travellers: tonight's moves, from the first morning
        // A new player learns by doing: on their first level a coach bubble
        // points at the next thing to tap (src/ui/coach.js). It replaced the
        // three How to play cards, which now live behind "?" as a reference.
        if (this.currentLevel && this.currentLevel.id === LEVELS[0].id && !this.demo) {
            import('./ui/coach.js').then((m) => m.startCoach(this));
        }
        addLogEntry(this.gameState.day, `Simulation started for ${this.currentScenario.name}.`, true);
    }

    createNetwork() {
        // Shared with the balance bots (src/sim/dealer.js), so every level
        // is dealt and set up the same way everywhere.
        this.openDeal();
    }

    handleNodeClick(event, node) {
        if (this.demo) return; // the solver is playing (Show best play)
        if (this.selectedTool === 'severLink') return; // Sever tool only works on links
        if (node.removed) return;
        if (!this.selectedTool && !this.autoPickTool('node', node.state)) return;

        const { allowed, reason } = canUseTool(
            this.gameState,
            this.tools,
            this.selectedTool,
            this.difficulty,
            node
        );
        if (!allowed) {
            showNotification(reason, 'error');
            this.audio.sfx('error');
            return;
        }
        this.applyToolToNode(this.selectedTool, node);
    }

    currentChips() {
        return toolChips(this.tools, this.difficulty, this.gameState.day, this.gameState.dailyUsage, getCharges());
    }

    // What the used-up nudges need to know about the web (round 38).
    tapContext() {
        const nodes = (this.network && this.network.nodes) || [];
        // Round 39: spreadOver tells the hints not to send the player to
        // vaccines or red lines once the outbreak cannot grow.
        return { sickFree: nodes.filter((n) => !n.removed && n.state === 'infected').length, spreadOver: !!this.network && spreadIsOver(this.network) };
    }

    // No tool chosen yet: pick the one that fits the tap (round 27), or say
    // which tool would. Returns true when a tool is now selected.
    autoPickTool(kind, nodeState) {
        const chips = this.currentChips();
        const toolId = autoToolForTap(kind, nodeState, chips);
        if (!toolId) {
            showNotification(noToolTapHint(kind, chips, { ...this.tapContext(), nodeState }), 'info');
            return false;
        }
        this.selectTool(toolId, { hint: false });
        return true;
    }

    handleLinkClick(event, link) {
        if (this.demo) return;
        if (!this.selectedTool && !this.autoPickTool('link')) return;
        if (this.selectedTool !== 'severLink') return;
        // Later planets: the place that must stay open keeps its lines.
        if (linkLocked(link, this.network)) {
            showNotification(HUB_LOCKED_TEXT, 'info');
            return;
        }
        const { allowed, reason } = canUseTool(
            this.gameState,
            this.tools,
            'severLink',
            this.difficulty
        );
        if (!allowed) {
            showNotification(reason, 'error');
            this.audio.sfx('error');
            return;
        }
        this.applyToolToLink(link);
    }

    applyToolToNode(toolId, node) {
        this.rememberForUndo();
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
                this.haptics.play('milestone');
            } else {
                this.haptics.play('tool');
            }
            // Music hook: milestone stinger each time totalProtected crosses
            // 25, 50, or 75. Called with optional chaining; safe if the audio
            // track has not landed yet.
            if (MILESTONE_THRESHOLDS.some((m) => prevProtected < m && this.gameState.stats.totalProtected >= m)) {
                this.audio.playStinger?.('milestone');
            }
        } else if (toolId === 'test' || toolId === 'mask') {
            // Later planets (src/sim/mechanics.js): a test says what it found.
            const result = applyNodeTool(this.gameState, this.tools, toolId, node);
            const said = mechanicToolFeedback(toolId, result, node);
            logMessage = said.log;
            showNotification(said.toast, said.tone);
            this.haptics.play(result.positive ? 'milestone' : 'tool');
            // A test result cannot be unseen, so a test is never undone.
            if (toolId === 'test') this.undoSnap = null;
        }

        this.audio.sfx(toolId, { id: node.id });

        addLogEntry(this.gameState.day, logMessage);
        this.updateUI();
        this.view.update(this.network.nodes, this.network.links);
        this.afterAction();
    }

    applyToolToLink(linkToRemove) {
        this.rememberForUndo();
        // Snip effect first, while both ends still exist in the view.
        this.view.animateSever?.(linkToRemove);
        severLink(this.gameState, this.network, linkToRemove);

        const logMessage = `Connection between ${linkToRemove.source.id} and ${linkToRemove.target.id} severed.`;
        addLogEntry(this.gameState.day, logMessage);
        if (this.audio.playSnip) this.audio.playSnip();
        else this.audio.playSound(400, 0.15, 'sawtooth');
        this.haptics.play('sever');
        this.updateUI();
        this.view.update(this.network.nodes, this.network.links);
        this.afterAction();
    }

    // After every action: when no daily actions are left, start the
    // auto-advance countdown. Power-ups and Next day stay available.
    afterAction() {
        this.refreshTravelPlan();
        if (!this.gameState || this.gameState.gameOver || this.demo) return;
        this.maybeWrapUp();
        if (this.wrapUp || this.gameState.paused) return;
        this.releaseUsedUpTool();
        if (allActionsSpent(this.gameState, this.tools, this.difficulty)) this.autoAdvance.start();
    }

    // Round 31: a tool that just hit its daily limit lets go, so the next tap
    // auto-picks a tool that is still ready (round 27) instead of drawing a
    // red limit error, and a toast says what is ready.
    releaseUsedUpTool() {
        const toolId = this.selectedTool;
        if (!toolId || isPowerUp(toolId)) return;
        const chips = this.currentChips();
        const chip = chips.find((c) => c.id === toolId);
        if (!chip || chip.state !== 'spent') return;
        this.selectTool(toolId); // deselect
        const nudge = usedUpNudge(toolId, chips, this.tapContext());
        if (nudge) showNotification(nudge, 'info');
    }

    // Countdown display on the Next day button; null clears it.
    renderCountdown(leftMs, progress = 0) {
        const btn = document.getElementById('next-day');
        const hold = document.getElementById('hold-advance');
        this.audio.countdown?.(leftMs);
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
        openRCard({ r: this.lastR, r0: this.currentR0, realR0Note: realR0NoteFor(this.currentScenario) });
    }

    nextDay() {
        if (this.gameState.gameOver) return;
        if (!canAdvanceDay(this.gameState)) {
            showNotification('The game is paused. Resume to advance the day.', 'info');
            return;
        }
        this.autoAdvance.cancel();
        // Round 52: yesterday's tap feedback is out of date once the day turns.
        dismissTapToasts();
        // Round 48: a care line about waiting for Quarantine is out of date
        // once the day moves on; maybeWrapUp says what is true now.
        const nudges = this.gameState.careNudges;
        if (nudges && nudges.waitingText) dismissToast(nudges.waitingText);
        const difficulty = this.difficulty;
        // Coaching: count actions left unused when a day ends by choice.
        if (!this.wrapUp) {
            const left = actionsRemaining(this.gameState, this.tools, difficulty);
            this.gameState.stats.unusedActions = (this.gameState.stats.unusedActions || 0) + left;
        }
        const { spread, outcomes, result } = advanceDay(this.gameState, this.network, {
            scenario: this.currentScenario,
            difficulty,
        });
        const { events, count } = spread;
        for (const { source, target } of events) {
            this.view.animateVirus(source, target);
            this.audio.sfx('infection', { id: target?.id });
        }
        if (count > 0) addLogEntry(this.gameState.day, `${count} new infections reported.`, true);
        // Later planets: carriers who showed symptoms overnight (no virus
        // flies for them, since nobody saw the moment they caught it).
        const onsetLine = result ? '' : onsetToast(spread);
        if (onsetLine) showNotification(onsetLine, 'info');
        // Music hook: spike stinger when a day produces 8+ new infections.
        if (count >= SPIKE_INFECTION_THRESHOLD) {
            this.audio.playStinger?.('spike');
            this.haptics.play('spike');
        }

        for (const { node, outcome } of outcomes) {
            addLogEntry(
                this.gameState.day,
                outcome === 'died' ? `Person ${node.id} has died from the infection.` : `Person ${node.id} has recovered.`
            );
        }
        const deaths = outcomes.filter((o) => o.outcome === 'died');
        const died = deaths.length;
        for (const o of outcomes) if (o.outcome !== 'died') this.audio.sfx('cure', { id: o.node.id });
        if (!result) {
            showDayBanner(dayBanner({ day: this.gameState.day - 1, newCases: count, recovered: outcomes.length - died, died }));
        }
        if (died > 0) {
            // Item 20: a gentle death moment, then the person leaves the web.
            for (const { node } of deaths) this.view.animateDeath?.(node);
            const first = !this.gameState.stats.deathToastShown;
            this.gameState.stats.deathToastShown = true;
            // Each person lost is named, here and on the results.
            const names = deaths.map((d) => personFor(d.node.id).label);
            (this.gameState.lostNames ||= []).push(...names);
            if (!result) {
                const inWard = deaths.every((d) => d.inWard);
                showNotification(deathToast({ count: died, firstThisLevel: first, inWard, names }), 'info');
            }
            this.audio.sfx('death');
            this.haptics.play('tool');
            this.view.update(this.network.nodes, this.network.links);
        }

        if (result) this.finishGame(result);

        this.audio.sfx('dayStart');
        addLogEntry(this.gameState.day, `Day ${this.gameState.day} begins.`, true);
        this.updateUI();
        this.view.update(this.network.nodes, this.network.links);
        // Music hook: let the audio track adjust the mood after each day.
        this.audio.updateMood?.(this.gameState.stats, { cap: caseCapFor(this.gameState, this.currentScenario), r: this.lastR });
        this.maybeWrapUp();
        this.afterMetaDay(); // Undo ends with the day
        this.refreshTravelPlan(); // tonight's moves of the travellers
    }

    // When no sick person is in contact with anyone who could still catch
    // it and isolation can no longer help the sick (round 39), no move can
    // change the outcome. Say so, then fast-forward the last days while the
    // remaining patients recover (or not), and end the round.
    maybeWrapUp() {
        if (!this.gameState || this.gameState.gameOver || this.wrapUp) return;
        if (this.demo) return this.checkGameOver(); // Show best play steps the days itself
        if (!spreadIsOver(this.network)) return;
        // Nobody sick at all: that is already a result.
        this.checkGameOver();
        if (this.gameState.gameOver) return;
        // Round 39: isolation still halves the sick's death risk, so while
        // Quarantine can reach someone sick, the player keeps the controls.
        const care = careStillHelps(this.gameState, this.network, this.tools, this.difficulty, this.difficulty.recoveryTime);
        if (care) {
            // Round 48: one line while Quarantine is still closed, and one
            // more on the morning it opens (careNudgeStep).
            const seen = (this.gameState.careNudges ||= {});
            const nudge = careNudgeStep(care, this.gameState.day, seen);
            if (nudge) {
                const first = !seen.waiting && !seen.open;
                seen[nudge.kind] = true;
                if (nudge.kind === 'waiting') seen.waitingText = nudge.text;
                else if (seen.waitingText) dismissToast(seen.waitingText);
                showNotification(nudge.text, 'success');
                if (first) this.audio.playStinger?.('milestone');
                else this.haptics.play('tool');
            }
            // Round 55 (Adam): nothing is left to do until Quarantine opens,
            // so the days roll on by themselves instead of asking for taps.
            this.skipToCareDay(care);
            return;
        }
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
        // Round 26: the card sits over the idle tool tray, not the bottom of
        // the web, so the toasts above the tray (a death, R below 1) never
        // cover it.
        (document.getElementById('tool-tray') || document.querySelector('.network-container'))?.appendChild(card);
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
            caseCapFor(this.gameState, this.currentScenario),
            this.currentScenario.goal || null
        );
        if (result) this.finishGame(result);
    }

    finishGame(result) {
        if (this.gameState.gameOver) return;
        // Item 20: a loss mid-day (from a power-up) still settles the sick.
        if (LOSS_RESULTS.includes(result)) {
            resolveAftermath(this.gameState, this.network);
        }
        this.autoAdvance.cancel();
        closeRCard();
        this.gameState.gameOver = true;
        this.gameState.outcome = result;
        // Music hook: 'win' for contained, 'loss' for everything else
        // (overwhelmed, timeout, burnout: none of them are victories).
        this.audio.playStinger?.(result === 'contained' ? 'win' : 'loss');
        this.haptics.play(result === 'contained' ? 'win' : 'loss');
        this.audio.stopGameMusic?.();
        this.refreshTravelPlan();
        // Show best play: no results, no rewards, back to the real results.
        if (this.demo) {
            setTimeout(() => this.endDemo(), 1400);
            return;
        }
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
        // A Daily practice replay pays nothing (only the first attempt counts).
        const fundingEarned = this.daily?.practice ? 0 : goldAward(outcome, stats, this.currentLevel);
        const livesSaved = livesSavedForRun(outcome, stats);
        // Care bonus for the people looked after (wins only), paid on top.
        const bonus = this.daily?.practice ? { lines: [], total: 0 } : careBonus(outcome, stats, this.currentLevel);
        let chests = [];
        if (this.currentLevel && !this.daily) {
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
            deathLines: resultsDeathLines({ outcome, stats, lostNames: this.gameState.lostNames || [] }),
            headline: resultsHeadline({ outcome, meter: starProgress(outcome, stats, this.currentLevel), lessonId: this.currentLevel?.lessonId, unusedActions: stats.unusedActions ?? 0, stats, caseCap: caseCapFor(this.gameState, this.currentScenario) }),
        });
        if (showTally) {
            playResultsTally(document.getElementById('results-tally'), {
                bins: { treatment: stats.treated || 0, isolated: stats.isolated || 0, cured: stats.totalRecovered || 0, lost: stats.totalDead || 0 },
                bonus,
                stars,
                baseFunding: fundingEarned,
                // Round 55: points turn into gold at a fixed rate.
                awardLabel: `${Math.round(calculateScore(outcome, stats, this.currentLevel))} points, ${POINTS_PER_GOLD} points = 1 gold`,
                chests,
                meter: starProgress(outcome, stats, this.currentLevel),
                sound: (kind, i = 0) => this.playTallySound(kind, i),
                lead: resultsLeadSlots(),
            });
        }
        const lesson = this.currentLevel ? lessonFor(this.currentLevel.id) : null;
        fillLessonCard('game-over-lesson', lesson?.title, [debriefLine(lesson, outcome, { unusedActions: stats.unusedActions ?? 0 }), mechanicsResultsLine(stats, this.currentScenario)].filter(Boolean).join(' '));
        this.renderAvertedCard(outcome, stats);
        // The mentor's reaction and the real disease behind the strain.
        storyResults({ level: this.currentLevel, outcome, stats, scenario: this.currentScenario, fatalityRate: this.difficulty?.fatalityRate, caseCap: caseCapFor(this.gameState, this.currentScenario), parDays: this.currentLevel ? speedParDays(stats, this.currentLevel) : 0 });
        this.applyResultsActions(outcome);
        this.refreshDealActions(stars);
        this.settleMeta(outcome, stats, stars, fundingEarned + bonus.total); // goals, Daily, Gentle offer
        this.showScreen('game-over');
    }

    // Round 34: Next level leads a win, Try again leads a loss, and the map
    // is always there (src/ui/results-actions.js).
    applyResultsActions(outcome) {
        const plan = resultsActions({ outcome, levelId: this.currentLevel?.id, save: this.save, levels: LEVELS, regions: REGIONS });
        this.nextLevelId = plan.nextLevelId;
        const buttons = {
            replay: document.getElementById('play-again'),
            map: document.getElementById('try-different-scenario'),
            next: document.getElementById('next-level'),
        };
        if (!buttons.replay || !buttons.map) return;
        buttons.replay.textContent = plan.replayLabel;
        buttons.map.textContent = plan.mapLabel;
        if (buttons.next) buttons.next.hidden = plan.primary !== 'next';
        for (const [key, btn] of Object.entries(buttons)) {
            if (!btn) continue;
            btn.classList.toggle('btn--primary', key === plan.primary);
            btn.classList.toggle('btn--secondary', key !== plan.primary);
        }
        const row = buttons.replay.parentElement;
        row?.classList.toggle('has-next', plan.primary === 'next');
        row?.classList.toggle('lead-replay', plan.primary === 'replay');
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
                const baseline = noResponseCases(this.openingSnapshot, { recoveryTime: d.recoveryTime });
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
        if (kind === 'tick') a.sfx('count', { step: i });
        else if (kind === 'line') a.sfx('tallyLine');
        else if (kind === 'star') a.sfx('star', { step: i });
        else if (kind === 'coin') a.sfx('coin');
        else if (kind === 'prize') a.sfx('milestone');
    }

    // hint: false when a tap picked the tool and used it in the same moment
    // (round 32). The player has just done what the hint would say, and on a
    // phone the hint sat over the bottom of the web for 4.5 s, often on top
    // of the sick person they were working on.
    selectTool(toolId, { hint = true } = {}) {
        this.selectedTool = this.selectedTool === toolId ? null : toolId;
        this.view.setToolMode?.(this.selectedTool);
        document.querySelectorAll('.tool-item').forEach((item) => {
            const on = item.dataset.tool === this.selectedTool;
            item.classList.toggle('selected', on);
            item.setAttribute('aria-pressed', String(on));
        });
        showToolHint(this.selectedTool && hint ? toolHint(this.selectedTool, this.tools) : '');
    }

    // Power-up flow: hand the economy module the gameApi it needs, spend
    // one charge, and sync the persisted save back onto this.save.
    usePowerUpFlow(powerUpId) {
        if (!this.beforePowerUp()) return;
        const gameApi = {
            network: this.network,
            gameState: this.gameState,
            log: (day, message, important) => addLogEntry(day, message, important),
            notify: (message, type) => showNotification(message, type),
            refreshUI: () => this.updateUI(),
            updateView: () => this.view.update(this.network.nodes, this.network.links),
            checkGameOver: () => this.checkGameOver(),
            playSound: () => this.audio.sfx('powerUp'),
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
        this.refreshMetaShop(); // permanent upgrades under the power-ups
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

    // Round 35: R is read off the web as it stands (liveR in
    // src/sim/actions.js), so it moves the moment the player cuts a red link
    // or isolates someone, not a day later. The first time it drops from
    // above 1 to 1 or below is the turning point of an outbreak: mark it once
    // per level with a toast and a chime (only once it reads under 1.0, since the
    // toast says below 1). When it drops straight to nothing
    // the Spread stopped! card says it instead.
    refreshR() {
        if (!this.gameState || !this.network || !this.currentScenario) return;
        const difficulty = this.difficulty;
        const prevR = this.lastR;
        this.lastR = liveR(this.network);
        if (!this.gameState.gameOver && !this.wrapUp && !this.gameState.stats.rBelowOneDay && rFellBelowOne(prevR, this.lastR) && this.lastR < 0.95 && !spreadIsOver(this.network)) {
            this.gameState.stats.rBelowOneDay = this.gameState.day;
            showNotification(R_BELOW_ONE_TEXT, 'success');
            this.audio.sfx('rBelowOne');
            this.haptics.play('milestone');
            document.getElementById('r-stat')?.classList.add('r-celebrate');
            setTimeout(() => document.getElementById('r-stat')?.classList.remove('r-celebrate'), 1600);
        }
        else if (prevR != null && !this.gameState.gameOver) {
            const tick = rTick(prevR, this.lastR);
            const el = document.getElementById('r-stat');
            if (tick && el) {
                el.classList.remove('r-tick-down', 'r-tick-up');
                void el.offsetWidth; // restart the animation on quick taps
                el.classList.add(`r-tick-${tick}`);
                clearTimeout(this.rTickTimer);
                this.rTickTimer = setTimeout(() => el.classList.remove('r-tick-down', 'r-tick-up'), 700);
            }
        }
        if (isRCardOpen()) openRCard({ r: this.lastR, r0: this.currentR0, realR0Note: realR0NoteFor(this.currentScenario) });
    }

    updateUI() {
        this.refreshR();
        const difficulty = this.difficulty;
        renderHeader({
            scenarioName: this.currentLevel ? this.currentLevel.name : this.currentScenario.name,
            difficultyName: difficulty.name,
            difficultyId: this.selectedDifficulty,
            threatPips: this.threat?.pips ?? null,
            day: dayLabel(this.gameState.day, this.currentScenario.goal),
            infected: this.network.nodes.filter((n) => n.state === 'infected').length,
            protected: this.gameState.stats.totalProtected,
            population: this.network.nodes.length,
            paused: this.gameState.paused,
            cases: this.gameState.stats.totalInfected,
            caseCap: caseCapFor(this.gameState, this.currentScenario),
            r: this.lastR,
            actionsLeft: actionsRemaining(this.gameState, this.tools, this.difficulty),
            deaths: this.gameState.stats.totalDead || 0,
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
        this.refreshMetaHud(); // Hint price, Undo button
        this.refreshNextStep();
    }

    // Spread is over and the only move left is to isolate the sick, but
    // Quarantine is not open (or is used up) today: go to the next day after
    // a short beat, and again each morning, until it opens. Pausing or
    // leaving the level stops it.
    skipToCareDay(care) {
        if (!shouldSkipToCare(care, this.gameState)) return;
        const state = this.gameState;
        const day = state.day;
        clearTimeout(this.careSkipTimer);
        this.careSkipTimer = setTimeout(() => {
            if (this.gameState !== state || state.gameOver || state.paused || this.wrapUp || state.day !== day || this.currentScreen !== 'game') return;
            this.nextDay();
        }, CARE_SKIP_MS);
    }

    // Round 55: glow on the button for the next sensible step (next-step.js).
    refreshNextStep() {
        if (!this.gameState || !this.network) return;
        const facts = { gameOver: this.gameState.gameOver, wrapUp: !!this.wrapUp, paused: this.gameState.paused, counting: this.autoAdvance.isRunning(), selectedTool: this.selectedTool };
        let move = null;
        if (!facts.gameOver && !facts.wrapUp && !facts.paused && !facts.selectedTool) {
            try {
                move = this.peekHint?.() || null;
            } catch {
                move = null;
            }
            // Spread is over: the one useful move is care for the sick, so
            // Quarantine glows when it is open today, and nothing while the
            // days roll on to it (skipToCareDay).
            if (spreadIsOver(this.network)) {
                const care = careStillHelps(this.gameState, this.network, this.tools, this.difficulty, this.difficulty.recoveryTime);
                move = care && care.day <= this.gameState.day ? { toolId: 'quarantine' } : null;
                if (care && care.day > this.gameState.day) facts.counting = true;
            }
        }
        markNextStep(nextStepTarget({ ...facts, move }));
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

// Hint, Undo, Gentle mode, bonus goals, the Daily puzzle and upgrades live in
// src/game-meta.js and are mixed in here, so this file only carries hooks.
Object.assign(EpidemicSimulator.prototype, metaMethods);
// Dealing, par, Retry this web and Show best play live in src/game-deal.js.
Object.assign(EpidemicSimulator.prototype, dealMethods);
