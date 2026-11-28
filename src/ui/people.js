// Round 53: every level is a crowd of different people. The cast (skin
// tones, ages, hair, beards, glasses, the land's headwear and a few visitors
// from other lands) comes from art/source/citizens.mjs and is drawn in the
// browser as small SVG images, so variety costs no extra downloads. A
// person's look follows their id, so they keep their face all level.
import { castForLand, citizenSvg, seededRandom } from '../../art/source/citizens.mjs';
import { createIdentityAssigner } from '../config/people-names.js';

// Distinct looks per level. Ten keeps the web varied while bounding how many
// face images the phone has to hold (10 looks x 21 frames at most).
export const CAST_SIZE = 10;
export const FACE_PX = 192;

let cast = castForLand('japan', CAST_SIZE, seededRandom(1));
// Person id → index into the cast, shuffled per level so neighbours differ.
let order = cast.map((_, i) => i);
// Names and roles (src/config/people-names.js), handed out per person as
// they are first asked for, in id order, so two people who share a face
// still get different names.
let assigner = createIdentityAssigner(1);
let people = [];

// New cast for a level start. `seed` varies it between plays.
export function castLevel(civ, seed = Math.floor(Math.random() * 1e9)) {
    const rng = seededRandom(seed);
    cast = castForLand(civ, CAST_SIZE, rng);
    order = cast.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
    }
    assigner = createIdentityAssigner(Math.floor(rng() * 1e9));
    people = [];
    return cast;
}

export function currentCast() {
    return cast;
}

// The look for person `id` (or a card's index): every look is used before
// any repeats.
export function lookFor(id = 0) {
    const n = Math.abs(Math.floor(Number(id) || 0));
    return cast[order[n % order.length]];
}

// Who person `id` is this level: { name, role, label } ("Aiko the baker").
export function personFor(id = 0) {
    const n = Math.abs(Math.floor(Number(id) || 0));
    while (people.length <= n) people.push(assigner.next(lookFor(people.length)));
    return people[n];
}

const urls = new Map();
// Data URL of one face frame for a look, cached.
export function lookFaceUrl(look, state, frame) {
    const key = `${look.key}|${state}|${frame}`;
    let url = urls.get(key);
    if (!url) {
        url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(citizenSvg(state, frame, { look, background: null, size: FACE_PX }));
        urls.set(key, url);
    }
    return url;
}
