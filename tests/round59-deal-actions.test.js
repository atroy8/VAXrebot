// Round 59 playtest fix: after a 3 star result the results screen no longer
// shows Retry this web next to Replay. A perfect win showed five buttons,
// two of them replays that read the same.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dealActionsShown } from '../src/ui/deal-actions.js';

describe('round 59: results buttons after a dealt level', () => {
    it('a missed 3 stars offers both Show best play and Retry this web', () => {
        for (const stars of [0, 1, 2]) {
            expect(dealActionsShown({ hasDeal: true, hasPar: true, stars })).toEqual({ best: true, retry: true });
        }
    });

    it('3 stars hides both: the web is solved', () => {
        expect(dealActionsShown({ hasDeal: true, hasPar: true, stars: 3 })).toEqual({ best: false, retry: false });
    });

    it('no par means no Show best play, but a dealt web can still be retried', () => {
        expect(dealActionsShown({ hasDeal: true, hasPar: false, stars: 1 })).toEqual({ best: false, retry: true });
    });

    it('no deal shows neither, and bad input never throws', () => {
        expect(dealActionsShown({ hasDeal: false, hasPar: false, stars: 0 })).toEqual({ best: false, retry: false });
        expect(dealActionsShown()).toEqual({ best: false, retry: false });
        expect(dealActionsShown({ hasDeal: true, hasPar: true, stars: undefined })).toEqual({ best: true, retry: true });
    });

    it('the results screen uses the helper for both buttons', () => {
        const src = readFileSync(new URL('../src/game-deal.js', import.meta.url), 'utf8');
        expect(src).toContain("import { dealActionsShown } from './ui/deal-actions.js'");
        expect(src).toContain('best.hidden = !show.best');
        expect(src).toContain('retry.hidden = !show.retry');
    });
});
