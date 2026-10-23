// Puzzle level variants (round 14). Pure: no DOM, rng injectable.
//
// A level may carry `variant` (src/config/campaign.js):
//   superSpreader { degreeShare or degree, toolDays, boss }  one carrier with many contacts
//                                            starts sick (node.superSpreader)
//   envoy { minDistance }                     one marked person far from the
//                                            first cases (node.envoy); if the
//                                            Envoy falls ill the round is lost
//   noVaccines / noQuarantine                 handled by the level's daily
//                                            limits (a limit of 0 = none here)
// These functions mutate the nodes and links arrays they are given.

const nodeId = (ref) => (ref && typeof ref === 'object' ? ref.id : ref);

export function adjacency(nodes, links) {
    const adj = new Map(nodes.map((n) => [n.id, new Set()]));
    for (const l of links) {
        const a = nodeId(l.source);
        const b = nodeId(l.target);
        if (a === b || !adj.has(a) || !adj.has(b)) continue;
        adj.get(a).add(b);
        adj.get(b).add(a);
    }
    return adj;
}

// Contacts the carrier should have: `degreeShare` of the rest of the web
// (item 14: about half), or a fixed `degree`.
export function carrierDegree(population, { degree, degreeShare } = {}) {
    if (degreeShare != null) return Math.max(2, Math.round(degreeShare * population));
    return degree ?? 10;
}

// Pick the best connected person, give them extra contacts until they have
// enough of them (carrierDegree), and make them sick. Returns the carrier node.
export function placeSuperSpreader(nodes, links, opts = {}, rng = Math.random) {
    const degree = carrierDegree(nodes.length, opts);
    const adj = adjacency(nodes, links);
    let carrier = nodes[0];
    for (const n of nodes) if (adj.get(n.id).size > adj.get(carrier.id).size) carrier = n;
    const mine = adj.get(carrier.id);
    const others = nodes.filter((n) => n.id !== carrier.id && !mine.has(n.id));
    const target = Math.min(degree, nodes.length - 1);
    while (mine.size < target && others.length) {
        const k = Math.floor(rng() * others.length);
        const other = others.splice(k, 1)[0];
        links.push({ source: carrier.id, target: other.id });
        mine.add(other.id);
    }
    carrier.state = 'infected';
    carrier.superSpreader = true;
    return carrier;
}

// Shortest hop count from any sick person to every node (Infinity when out
// of reach).
export function distancesFromSick(nodes, links) {
    const adj = adjacency(nodes, links);
    const dist = new Map(nodes.map((n) => [n.id, Infinity]));
    const queue = [];
    for (const n of nodes) {
        if (n.state === 'infected') {
            dist.set(n.id, 0);
            queue.push(n.id);
        }
    }
    for (let i = 0; i < queue.length; i++) {
        const id = queue[i];
        const d = dist.get(id) + 1;
        for (const nb of adj.get(id)) {
            if (dist.get(nb) > d) {
                dist.set(nb, d);
                queue.push(nb);
            }
        }
    }
    return dist;
}

// Mark the Envoy: a healthy, well connected person at least `minDistance`
// hops from every sick person (the farthest one if nobody is that far).
export function placeEnvoy(nodes, links, { minDistance = 3 } = {}, rng = Math.random) {
    const adj = adjacency(nodes, links);
    const dist = distancesFromSick(nodes, links);
    const healthy = nodes.filter((n) => n.state === 'healthy' && adj.get(n.id).size > 0);
    if (!healthy.length) return null;
    let pool = healthy.filter((n) => dist.get(n.id) >= minDistance);
    if (!pool.length) {
        const far = Math.max(...healthy.map((n) => dist.get(n.id)));
        pool = healthy.filter((n) => dist.get(n.id) === far);
    }
    // Well connected, but not the busiest hub: the middle of the top half,
    // so protecting them is a fair puzzle.
    pool.sort((a, b) => adj.get(b.id).size - adj.get(a.id).size || a.id - b.id);
    const top = pool.slice(0, Math.max(1, Math.ceil(pool.length / 2)));
    const envoy = top[Math.floor(rng() * top.length)];
    envoy.envoy = true;
    return envoy;
}

// True when the Envoy is sick, sick in isolation, or has died.
export function envoyLost(network, envoyId) {
    if (envoyId == null) return false;
    const envoy = network.nodes.find((n) => n.id === envoyId);
    if (!envoy || envoy.removed || envoy.state === 'dead') return true;
    return envoy.state === 'infected' || (envoy.state === 'quarantined' && !!envoy.sickWhileQuarantined);
}

// Briefing callout for a variant.
export function variantCallout(variant) {
    if (!variant) return null;
    switch (variant.type) {
        case 'superSpreader':
            return {
                title: variant.boss ? 'Boss: the Blightborne carrier' : 'Puzzle: stop the super-spreader',
                text: 'The person with the red crown has more contacts than anyone. Cut their links on day 1 and isolate them on day 2.',
            };
        case 'envoy':
            return { title: 'Puzzle: protect the Envoy', text: 'The person with the gold star must not fall ill. If they do, the mission fails.' };
        case 'noVaccines':
            return { title: 'Twist: no vaccines', text: 'The vaccine shipment was lost. Cut links and isolate the sick.' };
        case 'noQuarantine':
            return { title: 'Twist: no isolation wards', text: 'Nobody can be isolated here. Vaccinate and cut links.' };
        default:
            return null;
    }
}
