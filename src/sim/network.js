// Network generators. Pure data: no DOM, no D3, no audio.
// Node objects carry a `state` string: healthy | infected | recovered | vaccinated | quarantined | dead.
// Links use numeric { source, target } node ids; D3's forceLink later swaps these for node refs.

export function generateScaleFreeNetwork(n, m) {
    const links = [];
    for (let i = m; i < n; i++) {
        for (let j = 0; j < m; j++) {
            links.push({ source: i, target: Math.floor(Math.random() * i) });
        }
    }
    return { links };
}

export function generateSmallWorldNetwork(n, k, p) {
    const links = [];
    for (let i = 0; i < n; i++) {
        for (let j = 1; j <= k / 2; j++) {
            let target = (i + j) % n;
            if (Math.random() < p) target = Math.floor(Math.random() * n);
            links.push({ source: i, target });
        }
    }
    return { links };
}

export function generateRandomNetwork(n, p) {
    const links = [];
    for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
            if (Math.random() < p) links.push({ source: i, target: j });
        }
    }
    return { links };
}

// Dispatcher matching the scenario networkType values from src/config/scenarios.js.
// Parameters preserved from the original inline call sites (m=4, k=8, p=0.15, p=0.08).
export function generateNetwork(networkType, n) {
    switch (networkType) {
        case 'scale-free': return generateScaleFreeNetwork(n, 4);
        case 'small-world': return generateSmallWorldNetwork(n, 8, 0.15);
        default: return generateRandomNetwork(n, 0.08);
    }
}
