// Names and everyday roles for the people of a level (wide audience pass).
// Every face on the web is somebody: "Aiko the baker", "Moussa the fisher".
// Pure data and pure functions, no DOM. Names are common given names from
// each look's land (look.civ, see art/source/citizens.mjs), no surnames.
//
// People beyond the tenth reuse a look (src/ui/people.js), so names are
// handed out per person, not per look: two people with the same face get
// different names while the land's list lasts.

// f and m are only used so a bearded look gets a name that suits it.
export const NAMES = Object.freeze({
    japan: {
        f: ['Aiko', 'Yuki', 'Hana', 'Sakura', 'Emi', 'Naoko', 'Keiko', 'Mio'],
        m: ['Haruto', 'Kenji', 'Daichi', 'Sota', 'Ren', 'Takumi', 'Hiroshi', 'Isamu'],
    },
    sahel: {
        f: ['Aminata', 'Fatou', 'Mariam', 'Aissata', 'Kadiatou', 'Hawa', 'Oumou', 'Binta'],
        m: ['Amadou', 'Moussa', 'Ibrahim', 'Ousmane', 'Sekou', 'Modibo', 'Boubacar', 'Idrissa'],
    },
    andes: {
        f: ['Killa', 'Sumaq', 'Nayra', 'Rosa', 'Tika', 'Illari', 'Urpi', 'Wayra'],
        m: ['Amaru', 'Inti', 'Tupaq', 'Wari', 'Kusi', 'Rumi', 'Sayri', 'Mateo'],
    },
    mughal: {
        f: ['Noor', 'Zara', 'Meera', 'Farah', 'Anjali', 'Roshni', 'Parveen', 'Lakshmi'],
        m: ['Arjun', 'Imran', 'Kabir', 'Salim', 'Rahul', 'Akbar', 'Dev', 'Farid'],
    },
    nordic: {
        f: ['Astrid', 'Ingrid', 'Freya', 'Sigrid', 'Liv', 'Solveig', 'Maja', 'Elsa'],
        m: ['Erik', 'Lars', 'Bjorn', 'Leif', 'Magnus', 'Sven', 'Nils', 'Anders'],
    },
    maya: {
        f: ['Ixchel', 'Itzel', 'Nicte', 'Yatzil', 'Sacnite', 'Zazil', 'Akna', 'Ixkik'],
        m: ['Balam', 'Kinich', 'Canek', 'Pakal', 'Tecun', 'Hunac', 'Yaxkin', 'Nachi'],
    },
    persia: {
        f: ['Shirin', 'Laleh', 'Parisa', 'Roya', 'Mina', 'Nasrin', 'Yasmin', 'Golnar'],
        m: ['Darius', 'Kaveh', 'Arash', 'Bahram', 'Omid', 'Reza', 'Jamshid', 'Farhad'],
    },
});

// One word, everyday, fits any of the lands.
export const ROLES = Object.freeze([
    'baker', 'nurse', 'teacher', 'weaver', 'fisher', 'farmer', 'potter', 'tailor', 'cook', 'gardener', 'singer', 'carpenter',
    'courier', 'painter', 'smith', 'miller', 'scribe', 'pilot', 'mechanic', 'librarian', 'drummer', 'shepherd', 'mason', 'clerk',
]);
// For grey-haired looks (look.elder).
export const ELDER_ROLES = Object.freeze(['elder', 'storyteller', 'grandparent', 'herbalist', 'beekeeper', 'mender', 'tutor', 'clockmaker', 'healer', 'gardener']);

const landOf = (look) => (look && NAMES[look.civ] ? look.civ : 'japan');

// Women's and men's names taken in turn, so a crowd gets both.
function mixed(land) {
    const { f, m } = NAMES[land];
    const out = [];
    for (let i = 0; i < Math.max(f.length, m.length); i++) {
        if (f[i]) out.push(f[i]);
        if (m[i]) out.push(m[i]);
    }
    return out;
}

// The names a look may carry.
export function namesForLook(look) {
    const land = landOf(look);
    return look && look.beard ? [...NAMES[land].m] : mixed(land);
}

export function rolesForLook(look) {
    return look && look.elder ? [...ELDER_ROLES] : [...ROLES];
}

export function personLabel(person) {
    return person ? `${person.name} the ${person.role}` : '';
}

// Hands out names and roles one person at a time. `seed` moves where in each
// list a level starts, so the same land gives a different crowd on a replay.
// next(look) takes the first name (and role) from there that nobody in this
// level has yet, and only repeats once a list has run out.
export function createIdentityAssigner(seed = 0) {
    const s = Math.abs(Math.floor(Number(seed) || 0));
    const usedNames = new Map(); // land -> Set
    const usedRoles = new Set();
    const usedLabels = new Set();
    let count = 0;
    const take = (list, start, used) => {
        for (let k = 0; k < list.length; k++) {
            const item = list[(start + k) % list.length];
            if (!used.has(item)) return item;
        }
        // Everything is taken: walk the list so repeats spread evenly.
        return list[(start + used.size + count) % list.length];
    };
    return {
        next(look) {
            const land = landOf(look);
            if (!usedNames.has(land)) usedNames.set(land, new Set());
            const names = namesForLook(look);
            const name = take(names, s % names.length, usedNames.get(land));
            usedNames.get(land).add(name);
            const roles = rolesForLook(look);
            let role = take(roles, (s >> 3) % roles.length, usedRoles);
            // On a big web a name and a role can both come round again:
            // step through the roles so no two people share both.
            for (let k = 0; k < roles.length && usedLabels.has(`${name} the ${role}`); k++) role = roles[(roles.indexOf(role) + 1) % roles.length];
            usedRoles.add(role);
            usedLabels.add(`${name} the ${role}`);
            count++;
            return { name, role, label: `${name} the ${role}` };
        },
    };
}

// looks[i] is the look of person i. Returns [{ name, role, label }], the
// same length, deterministic for the same looks and seed.
export function assignIdentities(looks, seed = 0) {
    const assigner = createIdentityAssigner(seed);
    return looks.map((look) => assigner.next(look));
}

// "Aiko the baker", "Aiko the baker and Kofi the fisher",
// "Aiko the baker, Kofi the fisher and 2 others".
export function listPeople(labels, max = 2) {
    const all = (labels || []).filter(Boolean);
    if (all.length === 0) return '';
    if (all.length === 1) return all[0];
    if (all.length <= max) return `${all.slice(0, -1).join(', ')} and ${all[all.length - 1]}`;
    const rest = all.length - max;
    return `${all.slice(0, max).join(', ')} and ${rest} ${rest === 1 ? 'other' : 'others'}`;
}
