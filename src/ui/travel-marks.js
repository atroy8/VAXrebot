// Travellers (round 57): the dotted line that shows where each traveller
// goes tonight, and a small cross on the line they will drop. A DOM overlay
// placed with the view's own screenPoint(), like the hint marker in
// ./hint.js, so the 3D view needs no changes. The plan itself is pure
// (travelPlan in src/sim/mechanics.js) and is exactly what the night does.
import { barGeometry } from './hint.js';

let active = null; // { els, raf }

export function clearTravelPlan() {
    if (!active) return;
    cancelAnimationFrame(active.raf);
    for (const item of active.items) for (const el of item.els) el.remove();
    active = null;
}

// Screen points of one planned move: the traveller, where they go, and the
// contact they leave. null when the view cannot place them.
export function travelPoints(view, move) {
    if (!view || !move || !view.nodeObjs || !view.screenPoint) return null;
    const at = (id) => {
        const obj = view.nodeObjs.get(id);
        return obj ? view.screenPoint(obj.pos) : null;
    };
    const from = at(move.traveller);
    const to = at(move.to);
    const leaves = at(move.from);
    return from && to ? { from, to, leaves } : null;
}

// Text for screen readers and tests: "Traveller 3 goes to 9 tonight and leaves 5."
export function travelLabel(move) {
    return `Tonight this traveller moves on: a new line here, and their oldest line is dropped.`;
}

// plan: [{ traveller, from, to }]. Replaces whatever was shown.
export function showTravelPlan(view, plan = []) {
    clearTravelPlan();
    if (typeof document === 'undefined' || !plan.length) return false;
    const items = [];
    for (const move of plan) {
        if (!travelPoints(view, move)) continue;
        const line = document.createElement('div');
        line.className = 'travel-plan travel-plan--line';
        line.setAttribute('role', 'img');
        line.setAttribute('aria-label', travelLabel(move));
        const drop = document.createElement('div');
        drop.className = 'travel-plan travel-plan--drop';
        drop.textContent = '×';
        document.body.appendChild(line);
        document.body.appendChild(drop);
        items.push({ move, els: [line, drop] });
    }
    if (!items.length) return false;
    const place = () => {
        if (!active) return;
        for (const item of items) {
            const pts = travelPoints(view, item.move);
            const [line, drop] = item.els;
            if (!pts) {
                line.style.display = 'none';
                drop.style.display = 'none';
                continue;
            }
            const g = barGeometry(pts.from, pts.to);
            line.style.display = '';
            line.style.width = `${Math.max(12, g.length - 44)}px`;
            line.style.transform = `translate(${g.x}px, ${g.y}px) rotate(${g.angle}deg) translate(-50%, -50%)`;
            if (pts.leaves) {
                drop.style.display = '';
                drop.style.transform = `translate(${(pts.from.x + pts.leaves.x) / 2}px, ${(pts.from.y + pts.leaves.y) / 2}px) translate(-50%, -50%)`;
            } else drop.style.display = 'none';
        }
        active.raf = requestAnimationFrame(place);
    };
    active = { items, raf: 0 };
    place();
    return true;
}
