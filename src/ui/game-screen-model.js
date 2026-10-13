// Pure view models for the phone game screen (roadmap item 7). No DOM here,
// so everything is unit tested in tests/game-screen.test.js.
import { toolDailyLimit } from '../sim/engine.js';

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
//        | 'empty' (power-up with no charges: tapping opens the shop)
export function toolChips(tools, difficulty, day, dailyUsage, charges = {}) {
    return Object.entries(tools).map(([id, tool]) => {
        const label = plainName(tool.name);
        if (tool.consumable) {
            const left = charges[tool.chargeId || id] || 0;
            return { id, label, usage: `x${left}`, state: left > 0 ? 'ready' : 'empty', powerUp: true, color: tool.color || null };
        }
        const limit = toolDailyLimit(tool, difficulty, id);
        const used = dailyUsage[id] || 0;
        if (day < tool.availableDay) {
            return { id, label, usage: `Day ${tool.availableDay}`, state: 'locked', powerUp: false, color: null };
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
