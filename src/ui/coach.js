// Guided first level: the bubble on screen. The step logic is in
// coach-model.js; this file reads the live game, asks the model which step
// fits, and draws one small bubble next to the thing to tap.
//
// It never blocks play. The layer ignores taps (pointer-events: none), any
// tap anywhere waves the current step away, Skip tips ends it for good, and
// once finished or skipped it never shows again (COACH_FLAG in localStorage,
// the same flag the old How to play cards used).
import './coach.css';
import { toolDailyLimit } from '../sim/engine.js';
import {
    coachStep,
    coachDismiss,
    coachRecall,
    coachSkip,
    coachFinished,
    coachSeen,
    markCoachSeen,
    newCoachMemory,
    bubblePlacement,
    pickRiskLine,
    samplePoints,
} from './coach-model.js';

// New-tool hints fade on their own after this long.
const HINT_MS = 9000;

function safeStorage() {
    try {
        return typeof window !== 'undefined' ? window.localStorage : null;
    } catch {
        return null;
    }
}

// Plain facts for the model, read off the running game. Exported for tests
// (a fake game object is enough; `doc` may be null).
export function coachFacts(game, doc = typeof document !== 'undefined' ? document : null) {
    const st = game && game.gameState;
    if (!st) return null;
    const chips = game.currentChips ? game.currentChips() : [];
    const chip = (id) => chips.find((c) => c.id === id && !c.powerUp) || null;
    const links = (game.network && game.network.links) || [];
    const nodes = (game.network && game.network.nodes) || [];
    const kind = (l) => (game.view && game.view.linkKind ? game.view.linkKind(l) : 'normal');
    const severChip = chip('severLink');
    const severTool = game.tools && game.tools.severLink;
    const limit = severTool && game.difficulty ? toolDailyLimit(severTool, game.difficulty, 'severLink') : 0;
    const used = (st.dailyUsage && st.dailyUsage.severLink) || 0;
    const shown = (sel) => {
        const el = doc && doc.querySelector(sel);
        return !!el && !el.hidden;
    };
    return {
        day: st.day,
        gameOver: !!st.gameOver,
        selectedTool: game.selectedTool || null,
        blocked: !!st.paused || !!game.wrapUp || game.currentScreen !== 'game' || shown('#shop-sheet') || shown('#r-card') || shown('.onboarding-overlay'),
        sick: nodes.filter((n) => !n.removed && n.state === 'infected').length,
        riskLines: links.filter((l) => kind(l) === 'risk').length,
        sever: { state: severChip ? severChip.state : null, left: Math.max(0, limit - used), limit },
        vaccinate: { state: chip('vaccinate') ? chip('vaccinate').state : null },
        quarantine: { state: chip('quarantine') ? chip('quarantine').state : null },
        countdown: !!(game.autoAdvance && game.autoAdvance.isRunning && game.autoAdvance.isRunning()),
    };
}

let current = null; // the running coach, so a replay restarts it cleanly

export function stopCoach() {
    if (current) current.stop();
    current = null;
}

// Starts the coach on the level that is on screen. Returns false when the
// player has already seen it (or the old cards).
export function startCoach(game, { storage = safeStorage(), doc = document, win = window } = {}) {
    stopCoach();
    if (coachSeen(storage)) return false;

    let memory = newCoachMemory();
    let step = null;
    let shownKey = null;
    let shownAt = 0;
    let lineId = null;
    let lastTapAt = win.performance.now();
    let raf = 0;
    let stopped = false;
    const levelId = game.currentLevel && game.currentLevel.id;

    const layer = doc.createElement('div');
    layer.className = 'coach';
    layer.hidden = true;
    layer.innerHTML = `
        <div class="coach-ring" aria-hidden="true"></div>
        <div class="coach-bubble" role="status" aria-live="polite">
            <p class="coach-text"></p>
            <div class="coach-row">
                <button type="button" class="coach-skip">Skip tips</button>
                <button type="button" class="coach-ok" hidden>Got it</button>
            </div>
            <span class="coach-arrow" aria-hidden="true"></span>
        </div>`;
    doc.body.appendChild(layer);
    const ring = layer.querySelector('.coach-ring');
    const bubble = layer.querySelector('.coach-bubble');
    const textEl = layer.querySelector('.coach-text');
    const okBtn = layer.querySelector('.coach-ok');

    function stop() {
        if (stopped) return;
        stopped = true;
        win.cancelAnimationFrame(raf);
        win.removeEventListener('pointerdown', onPointerDown, true);
        doc.removeEventListener('keydown', onKeyDown);
        doc.body.classList.remove('coach-on');
        layer.remove();
        if (current && current.stop === stop) current = null;
    }

    function finish() {
        markCoachSeen(storage);
        stop();
    }

    // Any tap that is not Skip waves the step away. Capture phase, so it
    // sees the tap before the web or a button acts on it, and it never
    // stops the tap from doing its job.
    function onPointerDown(e) {
        lastTapAt = win.performance.now();
        if (!step) return;
        if (e.target && e.target.closest && e.target.closest('.coach-skip')) return;
        memory = coachDismiss(memory, step);
    }

    function onKeyDown(e) {
        if (e.key === 'Escape' && step) {
            memory = coachSkip(memory);
            finish();
        }
    }

    layer.querySelector('.coach-skip').addEventListener('click', () => {
        memory = coachSkip(memory);
        finish();
    });
    win.addEventListener('pointerdown', onPointerDown, true);
    doc.addEventListener('keydown', onKeyDown);

    const rectAnchor = (el) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) return null;
        return { x: r.left + r.width / 2, y: r.top + r.height / 2, r: r.height / 2, w: r.width, h: r.height, round: 16 };
    };

    // Every red line on screen, as screen segments.
    function riskLines() {
        const view = game.view;
        const lines = [];
        if (!view || !view.nodeObjs || !view.screenPoint || !view.linkKind) return lines;
        for (const l of game.network?.links || []) {
            if (view.linkKind(l) !== 'risk') continue;
            const s1 = view.nodeObjs.get(l.source.id);
            const s2 = view.nodeObjs.get(l.target.id);
            if (!s1 || !s2) continue;
            const p1 = view.screenPoint(s1.pos);
            const p2 = view.screenPoint(s2.pos);
            if (!p1 || !p2) continue;
            lines.push({ id: `${l.source.id}-${l.target.id}`, ax: p1.x, ay: p1.y, bx: p2.x, by: p2.y });
        }
        return lines;
    }

    // Where the step points, in CSS pixels, or null when it is not on screen.
    function anchorFor(s) {
        const a = s.anchor;
        const view = game.view;
        if (a.type === 'tool') return rectAnchor(doc.querySelector(`#tools-list [data-tool="${a.id}"]`));
        if (a.type === 'next-day') return rectAnchor(doc.getElementById('next-day'));
        if (!view || !view.nodeObjs || !view.screenPoint) return null;
        if (a.type === 'sick') {
            for (const obj of view.nodeObjs.values()) {
                if (!obj.node || obj.node.removed || obj.node.state !== 'infected') continue;
                const p = view.screenPoint(obj.pos);
                if (p) return { x: p.x, y: p.y, r: 34, w: 68, h: 68, round: 34 };
            }
            return null;
        }
        if (a.type === 'risk') {
            const lines = riskLines();
            const pick = pickRiskLine(lines, lineId);
            if (!pick) return null;
            lineId = pick.id;
            return { x: pick.x, y: pick.y, r: 22, w: 44, h: 44, round: 22 };
        }
        return null;
    }

    function draw(anchor) {
        if (!step || !anchor) {
            layer.hidden = true;
            doc.body.classList.remove('coach-on');
            return;
        }
        if (shownKey !== step.key || textEl.textContent !== step.text) {
            if (shownKey !== step.key) shownAt = win.performance.now();
            shownKey = step.key;
            textEl.textContent = step.text;
            okBtn.hidden = step.kind !== 'info';
            layer.dataset.step = step.id;
            bubble.dataset.kind = step.kind;
            // Restart the little entrance so a new step reads as new.
            bubble.classList.remove('coach-in');
            void bubble.offsetWidth;
            bubble.classList.add('coach-in');
        }
        layer.hidden = false;
        doc.body.classList.add('coach-on');
        ring.style.width = `${anchor.w + 12}px`;
        ring.style.height = `${anchor.h + 12}px`;
        ring.style.borderRadius = `${anchor.round + 6}px`;
        // left/top, not a transform: the pulse and the entrance animate
        // scale, which would also scale a translate and push them off target.
        ring.style.left = `${Math.round(anchor.x - anchor.w / 2 - 6)}px`;
        ring.style.top = `${Math.round(anchor.y - anchor.h / 2 - 6)}px`;
        const size = { width: bubble.offsetWidth, height: bubble.offsetHeight };
        const view = { width: win.innerWidth, height: win.innerHeight };
        const place = bubblePlacement(anchor, size, view, { avoid: samplePoints(riskLines()) });
        bubble.style.left = `${Math.round(place.left)}px`;
        bubble.style.top = `${Math.round(place.top)}px`;
        bubble.style.setProperty('--arrow-x', `${Math.round(place.arrow)}px`);
        bubble.dataset.side = place.side;
    }

    function tick() {
        if (stopped) return;
        // Another level (or a trip back to the map) ends this run quietly.
        const sameLevel = game.currentLevel && game.currentLevel.id === levelId;
        const facts = sameLevel ? coachFacts(game, doc) : null;
        if (!facts) return stop();
        if (coachFinished(facts, memory)) return finish();
        if (game.currentScreen !== 'game' && game.currentScreen !== 'game-over') return stop();
        memory = coachRecall(facts, memory, win.performance.now() - lastTapAt);
        step = coachStep(facts, memory);
        if (step && step.kind === 'info' && step.id !== 'sick' && shownKey === step.key && win.performance.now() - shownAt > HINT_MS) {
            memory = coachDismiss(memory, step);
            step = null;
        }
        draw(step ? anchorFor(step) : null);
        raf = win.requestAnimationFrame(tick);
    }

    current = { stop };
    raf = win.requestAnimationFrame(tick);
    return true;
}
