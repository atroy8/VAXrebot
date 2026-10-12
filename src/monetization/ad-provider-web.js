// Web placeholder for the interstitial ad. It shows a clearly labeled
// sample card so playtesters can judge the pacing before AdMob is wired.
// The real App Store build replaces this with an AdMob adapter that keeps
// the same contract: showInterstitial() returns a promise that resolves
// when the ad is closed (true) or could not load (false).

const CLOSE_DELAY_MS = 2000;

export function createWebAdProvider({ onRemoveAds, closeDelayMs = CLOSE_DELAY_MS } = {}) {
    return {
        isAvailable: () => typeof document !== 'undefined',
        showInterstitial() {
            return new Promise((resolve) => {
                const overlay = document.createElement('div');
                overlay.className = 'ad-overlay';
                overlay.setAttribute('role', 'dialog');
                overlay.setAttribute('aria-modal', 'true');
                overlay.setAttribute('aria-label', 'Ad break');
                overlay.innerHTML = `
                    <div class="ad-card">
                        <span class="ad-tag">Ad</span>
                        <p class="ad-title">Ad break</p>
                        <p class="ad-copy">This is a sample ad slot. In the App Store version a short ad plays here between levels, never during one.</p>
                        <button type="button" class="ad-remove">Remove Ads</button>
                        <button type="button" class="ad-close" disabled>Continue in <span class="ad-count">2</span></button>
                    </div>`;
                document.body.appendChild(overlay);
                const close = overlay.querySelector('.ad-close');
                const count = overlay.querySelector('.ad-count');
                let left = Math.ceil(closeDelayMs / 1000);
                const timer = setInterval(() => {
                    left -= 1;
                    if (left <= 0) {
                        clearInterval(timer);
                        close.disabled = false;
                        close.textContent = 'Continue';
                    } else {
                        count.textContent = String(left);
                    }
                }, 1000);
                const finish = () => {
                    clearInterval(timer);
                    overlay.remove();
                    resolve(true);
                };
                close.addEventListener('click', finish);
                overlay.querySelector('.ad-remove').addEventListener('click', () => {
                    finish();
                    onRemoveAds?.();
                });
            });
        },
    };
}
