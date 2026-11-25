// Meta-game wiring for EpidemicSimulator (wide audience round): Hint, Undo,
// Gentle mode, bonus goals, the Daily puzzle and permanent upgrades.
// Kept out of src/game.js so that file only gains one-line hooks; these
// methods are mixed into the class at the bottom of game.js. Orchestration
// only: every rule is a pure function in src/sim/* or src/config/*.
import { levelR0Range, formatR0 } from './sim/r0.js';
import { writeSave, loadSave } from './save.js';
import { rollLevelRules, threatLine } from './config/difficulty-roll.js';
import { applyMetaRules } from './config/meta-rules.js';
import { shouldOfferGentle } from './config/gentle.js';
import { buyUpgrade, freeHints, upgradeById } from './config/upgrades.js';
import { lessonFor } from './config/lessons.js';
import { variantCallout } from './sim/variants.js';
import { caseCapFor } from './sim/actions.js';
import { chooseMove, hintLine, hintOffer, hintLabel, hintPrice, NO_HINT_LINE, HINT_NODE_BUDGET, GLOW_NODE_BUDGET } from './sim/hint.js';
import { takeSnapshot, restoreSnapshot, canRestore } from './sim/undo.js';
import { goalsFor, checkGoals } from './sim/goals.js';
import { utcDateString, dailyLevel, dailyStatus, recordDaily, dailyShareText } from './sim/daily.js';
import { gentleOn, setGentle, markClear, saveGoals, noteResult, spendFunding } from './meta.js';
import { showNotification } from './ui/panels.js';
import { fillBriefing, showThreat, fillLessonCard, showVariantCallout, showToolkit } from './ui/briefing.js';
import { showMark, clearMarks, syncMetaButtons } from './ui/hint.js';
import { renderBriefingGoals, renderResultsGoals, gentleOfferMarkup, renderUpgrades, showUpgradeMessage } from './ui/meta-panels.js';
import { mountDailyButton, refreshDailyButton, dailyResultMarkup, shareText, shortDate, SHARE_STATUS } from './ui/daily.js';

// What a hint depends on: the day, today's uses, every person and every line.
function hintKey(state, network) {
    const id = (ref) => (ref && typeof ref === 'object' ? ref.id : ref);
    const people = network.nodes.map((n) => `${n.id}${n.state[0]}${n.daysInfected || 0}${n.masked ? 'm' : ''}${n.testedClear ? 't' : ''}`).join('');
    const lines = network.links.map((l) => `${id(l.source)}-${id(l.target)}${l.charged ? '!' : ''}`).join(',');
    return `${state.day}|${JSON.stringify(state.dailyUsage)}|${people}|${lines}`;
}

export const metaMethods = {
    // ---- Setup ----------------------------------------------------------------
    bindMeta() {
        document.getElementById('hint-btn')?.addEventListener('click', () => this.useHint());
        document.getElementById('undo-btn')?.addEventListener('click', () => this.undoLast());
        document.getElementById('game-over-screen')?.addEventListener('click', (e) => {
            const act = e.target.closest?.('[data-meta]')?.dataset.meta;
            if (act === 'gentle-on') {
                this.setGentleMode(true);
                const box = document.getElementById('results-meta');
                if (box) box.innerHTML = '<div class="gentle-offer" role="status"><strong>Gentle mode is on.</strong><p>Tap Try again for a gentler outbreak.</p></div>';
            }
            if (act === 'share') this.shareDaily();
        });
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) this.refreshDailyEntry();
        });
    },

    // The stored save is the truth: the map and the shop write to it too
    // (prize boxes, power-up charges). Re-read it before changing anything,
    // so a stale copy here never overwrites what they wrote.
    syncSave() {
        this.save = loadSave(this.storage);
        return this.save;
    },

    // What Settings needs for its Gentle mode switch.
    gentleSetting() {
        const game = this;
        return {
            get enabled() {
                return gentleOn(game.save);
            },
            setEnabled: (on) => game.setGentleMode(on),
        };
    },

    setGentleMode(on) {
        this.save = setGentle(this.syncSave(), on);
        writeSave(this.storage, this.save);
        // On the briefing the rules are already rolled: roll them again.
        if (this.currentScreen === 'briefing' && this.currentLevel && !this.daily) this.selectLevel(this.currentLevel.id);
    },

    // Gentle mode and upgrades in force. The Daily is the same for everyone.
    metaOptions() {
        if (this.daily) return { gentle: false, upgrades: [] };
        return { gentle: gentleOn(this.save), upgrades: [...(this.save.upgrades || [])] };
    },

    // The rules for this play: the level's rules with the meta modifiers on
    // top. (The deal itself is made by src/game-deal.js with the same meta.)
    rollMetaRules() {
        this.syncSave();
        this.metaInForce = this.metaOptions();
        return applyMetaRules(rollLevelRules(this.currentLevel), this.metaInForce);
    },

    // ---- Run lifecycle ----------------------------------------------------------
    beginMetaRun() {
        this.hintsUsed = 0;
        this.undoSnap = null;
        this.hintCache = null;
        clearMarks();
    },

    afterMetaDay() {
        // The night has happened: yesterday's move can no longer be undone.
        this.undoSnap = null;
        clearMarks();
        this.refreshMetaHud();
    },

    refreshMetaHud() {
        if (!this.gameState) return;
        const free = this.freeHintCount();
        syncMetaButtons({
            hint: { label: hintLabel(this.hintsUsed || 0, free), price: hintPrice(this.hintsUsed || 0, free), disabled: this.gameState.gameOver },
            undo: { visible: canRestore(this.gameState, this.undoSnap) && !this.wrapUp && !this.gameState.paused },
        });
    },

    // ---- Undo -----------------------------------------------------------------
    rememberForUndo() {
        if (!this.gameState || this.gameState.gameOver) return;
        this.undoSnap = takeSnapshot(this.gameState, this.network, { powerups: { ...(this.save.powerups || {}) } });
        clearMarks();
    },

    // Before a power-up: off in the Daily (everyone plays the same game),
    // otherwise remembered so Undo gives the charge back.
    beforePowerUp() {
        if (this.daily) {
            showNotification('Power-ups are off in the Daily puzzle, so everyone plays the same game.', 'info');
            return false;
        }
        this.rememberForUndo();
        return true;
    },

    undoLast() {
        if (this.wrapUp || !canRestore(this.gameState, this.undoSnap)) return;
        const snap = this.undoSnap;
        this.undoSnap = null;
        if (!restoreSnapshot(this.gameState, this.network, snap)) return;
        const charges = snap.extra && snap.extra.powerups;
        if (charges && JSON.stringify(charges) !== JSON.stringify(this.save.powerups || {})) {
            this.save = { ...this.save, powerups: { ...charges } };
            writeSave(this.storage, this.save);
        }
        this.autoAdvance.cancel();
        clearMarks();
        this.view.update(this.network.nodes, this.network.links);
        this.updateUI();
        this.haptics.play('tool');
        showNotification('Move undone.', 'info');
    },

    // ---- Hint -----------------------------------------------------------------
    freeHintCount() {
        return this.daily ? 1 : freeHints(this.save.upgrades);
    },

    // The move a hint would show right now (nothing is spent or changed).
    // Round 57: the move comes from the solver (src/sim/hint.js). It is
    // asked for on every screen update (the next-step glow), so the answer
    // is kept until the web or the day's uses change.
    // full: the Hint button (the whole budget). The glow asks on every tap,
    // so it searches a third as far; a full answer is reused for it.
    peekHint(full = false) {
        if (!this.gameState || this.gameState.gameOver || this.demo) return null;
        const key = hintKey(this.gameState, this.network);
        if (!this.hintCache || this.hintCache.key !== key || (full && !this.hintCache.full)) {
            const nodeBudget = full ? HINT_NODE_BUDGET : GLOW_NODE_BUDGET;
            this.hintCache = { key, full, move: chooseMove(this.gameState, this.network, this.tools, this.difficulty, this.currentScenario, { nodeBudget }) };
        }
        return this.hintCache.move;
    },

    useHint() {
        if (!this.gameState || this.gameState.gameOver || this.gameState.paused || this.wrapUp) return;
        this.syncSave();
        const offer = hintOffer({ used: this.hintsUsed || 0, funding: this.save.funding, free: this.freeHintCount() });
        if (!offer.ok) {
            showNotification(`${offer.reason} You have ${this.save.funding}.`, 'info');
            return;
        }
        const move = this.peekHint(true);
        if (!move) {
            showNotification(NO_HINT_LINE, 'info'); // nothing to point at: not charged
            return;
        }
        const paid = spendFunding(this.save, offer.price);
        if (!paid) return;
        if (paid !== this.save) {
            this.save = paid;
            writeSave(this.storage, this.save);
        }
        this.hintsUsed = (this.hintsUsed || 0) + 1;
        this.gameState.stats.hintsUsed = this.hintsUsed;
        if (this.autoAdvance.isRunning()) this.autoAdvance.hold();
        // Pick the tool too, so a tap on the marked line or person just works.
        if (this.selectedTool !== move.toolId) this.selectTool(move.toolId, { hint: false });
        showMark(this.view, move);
        showNotification(hintLine(move), 'success');
        this.haptics.play('tool');
        this.updateUI();
    },

    // ---- Briefing ---------------------------------------------------------------
    refreshMetaBriefing() {
        const level = this.currentLevel;
        if (!level) return;
        this.levelGoals = goalsFor(level);
        const done = (this.save.goals && this.save.goals[level.id]) || [];
        renderBriefingGoals(this.levelGoals, done, { gentle: !!(this.metaInForce && this.metaInForce.gentle) });
        // Cold chain and Rapid response move a tool a day earlier: show the real days.
        if (this.difficulty.toolDays) showToolkit(level.toolkit, this.difficulty.toolDays);
    },

    // ---- Daily puzzle -------------------------------------------------------------
    mountDailyEntry() {
        const host = document.querySelector('.globe-home') || document.getElementById('welcome-screen');
        mountDailyButton(host, { onPlay: () => this.selectDaily() });
        this.refreshDailyEntry();
    },

    refreshDailyEntry() {
        const today = utcDateString();
        refreshDailyButton(today, dailyStatus(this.syncSave().daily, today));
    },

    selectDaily() {
        const date = utcDateString();
        const level = dailyLevel(date);
        this.syncSave();
        this.daily = { date, practice: dailyStatus(this.save.daily, date).done };
        this.currentLevel = level;
        this.selectedDifficulty = level.difficultyId;
        this.rollThreat();
        fillBriefing({
            ...this.currentScenario,
            name: `${level.name}, ${shortDate(date)}`,
            description: this.daily.practice
                ? 'Practice run. The same web and first cases as your first attempt today.'
                : 'One puzzle a day, the same for everyone: same web, same first cases, same best play. Your first attempt counts for your streak.',
        });
        const r0 = levelR0Range({
            networkType: this.currentScenario.networkType,
            populationRange: this.currentScenario.populationRange,
            degree: this.currentScenario.webDegree,
        });
        this.currentR0 = formatR0(r0.lo, r0.hi);
        showThreat({ pips: this.threat.pips, line: threatLine(this.threat.value), r0: this.currentR0 });
        // The day's seed deals the day's web: the same one for everyone.
        this.beginDeal();
        const lesson = lessonFor(level.lessonId);
        fillLessonCard('briefing-lesson', lesson?.title, lesson?.brief);
        showVariantCallout(variantCallout(level.variant));
        showToolkit(level.toolkit, this.difficulty.toolDays || level.variant?.toolDays);
        this.refreshMetaBriefing();
        this.viewLoader.prefetch();
        this.showScreen('briefing');
    },

    async shareDaily() {
        if (!this.dailyShare) return;
        const result = await shareText(this.dailyShare);
        const status = document.querySelector('#results-meta .daily-share-status');
        if (status) status.textContent = SHARE_STATUS[result];
    },

    // ---- Results ------------------------------------------------------------------
    // Called once per finished level, after the campaign save is recorded.
    // `earned` is the funding the results screen shows for this run.
    settleMeta(outcome, stats, stars, earned = 0) {
        const won = outcome === 'contained';
        const box = document.getElementById('results-meta');
        if (box) box.innerHTML = '';
        this.dailyShare = null;
        clearMarks();
        if (this.daily) {
            const date = this.daily.date;
            const { daily, counted } = recordDaily(this.save.daily, { date, outcome, days: this.gameState.day, lost: stats.totalDead || 0, stars });
            if (counted) {
                this.save = { ...this.save, daily, funding: this.save.funding + (won ? earned : 0) };
                writeSave(this.storage, this.save);
            }
            this.daily.practice = true; // any further run today is practice
            this.dailyShare = dailyShareText({ date, outcome, days: this.gameState.day, lost: stats.totalDead || 0, stars, activeByDay: stats.activeByDay || [], streak: counted ? daily.streak : 0, cases: stats.totalInfected, par: stats.par || null });
            if (box) box.innerHTML = dailyResultMarkup({ text: this.dailyShare, counted, streak: daily.streak });
            renderResultsGoals([]);
            this.refreshDailyEntry();
            return;
        }
        if (!this.currentLevel) return;
        const levelId = this.currentLevel.id;
        let save = noteResult(this.save, levelId, won);
        if (won) save = markClear(save, levelId, { gentle: !!this.difficulty.gentle });
        const goals = this.levelGoals || goalsFor(this.currentLevel);
        const checked = checkGoals(goals, outcome, stats, { caseCap: caseCapFor(this.gameState, this.currentScenario) });
        const before = (save.goals && save.goals[levelId]) || [];
        const banked = saveGoals(save, levelId, checked);
        this.save = banked.save;
        writeSave(this.storage, this.save);
        renderResultsGoals(won ? checked : [], banked.fresh, before);
        if (!won && box && shouldOfferGentle({ gentleOn: gentleOn(this.save), lossStreak: this.save.lossStreak, levelId })) {
            box.innerHTML = gentleOfferMarkup();
        }
    },

    // ---- Shop: permanent upgrades -----------------------------------------------------
    refreshMetaShop() {
        const host = document.getElementById('shop-sheet-body');
        if (!host) return;
        renderUpgrades(host, {
            funding: this.save.funding,
            owned: this.save.upgrades || [],
            onBuy: (id) => {
                const result = buyUpgrade(this.syncSave(), id);
                if (result.ok) {
                    this.save = result.save;
                    writeSave(this.storage, this.save);
                    this.updateUI(); // re-renders the tray and the open shop
                    this.refreshMetaShop();
                    showUpgradeMessage(host, `${upgradeById(id).name} is yours. It starts on your next level.`);
                } else {
                    showUpgradeMessage(host, result.reason, true);
                }
            },
        });
    },
};
