// Wide audience pass, story and identity: Dr. Amina Diallo, the mentor.
// One short line on every briefing and one on the results that reacts to
// how the level went. Data driven and pure (src/config/mentor.js).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { LEVELS } from '../src/config/levels.js';
import { toolsOf } from '../src/config/toolkits.js';
import { MENTOR, MENTOR_MAX_CHARS, BRIEFING_LINES, RESULT_LINES, EARLY_LOSS_DAY, briefingKind, mentorBriefingLine, mentorOutcome, mentorResultLine } from '../src/config/mentor.js';
import { mentorMarkup } from '../src/ui/story.js';
import { citizenSvg } from '../art/source/citizens.mjs';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const allLines = [...Object.values(BRIEFING_LINES).flat(), ...Object.values(RESULT_LINES).flat()];

describe('the mentor', () => {
    it('is one named character with a fixed look that the citizen art can draw', () => {
        expect(MENTOR.name).toBe('Dr. Amina Diallo');
        expect(MENTOR.short).toBe('Dr. Diallo');
        expect(MENTOR.look.key).toBeTruthy();
        const svg = citizenSvg('healthy', 'idle', { look: MENTOR.look, background: null, size: 192 });
        expect(svg).toMatch(/^<svg/);
    });

    it('every line is short, plain and unique', () => {
        expect(allLines.length).toBeGreaterThanOrEqual(90);
        expect(new Set(allLines).size).toBe(allLines.length);
        for (const line of allLines) {
            expect(line.length, line).toBeLessThanOrEqual(MENTOR_MAX_CHARS);
            expect(line.length, line).toBeGreaterThan(15);
            expect(line, line).not.toContain('—');
            expect(line, line).not.toMatch(/measles|norovirus|\bflu\b|MERS|pneumo/i);
        }
    });
});

describe('briefing lines', () => {
    it('every level gets a line, the same one every time', () => {
        for (const level of LEVELS) {
            const line = mentorBriefingLine(level.id);
            expect(BRIEFING_LINES[briefingKind(level)], level.id).toContain(line);
            expect(mentorBriefingLine(level.id)).toBe(line);
        }
        expect(mentorBriefingLine('mizuho-1')).toMatch(/^Welcome aboard/);
        expect(mentorBriefingLine('not-a-level')).toBe(BRIEFING_LINES.fallback[0]);
    });

    it('any ten levels in a row hear ten different lines', () => {
        const lines = LEVELS.map((l) => mentorBriefingLine(l.id));
        for (let i = 0; i + 10 <= lines.length; i++) {
            expect(new Set(lines.slice(i, i + 10)).size, `from ${LEVELS[i].id}`).toBe(10);
        }
        // Across the whole campaign there is plenty of variety too.
        expect(new Set(lines).size).toBeGreaterThanOrEqual(40);
    });

    it('each planet opens with its own line, and bosses and puzzles get theirs', () => {
        const openers = LEVELS.filter((l) => l.levelInPlanet === 0).map((l) => mentorBriefingLine(l.id));
        expect(new Set(openers).size).toBe(8);
        expect(briefingKind(LEVELS[9])).toBe('boss');
        expect(briefingKind(LEVELS[2])).toBe('superSpreader');
        expect(briefingKind(LEVELS[6])).toBe('envoy');
        expect(briefingKind(LEVELS[4])).toBe('noVaccines');
        expect(briefingKind(LEVELS[8])).toBe('noQuarantine');
    });

    it('a line never promises a tool the level does not have', () => {
        for (const level of LEVELS) {
            const line = mentorBriefingLine(level.id);
            const tools = toolsOf(level);
            if (/\b(doses|vaccinate)\b/i.test(line) && !/no doses|without|floating/i.test(line)) expect(tools, `${level.id}: ${line}`).toContain('vaccinate');
            if (/\bisolate\b/i.test(line) && !/cannot isolate/i.test(line)) expect(tools, `${level.id}: ${line}`).toContain('quarantine');
            if (/all three tools/i.test(line)) expect(tools).toHaveLength(3);
            if (/one tool today/i.test(line)) expect(tools).toHaveLength(1);
        }
    });
});

describe('results lines', () => {
    it('reads the outcome: flawless, with deaths, slow, early, late, by one', () => {
        expect(mentorOutcome('contained', { totalDead: 0, daysUsed: 5, parDays: 6 })).toBe('flawless');
        expect(mentorOutcome('contained', { totalDead: 0, daysUsed: 5 })).toBe('flawless');
        expect(mentorOutcome('contained', { totalDead: 2, daysUsed: 5, parDays: 6 })).toBe('wonWithDeaths');
        expect(mentorOutcome('contained', { totalDead: 0, daysUsed: 9, parDays: 6 })).toBe('wonSlow');
        expect(mentorOutcome('overwhelmed', { totalInfected: 7, caseCap: 5, daysUsed: EARLY_LOSS_DAY })).toBe('lostEarly');
        expect(mentorOutcome('overwhelmed', { totalInfected: 7, caseCap: 5, daysUsed: EARLY_LOSS_DAY + 1 })).toBe('lostLate');
        expect(mentorOutcome('overwhelmed', { totalInfected: 5, caseCap: 5, daysUsed: 8 })).toBe('lostByOne');
        // A quick loss is an early loss even when it lands exactly on the cap.
        expect(mentorOutcome('overwhelmed', { totalInfected: 5, caseCap: 5, daysUsed: 3 })).toBe('lostEarly');
        expect(mentorOutcome('overwhelmed', { totalInfected: 5, caseCap: Infinity, daysUsed: 8 })).toBe('lostLate');
        expect(mentorOutcome('envoy-lost', {})).toBe('envoyLost');
        expect(mentorOutcome('burnout', {})).toBe('burnout');
        expect(mentorOutcome('timeout', {})).toBe('timeout');
    });

    it('is deterministic given the level, the outcome and the stats', () => {
        const stats = { totalDead: 1, totalInfected: 6, daysUsed: 7, caseCap: 5, parDays: 6 };
        for (const outcome of ['contained', 'overwhelmed', 'envoy-lost', 'burnout', 'timeout']) {
            const a = mentorResultLine('hanabi-4', outcome, stats);
            expect(mentorResultLine('hanabi-4', outcome, { ...stats })).toEqual(a);
            expect(RESULT_LINES[a.kind]).toContain(a.line);
        }
    });

    it('ten wins in a row of the same kind never repeat a line', () => {
        const kinds = {
            flawless: { totalDead: 0, daysUsed: 3, parDays: 6 },
            wonWithDeaths: { totalDead: 1, daysUsed: 3, parDays: 6 },
            wonSlow: { totalDead: 0, daysUsed: 9, parDays: 6 },
        };
        for (const [kind, stats] of Object.entries(kinds)) {
            const lines = LEVELS.map((l) => mentorResultLine(l.id, 'contained', stats));
            expect(lines.every((x) => x.kind === kind)).toBe(true);
            for (let i = 0; i + 10 <= lines.length; i++) {
                expect(new Set(lines.slice(i, i + 10).map((x) => x.line)).size, `${kind} from ${LEVELS[i].id}`).toBe(10);
            }
        }
    });

    it('a retry that goes differently hears a different line', () => {
        const a = mentorResultLine('mizuho-3', 'overwhelmed', { totalInfected: 8, daysUsed: 3, caseCap: 5 });
        const b = mentorResultLine('mizuho-3', 'overwhelmed', { totalInfected: 9, daysUsed: 3, caseCap: 5 });
        expect(a.kind).toBe('lostEarly');
        expect(b.kind).toBe('lostEarly');
        expect(a.line).not.toBe(b.line);
    });

    it('never jokes on a win with deaths', () => {
        for (const line of RESULT_LINES.wonWithDeaths) expect(line).not.toMatch(/tea|annoyed|scenic|humour/i);
    });

    it('copes with a level the campaign does not know', () => {
        const out = mentorResultLine(undefined, 'contained', {});
        expect(RESULT_LINES.flawless).toContain(out.line);
        expect(mentorResultLine('free-play', 'overwhelmed', {}).line).toBeTruthy();
    });
});

describe('mentor wiring', () => {
    it('markup shows her name, the line and a portrait when there is one', () => {
        const out = mentorMarkup('Cut the red lines <first>.', 'data:image/svg+xml,x');
        expect(out).toContain('<img class="mentor-face" src="data:image/svg+xml,x" alt=""');
        expect(out).toContain('<strong class="mentor-name">Dr. Diallo</strong>');
        expect(out).toContain('Cut the red lines &lt;first&gt;.');
        expect(mentorMarkup('Hello there.')).not.toContain('<img');
        expect(mentorMarkup('')).toBe('');
    });

    it('the page has a slot on the briefing and one on the results, styled in story.css', () => {
        const html = read('../index.html');
        expect(html).toContain('<div class="mentor-line" id="briefing-mentor" hidden></div>');
        expect(html).toContain('<div class="mentor-line" id="results-mentor" hidden></div>');
        const css = read('../src/ui/story.css');
        expect(css).toContain('.mentor-line');
        expect(css).toContain('.based-on');
        expect(css).not.toContain('—');
        expect(read('../src/ui/story.js')).toContain("import './story.css';");
    });

    it('game.js asks for the briefing line and the results line', () => {
        const game = read('../src/game.js');
        expect(game).toContain('storyBriefing(level);');
        // Round 57: the days come from the deal's par when there is one (speedParDays).
        expect(game).toMatch(/storyResults\(\{[^}]*parDays: this\.currentLevel \? speedParDays\(stats, this\.currentLevel\) : 0 \}\)/);
    });
});
