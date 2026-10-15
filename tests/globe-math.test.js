import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { latLngToXYZ, slerp, windingPath, chestStop, globeFitDistance, faceRotation, angleDelta } from '../src/ui/globe-math.js';
import { createMemoryBackend, freshSave, writeSave } from '../src/save.js';
import { recordCompletion } from '../src/progress.js';
import { getChestState, openChest, setEconomyStorage, setChestConfig } from '../src/economy.js';

const len = (v) => Math.hypot(v.x, v.y, v.z);

// Apply Euler XYZ rotation (three.js default order) to a point.
function rotateXYZ(p, rx, ry) {
    const x1 = p.x * Math.cos(ry) + p.z * Math.sin(ry);
    const z1 = -p.x * Math.sin(ry) + p.z * Math.cos(ry);
    const y2 = p.y * Math.cos(rx) - z1 * Math.sin(rx);
    const z2 = p.y * Math.sin(rx) + z1 * Math.cos(rx);
    return { x: x1, y: y2, z: z2 };
}

describe('candy planet math', () => {
    it('the road stays on the surface and passes through every level', () => {
        const stops = [latLngToXYZ(18, -90), latLngToXYZ(34, -52), latLngToXYZ(12, -20)];
        const path = windingPath(stops, { perLeg: 10, radius: 1.01 });
        expect(path.length).toBe(21);
        for (const p of path) expect(len(p)).toBeCloseTo(1.01, 6);
        expect(path[0].x).toBeCloseTo(stops[0].x * 1.01, 6);
        expect(path[10].y).toBeCloseTo(stops[1].y * 1.01, 6);
    });

    it('prize boxes sit halfway along the road after their level', () => {
        const a = latLngToXYZ(0, 0);
        const b = latLngToXYZ(0, 60);
        const mid = chestStop([a, b], 0);
        const expected = latLngToXYZ(0, 30);
        expect(mid.x).toBeCloseTo(expected.x, 6);
        expect(mid.z).toBeCloseTo(expected.z, 6);
        expect(len(slerp(a, b, 0.3))).toBeCloseTo(1, 6);
    });

    it('fits the whole planet on a portrait phone', () => {
        const aspect = 390 / 844;
        const d = globeFitDistance({ radius: 1.06, fovDeg: 40, aspect, margin: 1 });
        const halfW = Math.atan(Math.tan((20 * Math.PI) / 180) * aspect);
        // Angular radius of the sphere from the camera fits the narrow side.
        expect(Math.asin(1.06 / d)).toBeLessThanOrEqual(halfW + 1e-9);
        expect(globeFitDistance({ radius: 1, fovDeg: 40, aspect: 2 })).toBeLessThan(d);
    });

    it('spins the planet so the chosen level faces the camera', () => {
        for (const [lat, lng] of [[18, -90], [34, -52], [-6, -176], [24, 78]]) {
            const p = latLngToXYZ(lat, lng);
            const r = faceRotation(p, 1);
            const q = rotateXYZ(p, r.x, r.y);
            expect(q.x).toBeCloseTo(0, 6);
            expect(q.y).toBeCloseTo(0, 6);
            expect(q.z).toBeCloseTo(1, 6);
        }
    });

    it('takes the short way round', () => {
        expect(angleDelta(0, Math.PI * 1.5)).toBeCloseTo(-Math.PI / 2, 6);
        expect(angleDelta(3, -3)).toBeCloseTo(2 * Math.PI - 6, 6);
    });
});

describe('prize boxes open in the built game (bug fix)', () => {
    it('uses the real box list without a runtime import that 404s', async () => {
        const storage = createMemoryBackend();
        setEconomyStorage(storage);
        setChestConfig(null);
        let save = freshSave();
        writeSave(storage, save);
        expect(await getChestState('chest-a')).toBe('locked');
        save = recordCompletion(save, 'r1-care-home', 'contained', {
            initialPopulation: 40,
            totalDead: 0,
            totalInfected: 4,
            totalRecovered: 4,
            totalProtected: 6,
            daysUsed: 6,
        });
        writeSave(storage, save);
        expect(await getChestState('chest-a')).toBe('ready');
        const res = await openChest('chest-a');
        expect(res.ok).toBe(true);
        expect(await getChestState('chest-a')).toBe('opened');
        const src = readFileSync(new URL('../src/economy.js', import.meta.url), 'utf8');
        expect(src).not.toContain('@vite-ignore');
    });
});
