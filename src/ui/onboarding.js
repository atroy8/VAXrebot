// First-visit onboarding overlay for VAXrebot.
// Shows once on first load; dismissal is remembered in localStorage
// under the "vaxrebot-onboarded" flag.

const FLAG = 'vaxrebot-onboarded';

export function maybeShowOnboarding() {
    let dismissed = false;
    try {
        dismissed = localStorage.getItem(FLAG) === 'true';
    } catch (err) {
        dismissed = false;
    }
    if (dismissed) return;
    showOnboarding();
}

// Force-show the overlay (the "How to play" button). Does not touch the
// dismissal flag: reopening it never re-arms the first-visit behavior.
export function showOnboarding() {
    const overlay = document.createElement('div');
    overlay.className = 'onboarding-overlay';
    overlay.innerHTML = `
        <div class="onboarding-dialog" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
            <h2 id="onboarding-title">How to play</h2>
            <p class="onboarding-intro">Three things to know before your first day.</p>
            <div class="onboarding-cards">
                <div class="onboarding-card">
                    <span class="onboarding-step">1</span>
                    <h3>Contain the outbreak</h3>
                    <p>A virus is spreading through a town. Each dot is a person and each line is a contact the virus can travel along.</p>
                </div>
                <div class="onboarding-card">
                    <span class="onboarding-step">2</span>
                    <h3>Pick a tool, then tap</h3>
                    <p>Choose a tool from the tray at the bottom, then tap a person or a line. You get a few actions a day. When they run out, the next day starts on its own.</p>
                </div>
                <div class="onboarding-card">
                    <span class="onboarding-step">3</span>
                    <h3>Win or lose</h3>
                    <p>You win when nobody is sick. You lose if total cases reach the cap on the case meter. Watch R: below 1 means the outbreak is shrinking.</p>
                </div>
            </div>
            <div class="onboarding-actions">
                <button class="btn btn--primary btn--lg" data-onboarding-dismiss>Start Playing</button>
            </div>
        </div>
    `;

    const dismiss = () => {
        try {
            localStorage.setItem(FLAG, 'true');
        } catch (err) {
            // Storage unavailable (private mode, etc.); just close the overlay.
        }
        document.removeEventListener('keydown', onKeyDown);
        overlay.remove();
    };

    const onKeyDown = (event) => {
        if (event.key === 'Escape') dismiss();
    };

    overlay.querySelector('[data-onboarding-dismiss]').addEventListener('click', dismiss);
    document.addEventListener('keydown', onKeyDown);
    document.body.appendChild(overlay);
}
