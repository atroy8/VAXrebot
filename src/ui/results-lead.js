// Lean results: the lead block above Details (index.html #results-lead).
//
//   #results-stars     the three stars (the tally pops them one at a time)
//   #results-mentor    a slot for a mentor line, hidden while empty
//   #results-headline  ONE sentence (results-headline.js)
//   #results-reward    funding earned and any prize box
//
// The score bar, pills, bins, outbreak numbers, the long message, cases
// averted and the lesson sit in <details id="results-details">, closed.
import './results-lean.css';

export const EMPTY_STARS = `<div class="tally-stars" aria-label="0 of 3 stars">${'<span class="tally-star">★</span>'.repeat(3)}</div>`;

// Where the tally puts its stars and reward when the results are lean.
// null (old markup, tests without a DOM) keeps the tally in one piece.
export function resultsLeadSlots(doc = typeof document !== 'undefined' ? document : null) {
    const stars = doc?.getElementById('results-stars');
    const reward = doc?.getElementById('results-reward');
    return stars && reward ? { stars, reward } : null;
}

// Called by renderGameOver on every results screen. tally: a win, whose
// stars and reward playResultsTally fills in next.
export function renderResultsLead({ headline = '', tally = false } = {}, doc = typeof document !== 'undefined' ? document : null) {
    if (!doc) return;
    const line = doc.getElementById('results-headline');
    if (line) {
        line.textContent = headline;
        line.hidden = !headline;
    }
    const slots = resultsLeadSlots(doc);
    if (slots && !tally) {
        // No win, no stars yet: three hollow ones show what is there to earn.
        slots.stars.innerHTML = EMPTY_STARS;
        slots.reward.innerHTML = '';
    }
    // Every results screen opens with Details closed and scrolled to the top.
    const details = doc.getElementById('results-details');
    if (details) details.open = false;
}
