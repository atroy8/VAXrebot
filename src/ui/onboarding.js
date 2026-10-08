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
                    <p>A virus is spreading through the community network. Your goal is to stop it before it overwhelms the response.</p>
                </div>
                <div class="onboarding-card">
                    <span class="onboarding-step">2</span>
                    <h3>Pick a tool each day</h3>
                    <p>Choose an intervention from the Tools panel, then click people or connections in the network to apply it. Each tool has a daily limit, so choose wisely.</p>
                </div>
                <div class="onboarding-card">
                    <span class="onboarding-step">3</span>
                    <h3>Win or lose</h3>
                    <p>You win by eradicating the virus. You lose if deaths overwhelm the response. Watch the Action Log to learn what is working.</p>
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
