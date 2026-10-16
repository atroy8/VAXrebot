// Care box (right side of the game screen): people who have left the
// network because they are in treatment, isolated, or cured. Pure, tested
// in tests/care-box.test.js. The sim is unchanged; this is how we show it.
//
//   treatment: sick and isolated (quarantined while infected)
//   isolated:  quarantined while healthy, a precaution
//   cured:     recovered, now immune

export const BINS = [
    { id: 'treatment', label: 'Treating', sprite: 'infected', face: 'infected', tip: 'Sick people in isolation. They cannot spread it while they recover.' },
    { id: 'isolated', label: 'Isolated', sprite: 'quarantined', face: 'quarantined', tip: 'Healthy people kept apart as a precaution.' },
    { id: 'cured', label: 'Cured', sprite: 'recovered', face: 'recovered', tip: 'Recovered and immune. They cannot catch it again.' },
];

export function binFor(node) {
    if (!node || node.removed) return null;
    if (node.state === 'quarantined') return node.sickWhileQuarantined ? 'treatment' : 'isolated';
    if (node.state === 'recovered') return 'cured';
    return null;
}

export function isBoxed(node) {
    return binFor(node) !== null;
}

export function careCounts(nodes) {
    const counts = { treatment: 0, isolated: 0, cured: 0 };
    for (const n of nodes) {
        const b = binFor(n);
        if (b) counts[b]++;
    }
    return counts;
}
