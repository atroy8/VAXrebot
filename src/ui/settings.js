// Settings sheet: a gear button on the home and level screens that opens a
// bottom sheet with Remove Ads, Restore purchases, privacy and support
// links, and Reset progress. Hidden during a level (CSS, see settings.css).
//
// Remove Ads and Restore need the App Store purchase flow (roadmap item 12),
// so on the web they explain that, and the preview build offers a clearly
// labeled "Preview: pretend Remove Ads is owned" switch so the ad pacing
// can be playtested both ways.

import './settings.css';

export const PRIVACY_URL = './privacy.html';
export const SUPPORT_URL = './support.html';
// Public URLs for the App Store listing once main deploys to GitHub Pages.
export const PUBLIC_PRIVACY_URL = 'https://atroy8.github.io/VAXrebot/privacy.html';
export const PUBLIC_SUPPORT_URL = 'https://atroy8.github.io/VAXrebot/support.html';

export function settingsMarkup({ adsRemoved }) {
    return `
        <div class="settings-sheet" role="dialog" aria-modal="true" aria-labelledby="settings-title">
            <div class="settings-head">
                <h2 id="settings-title">Settings</h2>
                <button type="button" class="settings-x" data-act="close" aria-label="Close settings">&times;</button>
            </div>
            <section class="settings-group">
                <h3>Ads</h3>
                <p class="settings-note" data-role="ads-status">${
                    adsRemoved ? 'Ads are off. Thanks for supporting VAXrebot.' : 'A short ad may play between levels, never during one.'
                }</p>
                <button type="button" class="settings-row" data-act="remove-ads">Remove Ads</button>
                <button type="button" class="settings-row" data-act="restore">Restore purchases</button>
                <label class="settings-row settings-switch">
                    <span>Preview: pretend Remove Ads is owned</span>
                    <input type="checkbox" data-act="preview-owned" ${adsRemoved ? 'checked' : ''}>
                </label>
            </section>
            <section class="settings-group">
                <h3>About</h3>
                <a class="settings-row" href="${PRIVACY_URL}" target="_blank" rel="noopener">Privacy policy</a>
                <a class="settings-row" href="${SUPPORT_URL}" target="_blank" rel="noopener">Help and support</a>
            </section>
            <section class="settings-group">
                <h3>Progress</h3>
                <button type="button" class="settings-row settings-danger" data-act="reset">Reset progress</button>
            </section>
        </div>`;
}

export function mountSettings({ monetization, onResetProgress, notify = () => {} } = {}) {
    if (typeof document === 'undefined' || document.querySelector('.settings-fab')) return null;

    const fab = document.createElement('button');
    fab.type = 'button';
    fab.className = 'settings-fab';
    fab.setAttribute('aria-label', 'Settings');
    fab.innerHTML = `<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path fill="currentColor" d="M19.4 13a7.6 7.6 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7.4 7.4 0 0 0-1.7-1L15 3h-4l-.4 2.9a7.4 7.4 0 0 0-1.7 1l-2.5-1-2 3.5L6.6 11a7.6 7.6 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1c.5.4 1.1.7 1.7 1L11 21h4l.4-2.9c.6-.3 1.2-.6 1.7-1l2.5 1 2-3.5zM13 15.5A3.5 3.5 0 1 1 13 8.5a3.5 3.5 0 0 1 0 7z" transform="translate(-1 0)"/></svg>`;
    document.body.appendChild(fab);

    let backdrop = null;
    let resetArmed = false;

    const close = () => {
        backdrop?.remove();
        backdrop = null;
        resetArmed = false;
    };

    const open = () => {
        if (backdrop) return;
        backdrop = document.createElement('div');
        backdrop.className = 'settings-backdrop';
        backdrop.innerHTML = settingsMarkup({ adsRemoved: monetization?.adsRemoved === true });
        document.body.appendChild(backdrop);
        backdrop.addEventListener('click', (e) => {
            if (e.target === backdrop) return close();
            const act = e.target.closest('[data-act]')?.dataset.act;
            if (act === 'close') close();
            if (act === 'remove-ads' || act === 'restore') {
                // Inline, inside the sheet, so it never hides behind the backdrop.
                const status = backdrop.querySelector('[data-role="ads-status"]');
                const msg = 'Purchases arrive with the App Store version.';
                if (status) status.textContent = msg;
                else notify(msg);
            }
            if (act === 'reset') {
                const btn = e.target.closest('[data-act]');
                if (!resetArmed) {
                    resetArmed = true;
                    btn.textContent = 'Tap again to erase all stars and funding';
                } else {
                    close();
                    onResetProgress?.();
                }
            }
        });
        backdrop.addEventListener('change', (e) => {
            if (e.target.dataset.act !== 'preview-owned') return;
            monetization?.setAdsRemoved(e.target.checked);
            const status = backdrop.querySelector('[data-role="ads-status"]');
            if (status) {
                status.textContent = e.target.checked
                    ? 'Ads are off. Thanks for supporting VAXrebot.'
                    : 'A short ad may play between levels, never during one.';
            }
        });
    };

    fab.addEventListener('click', open);
    return { open, close, fab };
}
