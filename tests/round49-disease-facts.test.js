// Round 49: the disease profile tells the truth.
// - The market district disease is measles (it was Acinetobacter baumannii, a
//   hospital germ with no vaccine, on levels that hand out vaccines).
// - Vaccinate is only offered against a disease with a real vaccine, unless
//   the toolkit says the doses are trial doses.
// - The briefing shows the real disease's R0 beside the game's own R0.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { scenarios } from '../src/config/scenarios.js';
import { LEVELS } from '../src/config/levels.js';
import { toolsOf } from '../src/config/toolkits.js';
import { briefingRealR0, basedOnCard } from '../src/ui/deaths.js';
import { rExplainer } from '../src/ui/game-screen-model.js';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

describe('round 49: real diseases, real vaccines', () => {
    it('the market district plays measles, which has a vaccine', () => {
        expect(scenarios.urban.diseaseName).toBe('Measles');
        expect(scenarios.urban.agent).toBe('Virus');
        expect(scenarios.urban.vaccine).toMatch(/MMR/);
        expect(scenarios.urban.cfrSource).toMatch(/^https:\/\/www\.who\.int\//);
        for (const s of Object.values(scenarios)) expect(s.diseaseName).not.toMatch(/Acinetobacter/);
    });

    it('Norovirus and MERS have no licensed vaccine', () => {
        expect(scenarios.festival.vaccine).toBeUndefined();
        expect(scenarios.global.vaccine).toBeUndefined();
    });

    it('every level that offers Vaccinate has a real vaccine or says the doses are trial doses', () => {
        let checked = 0;
        for (const level of LEVELS) {
            if (!toolsOf(level).includes('vaccinate')) continue;
            const scenario = scenarios[level.scenarioId];
            const ok = Boolean(scenario.vaccine) || /trial/i.test(level.toolkit?.why || '');
            expect(ok, `${level.id} (${scenario.diseaseName})`).toBe(true);
            checked++;
        }
        expect(checked).toBeGreaterThan(20);
    });
});

describe('round 49: real R0 in the briefing and the R card', () => {
    it('each real R0 comes with a note and a source, written without em dashes', () => {
        const withR0 = Object.values(scenarios).filter((s) => s.realR0);
        expect(withR0.map((s) => s.id).sort()).toEqual(['global', 'school', 'urban']);
        for (const s of withR0) {
            expect(s.r0Note.length, s.id).toBeGreaterThan(30);
            expect(s.r0Source, s.id).toMatch(/^https:\/\//);
            expect(s.r0Note + s.cfrNote, s.id).not.toContain('—');
        }
        expect(scenarios.urban.realR0).toBe('12 to 18');
        expect(scenarios.global.realR0).toMatch(/under 1/);
    });

    it('the briefing row shows the real R0 and hides without one', () => {
        expect(briefingRealR0(scenarios.urban)).toBe('12 to 18');
        expect(briefingRealR0(scenarios.care)).toBe('');
        expect(briefingRealR0(null)).toBe('');
    });

    // Wide audience pass: the briefing names an invented strain, so the real
    // R0 left the briefing. It is on the R card and the Based on card.
    it('the briefing labels the game number R0 here; the real R0 is shown after the level', () => {
        expect(html).not.toMatch(/Est\. R₀/);
        expect(html).toMatch(/R₀ here:/);
        expect(html).not.toMatch(/Real R₀:/);
        expect(basedOnCard({ scenario: scenarios.urban }).lines).toContain(scenarios.urban.r0Note);
    });

    it('the R card names the web R0 and then the real one', () => {
        const e = rExplainer({ r: 2.4, r0: '1.5 - 2.0', realR0Note: scenarios.urban.r0Note });
        expect(e.lines.some((l) => l.startsWith('On this web R₀ is 1.5 - 2.0'))).toBe(true);
        expect(e.lines[e.lines.length - 1]).toBe(scenarios.urban.r0Note);
        expect(rExplainer({ r: 2.4, r0: '1.5 - 2.0' }).lines.some((l) => /measles/i.test(l))).toBe(false);
    });

    it('the results note for measles reads true', () => {
        const card = basedOnCard({ scenario: scenarios.urban, fatalityRate: 0.1 });
        expect(card.title).toBe('Based on: measles');
        expect(card.lines.join(' ')).toMatch(/For real: WHO estimates measles/);
    });
});
