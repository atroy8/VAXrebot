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

// The three How to play cards (round 26: rewritten for faces, red lines,
// tools that open on later days and deaths). Pure data so it is tested.
export const HOW_TO_PLAY = Object.freeze([
    {
        title: 'Stop the spread',
        body: 'Each face is a person and each line is a contact the virus can travel along. Red faces are sick, and red lines show where it can jump next.',
    },
    {
        title: 'Pick a tool, then tap',
        body: 'Choose a tool from the tray at the bottom, then tap a person or a line. Some tools open on a later day, as the briefing shows. When your actions run out, the next day starts on its own.',
    },
    {
        title: 'Win or lose',
        body: 'You win when nobody is sick. You lose if cases reach the cap on the case meter. Sick people can die, so act early. Watch R: below 1 means the outbreak is shrinking.',
    },
]);

const cardMarkup = (card, i) => `
                <div class="onboarding-card">
                    <span class="onboarding-step">${i + 1}</span>
                    <h3>${card.title}</h3>
                    <p>${card.body}</p>
                </div>`;

// Force-show the overlay (the "How to play" button). Does not touch the
// dismissal flag: reopening it never re-arms the first-visit behavior.
export function showOnboarding() {
    const overlay = document.createElement('div');
    overlay.className = 'onboarding-overlay';
    overlay.innerHTML = `
        <div class="onboarding-dialog" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
            <h2 id="onboarding-title">How to play</h2>
            <p class="onboarding-intro">Three things to know before your first day.</p>
            <div class="onboarding-cards">${HOW_TO_PLAY.map(cardMarkup).join('')}
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
