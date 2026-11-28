// Wide audience pass, story and identity: every person on the web has a
// given name from their land and a one word everyday role.
import { describe, it, expect } from 'vitest';
import { NAMES, ROLES, ELDER_ROLES, namesForLook, rolesForLook, createIdentityAssigner, assignIdentities, listPeople, personLabel } from '../src/config/people-names.js';
import { castLevel, lookFor, personFor, CAST_SIZE } from '../src/ui/people.js';
import { LAND_PEOPLE, castForLand, seededRandom } from '../art/source/citizens.mjs';

describe('names and roles data', () => {
    it('every land the art can draw has names: several, given names only, no repeats', () => {
        expect(Object.keys(NAMES).sort()).toEqual(Object.keys(LAND_PEOPLE).sort());
        const all = [];
        for (const [land, { f, m }] of Object.entries(NAMES)) {
            expect(f.length, land).toBeGreaterThanOrEqual(8);
            expect(m.length, land).toBeGreaterThanOrEqual(8);
            for (const name of [...f, ...m]) {
                expect(name, land).toMatch(/^[A-Z][a-z]+$/); // one word, no surname
                all.push(name);
            }
        }
        expect(new Set(all).size).toBe(all.length);
    });

    it('roles are one everyday word, with their own list for elders', () => {
        for (const role of [...ROLES, ...ELDER_ROLES]) expect(role).toMatch(/^[a-z]+$/);
        expect(new Set(ROLES).size).toBe(ROLES.length);
        expect(ROLES.length).toBeGreaterThanOrEqual(20);
        expect(ELDER_ROLES).toContain('elder');
        for (const young of ['student', 'pilot', 'courier', 'mechanic']) expect(ELDER_ROLES).not.toContain(young);
    });
});

describe('who a look can be', () => {
    it('a look is named from its own land, visitors included', () => {
        for (const land of Object.keys(NAMES)) {
            const names = namesForLook({ civ: land });
            expect(names).toHaveLength(NAMES[land].f.length + NAMES[land].m.length);
            expect(names).toContain(NAMES[land].f[0]);
            expect(names).toContain(NAMES[land].m[0]);
        }
        expect(namesForLook({ civ: 'atlantis' })).toContain('Aiko');
        expect(namesForLook(null)).toContain('Aiko');
    });

    it('a bearded look gets one of the land\'s men\'s names', () => {
        expect(namesForLook({ civ: 'nordic', beard: true })).toEqual(NAMES.nordic.m);
    });

    it('elders get age-appropriate roles', () => {
        expect(rolesForLook({ elder: true })).toEqual([...ELDER_ROLES]);
        expect(rolesForLook({ elder: false })).toEqual([...ROLES]);
    });
});

describe('handing out identities', () => {
    const looksFor = (civ, seed, people) => {
        const cast = castForLand(civ, 10, seededRandom(seed));
        return Array.from({ length: people }, (_, i) => cast[i % cast.length]);
    };

    it('is pure: the same looks and seed give the same people', () => {
        const looks = looksFor('sahel', 7, 24);
        expect(assignIdentities(looks, 42)).toEqual(assignIdentities(looks, 42));
        expect(assignIdentities(looks, 42)).not.toEqual(assignIdentities(looks, 43));
    });

    it('labels read "Name the role"', () => {
        const [p] = assignIdentities([{ civ: 'japan' }], 0);
        expect(p.label).toBe(`${p.name} the ${p.role}`);
        expect(personLabel(p)).toBe(p.label);
        expect(personLabel(null)).toBe('');
        expect(p.label).toBe('Aiko the baker');
    });

    it('names fit the land and roles fit the age, for every land and many seeds', () => {
        for (const land of Object.keys(NAMES)) {
            for (let seed = 1; seed <= 12; seed++) {
                const looks = looksFor(land, seed, 32);
                assignIdentities(looks, seed * 977).forEach((p, i) => {
                    const look = looks[i];
                    expect(namesForLook(look), `${land} ${seed} ${i}`).toContain(p.name);
                    expect(look.elder ? ELDER_ROLES : ROLES).toContain(p.role);
                });
            }
        }
    });

    it('two people who share a face get different names', () => {
        for (const land of Object.keys(NAMES)) {
            for (let seed = 1; seed <= 12; seed++) {
                // 20 people on ten looks: everyone has exactly one twin.
                const looks = looksFor(land, seed, 20);
                const people = assignIdentities(looks, seed);
                for (let i = 0; i < 10; i++) expect(people[i].name, `${land} ${seed} look ${i}`).not.toBe(people[i + 10].name);
            }
        }
    });

    it('a web of 16 has no repeated name, and the biggest web no repeated label where the lists allow', () => {
        for (const land of Object.keys(NAMES)) {
            for (let seed = 1; seed <= 12; seed++) {
                const small = assignIdentities(looksFor(land, seed, 16), seed).map((p) => p.name);
                expect(new Set(small).size, `${land} ${seed}`).toBe(16);
                const big = assignIdentities(looksFor(land, seed, 32), seed);
                const labels = big.map((p) => p.label);
                expect(new Set(labels).size, `${land} ${seed} labels`).toBe(32);
            }
        }
    });

    it('an assigner repeats only when a list has run out', () => {
        const a = createIdentityAssigner(3);
        const names = Array.from({ length: 9 }, () => a.next({ civ: 'maya', beard: true }).name);
        expect(new Set(names.slice(0, 8)).size).toBe(8);
        expect(NAMES.maya.m).toContain(names[8]);
    });
});

describe('people of the level (src/ui/people.js)', () => {
    it('personFor follows the cast: stable all level, new on a new cast', () => {
        castLevel('andes', 1234);
        const first = Array.from({ length: 24 }, (_, id) => personFor(id));
        // Asking again, in any order, gives the same people.
        expect(personFor(17)).toBe(first[17]);
        expect(personFor(0)).toBe(first[0]);
        first.forEach((p, id) => expect(namesForLook(lookFor(id)), `id ${id}`).toContain(p.name));
        // The same seed replays the same crowd; another seed is a new one.
        castLevel('andes', 1234);
        expect(Array.from({ length: 24 }, (_, id) => personFor(id).label)).toEqual(first.map((p) => p.label));
        castLevel('andes', 99);
        expect(Array.from({ length: 24 }, (_, id) => personFor(id).label)).not.toEqual(first.map((p) => p.label));
    });

    it('faces that repeat past the tenth person carry different names', () => {
        castLevel('persia', 5);
        for (let id = 0; id < CAST_SIZE; id++) {
            expect(lookFor(id)).toBe(lookFor(id + CAST_SIZE));
            expect(personFor(id).name).not.toBe(personFor(id + CAST_SIZE).name);
        }
    });
});

describe('listing people', () => {
    it('joins names in plain words', () => {
        expect(listPeople([])).toBe('');
        expect(listPeople(['A'])).toBe('A');
        expect(listPeople(['A', 'B'])).toBe('A and B');
        expect(listPeople(['A', 'B', 'C'])).toBe('A, B and 1 other');
        expect(listPeople(['A', 'B', 'C'], 3)).toBe('A, B and C');
        expect(listPeople(['A', 'B', 'C', 'D', 'E'], 3)).toBe('A, B, C and 2 others');
    });
});
