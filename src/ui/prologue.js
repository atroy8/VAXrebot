// Story prologue (round 14): a short cinematic intro shown on first launch,
// before the start page. Five story cards auto-advance (tap to go faster),
// Skip leaves at any time, and Settings can replay it.
//
// The story: the Blightborne, an alliance of hostile alien races, seed a
// virus from world to world. You lead the galaxy's last response team. The
// tools you carry are the real ones public health teams use.
//
// Pure parts (card copy, the seen flag, the step controller) are exported
// for tests; mountPrologue() is the only part that touches the DOM.

import './prologue.css';

export const PROLOGUE_SEEN_KEY = 'galactic-outbreak.prologue-seen.v1';
export const CARD_MS = 5600;
export const ALIEN_RACE = 'the Blightborne';

export const PROLOGUE_CARDS = [
    {
        id: 'peace',
        title: 'A thousand worlds lived in peace.',
        text: 'Many peoples, one bright galaxy, joined by star lanes and old friendships.',
        art: 'galaxy',
    },
    {
        id: 'blight',
        title: 'Then the Blightborne came.',
        text: 'Hostile alien fleets slipped a virus onto every world they passed. It jumps from person to person, one contact at a time.',
        art: 'fleet',
    },
    {
        id: 'dark',
        title: 'One by one, worlds went dark.',
        text: 'Where the virus ran unchecked, cities fell quiet and the star lanes closed.',
        art: 'dark',
    },
    {
        id: 'hope',
        title: 'You are the galaxy\'s last hope.',
        text: 'Lead the Galactic Response Team from world to world. Every outbreak can be stopped if you act early.',
        art: 'ship',
    },
    {
        id: 'tools',
        title: 'Your tools are real.',
        text: 'Vaccines protect people. Quarantine keeps the sick from passing it on. Cutting contacts breaks the chain. Health teams use them every day.',
        art: 'tools',
    },
    {
        id: 'begin',
        title: 'Stop the spread. Save the galaxy.',
        text: '',
        art: 'galaxy-bright',
        final: true,
    },
];

// First launch only. Storage can be missing or throw (private mode,
// previews): then show it, and never crash.
export function shouldShowPrologue(storage) {
    try {
        return !storage || storage.getItem(PROLOGUE_SEEN_KEY) !== '1';
    } catch {
        return true;
    }
}

export function markPrologueSeen(storage) {
    try {
        storage?.setItem(PROLOGUE_SEEN_KEY, '1');
    } catch {
        /* ignore: worst case it shows again next launch */
    }
}

// Step controller, no DOM and no timers of its own. `onChange(index)` on
// every card change, `onDone(reason)` once ('skip' or 'begin').
export function createPrologueController({ cards = PROLOGUE_CARDS, onChange = () => {}, onDone = () => {} } = {}) {
    let index = 0;
    let done = false;
    const finish = (reason) => {
        if (done) return;
        done = true;
        onDone(reason);
    };
    return {
        get index() { return index; },
        get done() { return done; },
        get isFinal() { return index === cards.length - 1; },
        // Tap or timer: next card; the final card waits for Begin.
        next() {
            if (done || index >= cards.length - 1) return false;
            index++;
            onChange(index);
            return true;
        },
        skip() { finish('skip'); },
        begin() { finish('begin'); },
    };
}

const ART = {
    galaxy: `<svg viewBox="0 0 200 200" class="pro-art pro-art--galaxy" aria-hidden="true">
        <defs><radialGradient id="pg-core"><stop offset="0" stop-color="#fff6d6"/><stop offset="0.5" stop-color="#ecd27e" stop-opacity="0.7"/><stop offset="1" stop-color="#ecd27e" stop-opacity="0"/></radialGradient><radialGradient id="pg-disc"><stop offset="0" stop-color="#9cc4ff" stop-opacity="0.35"/><stop offset="1" stop-color="#9cc4ff" stop-opacity="0"/></radialGradient></defs>
        <g transform="rotate(-18 100 100)">
            <ellipse cx="100" cy="100" rx="92" ry="50" fill="url(#pg-disc)"/>
            <g class="pro-twinkle"><circle cx="109.8" cy="102.3" r="1.4" fill="#e8eef8"/><circle cx="109.3" cy="104.2" r="1.4" fill="#e8eef8"/><circle cx="107.6" cy="106.2" r="3.6" fill="#7fd8a4"/><circle cx="104.5" cy="108.1" r="1.5" fill="#e8eef8"/><circle cx="100.2" cy="109.5" r="1.6" fill="#e8eef8"/><circle cx="94.6" cy="110.3" r="1.6" fill="#e8eef8"/><circle cx="88.1" cy="110.2" r="3.6" fill="#f3a9c8"/><circle cx="81.1" cy="109.0" r="1.8" fill="#e8eef8"/><circle cx="74.3" cy="106.3" r="1.8" fill="#e8eef8"/><circle cx="68.4" cy="102.3" r="1.8" fill="#e8eef8"/><circle cx="64.5" cy="96.9" r="3.6" fill="#9cc4ff"/><circle cx="63.4" cy="90.3" r="1.9" fill="#e8eef8"/><circle cx="66.0" cy="83.0" r="2.0" fill="#e8eef8"/><circle cx="73.2" cy="75.6" r="2.0" fill="#e8eef8"/><circle cx="85.4" cy="68.8" r="3.6" fill="#ffd27a"/><circle cx="102.5" cy="63.6" r="2.1" fill="#e8eef8"/><circle cx="124.1" cy="61.1" r="2.2" fill="#e8eef8"/><circle cx="148.9" cy="62.1" r="2.2" fill="#e8eef8"/><circle cx="90.2" cy="97.7" r="1.4" fill="#e8eef8"/><circle cx="90.7" cy="95.8" r="1.4" fill="#e8eef8"/><circle cx="92.4" cy="93.8" r="3.6" fill="#c7a8ff"/><circle cx="95.5" cy="91.9" r="1.5" fill="#e8eef8"/><circle cx="99.8" cy="90.5" r="1.6" fill="#e8eef8"/><circle cx="105.4" cy="89.7" r="1.6" fill="#e8eef8"/><circle cx="111.9" cy="89.8" r="3.6" fill="#7fe0e0"/><circle cx="118.9" cy="91.0" r="1.8" fill="#e8eef8"/><circle cx="125.7" cy="93.7" r="1.8" fill="#e8eef8"/><circle cx="131.6" cy="97.7" r="1.8" fill="#e8eef8"/><circle cx="135.5" cy="103.1" r="3.6" fill="#7fd8a4"/><circle cx="136.6" cy="109.7" r="1.9" fill="#e8eef8"/><circle cx="134.0" cy="117.0" r="2.0" fill="#e8eef8"/><circle cx="126.8" cy="124.4" r="2.0" fill="#e8eef8"/><circle cx="114.6" cy="131.2" r="3.6" fill="#f3a9c8"/><circle cx="97.5" cy="136.4" r="2.1" fill="#e8eef8"/><circle cx="75.9" cy="138.9" r="2.2" fill="#e8eef8"/><circle cx="51.1" cy="137.9" r="2.2" fill="#e8eef8"/></g>
            <ellipse cx="100" cy="100" rx="30" ry="18" fill="url(#pg-core)"/>
        </g>
    </svg>`,
    fleet: `<svg viewBox="0 0 200 200" class="pro-art pro-art--fleet" aria-hidden="true">
        <g class="pro-drift">
            <path d="M40 60 l40 -14 l-10 14 l10 14 z" fill="#3a2350" stroke="#c8432f" stroke-width="2"/>
            <path d="M110 40 l46 -16 l-12 16 l12 16 z" fill="#3a2350" stroke="#c8432f" stroke-width="2"/>
            <path d="M120 92 l36 -12 l-9 12 l9 12 z" fill="#3a2350" stroke="#c8432f" stroke-width="2"/>
        </g>
        <g class="pro-spores" fill="#ff6b6b">
            <circle cx="66" cy="84" r="4"/><circle cx="138" cy="66" r="5"/><circle cx="142" cy="116" r="4"/><circle cx="100" cy="128" r="3"/>
        </g>
        <circle cx="100" cy="190" r="56" fill="#234c9c"/><path d="M60 160 q20 -12 40 0 t40 0" fill="none" stroke="#7fd8a4" stroke-width="6" stroke-linecap="round"/>
    </svg>`,
    dark: `<svg viewBox="0 0 200 200" class="pro-art pro-art--dark" aria-hidden="true">
        <circle cx="52" cy="70" r="22" fill="#234c9c"/><circle cx="52" cy="70" r="22" class="pro-dim" style="--d:0.6s"/>
        <circle cx="142" cy="60" r="28" fill="#3565b8"/><circle cx="142" cy="60" r="28" class="pro-dim" style="--d:1.4s"/>
        <circle cx="100" cy="140" r="34" fill="#1b3a7a"/><circle cx="100" cy="140" r="34" class="pro-dim" style="--d:2.2s"/>
        <g fill="#ffd27a"><circle cx="46" cy="66" r="2.5" class="pro-light" style="--d:0.6s"/><circle cx="58" cy="76" r="2" class="pro-light" style="--d:0.6s"/><circle cx="134" cy="54" r="2.5" class="pro-light" style="--d:1.4s"/><circle cx="150" cy="66" r="2" class="pro-light" style="--d:1.4s"/><circle cx="90" cy="134" r="3" class="pro-light" style="--d:2.2s"/><circle cx="110" cy="148" r="2.5" class="pro-light" style="--d:2.2s"/></g>
    </svg>`,
    ship: `<svg viewBox="0 0 200 200" class="pro-art pro-art--ship" aria-hidden="true">
        <path d="M20 150 Q 80 120, 110 96" fill="none" stroke="#ecd27e" stroke-width="5" stroke-linecap="round" stroke-dasharray="2 10" class="pro-trail"/>
        <g class="pro-fly">
            <path d="M104 100 l40 -34 l8 10 l-34 40 z" fill="#f7f2e4" stroke="#0b1838" stroke-width="3"/>
            <circle cx="136" cy="76" r="7" fill="#9cc4ff" stroke="#0b1838" stroke-width="2.5"/>
            <path d="M106 102 l-14 10 l6 -16 z" fill="#ddb94a"/>
        </g>
        <circle cx="168" cy="40" r="14" fill="#7fd8a4" class="pro-pulse"/>
    </svg>`,
    tools: `<svg viewBox="0 0 240 120" class="pro-art pro-art--tools" aria-hidden="true">
        <g class="pro-pop" style="--d:0.2s"><circle cx="40" cy="60" r="32" fill="#5b3fb8"/><g transform="rotate(-45 40 60)"><rect x="12" y="51" width="4" height="18" rx="2" fill="#fff"/><rect x="16" y="58" width="9" height="4" fill="#fff"/><rect x="25" y="53" width="24" height="14" rx="3" fill="#fff"/><rect x="29" y="57" width="12" height="6" rx="1.5" fill="#9cc4ff"/><rect x="49" y="57.5" width="4" height="5" fill="#fff"/><rect x="53" y="59" width="14" height="2" rx="1" fill="#fff"/></g></g>
        <g class="pro-pop" style="--d:0.7s"><circle cx="120" cy="60" r="32" fill="#c46a2f"/><path d="M102 64 l18 -16 l18 16 v16 h-36 z" fill="#fff"/></g>
        <g class="pro-pop" style="--d:1.2s"><circle cx="200" cy="60" r="32" fill="#1d8fd6"/><circle cx="190" cy="74" r="6" fill="none" stroke="#fff" stroke-width="4"/><circle cx="210" cy="74" r="6" fill="none" stroke="#fff" stroke-width="4"/><path d="M194 68 l14 -26 M206 68 l-14 -26" stroke="#fff" stroke-width="4" stroke-linecap="round"/></g>
    </svg>`,
};
ART['galaxy-bright'] = ART.galaxy.replace('pro-art--galaxy', 'pro-art--galaxy pro-art--bright');

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export function prologueMarkup(cards = PROLOGUE_CARDS) {
    const slides = cards
        .map(
            (c, i) => `<section class="pro-card${i === 0 ? ' on' : ''}" data-i="${i}" aria-hidden="${i === 0 ? 'false' : 'true'}">
                <div class="pro-art-wrap">${ART[c.art] || ''}</div>
                <h2 class="pro-title">${esc(c.title)}</h2>
                ${c.text ? `<p class="pro-text">${esc(c.text)}</p>` : ''}
                ${c.final ? '<button type="button" class="pro-begin" data-act="begin">Begin</button>' : ''}
            </section>`
        )
        .join('');
    const dots = cards.map((_, i) => `<span class="pro-dot${i === 0 ? ' on' : ''}"></span>`).join('');
    return `<div class="prologue" role="dialog" aria-modal="true" aria-label="Story">
        <div class="pro-stars pro-stars--far"></div>
        <div class="pro-stars pro-stars--mid"></div>
        <div class="pro-stars pro-stars--near"></div>
        <button type="button" class="pro-skip" data-act="skip">Skip</button>
        <div class="pro-cards">${slides}</div>
        <div class="pro-dots" aria-hidden="true">${dots}</div>
        <p class="pro-hint" aria-hidden="true">Tap to continue</p>
    </div>`;
}

function safeStorage() {
    try {
        return typeof window !== 'undefined' ? window.localStorage : null;
    } catch {
        return null;
    }
}

// Shows the prologue over everything. Resolves when it closes.
export function mountPrologue({ doc = typeof document !== 'undefined' ? document : null, storage = safeStorage(), cardMs = CARD_MS } = {}) {
    if (!doc || doc.querySelector('.prologue')) return Promise.resolve('open');
    return new Promise((resolve) => {
        const holder = doc.createElement('div');
        holder.innerHTML = prologueMarkup();
        const root = holder.firstElementChild;
        doc.body.appendChild(root);
        const cards = root.querySelectorAll('.pro-card');
        const dots = root.querySelectorAll('.pro-dot');
        let timer = null;
        const arm = () => {
            clearTimeout(timer);
            if (!ctl.isFinal) timer = setTimeout(() => ctl.next(), cardMs);
        };
        const ctl = createPrologueController({
            onChange(i) {
                cards.forEach((c, k) => {
                    c.classList.toggle('on', k === i);
                    c.classList.toggle('past', k < i);
                    c.setAttribute('aria-hidden', k === i ? 'false' : 'true');
                });
                dots.forEach((d, k) => d.classList.toggle('on', k <= i));
                root.classList.toggle('at-final', ctl.isFinal);
                root.style.setProperty('--shift', String(i));
                arm();
            },
            onDone(reason) {
                clearTimeout(timer);
                markPrologueSeen(storage);
                root.classList.add('leaving');
                setTimeout(() => root.remove(), 450);
                resolve(reason);
            },
        });
        root.addEventListener('click', (e) => {
            const act = e.target.closest('[data-act]')?.dataset.act;
            if (act === 'skip') return ctl.skip();
            if (act === 'begin') return ctl.begin();
            ctl.next();
        });
        arm();
    });
}

export function maybeShowPrologue(opts = {}) {
    const storage = opts.storage ?? safeStorage();
    if (!shouldShowPrologue(storage)) return Promise.resolve('seen');
    return mountPrologue({ ...opts, storage });
}

// Settings fires this event to replay the story.
export const REPLAY_EVENT = 'prologue:replay';
export function bindPrologueReplay(target = typeof window !== 'undefined' ? window : null) {
    target?.addEventListener(REPLAY_EVENT, () => mountPrologue());
}
