// Dealing, par and best play for EpidemicSimulator (round 57). Mixed into
// the class at the bottom of src/game.js, like src/game-meta.js, so game.js
// only gains one-line hooks. Orchestration only: the rules are pure
// functions in src/sim/dealer.js and src/sim/solver.js.
//
// - When a briefing opens, a new web is dealt for the level: candidate webs
//   are built and solved a few milliseconds at a time (so the screen never
//   freezes), and the briefing shows what 3 stars means on this deal as soon
//   as it is known. Begin Containment is instant when the deal is ready and
//   otherwise finishes it on the spot within a hard time budget.
// - Replay deals a new web (a new seed). Retry this web plays the same deal.
// - Show best play replays the solver's moves on the same web, step by step,
//   and returns to the results. It never banks a reward or counts as a try.
import { createDealer, startDeal } from './sim/dealer.js';
import { randomSeed } from './sim/rng.js';
import { dailySeed } from './sim/daily.js';
import { findMove } from './sim/solver.js';
import { travelPlan } from './sim/mechanics.js';
import { webR0, formatR0 } from './sim/r0.js';
import { snapshotNetwork } from './sim/counterfactual.js';
import { levelRecord } from './progress.js';
import { starGoalLine } from './ui/briefing.js';
import { showTravelPlan, clearTravelPlan } from './ui/travel-marks.js';
import { showNotification } from './ui/panels.js';
import './ui/round57.css';

// Dealing while the briefing is on screen: work for at most SLICE_MS, then
// let the browser breathe. When the player taps Begin before the deal is
// done, it is finished at once, but for no longer than HARD_MS: after that
// the best web seen so far is used. (The Daily never takes that shortcut,
// so it is the same web for everyone, on any phone.)
export const DEAL_SLICE_MS = 10;
export const DEAL_HARD_MS = 400;
// Show best play: the pause between two moves, and before a night.
export const DEMO_STEP_MS = 800;
export const DEMO_NIGHT_MS = 1100;

const clock = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export const dealMethods = {
    // ---- Dealing ---------------------------------------------------------
    // Start a new deal for the current level. seed: a fixed one (the Daily),
    // or left out for a fresh web.
    beginDeal({ seed = null } = {}) {
        clearTimeout(this.dealTimer);
        const level = this.currentLevel;
        if (!level) return;
        const dealSeed = seed != null ? seed : this.daily ? dailySeed(this.daily.date) : randomSeed();
        this.deal = null;
        this.dealer = createDealer(level, dealSeed, { meta: this.daily ? null : this.metaInForce || null, tools: this.tools });
        this.refreshParLine();
        const work = () => {
            if (!this.dealer || this.dealer.deal) return;
            const until = clock() + DEAL_SLICE_MS;
            let done = false;
            while (!done && clock() < until) done = this.dealer.step();
            if (done) this.dealReady();
            else this.dealTimer = setTimeout(work, 0);
        };
        this.dealTimer = setTimeout(work, 0);
    },

    dealReady() {
        if (!this.dealer || !this.dealer.deal) return;
        this.deal = this.dealer.deal;
        this.refreshParLine();
    },

    // The deal to play, finished now if it is still being dealt.
    ensureDeal() {
        if (this.deal) return this.deal;
        if (!this.dealer) this.beginDeal();
        clearTimeout(this.dealTimer);
        const until = clock() + DEAL_HARD_MS;
        let done = !!this.dealer.deal;
        while (!done && (this.daily || clock() < until)) done = this.dealer.step();
        if (!done) this.dealer.finish();
        this.dealReady();
        return this.deal;
    },

    // The briefing's par line: what 3 stars means on this deal.
    refreshParLine() {
        const el = typeof document !== 'undefined' ? document.getElementById('star-goal') : null;
        if (!el) return;
        const deal = this.deal;
        if (!deal || !deal.par) {
            el.textContent = deal ? '' : starGoalLine({ par: null });
            return;
        }
        const best = this.currentLevel && !this.daily ? levelRecord(this.save, this.currentLevel.id).stars || 0 : 0;
        el.textContent = starGoalLine({ par: deal.par, best, goal: deal.scenario.goal || null });
        // The R0 of the web that was really dealt.
        const r0El = document.getElementById('briefing-r0');
        const r0 = formatR0(webR0({ nodes: deal.nodes, links: deal.links }));
        if (r0El && r0) r0El.textContent = r0;
    },

    // Open a fresh, playable copy of the deal as the current game.
    openDeal() {
        const deal = this.ensureDeal();
        const run = startDeal(deal, this.tools);
        this.gameState = run.state;
        this.network = run.network;
        this.currentScenario = deal.scenario;
        this.activeDifficulty = deal.difficulty;
        // Opening snapshot for the no-response baseline on the results screen.
        this.openingSnapshot = snapshotNetwork(this.network);
        const webR = webR0(this.network);
        if (Number.isFinite(webR) && webR > 0) this.currentR0 = formatR0(webR);
    },

    // Travellers: show tonight's moves (a dotted line to each one's next stop).
    refreshTravelPlan() {
        if (!this.view || !this.gameState || this.gameState.gameOver || !this.currentScenario?.travellers || this.currentScreen === 'game-over') {
            clearTravelPlan();
            return;
        }
        showTravelPlan(this.view, travelPlan(this.network));
    },

    // ---- Results: Retry this web, Show best play -------------------------
    bindDeal() {
        document.getElementById('retry-web')?.addEventListener('click', () => this.leaveResults(() => this.startGame()));
        document.getElementById('show-best')?.addEventListener('click', () => this.showBestPlay());
        document.getElementById('demo-skip')?.addEventListener('click', () => this.endDemo());
    },

    // Which of the two extra results buttons to show.
    refreshDealActions(stars) {
        const best = document.getElementById('show-best');
        const retry = document.getElementById('retry-web');
        const hasPar = !!(this.deal && this.deal.par);
        if (best) best.hidden = !hasPar || stars >= 3;
        if (retry) retry.hidden = !this.deal;
    },

    // Replay the solver's moves on the same web, then come back to the
    // results exactly as they were. Nothing is saved.
    async showBestPlay() {
        const deal = this.deal;
        if (!deal || !deal.par || this.demo) return;
        this.demo = { moves: [...deal.par.moves], timer: null, kept: { state: this.gameState, network: this.network } };
        await this.startGame();
        if (!this.demo) return;
        document.getElementById('game-screen')?.classList.add('is-demo');
        const banner = document.getElementById('demo-banner');
        if (banner) banner.hidden = false;
        const text = document.getElementById('demo-text');
        if (text) text.textContent = `Best play: ${deal.par.cases} ${deal.par.cases === 1 ? 'case' : 'cases'}`;
        const step = () => {
            if (!this.demo) return;
            const state = this.gameState;
            if (!state || state.gameOver) return;
            if (state.paused) {
                this.demo.timer = setTimeout(step, DEMO_STEP_MS);
                return;
            }
            const k = this.demo.moves.findIndex((m) => m.day === state.day);
            if (k >= 0) {
                const [move] = this.demo.moves.splice(k, 1);
                const found = findMove(this.network, move);
                if (found && found.link) this.applyToolToLink(found.link);
                else if (found) this.applyToolToNode(move.toolId, found.node);
                this.demo.timer = setTimeout(step, DEMO_STEP_MS);
                return;
            }
            this.nextDay();
            if (this.demo && !this.gameState.gameOver) this.demo.timer = setTimeout(step, this.demo.moves.some((m) => m.day === this.gameState.day) ? DEMO_NIGHT_MS : DEMO_STEP_MS);
        };
        this.demo.timer = setTimeout(step, DEMO_NIGHT_MS);
    },

    // The demo is over (or was skipped): back to the results screen.
    endDemo() {
        if (!this.demo) return;
        clearTimeout(this.demo.timer);
        const kept = this.demo.kept;
        this.demo = null;
        this.autoAdvance.cancel();
        this.endWrapUp();
        clearTravelPlan();
        document.getElementById('game-screen')?.classList.remove('is-demo');
        const banner = document.getElementById('demo-banner');
        if (banner) banner.hidden = true;
        document.getElementById('notification-container')?.replaceChildren();
        // The finished run the results belong to is the current game again.
        if (kept && kept.state) {
            this.gameState = kept.state;
            this.network = kept.network;
        }
        this.showScreen('game-over');
        showNotification('That was the best play. Try it yourself with Retry this web.', 'info');
    },
};
