// Hint and Undo on the play screen (wide audience round): the two tray
// buttons and the marker that points at a move. DOM only; the move itself
// comes from src/sim/hint.js and the snapshot from src/sim/undo.js.
//
// The marker is a DOM overlay placed with the view's own screenPoint(), so
// the 3D view needs no changes: a ring on a person, or a bar along a line.
import './meta.css';

const MARK_MS = 5000;
const BAR_INSET = 40; // keep the bar clear of the two faces at its ends
let active = null; // { els, raf, timer }

export function clearMarks() {
    if (!active) return;
    cancelAnimationFrame(active.raf);
    clearTimeout(active.timer);
    for (const el of active.els) el.remove();
    active = null;
}

// Screen ends of a move: one point for a person, two for a line.
export function markPoints(view, move) {
    if (!view || !move || !view.nodeObjs || !view.screenPoint) return null;
    const at = (node) => {
        const obj = node && view.nodeObjs.get(typeof node === 'object' ? node.id : node);
        return obj ? view.screenPoint(obj.pos) : null;
    };
    if (move.link) {
        const a = at(move.link.source);
        const b = at(move.link.target);
        return a && b ? [a, b] : null;
    }
    const p = at(move.node);
    return p ? [p] : null;
}

// Geometry for the bar along a line: centre, length and angle in degrees.
export function barGeometry(a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, length: Math.hypot(dx, dy), angle: (Math.atan2(dy, dx) * 180) / Math.PI };
}

// Point at a move for a few seconds. kind: 'hint' (gold) or 'warn' (red,
// the Early warning upgrade). Returns true when something was shown.
export function showMark(view, move, { kind = 'hint', ms = MARK_MS, label = '' } = {}) {
    clearMarks();
    if (typeof document === 'undefined' || !markPoints(view, move)) return false;
    // A person gets a ring; a line gets a bar along it (a ring at its middle
    // could look like it marks whoever stands behind the line).
    const shape = document.createElement('div');
    shape.className = `meta-mark meta-mark--${move.link ? 'bar' : 'ring'} meta-mark--${kind}`;
    const els = [shape];
    let tag = null;
    if (label) {
        tag = document.createElement('div');
        tag.className = `meta-mark meta-mark--tag meta-mark--${kind}`;
        tag.textContent = label;
        els.push(tag);
    }
    for (const el of els) document.body.appendChild(el);
    const place = () => {
        const pts = markPoints(view, move);
        if (!pts) return clearMarks();
        const centre = pts.length === 2 ? barGeometry(pts[0], pts[1]) : pts[0];
        if (pts.length === 2) {
            shape.style.width = `${Math.max(24, centre.length - BAR_INSET)}px`;
            shape.style.transform = `translate(${centre.x}px, ${centre.y}px) rotate(${centre.angle}deg) translate(-50%, 0)`;
        } else {
            shape.style.transform = `translate(${centre.x}px, ${centre.y}px)`;
        }
        if (tag) tag.style.transform = `translate(${centre.x}px, ${centre.y - 50}px)`;
        if (active) active.raf = requestAnimationFrame(place);
    };
    active = { els, raf: 0, timer: setTimeout(clearMarks, ms) };
    place();
    return true;
}

// Keep the two tray buttons in step with the game.
//   hint: { label, price, disabled }   undo: { visible }
export function syncMetaButtons({ hint = null, undo = null } = {}) {
    if (typeof document === 'undefined') return;
    const hintBtn = document.getElementById('hint-btn');
    if (hintBtn && hint) {
        const cost = hintBtn.querySelector('.meta-btn-cost');
        if (cost) cost.textContent = hint.label;
        hintBtn.setAttribute('aria-label', hint.price > 0 ? `Hint, costs ${hint.price} gold` : 'Hint, free');
        hintBtn.classList.toggle('is-off', !!hint.disabled);
    }
    const undoBtn = document.getElementById('undo-btn');
    if (undoBtn && undo) undoBtn.hidden = !undo.visible;
}
