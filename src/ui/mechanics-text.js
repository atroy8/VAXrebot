// Words for the mechanics of later planets (hidden carriers, tests, masks,
// new goals). Pure: no DOM, tested in tests/wide-mechanics-*.test.js.
// src/game.js shows these as toasts and log lines.

// What to say and log after Test or Mask is used on a person.
// result is what applyNodeTool returned (src/sim/actions.js).
// Returns { toast, tone, log }.
export function mechanicToolFeedback(toolId, result = {}, node = {}) {
    if (toolId === 'test') {
        if (result.positive) {
            return {
                toast: 'Positive! This person is carrying it without symptoms and passes it on tonight. Isolate them or cut their lines.',
                tone: 'success',
                log: `Person ${node.id} tested positive.`,
            };
        }
        return { toast: 'Tested clear: not a carrier. They can still catch it over a red line.', tone: 'info', log: `Person ${node.id} tested clear.` };
    }
    if (toolId === 'mask') {
        return { toast: 'Masked. Every line of this person now takes two nights to cross instead of one.', tone: 'info', log: `Person ${node.id} now wears a mask.` };
    }
    return { toast: '', tone: 'info', log: '' };
}

// One line the morning after carriers show symptoms. spread is what
// advanceDay returned (spread.onsets, later planets only). Says only what
// the player can now see: who fell ill, and where each one was.
// Returns '' when there is nothing to say.
export function onsetToast(spread) {
    const onsets = (spread && spread.onsets) || [];
    const travel = travelLine(spread);
    if (!onsets.length) return travel;
    const late = onsets.filter((o) => o.from === 'vaccinated').length;
    const inWard = onsets.filter((o) => o.from === 'quarantined').length;
    const found = onsets.filter((o) => o.from === 'exposed').length;
    const surprise = onsets.filter((o) => o.from === 'healthy').length;
    const parts = [];
    if (surprise > 0) {
        parts.push(
            surprise === 1
                ? 'Someone who looked healthy fell ill overnight. They were carrying it. Test their contacts.'
                : `${surprise} people who looked healthy fell ill overnight. They were carrying it. Test their contacts.`
        );
    }
    if (inWard > 0) parts.push(inWard === 1 ? 'A person you isolated fell ill in the ward, where they can infect nobody. Good call.' : `${inWard} people you isolated fell ill in the ward, where they can infect nobody. Good call.`);
    if (late > 0) parts.push(late === 1 ? 'One vaccine came too late: that person had already caught it.' : `${late} vaccines came too late: those people had already caught it.`);
    if (!parts.length && found > 0) parts.push(found === 1 ? 'A carrier you found now shows symptoms.' : `${found} carriers you found now show symptoms.`);
    if (travel) parts.push(travel);
    return parts.join(' ');
}

// The results line that reveals the hidden chains (appended to the lesson
// takeaway). '' when the level had no hidden carriers.
export function hiddenChainsLine(stats = {}) {
    const all = stats.hiddenInfections || 0;
    if (!all) return '';
    const silent = stats.silentSpread || 0;
    const found = stats.testsPositive || 0;
    const carried = all === 1 ? '1 person carried it unseen from the start.' : `${all} people carried it unseen from the start.`;
    const passed = silent > 0 ? ` ${silent === 1 ? '1 infection was' : `${silent} infections were`} passed on by people with no symptoms yet.` : '';
    const tests = found > 0 ? ` Your tests caught ${found} ${found === 1 ? 'carrier' : 'carriers'} early.` : ' No test found a carrier this time.';
    return `Hidden chains: ${carried}${passed}${tests}`;
}

// Keep it open: a tap on one of the hub's lines.
export const HUB_LOCKED_TEXT = 'This place must stay open, so its lines cannot be cut. Cut the lines that lead to it.';

// The day shown in the HUD. On a hold the line level it counts toward the
// day help lands: "3/7".
export function dayLabel(day, goal = null) {
    if (goal && goal.type === 'holdLine') return `${Math.min(day, goal.days)}/${goal.days}`;
    return day;
}

// How a hold the line level ended, for the results. '' on other levels.
export function goalLine(stats = {}, scenario = null) {
    const goal = scenario && scenario.goal;
    if (!goal || goal.type !== 'holdLine') return '';
    if (stats.heldLine) return `You held the line: the vaccines landed after day ${goal.days} with cases still under the cap.`;
    return '';
}

// Everything the new mechanics add to the results takeaway, in one line.
export function mechanicsResultsLine(stats = {}, scenario = null) {
    return [goalLine(stats, scenario), hiddenChainsLine(stats)].filter(Boolean).join(' ');
}

// The morning line about travellers (spread.travel from advanceDay). ''
// when nobody moved.
export function travelLine(spread) {
    const moves = (spread && spread.travel) || [];
    if (!moves.length) return '';
    return moves.length === 1 ? 'A traveller moved on overnight, as the dotted line showed.' : `${moves.length} travellers moved on overnight, as the dotted lines showed.`;
}
