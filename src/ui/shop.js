// Power-up shop UI: spend grant funding on consumable power-up charges.
// Candy aesthetic, mobile friendly, fully offline. Mounted by game.js in
// the tool-wiring section (below the tool list on the game screen).
// Styles are injected by this module so src/styles.css stays untouched.

import { POWER_UPS, POWER_UP_IDS, getCharges, getFunding, buyCharge } from '../economy.js';

const STYLE_ID = 'powerup-shop-styles';

function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
        .powerup-shop {
            font-family: 'Fredoka', 'Comic Sans MS', system-ui, sans-serif;
            background: linear-gradient(160deg, #fdf6ff 0%, #f3ecff 100%);
            border: 2px solid #e3d4ff;
            border-radius: 18px;
            padding: 14px;
            margin: 12px 0;
            box-shadow: 0 4px 14px rgba(122, 90, 200, 0.15);
        }
        .powerup-shop h3 {
            margin: 0 0 2px;
            font-size: 1.1rem;
            color: #4a2d8f;
            text-align: center;
        }
        .powerup-shop .shop-sub {
            margin: 0 0 10px;
            font-size: 0.8rem;
            color: #7a6aa0;
            text-align: center;
        }
        .powerup-shop .shop-balance {
            display: inline-block;
            background: #fff3c4;
            border: 2px solid #f0c93f;
            border-radius: 999px;
            padding: 4px 14px;
            font-weight: 700;
            color: #8a5c00;
            font-size: 0.95rem;
        }
        .powerup-shop .shop-balance-row { text-align: center; margin-bottom: 10px; }
        .powerup-shop .shop-card {
            display: flex;
            align-items: center;
            gap: 10px;
            border-radius: 14px;
            padding: 10px 12px;
            margin-bottom: 8px;
            background: #ffffff;
            border: 2px solid var(--pc, #ccc);
        }
        .powerup-shop .shop-icon {
            flex: 0 0 44px;
            width: 44px;
            height: 44px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 1.5rem;
            background: var(--pc, #ccc);
            box-shadow: inset 0 -3px 0 rgba(0,0,0,0.12);
        }
        .powerup-shop .shop-info { flex: 1; min-width: 0; }
        .powerup-shop .shop-name { font-weight: 700; color: #3a2a6e; font-size: 0.95rem; }
        .powerup-shop .shop-effect { font-size: 0.75rem; color: #6a5a94; margin: 2px 0; line-height: 1.3; }
        .powerup-shop .shop-owned {
            font-size: 0.75rem;
            font-weight: 700;
            color: #4a2d8f;
            background: #efe7ff;
            border-radius: 999px;
            padding: 1px 10px;
            display: inline-block;
        }
        .powerup-shop .shop-buy {
            flex: 0 0 auto;
            font-family: inherit;
            font-weight: 700;
            font-size: 0.85rem;
            color: #fff;
            background: var(--pc, #7a5ac8);
            border: none;
            border-radius: 999px;
            padding: 12px 16px;
            min-height: 48px;
            cursor: pointer;
            box-shadow: 0 3px 0 rgba(0,0,0,0.18);
            transition: transform 0.08s ease;
            white-space: nowrap;
        }
        .powerup-shop .shop-buy:active { transform: translateY(2px); box-shadow: none; }
        .powerup-shop .shop-buy:disabled {
            background: #c9c2d8;
            cursor: not-allowed;
            box-shadow: none;
        }
        .powerup-shop .shop-msg {
            text-align: center;
            font-size: 0.8rem;
            font-weight: 600;
            color: #2e7d32;
            min-height: 1.2em;
            margin-top: 4px;
        }
        .powerup-shop .shop-msg.error { color: #c62828; }
        @media (max-width: 480px) {
            .powerup-shop .shop-card { flex-wrap: wrap; }
            .powerup-shop .shop-buy { width: 100%; margin-top: 6px; }
        }
    `;
    document.head.appendChild(style);
}

// Create the shop container right after the tool list. Returns the element.
export function mountShop() {
    ensureStyles();
    let el = document.getElementById('powerup-shop');
    if (el) return el;
    el = document.createElement('section');
    el.id = 'powerup-shop';
    el.className = 'powerup-shop';
    el.setAttribute('aria-label', 'Power-up shop');
    const anchor = document.getElementById('tools-list');
    if (anchor && anchor.parentElement) {
        anchor.parentElement.insertBefore(el, anchor.nextSibling);
    } else {
        document.body.appendChild(el);
    }
    return el;
}

// Re-render the shop. onPurchase({ id, ok, reason, save }) fires after a buy.
export function renderShop(el, { onPurchase } = {}) {
    if (!el) return;
    ensureStyles();
    const funding = getFunding();
    const charges = getCharges();
    const cards = POWER_UP_IDS.map((id) => {
        const p = POWER_UPS[id];
        const owned = charges[id] || 0;
        const affordable = funding >= p.cost;
        return `
            <div class="shop-card" style="--pc:${p.color}">
                <div class="shop-icon" aria-hidden="true">${p.emoji}</div>
                <div class="shop-info">
                    <div class="shop-name">${p.name}</div>
                    <div class="shop-effect">${p.effect}</div>
                    <span class="shop-owned">You have ${owned}</span>
                </div>
                <button class="shop-buy" data-buy="${id}" ${affordable ? '' : 'disabled'}>
                    Buy: ${p.cost} 💰
                </button>
            </div>
        `;
    }).join('');
    el.innerHTML = `
        <h3>⚡ Power-Up Shop</h3>
        <p class="shop-sub">Spend grant funding on extra charges. Unused charges carry over to the next level.</p>
        <div class="shop-balance-row"><span class="shop-balance">💰 ${funding} funding</span></div>
        ${cards}
        <div class="shop-msg" id="shop-msg" role="status"></div>
    `;
    el.querySelectorAll('[data-buy]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const id = btn.dataset.buy;
            const result = buyCharge(id);
            const msg = el.querySelector('#shop-msg');
            if (msg) {
                msg.textContent = result.ok
                    ? `${POWER_UPS[id].name} charge added. Good luck out there.`
                    : result.reason;
                msg.classList.toggle('error', !result.ok);
            }
            renderShop(el, { onPurchase });
            if (onPurchase) onPurchase({ id, ...result });
        });
    });
}
