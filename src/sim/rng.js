// The seeded dice every deal is rolled with (round 57). Pure.
// mulberry32: a small, fast generator with a 32 bit seed. The same seed
// always gives the same stream, on every device.
export function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// A 32 bit seed from a string (FNV-1a), for "level id + deal number".
export function hashSeed(text) {
    let h = 0x811c9dc5;
    for (const ch of String(text)) {
        h ^= ch.charCodeAt(0);
        h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
}

// A fresh seed for a new deal. The only place a deal touches Math.random.
export function randomSeed(random = Math.random) {
    return Math.floor(random() * 4294967296) >>> 0;
}
