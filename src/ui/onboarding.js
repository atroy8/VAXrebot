// How to play: a short reference card behind the "?" button in the HUD.
//
// It used to open by itself on a new player's first level, three cards of
// text before the first tap. The guided first level (coach.js) teaches the
// same things on the live web now, so this is only the reference a player
// can open when they want it. It no longer touches the first-visit flag.

// The three How to play cards (round 26: rewritten for faces, red lines,
// tools that open on later days and deaths; trimmed to a line or two each
// when they became a reference). Pure data so it is tested.
export const HOW_TO_PLAY = Object.freeze([
    {
        title: 'Stop the spread',
        body: 'Each face is a person and each line is a contact. Red faces are sick, and red lines are tonight\'s new cases unless you act.',
    },
    {
        title: 'Pick a tool, then tap',
        body: 'Choose a tool from the tray, then tap a person or a line. Some tools open on a later day. When your actions run out, the next day starts on its own.',
    },
    {
        title: 'Win or lose',
        body: 'You win when nobody is sick and lose at the case cap. Frail people (heart mark) die on their third night sick unless isolated. 3 stars: the best play.',
    },
]);

const cardMarkup = (card, i) => `
                <div class="onboarding-card">
                    <span class="onboarding-step">${i + 1}</span>
                    <h3>${card.title}</h3>
                    <p>${card.body}</p>
                </div>`;

// Opens the reference (the "How to play" button). Closes on Got it or Escape.
export function showOnboarding() {
    if (document.querySelector('.onboarding-overlay')) return;
    const overlay = document.createElement('div');
    overlay.className = 'onboarding-overlay';
    overlay.innerHTML = `
        <div class="onboarding-dialog" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
            <h2 id="onboarding-title">How to play</h2>
            <p class="onboarding-intro">The short version.</p>
            <div class="onboarding-cards">${HOW_TO_PLAY.map(cardMarkup).join('')}
            </div>
            <div class="onboarding-actions">
                <button class="btn btn--primary btn--lg" data-onboarding-dismiss>Got it</button>
            </div>
        </div>
    `;

    const dismiss = () => {
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
