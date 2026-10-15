import { describe, it, expect } from 'vitest';
import { levelLabelHtml, clampLabelX, starRow } from '../src/ui/globe-labels.js';

describe('globe level labels', () => {
    it('locked levels show a padlock icon, never the word lock', () => {
        const html = levelLabelHtml(1, { unlocked: false, completed: false, stars: 0 });
        expect(html).toContain('>2<');
        expect(html).toContain('<svg');
        expect(html).toContain('aria-label="Locked"');
        expect(html.replace(/<[^>]*>/g, '')).toBe('2');
    });

    it('open levels show only the number', () => {
        expect(levelLabelHtml(0, { unlocked: true, completed: false, stars: 0 }).replace(/<[^>]*>/g, '')).toBe('1');
    });

    it('completed levels show their stars', () => {
        const html = levelLabelHtml(2, { unlocked: true, completed: true, stars: 2 });
        expect(html).toContain('★★☆');
    });

    it('starRow clamps bad input', () => {
        expect(starRow(5)).toBe('★★★');
        expect(starRow(-1)).toBe('☆☆☆');
        expect(starRow(undefined)).toBe('☆☆☆');
    });
});

describe('clampLabelX', () => {
    it('leaves centred labels alone', () => {
        expect(clampLabelX(195, 80, 390)).toBe(195);
    });
    it('pulls labels at the left edge back on screen', () => {
        expect(clampLabelX(-20, 100, 390)).toBe(56);
    });
    it('pulls labels at the right edge back on screen', () => {
        expect(clampLabelX(400, 100, 390)).toBe(334);
    });
    it('centres a label wider than the screen', () => {
        expect(clampLabelX(10, 500, 390)).toBe(195);
    });
});
