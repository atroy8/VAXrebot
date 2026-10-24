// Pure view models for the phone game screen (roadmap item 7). No DOM here,
// so everything is unit tested in tests/game-screen.test.js.
import { toolDailyLimit, toolAvailableDay } from '../sim/engine.js';

// Strip a leading emoji (and any joiners or variation selectors) from a
// tool name: "💉 Vaccinate" -> "Vaccinate". The config keeps the emoji for
// older copy; the game screen draws its own icons instead.
export function plainName(name) {
    return String(name)
        .replace(/^[\p{Extended_Pictographic}\p{Emoji_Presentation}‍️\s]+/u, '')
        .trim();
}

// Short instruction shown over the network while a tool is selected.
// One line, plain words, teaches the idea behind the tool.
const HINTS = {
    vaccinate: 'Tap a healthy person to vaccinate them. Busy people first.',
    quarantine: 'Tap a person to isolate them. Isolating the sick stops them spreading.',
    severLink: 'Tap a link to cut it. Red links are where the virus spreads next.',
};

export function toolHint(toolId, tools = {}) {
    if (HINTS[toolId]) return HINTS[toolId];
    const tool = tools[toolId];
    return tool ? plainName(tool.name) : '';
}

// One chip per tool for the bottom tray.
// state: 'ready' | 'locked' (not yet available) | 'spent' (daily limit hit)
//        | 'off' (none on this world: a puzzle level with a limit of 0)
//        | 'empty' (power-up with no charges: tapping opens the shop)
//
// Item 16: when the level has a toolkit (difficulty.toolkit), classic tools
// outside it get no chip at all, so the tray only shows what this level
// offers. Power-ups always show.
export function toolChips(tools, difficulty, day, dailyUsage, charges = {}) {
    const kit = difficulty && Array.isArray(difficulty.toolkit) ? difficulty.toolkit : null;
    const entries = Object.entries(tools).filter(([id, tool]) => tool.consumable || !kit || kit.includes(id));
    return entries.map(([id, tool]) => {
        const label = plainName(tool.name);
        if (tool.consumable) {
            const left = charges[tool.chargeId || id] || 0;
            return { id, label, usage: `x${left}`, state: left > 0 ? 'ready' : 'empty', powerUp: true, color: tool.color || null };
        }
        const limit = toolDailyLimit(tool, difficulty, id);
        const used = dailyUsage[id] || 0;
        if (limit <= 0) {
            return { id, label, usage: 'None here', state: 'off', powerUp: false, color: null };
        }
        const firstDay = toolAvailableDay(tool, difficulty, id);
        if (day < firstDay) {
            return { id, label, usage: `Day ${firstDay}`, state: 'locked', powerUp: false, color: null };
        }
        return {
            id,
            label,
            usage: `${Math.max(0, limit - used)} left`,
            state: used >= limit ? 'spent' : 'ready',
            powerUp: false,
            color: null,
        };
    });
}

// The day banner replaces the old text log: one line after each day.
// Returns { text, tone } where tone is 'bad' | 'good' | 'calm'.
export function dayBanner({ day, newCases = 0, recovered = 0, died = 0 }) {
    const parts = [];
    if (newCases > 0) parts.push(`${newCases} new ${newCases === 1 ? 'case' : 'cases'}`);
    if (recovered > 0) parts.push(`${recovered} recovered`);
    if (died > 0) parts.push(`${died} lost`);
    if (parts.length === 0) parts.push('no new cases');
    const tone = newCases > 0 || died > 0 ? (newCases > recovered ? 'bad' : 'calm') : 'good';
    return { text: `Day ${day}: ${parts.join(', ')}`, tone };
}

// Camera fit for the flat network: the smallest distance that shows every
// point (plus padding) at the given vertical field of view and aspect.
// points: [{x, y}], returns { cx, cy, distance }.
export function fitCamera(points, { fovDeg = 48, aspect = 1, pad = 1.4 } = {}) {
    if (!points.length) return { cx: 0, cy: 0, distance: 10 };
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const p of points) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
    }
    const halfW = (maxX - minX) / 2 + pad;
    const halfH = (maxY - minY) / 2 + pad;
    const t = Math.tan((fovDeg * Math.PI) / 360);
    const distance = Math.max(halfH / t, halfW / (t * Math.max(0.2, aspect)));
    return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, distance };
}

// Results copy for a loss: say which rule ended the run.
export function lossReason({ totalInfected = 0, caseCap = Infinity } = {}) {
    if (Number.isFinite(caseCap) && totalInfected >= caseCap) {
        return `Cases reached the cap of ${caseCap}. The outbreak got ahead of the response. Act earlier and cut the busiest links first.`;
    }
    return 'Deaths overwhelmed the response before the outbreak could be contained. Try isolating the sick sooner.';
}

// ---- R you can read (round 16) ---------------------------------------------
// The R stat in the HUD opens a short card that says what the number means
// right now. On a phone there is no hover, so the old title tooltip never
// showed. Pure text here, tested in tests/r-explainer.test.js.

// Highest number in a briefing range such as "1.5 - 2.0" (null if none).
export function r0High(r0) {
    const nums = String(r0 ?? '').match(/\d+(?:\.\d+)?/g);
    if (!nums) return null;
    return Math.max(...nums.map(Number));
}

export function formatR(r) {
    if (r == null || !Number.isFinite(r)) return '–';
    return r >= 5 ? '5+' : r.toFixed(1);
}

// 'up' above 1 (growing), 'down' at or below 1 (shrinking), null before day 2.
export function rTone(r) {
    if (r == null || !Number.isFinite(r)) return null;
    return r > 1 ? 'up' : 'down';
}

// { value, headline, lines[] } for the R card.
export function rExplainer({ r = null, r0 = '' } = {}) {
    const value = formatR(r);
    const lines = [];
    let headline;
    if (r == null || !Number.isFinite(r)) {
        headline = 'R shows after the first day';
        lines.push('R counts how many people each sick person infects. Health teams watch it every day.');
    } else if (r > 1) {
        const about = r >= 5 ? '5 or more' : r < 1.5 ? 'more than 1' : `about ${Math.round(r)}`;
        headline = 'Growing: R is above 1';
        lines.push(`Each sick person is passing it to ${about} others right now, so cases multiply.`);
        lines.push('Isolate the sick and cut the red links to push R under 1.');
    } else if (r === 0) {
        headline = 'Stopped for now: R is 0';
        lines.push('Nobody caught it yesterday. Keep the sick away from the healthy.');
    } else {
        headline = 'Shrinking: R is below 1';
        lines.push('Each sick person now passes it to fewer than one other, so the outbreak fades out.');
    }
    const high = r0High(r0);
    if (high != null) {
        let line = `The briefing estimate is R₀ ${String(r0).trim()}: how fast it spreads when nobody is protected.`;
        if (r != null && Number.isFinite(r) && r > high + 0.5) {
            line += ' This web is more crowded than a real town, so R runs higher here.';
        }
        lines.push(line);
    }
    return { value, headline, lines };
}

// True on the day R first drops from above 1 to 1 or below: a moment worth
// celebrating, because that is when an outbreak starts to die out.
export function rFellBelowOne(prevR, nextR) {
    return prevR != null && nextR != null && Number.isFinite(prevR) && Number.isFinite(nextR) && prevR > 1 && nextR <= 1;
}

export const R_BELOW_ONE_TEXT = 'R fell below 1! Each case now leads to less than one more, so the outbreak is shrinking.';

// Where R sits on a 0 to 3 scale with 1 marked, as a 0..1 position (string
// for a CSS custom property).
export function rScalePos(r) {
    if (r == null || !Number.isFinite(r)) return '0';
    return Math.max(0, Math.min(1, r / 3)).toFixed(3);
}

// Round 18: when the phone leaves the game mid-level (a call, the home
// button, the app switcher), pause it so the player comes back to the
// Paused card instead of a day that ticked on without them. Not during the
// Spread stopped! fast-forward (no decisions left) or once the level is over.
export function shouldAutoPause({ hidden, screen, gameState, wrapUp = null } = {}) {
    return Boolean(hidden && screen === 'game' && gameState && !gameState.gameOver && !gameState.paused && !wrapUp);
}
