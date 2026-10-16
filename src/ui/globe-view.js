// Candy solar system home screen (3D): three glossy candy planets circle a
// candy sun, one per region. Tap a planet to fly in and see its three
// levels on a candy-cane road, with bouncy level buttons and wobbling prize
// boxes. Procedurally generated textures, fully offline. Mounted by screens.js onto #welcome-screen, replacing the video
// intro. Reads progression state (read-only) from src/progress.js and
// src/save.js; opens crates through src/economy.js when it exists.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { LEVELS, REGIONS, regionById } from '../config/levels.js';
import { CHESTS } from '../config/chests.js';
import { isLevelUnlocked, lockReason, levelRecord, totalStars } from '../progress.js';
import { loadSave, createStorage } from '../save.js';
import { showNotification } from './panels.js';
import './globe-candy.css';
import { starRow, levelLabelHtml, clampLabelX, LOCK_ICON as LOCK_SVG } from './globe-labels.js';
import { latLngToXYZ, windingPath, chestStop, globeFitDistance, faceRotation, angleDelta, slerp } from './globe-math.js';
import { PLANETS, PLANET_RADIUS, PLANET_LEVEL_POSITIONS, SUN_RADIUS } from '../config/solar-system.js';
import { orbitAngle, orbitPosition, systemCamera, planetStatus } from './solar-math.js';

// Level buttons: the planet's color while open, gold once beaten.
const LOCKED_COLOR = 0xb9b3cc;
const COMPLETED_COLOR = 0xffc93c;

const POWERUP_NAMES = {
    eureka: 'Eureka cure',
    blitz: 'Vax Blitz',
    pay: 'Stay Home order',
};

const GLOBE_RADIUS = 1;

// Seeded RNG so the generated texture is stable between sessions.
function mulberry32(seed) {
    let a = seed;
    return () => {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// Candy planet texture: bright lagoon ocean with wave stripes, pastel
// continents with white frosting edges and sprinkles, candy-cane poles.
// Drawn locally on a canvas, no downloads.
const CANDY = ['#7ae582', '#ff9ad5', '#ffe66d', '#c3a6ff', '#ffb38a', '#8be9fd'];
const SPRINKLES = ['#ff4d6d', '#ffd60a', '#4cc9f0', '#80ed99', '#b388ff', '#ffffff'];

function makeWorldTexture({ seed = 20261015, ocean = ['#4fd1ff', '#2bb3f3'], land = CANDY } = {}) {
    const w = 1024;
    const h = 512;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');

    const sea = ctx.createLinearGradient(0, 0, 0, h);
    sea.addColorStop(0, ocean[0]);
    sea.addColorStop(0.5, ocean[1]);
    sea.addColorStop(1, ocean[0]);
    ctx.fillStyle = sea;
    ctx.fillRect(0, 0, w, h);
    // Soft wave stripes on the water.
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 3;
    for (let y = 40; y < h - 40; y += 22) {
        ctx.beginPath();
        for (let x = 0; x <= w; x += 8) {
            const yy = y + Math.sin((x + y * 3) / 38) * 4;
            if (x === 0) ctx.moveTo(x, yy);
            else ctx.lineTo(x, yy);
        }
        ctx.stroke();
    }

    const rand = mulberry32(seed);
    const blobs = [];
    for (let c = 0; c < 9; c++) {
        const cx = rand() * w;
        const cy = h * 0.2 + rand() * h * 0.6;
        const base = 34 + rand() * 52;
        const color = land[c % land.length];
        const parts = [];
        for (let b = 0; b < 18; b++) {
            const ang = rand() * Math.PI * 2;
            const dist = rand() * base * 1.4;
            parts.push({ x: cx + Math.cos(ang) * dist, y: cy + Math.sin(ang) * dist * 0.7, r: base * (0.4 + rand() * 0.5) });
        }
        blobs.push({ color, parts });
    }
    // Frosting outline first, then the candy fill, then a glossy highlight.
    for (const { parts } of blobs) {
        ctx.fillStyle = '#ffffff';
        for (const p of parts) {
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r + 6, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    for (const { color, parts } of blobs) {
        ctx.fillStyle = color;
        for (const p of parts) {
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.fillStyle = 'rgba(255,255,255,0.28)';
        for (const p of parts.slice(0, 6)) {
            ctx.beginPath();
            ctx.ellipse(p.x - p.r * 0.25, p.y - p.r * 0.3, p.r * 0.45, p.r * 0.22, -0.4, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    // Sprinkles on the land.
    for (const { parts } of blobs) {
        for (let k = 0; k < 26; k++) {
            const p = parts[Math.floor(rand() * parts.length)];
            const a = rand() * Math.PI * 2;
            const d = rand() * p.r * 0.8;
            ctx.save();
            ctx.translate(p.x + Math.cos(a) * d, p.y + Math.sin(a) * d);
            ctx.rotate(rand() * Math.PI);
            ctx.fillStyle = SPRINKLES[Math.floor(rand() * SPRINKLES.length)];
            roundRect(ctx, -5, -1.6, 10, 3.2, 1.6);
            ctx.fill();
            ctx.restore();
        }
    }
    // Candy-cane poles.
    for (const [y0, y1] of [[0, 34], [h - 40, h]]) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, y0, w, y1 - y0);
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, y0, w, y1 - y0);
        ctx.clip();
        ctx.fillStyle = '#ff6b9a';
        for (let x = -60; x < w + 60; x += 28) {
            ctx.beginPath();
            ctx.moveTo(x, y1);
            ctx.lineTo(x + 14, y1);
            ctx.lineTo(x + 14 + 40, y0);
            ctx.lineTo(x + 40, y0);
            ctx.fill();
        }
        ctx.restore();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
}

function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

// Candy-cane stripe texture for the path between levels.
function makeStripeTexture(a, b) {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 16;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = a;
    ctx.fillRect(0, 0, 64, 16);
    ctx.fillStyle = b;
    for (let x = -16; x < 80; x += 16) {
        ctx.beginPath();
        ctx.moveTo(x, 16);
        ctx.lineTo(x + 8, 16);
        ctx.lineTo(x + 16, 0);
        ctx.lineTo(x + 8, 0);
        ctx.fill();
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    return tex;
}

function makeGlowSprite(color) {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, color);
    g.addColorStop(0.4, color + 'aa');
    g.addColorStop(1, color + '00');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
    return new THREE.Sprite(mat);
}

function atmosphereMaterial(color = 0xffc6ec) {
    return new THREE.ShaderMaterial({
        uniforms: {
            glowColor: { value: new THREE.Color(color) },
            intensity: { value: 1.1 },
        },
        vertexShader: `
            varying vec3 vNormal;
            void main() {
                vNormal = normalize(normalMatrix * normal);
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }`,
        fragmentShader: `
            uniform vec3 glowColor;
            uniform float intensity;
            varying vec3 vNormal;
            void main() {
                float rim = pow(1.0 - abs(vNormal.z), 2.4);
                gl_FragColor = vec4(glowColor, rim * intensity);
            }`,
        side: THREE.BackSide,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
    });
}



function givesText(gives) {
    return Object.entries(gives)
        .map(([id, n]) => `${POWERUP_NAMES[id] || id} x${n}`)
        .join(', ');
}

// economy.js is built in parallel by another worker and may not exist yet.
// Everything below degrades gracefully: crates render locked/unopened state
// and a friendly message appears instead of crashing.
let economyModule = undefined; // undefined = not tried yet
async function getEconomy() {
    if (economyModule !== undefined) return economyModule;
    try {
        economyModule = await import('../economy.js');
    } catch {
        economyModule = null;
    }
    return economyModule;
}

// Chest open state: the economy module owns persistence (save schema v2
// carries openedChests / powerups, owned by the economy worker). Defensive
// reads accept the economy worker's 'locked' | 'ready' | 'opened' strings
// as well as boolean / { opened } shapes from other contract versions.
function readChestOpenedFallback(save, chestId) {
    if (save.openedChests && Array.isArray(save.openedChests)) {
        return save.openedChests.includes(chestId);
    }
    return !!(save.chests && save.chests[chestId] && save.chests[chestId].opened);
}

// Normalizes any economy contract variant to 'locked' | 'openable' | 'opened'.
function normalizeChestState(raw, fallbackOpened) {
    if (raw === 'opened' || raw === true) return 'opened';
    if (raw === 'ready' || raw === 'openable' || raw === 'unopened' || raw === false) return 'openable';
    if (raw === 'locked') return 'locked';
    if (raw && typeof raw === 'object') {
        if (raw.opened) return 'opened';
        if (raw.ready) return 'openable';
    }
    return fallbackOpened ? 'opened' : 'openable';
}

export function initGlobeView(mountEl, { onPlayLevel } = {}) {
    if (!mountEl || mountEl.dataset.globeMounted) return { refresh: () => {} };
    mountEl.dataset.globeMounted = '1';

    const state = {
        save: loadSave(createStorage()),
        levelMarkers: [],
        chestMarkers: [],
        nextIndex: 0,
        // 'system': the whole solar system. 'planet': flown in to one planet.
        mode: 'system',
        planet: 0,
    };
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    // ---- DOM shell -------------------------------------------------------
    mountEl.innerHTML = `
        <div class="globe-home candy">
            <div class="globe-loading" id="globe-loading">Loading the world...</div>
            <canvas class="globe-canvas" id="globe-canvas"></canvas>
            <div class="globe-labels" id="globe-labels"></div>
            <div class="globe-hud">
                <div class="globe-title">VAXrebot</div>
                <div class="globe-planet-title" id="globe-planet-title" hidden></div>
                <div class="globe-stats">
                    <span class="globe-stat stat-stars" id="globe-hud-stars">0 stars</span>
                    <span class="globe-stat stat-funding" id="globe-hud-funding">0 funding</span>
                    <span class="globe-stat stat-lives" id="globe-hud-lives">0 lives saved</span>
                </div>
            </div>
            <button type="button" class="globe-back" id="globe-back" hidden aria-label="Back to the solar system">
                <span aria-hidden="true">&#8249;</span> Planets
            </button>
            <button type="button" class="globe-play" id="globe-play">Play</button>
            <div class="globe-sheet" id="globe-sheet" hidden>
                <button class="globe-sheet-close" id="globe-sheet-close" aria-label="Close">&times;</button>
                <h2 id="globe-sheet-title"></h2>
                <p class="globe-sheet-sub" id="globe-sheet-sub"></p>
                <p class="globe-sheet-desc" id="globe-sheet-desc"></p>
                <button class="globe-sheet-btn" id="globe-sheet-action" hidden></button>
            </div>
        </div>`;

    const canvas = mountEl.querySelector('#globe-canvas');
    const labelLayer = mountEl.querySelector('#globe-labels');
    const sheet = mountEl.querySelector('#globe-sheet');
    const playBtn = mountEl.querySelector('#globe-play');
    const backBtn = mountEl.querySelector('#globe-back');
    const planetTitle = mountEl.querySelector('#globe-planet-title');

    // ---- Renderer / scene ------------------------------------------------
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);
    let fitDistance = 3.2; // camera distance that frames one planet
    let systemCam = { distance: 20, position: { x: 0, y: 14, z: 14 }, target: { x: 0, y: 0, z: 0 } };
    camera.position.set(0, 14, 14);

    scene.add(new THREE.HemisphereLight(0xfff1fb, 0x7a5cff, 1.25));
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.9);
    keyLight.position.set(3, 4, 5);
    scene.add(keyLight);
    const rim = new THREE.DirectionalLight(0xffb3e6, 1.2);
    rim.position.set(-4, -2, -3);
    scene.add(rim);

    // Twinkling sugar sparkles in the sky, all around.
    const sparkles = [];
    {
        const rand = mulberry32(7);
        const colors = [0xffffff, 0xfff3a8, 0xffc6ec, 0xb9f6ff];
        for (let layer = 0; layer < 2; layer++) {
            const pts = [];
            for (let i = 0; i < 260; i++) {
                const v = new THREE.Vector3(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1).normalize().multiplyScalar(40 + rand() * 30);
                pts.push(v.x, v.y, v.z);
            }
            const g = new THREE.BufferGeometry();
            g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
            const m = new THREE.PointsMaterial({ color: colors[layer * 2], size: 0.35, transparent: true, opacity: 0.8, depthWrite: false });
            const p = new THREE.Points(g, m);
            scene.add(p);
            sparkles.push(p);
        }
    }

    // ---- Sun and orbits -------------------------------------------------
    const sunGroup = new THREE.Group();
    scene.add(sunGroup);
    const sunMesh = new THREE.Mesh(
        new THREE.SphereGeometry(SUN_RADIUS, 48, 32),
        new THREE.MeshBasicMaterial({ map: makeStripeTexture('#ffe66d', '#ffb347') })
    );
    sunMesh.material.map.repeat.set(6, 3);
    sunGroup.add(sunMesh);
    const sunGlow = makeGlowSprite('#fff3a8');
    sunGlow.scale.set(SUN_RADIUS * 5, SUN_RADIUS * 5, 1);
    sunGroup.add(sunGlow);

    const orbitStripe = makeStripeTexture('#ffffff', '#ffc6ec');
    const orbitMeshes = PLANETS.map((p) => {
        const pts = [];
        for (let i = 0; i <= 96; i++) {
            const th = (i / 96) * Math.PI * 2;
            pts.push(new THREE.Vector3(p.orbit.a * Math.cos(th), 0, p.orbit.b * Math.sin(th)));
        }
        const curve = new THREE.CatmullRomCurve3(pts, true);
        const tex = orbitStripe.clone();
        tex.needsUpdate = true;
        tex.repeat.set(Math.round(curve.getLength() * 6), 1);
        const mesh = new THREE.Mesh(
            new THREE.TubeGeometry(curve, 160, 0.025, 8, true),
            new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.55, depthWrite: false })
        );
        scene.add(mesh);
        return mesh;
    });

    // ---- Planets -----------------------------------------------------------
    // Each planet: an orbit group (position on the orbit) holding a scaled
    // group (the planet at radius 1, scaled to PLANET_RADIUS) whose `world`
    // child spins to face a level, plus its glow and its system-view hit area.
    const pickables = [];
    const tmpV = new THREE.Vector3();
    const tmpC = new THREE.Vector3();
    const v3 = (p) => new THREE.Vector3(p.x, p.y, p.z);
    const PER_LEG = 28;
    const brightStripe = makeStripeTexture('#ffffff', '#ff4f8b');
    const paleStripe = makeStripeTexture('#ffffff', '#d9c8ff');

    const planets = PLANETS.map((def, pi) => {
        const orbitGroup = new THREE.Group();
        scene.add(orbitGroup);
        const scaled = new THREE.Group();
        scaled.scale.setScalar(PLANET_RADIUS);
        orbitGroup.add(scaled);
        const world = new THREE.Group();
        scaled.add(world);
        const globe = new THREE.Mesh(
            new THREE.SphereGeometry(GLOBE_RADIUS, 64, 48),
            new THREE.MeshPhysicalMaterial({ map: makeWorldTexture(def), roughness: 0.42, clearcoat: 1, clearcoatRoughness: 0.18 })
        );
        world.add(globe);
        const atmosphere = new THREE.Mesh(new THREE.SphereGeometry(GLOBE_RADIUS * 1.16, 48, 32), atmosphereMaterial(def.glow));
        scaled.add(atmosphere);

        // Big invisible ball so planets are easy to tap from far away.
        const hit = new THREE.Mesh(new THREE.SphereGeometry(GLOBE_RADIUS * 1.5, 12, 12), new THREE.MeshBasicMaterial({ visible: false }));
        hit.userData = { kind: 'planet', planet: pi };
        scaled.add(hit);

        // Pulsing ring around the planet with the next mission.
        const halo = new THREE.Mesh(
            new THREE.RingGeometry(1.32, 1.45, 64),
            new THREE.MeshBasicMaterial({ color: 0xffd60a, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false })
        );
        halo.rotation.x = -Math.PI / 2;
        scaled.add(halo);

        const label = document.createElement('div');
        label.className = 'globe-planet-label';
        labelLayer.appendChild(label);

        const levelIdx = [];
        LEVELS.forEach((l, i) => {
            if (l.regionId === def.regionId) levelIdx.push(i);
        });
        const stops = levelIdx.map((_, k) => {
            const pos = PLANET_LEVEL_POSITIONS[k % PLANET_LEVEL_POSITIONS.length];
            return latLngToXYZ(pos.lat, pos.lng, 1);
        });
        return {
            def,
            index: pi,
            orbitGroup,
            scaled,
            world,
            atmosphere,
            hit,
            halo,
            label,
            levelIdx,
            stops,
            pathPoints: stops.length > 1 ? windingPath(stops, { perLeg: PER_LEG, wiggle: 0.07, radius: 1.008 }).map(v3) : [],
            doneTube: null,
            todoTube: null,
            status: null,
            spin: { from: { x: 0, y: 0 }, to: { x: 0, y: 0 }, start: 0, dur: 0 },
        };
    });

    function planetOfLevelIndex(i) {
        return planets.findIndex((p) => p.levelIdx.includes(i));
    }

    // Orbit clock: runs in the system view, holds still while flown in.
    let orbitT = 0;
    function placePlanets() {
        const ang = orbitAngle(orbitT);
        for (const p of planets) {
            const pos = orbitPosition(p.def, ang);
            p.orbitGroup.position.set(pos.x, pos.y, pos.z);
        }
    }
    placePlanets();

    // ---- Controls (planet view only) --------------------------------------
    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.enableZoom = true;
    controls.rotateSpeed = 0.6;
    controls.autoRotate = false;
    controls.enabled = false;
    let userTurning = false;
    controls.addEventListener('start', () => {
        userTurning = true;
    });

    // ---- Paths and markers --------------------------------------------------
    function buildPath(p) {
        for (const t of [p.doneTube, p.todoTube]) {
            if (t) {
                p.world.remove(t);
                t.geometry.dispose();
            }
        }
        p.doneTube = null;
        p.todoTube = null;
        if (p.pathPoints.length < 2) return;
        // Bright up to the next mission on this planet, pale beyond it.
        const first = p.levelIdx[0];
        const last = p.levelIdx[p.levelIdx.length - 1];
        let localNext;
        if (state.nextIndex < first) localNext = 0;
        else if (state.nextIndex > last) localNext = p.levelIdx.length - 1;
        else localNext = state.nextIndex - first;
        const allDone = state.nextIndex > last || (p.status && p.status.done);
        const split = allDone ? p.pathPoints.length - 1 : Math.min(p.pathPoints.length - 1, Math.max(0, localNext * PER_LEG));
        const make = (pts, tex, opacity) => {
            if (pts.length < 2) return null;
            const curve = new THREE.CatmullRomCurve3(pts);
            const len = curve.getLength();
            const t = tex.clone();
            t.needsUpdate = true;
            t.repeat.set(Math.max(1, Math.round(len * 14)), 1);
            const mesh = new THREE.Mesh(
                new THREE.TubeGeometry(curve, Math.max(8, pts.length * 3), 0.022, 10, false),
                new THREE.MeshPhysicalMaterial({ map: t, roughness: 0.3, clearcoat: 1, transparent: opacity < 1, opacity })
            );
            p.world.add(mesh);
            return mesh;
        };
        p.doneTube = make(p.pathPoints.slice(0, split + 1), brightStripe, 1);
        p.todoTube = make(p.pathPoints.slice(split), paleStripe, 0.8);
    }

    function addLabel(html, cls) {
        const el = document.createElement('div');
        el.className = `globe-marker-label ${cls || ''}`;
        el.innerHTML = html;
        labelLayer.appendChild(el);
        return el;
    }

    // Glossy candy button standing on the surface.
    const buttonGeo = new THREE.CylinderGeometry(0.1, 0.11, 0.045, 40);
    const capGeo = new THREE.SphereGeometry(0.1, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2);
    const ringGeo = new THREE.RingGeometry(0.12, 0.14, 40);

    function markerColor(m) {
        if (!m.unlocked) return LOCKED_COLOR;
        if (m.done) return COMPLETED_COLOR;
        return planets[m.planet].def.button;
    }

    function makeLevelMarker(level, index) {
        const pi = planetOfLevelIndex(index);
        const planet = planets[pi];
        const local = planet.levelIdx.indexOf(index);
        const stop = planet.stops[local];
        const anchor = v3(stop).multiplyScalar(GLOBE_RADIUS);
        const grp = new THREE.Group();
        grp.position.copy(anchor);
        grp.lookAt(anchor.clone().multiplyScalar(2));
        grp.rotateX(Math.PI / 2); // local +y now points away from the planet

        const mat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.08, sheen: 0.4 });
        const base = new THREE.Mesh(buttonGeo, mat);
        base.position.y = 0.022;
        const cap = new THREE.Mesh(capGeo, mat);
        cap.scale.y = 0.45;
        cap.position.y = 0.044;
        const body = new THREE.Group();
        body.add(base, cap);
        grp.add(body);

        const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.004;
        grp.add(ring);

        const hit = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8), new THREE.MeshBasicMaterial({ visible: false }));
        hit.userData = { kind: 'level', levelId: level.id };
        grp.add(hit);
        pickables.push(hit);

        const label = addLabel('', '');
        const marker = { kind: 'level', index, planet: pi, stop, level, grp, body, mat, ring, label, unlocked: false, done: false, squishAt: -1 };
        state.levelMarkers.push(marker);
        planet.world.add(grp);
        return marker;
    }

    function paintLevelMarker(m) {
        const rec = levelRecord(state.save, m.level.id);
        m.unlocked = isLevelUnlocked(state.save, LEVELS, REGIONS, m.level.id);
        m.done = rec.completed;
        m.mat.color.setHex(markerColor(m));
        m.mat.emissive.setHex(markerColor(m));
        m.mat.emissiveIntensity = m.unlocked ? 0.12 : 0;
        m.label.innerHTML = levelLabelHtml(m.index, { unlocked: m.unlocked, completed: m.done, stars: rec.stars });
        m.label.dataset.w = '';
        m.label.classList.toggle('locked', !m.unlocked);
        m.label.classList.toggle('current', m.index === state.nextIndex && m.unlocked && !m.done);
    }

    function paintPlanet(p) {
        p.status = planetStatus(state.save, LEVELS, REGIONS, p.def);
        const region = regionById(p.def.regionId);
        const st = p.status;
        const lock = st.unlocked ? '' : `<span class="globe-label-lock" aria-label="Locked">${LOCK_SVG}</span>`;
        p.label.innerHTML = `<span class="globe-planet-name">${p.def.name}</span>` +
            `<span class="globe-planet-region">${region ? region.name : ''}</span>` +
            (st.unlocked ? `<span class="globe-planet-stars">&#9733; ${st.stars}/${st.maxStars}</span>` : lock);
        p.label.classList.toggle('locked', !st.unlocked);
        p.label.dataset.w = '';
        // Locked planets look sugar-frosted (paler) until you reach them.
        p.world.children[0].material.color.setHex(st.unlocked ? 0xffffff : 0xb9b3cc);
    }

    // Prize box: a wrapped gift with a ribbon and bow, on its planet's road.
    function makeChestMarker(chest) {
        const pi = planetOfLevelIndex(chest.afterLevelIndex);
        if (pi < 0) return null;
        const planet = planets[pi];
        const local = planet.levelIdx.indexOf(chest.afterLevelIndex);
        const stop = chestStop(planet.stops, local);
        const anchor = v3(stop).multiplyScalar(GLOBE_RADIUS);
        const grp = new THREE.Group();
        grp.position.copy(anchor);
        grp.lookAt(anchor.clone().multiplyScalar(2));
        grp.rotateX(Math.PI / 2);

        const wrap = new THREE.MeshPhysicalMaterial({ color: 0xff5fa2, roughness: 0.3, clearcoat: 1 });
        const ribbonMat = new THREE.MeshPhysicalMaterial({ color: 0xffd60a, roughness: 0.25, clearcoat: 1 });
        const gift = new THREE.Group();
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.09, 0.12), wrap);
        body.position.y = 0.045;
        const lidGroup = new THREE.Group();
        lidGroup.position.y = 0.09;
        const lid = new THREE.Mesh(new THREE.BoxGeometry(0.135, 0.03, 0.135), wrap.clone());
        lid.position.y = 0.015;
        const r1 = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.093, 0.124), ribbonMat);
        r1.position.y = 0.045;
        const r2 = new THREE.Mesh(new THREE.BoxGeometry(0.124, 0.093, 0.026), ribbonMat);
        r2.position.y = 0.045;
        const bowGeo = new THREE.TorusGeometry(0.022, 0.009, 10, 20);
        const bowL = new THREE.Mesh(bowGeo, ribbonMat);
        bowL.position.set(-0.02, 0.045, 0);
        bowL.rotation.y = Math.PI / 2;
        bowL.rotation.z = 0.6;
        const bowR = bowL.clone();
        bowR.position.x = 0.02;
        bowR.rotation.z = -0.6;
        lidGroup.add(lid, bowL, bowR);
        gift.add(body, r1, r2, lidGroup);
        gift.scale.setScalar(1.35);
        grp.add(gift);

        const glow = makeGlowSprite('#fff3a8');
        glow.scale.set(0.42, 0.42, 1);
        glow.position.y = 0.07;
        grp.add(glow);

        const hit = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 8), new THREE.MeshBasicMaterial({ visible: false }));
        hit.position.y = 0.06;
        hit.userData = { kind: 'chest', chestId: chest.id };
        grp.add(hit);
        pickables.push(hit);
        planet.world.add(grp);

        const label = addLabel('<span class="globe-label-chest">Prize box</span>', 'chest-label');
        const marker = { kind: 'chest', chest, planet: pi, grp, gift, lidGroup, wrap, glow, label, chestState: 'locked' };
        state.chestMarkers.push(marker);
        return marker;
    }

    function setChestVisual(marker, chestState) {
        marker.chestState = chestState;
        const col = chestState === 'locked' ? 0xb8a9d9 : chestState === 'opened' ? 0xffc2dc : 0xff5fa2;
        marker.wrap.color.setHex(col);
        marker.lidGroup.children[0].material.color.setHex(col);
        marker.glow.visible = chestState === 'openable';
        marker.lidGroup.position.y = chestState === 'opened' ? 0.13 : 0.09;
        marker.lidGroup.rotation.z = chestState === 'opened' ? 0.9 : 0;
        // Only a ready box gets a label, so labels never crowd the road.
        marker.label.querySelector('.globe-label-chest').textContent = 'Open me!';
        marker.label.classList.toggle('ready', chestState === 'openable');
        marker.label.hidden = chestState !== 'openable';
    }

    // ---- Confetti --------------------------------------------------------------
    const bursts = [];
    const confettiGeo = new THREE.BoxGeometry(0.018, 0.006, 0.01);
    function confetti(at, count = 36) {
        if (reduceMotion) return;
        const colors = [0xff4d6d, 0xffd60a, 0x4cc9f0, 0x80ed99, 0xb388ff, 0xffffff];
        const origin = new THREE.Vector3();
        at.getWorldPosition(origin);
        const centre = new THREE.Vector3();
        planets[state.planet].orbitGroup.getWorldPosition(centre);
        const out = origin.clone().sub(centre).normalize();
        const pieces = [];
        for (let i = 0; i < count; i++) {
            const m = new THREE.Mesh(confettiGeo, new THREE.MeshBasicMaterial({ color: colors[i % colors.length], transparent: true }));
            m.position.copy(origin);
            const v = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(0.02).addScaledVector(out, 0.018 + Math.random() * 0.015);
            m.userData = { v, spin: new THREE.Vector3(Math.random(), Math.random(), Math.random()).multiplyScalar(0.4) };
            scene.add(m);
            pieces.push(m);
        }
        bursts.push({ pieces, start: performance.now() });
    }

    // ---- Chest state / economy --------------------------------------------
    function chestUnlockedByLevel(chest) {
        const level = LEVELS[chest.afterLevelIndex];
        if (!level) return false;
        return levelRecord(state.save, level.id).stars >= 1;
    }

    async function chestOpenState(chest) {
        if (!chestUnlockedByLevel(chest)) return 'locked';
        const econ = await getEconomy();
        if (econ && typeof econ.getChestState === 'function') {
            try {
                const s = await econ.getChestState(chest.id);
                return normalizeChestState(s, readChestOpenedFallback(state.save, chest.id));
            } catch {
                // fall through to save fallback
            }
        }
        return readChestOpenedFallback(state.save, chest.id) ? 'opened' : 'openable';
    }

    async function refreshChests() {
        for (const m of state.chestMarkers) setChestVisual(m, await chestOpenState(m.chest));
    }

    // ---- Info sheet ---------------------------------------------------------
    function openSheet({ title, sub, desc, actionLabel, onAction }) {
        sheet.querySelector('#globe-sheet-title').textContent = title;
        sheet.querySelector('#globe-sheet-sub').textContent = sub || '';
        sheet.querySelector('#globe-sheet-desc').textContent = desc || '';
        const btn = sheet.querySelector('#globe-sheet-action');
        if (actionLabel && onAction) {
            btn.hidden = false;
            btn.textContent = actionLabel;
            btn.onclick = onAction;
        } else {
            btn.hidden = true;
            btn.onclick = null;
        }
        sheet.hidden = false;
        playBtn.hidden = true;
    }
    function closeSheet() {
        sheet.hidden = true;
        playBtn.hidden = false;
    }
    sheet.querySelector('#globe-sheet-close').addEventListener('click', closeSheet);

    function showLevelSheet(marker) {
        const { level, unlocked, done } = marker;
        const rec = levelRecord(state.save, level.id);
        const region = regionById(level.regionId);
        if (!unlocked) {
            openSheet({
                title: `Level ${marker.index + 1}: ${level.name}`,
                sub: 'Locked',
                desc: lockReason(state.save, LEVELS, REGIONS, level.id) || 'Locked.',
                actionLabel: null,
            });
            return;
        }
        openSheet({
            title: `Level ${marker.index + 1}: ${level.name}`,
            sub: region ? region.name : '',
            desc: done ? `${level.blurb} Best: ${starRow(rec.stars)}` : level.blurb,
            actionLabel: done ? 'Play again' : 'Play',
            onAction: () => {
                closeSheet();
                if (onPlayLevel) onPlayLevel(level.id);
            },
        });
    }

    function showLockedPlanetSheet(p) {
        const region = regionById(p.def.regionId);
        openSheet({
            title: `Planet ${p.def.name}`,
            sub: `${region ? region.name : ''}: locked`,
            desc: `${region ? region.tagline + ' ' : ''}${p.status?.reason || 'Beat the planet before it to fly here.'}`,
            actionLabel: 'Take a look',
            onAction: () => {
                closeSheet();
                flyToPlanet(p.index);
            },
        });
    }

    async function showChestSheet(marker) {
        const chest = marker.chest;
        const level = LEVELS[chest.afterLevelIndex];
        const st = await chestOpenState(chest);
        const contains = `Contains: ${givesText(chest.gives)}.`;
        if (st === 'locked') {
            openSheet({
                title: 'Prize box',
                sub: 'Locked',
                desc: `Earn at least 1 star on "${level ? level.name : 'an earlier level'}" to open this box. ${contains}`,
                actionLabel: null,
            });
            return;
        }
        if (st === 'opened') {
            openSheet({
                title: 'Prize box',
                sub: 'Already opened',
                desc: `This box is empty. ${contains.replace('Contains', 'It held')}`,
                actionLabel: null,
            });
            return;
        }
        openSheet({ title: 'Prize box', sub: 'Ready to open', desc: contains, actionLabel: 'Open it', onAction: () => handleChestOpen(marker) });
    }

    async function handleChestOpen(marker) {
        const chest = marker.chest;
        if ((await chestOpenState(chest)) !== 'openable') {
            showChestSheet(marker);
            return;
        }
        const econ = await getEconomy();
        if (!econ || typeof econ.openChest !== 'function') {
            showNotification('Prize boxes are not wired up yet.', 'info');
            return;
        }
        let result = null;
        try {
            result = await econ.openChest(chest.id);
        } catch {
            showNotification('Could not open the box right now. Try again later.', 'error');
            return;
        }
        if (result && result.ok === false) {
            showNotification(result.reason || 'Could not open the box right now.', 'error');
            return;
        }
        const loot = (result && (result.gives || result.granted)) || chest.gives;
        setChestVisual(marker, 'opened');
        marker.openedAt = performance.now();
        confetti(marker.gift, 60);
        state.save = loadSave(createStorage());
        refreshHUD();
        closeSheet();
        showNotification(`Prize box opened: ${givesText(loot)}!`, 'success');
    }

    // ---- Camera flights ------------------------------------------------------
    // One tween moves the camera position and what it looks at, between the
    // system view and a planet (or planet to planet).
    const flight = { fromPos: new THREE.Vector3(), toPos: new THREE.Vector3(), fromLook: new THREE.Vector3(), toLook: new THREE.Vector3(), start: 0, dur: 0 };
    const look = new THREE.Vector3(); // where the camera is looking right now

    function planetCentre(pi, out = new THREE.Vector3()) {
        return planets[pi].orbitGroup.getWorldPosition(out);
    }

    function startFlight(toPos, toLook, dur) {
        flight.fromPos.copy(camera.position);
        flight.fromLook.copy(look);
        flight.toPos.copy(toPos);
        flight.toLook.copy(toLook);
        flight.start = performance.now();
        flight.dur = reduceMotion ? 1 : dur;
    }

    function flyToPlanet(pi, { focusIndex = null, dur = 1100 } = {}) {
        const p = planets[pi];
        state.mode = 'planet';
        state.planet = pi;
        const c = planetCentre(pi);
        // Spin the planet so the chosen (or next) level faces the camera.
        spinPlanet(p, facingStop(p, focusIndex), dur * 0.8);
        controls.enabled = false;
        userTurning = false;
        startFlight(c.clone().add(new THREE.Vector3(0, 0, fitDistance)), c, dur);
        updateChrome();
    }

    function flyToSystem(dur = 1000) {
        state.mode = 'system';
        controls.enabled = false;
        userTurning = false;
        const sc = systemCam;
        startFlight(new THREE.Vector3(sc.position.x, sc.position.y, sc.position.z), new THREE.Vector3(0, 0, 0), dur);
        closeSheet();
        updateChrome();
    }

    // What to turn toward you: the middle of the planet's road, nudged a
    // little toward the chosen level, so all three levels stay on screen.
    function facingStop(p, levelIndex) {
        const mid = p.stops[Math.floor(p.stops.length / 2)];
        const local = levelIndex != null ? p.levelIdx.indexOf(levelIndex) : -1;
        if (local < 0) return mid;
        return slerp(mid, p.stops[local], 0.25);
    }

    // Spin one planet so a surface point faces you.
    function spinPlanet(p, stop, dur = 900) {
        const target = faceRotation(stop, 0.7);
        p.spin.from = { x: p.world.rotation.x, y: p.world.rotation.y };
        p.spin.to = { x: target.x, y: p.world.rotation.y + angleDelta(p.world.rotation.y, target.y) };
        p.spin.start = performance.now();
        p.spin.dur = reduceMotion ? 1 : dur;
    }

    // Planet view: spin to a level and re-centre the camera in front.
    function focusOn(levelIndex, dur = 900) {
        const pi = planetOfLevelIndex(levelIndex);
        if (pi < 0) return;
        if (state.mode !== 'planet' || state.planet !== pi) {
            flyToPlanet(pi, { focusIndex: levelIndex, dur: Math.max(dur, 900) });
            return;
        }
        const p = planets[pi];
        spinPlanet(p, facingStop(p, levelIndex), dur);
        const c = planetCentre(pi);
        controls.enabled = false;
        userTurning = false;
        startFlight(c.clone().add(new THREE.Vector3(0, 0, fitDistance)), c, dur);
    }

    function updateChrome() {
        const inPlanet = state.mode === 'planet';
        backBtn.hidden = !inPlanet;
        planetTitle.hidden = !inPlanet;
        mountEl.querySelector('.globe-home').classList.toggle('in-planet', inPlanet);
        if (inPlanet) {
            const p = planets[state.planet];
            const region = regionById(p.def.regionId);
            planetTitle.innerHTML = `<span class="globe-planet-title-name">${p.def.name}</span><span class="globe-planet-title-region">${region ? region.name : ''}</span>`;
        }
    }
    backBtn.addEventListener('click', () => flyToSystem());

    // ---- Tap handling ---------------------------------------------------------
    const raycaster = new THREE.Raycaster();
    const pointerNDC = new THREE.Vector2();
    let downX = 0;
    let downY = 0;
    let downT = 0;
    canvas.addEventListener('pointerdown', (e) => {
        downX = e.clientX;
        downY = e.clientY;
        downT = performance.now();
    });
    canvas.addEventListener('pointerup', (e) => {
        const moved = Math.hypot(e.clientX - downX, e.clientY - downY);
        if (moved > 10 || performance.now() - downT > 600) return; // a drag
        const rect = canvas.getBoundingClientRect();
        pointerNDC.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        pointerNDC.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(pointerNDC, camera);

        if (state.mode === 'system') {
            const hits = raycaster.intersectObjects(planets.map((p) => p.hit), false);
            if (!hits.length) {
                closeSheet();
                return;
            }
            const p = planets[hits[0].object.userData.planet];
            if (p.status && !p.status.unlocked) {
                showLockedPlanetSheet(p);
                return;
            }
            closeSheet();
            const next = p.levelIdx.includes(state.nextIndex) ? state.nextIndex : null;
            flyToPlanet(p.index, { focusIndex: next });
            return;
        }

        const centre = planetCentre(state.planet, tmpC);
        const onPlanet = pickables.filter((h) => {
            const m = h.userData.kind === 'level'
                ? state.levelMarkers.find((x) => x.level.id === h.userData.levelId)
                : state.chestMarkers.find((x) => x.chest.id === h.userData.chestId);
            return m && m.planet === state.planet;
        });
        const hits = raycaster.intersectObjects(onPlanet, false).filter((h) => {
            // Ignore markers on the far side of the planet.
            h.object.getWorldPosition(tmpV);
            return tmpV.sub(centre).dot(tmpC.copy(camera.position).sub(centre)) > 0;
        });
        if (!hits.length) {
            closeSheet();
            return;
        }
        const ud = hits[0].object.userData;
        if (ud.kind === 'level') {
            const marker = state.levelMarkers.find((m) => m.level.id === ud.levelId);
            if (marker) {
                marker.squishAt = performance.now();
                focusOn(marker.index, 600);
                showLevelSheet(marker);
            }
        } else if (ud.kind === 'chest') {
            const marker = state.chestMarkers.find((m) => m.chest.id === ud.chestId);
            if (marker) {
                marker.squishAt = performance.now();
                chestOpenState(marker.chest).then((st) => {
                    if (st === 'openable') handleChestOpen(marker);
                    else showChestSheet(marker);
                });
            }
        }
    });

    playBtn.addEventListener('click', () => {
        const m = state.levelMarkers[state.nextIndex];
        if (!m) return;
        m.squishAt = performance.now();
        if (onPlayLevel) onPlayLevel(m.level.id);
    });

    // ---- HUD --------------------------------------------------------------------
    function refreshHUD() {
        const stars = totalStars(state.save);
        mountEl.querySelector('#globe-hud-stars').textContent = `${stars} star${stars === 1 ? '' : 's'}`;
        mountEl.querySelector('#globe-hud-funding').textContent = `${state.save.funding} funding`;
        mountEl.querySelector('#globe-hud-lives').textContent = `${state.save.livesSaved.toLocaleString()} lives saved`;
    }

    // Next mission: the first unlocked level not yet completed, else the
    // furthest unlocked one.
    function findNextIndex() {
        let last = 0;
        for (let i = 0; i < LEVELS.length; i++) {
            if (!isLevelUnlocked(state.save, LEVELS, REGIONS, LEVELS[i].id)) break;
            last = i;
            if (!levelRecord(state.save, LEVELS[i].id).completed) return i;
        }
        return last;
    }

    function refresh() {
        state.save = loadSave(createStorage());
        refreshHUD();
        const prevNext = state.nextIndex;
        const prevPlanet = planetOfLevelIndex(prevNext);
        state.nextIndex = findNextIndex();
        for (const p of planets) paintPlanet(p);
        for (const m of state.levelMarkers) paintLevelMarker(m);
        for (const p of planets) buildPath(p);
        refreshChests();
        const next = state.levelMarkers[state.nextIndex];
        playBtn.textContent = next && next.done ? `Play level ${state.nextIndex + 1} again` : `Play level ${state.nextIndex + 1}`;
        const nextPlanet = planetOfLevelIndex(state.nextIndex);
        if (!refresh.ran) {
            // First visit: start on the whole solar system.
            flyToSystem(1);
        } else if (prevNext !== state.nextIndex) {
            if (nextPlanet !== prevPlanet) {
                // A new planet just opened: show it off, then fly there.
                showNotification(`New planet unlocked: ${planets[nextPlanet].def.name}!`, 'success');
                flyToPlanet(nextPlanet, { focusIndex: state.nextIndex, dur: 1600 });
            } else {
                focusOn(state.nextIndex, 1200);
            }
        }
        refresh.ran = true;
    }

    // ---- Animation ---------------------------------------------------------------
    const clock = new THREE.Clock();
    function resize() {
        const w = mountEl.clientWidth || window.innerWidth;
        const h = mountEl.clientHeight || window.innerHeight;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        // Leave room for the title bar and the Play button on tall phones.
        fitDistance = globeFitDistance({ radius: 1.06 * PLANET_RADIUS, fovDeg: camera.fov, aspect: camera.aspect, margin: 1.0 });
        controls.minDistance = fitDistance * 0.6;
        controls.maxDistance = fitDistance * 1.4;
        systemCam = systemCamera({ fovDeg: camera.fov, aspect: camera.aspect });
        if (flight.dur === 0 && state.mode === 'system') {
            camera.position.set(systemCam.position.x, systemCam.position.y, systemCam.position.z);
            look.set(0, 0, 0);
        }
    }
    new ResizeObserver(resize).observe(mountEl);
    resize();

    const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    let firstFrame = true;
    let lastFrame = performance.now();
    function animate() {
        requestAnimationFrame(animate);
        // Only draw while the map is on screen; levels get the whole phone.
        if (!mountEl.classList.contains('active')) {
            lastFrame = performance.now();
            return;
        }
        const t = clock.getElapsedTime();
        const now = performance.now();
        const dt = Math.min(0.1, (now - lastFrame) / 1000);
        lastFrame = now;

        // Planets orbit only in the system view, so a flown-to planet holds still.
        if (state.mode === 'system' && !reduceMotion && flight.dur === 0) {
            orbitT += dt;
            placePlanets();
        }

        // Planet spins toward a focused level.
        for (const p of planets) {
            if (p.spin.dur > 0) {
                const k = Math.min(1, (now - p.spin.start) / p.spin.dur);
                const e = ease(k);
                p.world.rotation.x = p.spin.from.x + (p.spin.to.x - p.spin.from.x) * e;
                p.world.rotation.y = p.spin.from.y + (p.spin.to.y - p.spin.from.y) * e;
                if (k >= 1) p.spin.dur = 0;
            } else if (!reduceMotion && !(state.mode === 'planet' && state.planet === p.index && userTurning)) {
                // Idle: planets turn slowly in the system view, sway when close.
                p.world.rotation.y += state.mode === 'system' ? dt * 0.15 : Math.sin(t * 0.4) * 0.0004;
            }
            // The planet with the next mission wears a pulsing gold ring.
            const isNext = p.index === planetOfLevelIndex(state.nextIndex) && state.mode === 'system';
            p.halo.material.opacity = isNext && !reduceMotion ? 0.55 + 0.35 * Math.sin(t * 3) : isNext ? 0.7 : 0;
        }
        sunMesh.rotation.y += dt * 0.2;
        for (const m of orbitMeshes) m.visible = state.mode === 'system' || flight.dur > 0;

        // Camera flight.
        if (flight.dur > 0) {
            const k = Math.min(1, (now - flight.start) / flight.dur);
            const e = ease(k);
            camera.position.lerpVectors(flight.fromPos, flight.toPos, e);
            look.lerpVectors(flight.fromLook, flight.toLook, e);
            camera.lookAt(look);
            if (k >= 1) {
                flight.dur = 0;
                if (state.mode === 'planet') {
                    controls.target.copy(look);
                    controls.enabled = true;
                    controls.update();
                }
            }
        } else if (state.mode === 'planet') {
            controls.update();
        } else {
            camera.lookAt(look);
        }

        // Level buttons: the next one bounces with squash and stretch and a
        // pulsing ring; a tapped one squishes.
        for (const m of state.levelMarkers) {
            const current = m.index === state.nextIndex && m.unlocked && !m.done;
            let sy = 1;
            let sxz = 1;
            let lift = 0;
            if (current && !reduceMotion) {
                const ph = (t * 2.2) % 1;
                lift = Math.max(0, Math.sin(ph * Math.PI)) * 0.04;
                const squash = ph < 0.08 || ph > 0.92 ? 0.82 : 1.06;
                sy = squash;
                sxz = 1 / Math.sqrt(squash);
                m.ring.material.opacity = 0.7 * (1 - ((t * 0.9) % 1));
                const rs = 1 + ((t * 0.9) % 1) * 1.2;
                m.ring.scale.setScalar(rs);
            } else {
                m.ring.material.opacity = 0;
            }
            if (m.squishAt > 0) {
                const k = (now - m.squishAt) / 380;
                if (k < 1) {
                    const w = Math.sin(k * Math.PI * 3) * (1 - k) * 0.35;
                    sy *= 1 - w;
                    sxz *= 1 + w * 0.6;
                } else m.squishAt = -1;
            }
            m.body.scale.set(sxz, sy, sxz);
            m.body.position.y = lift;
        }
        // Prize boxes wobble when ready, pop when tapped.
        for (const m of state.chestMarkers) {
            const ready = m.chestState === 'openable';
            m.gift.rotation.y = ready && !reduceMotion ? Math.sin(t * 6) * 0.18 * (Math.sin(t * 1.5) > 0.3 ? 1 : 0.15) : 0;
            const hop = ready && !reduceMotion ? Math.abs(Math.sin(t * 3)) * 0.02 : 0;
            m.gift.position.y = hop;
            if (m.glow.visible) m.glow.material.opacity = 0.6 + 0.4 * Math.sin(t * 4);
            if (m.squishAt > 0) {
                const k = (now - m.squishAt) / 350;
                const s = k < 1 ? 1 + Math.sin(k * Math.PI) * 0.25 : 1;
                m.gift.scale.setScalar(1.35 * s);
                if (k >= 1) m.squishAt = -1;
            }
        }
        // Sparkles twinkle.
        sparkles[0].material.opacity = 0.55 + 0.35 * Math.sin(t * 2.1);
        sparkles[1].material.opacity = 0.55 + 0.35 * Math.sin(t * 1.7 + 1.5);

        // Confetti bursts.
        for (let i = bursts.length - 1; i >= 0; i--) {
            const b = bursts[i];
            const age = (now - b.start) / 1400;
            for (const p of b.pieces) {
                p.position.add(p.userData.v);
                p.userData.v.multiplyScalar(0.95);
                p.userData.v.y -= 0.0006;
                p.rotation.x += p.userData.spin.x;
                p.rotation.y += p.userData.spin.y;
                p.material.opacity = Math.max(0, 1 - age);
            }
            if (age >= 1) {
                for (const p of b.pieces) {
                    scene.remove(p);
                    p.material.dispose();
                }
                bursts.splice(i, 1);
            }
        }

        renderer.render(scene, camera);
        projectLabels();

        if (firstFrame) {
            firstFrame = false;
            const loading = mountEl.querySelector('#globe-loading');
            if (loading) {
                loading.classList.add('fade');
                setTimeout(() => loading.remove(), 600);
            }
        }
    }

    // HTML labels: planet names in the system view, level numbers and prize
    // boxes on the planet you flew to. Hidden on the far side of a planet.
    function placeLabel(el, world, extraUp = 0) {
        tmpV.copy(world).project(camera);
        const vw = renderer.domElement.clientWidth;
        const vh = renderer.domElement.clientHeight;
        const x = (tmpV.x * 0.5 + 0.5) * vw;
        const y = (-tmpV.y * 0.5 + 0.5) * vh - extraUp;
        if (tmpV.z > 1 || x < 0 || x > vw) return false;
        el.style.display = 'flex';
        if (!el.dataset.w) el.dataset.w = el.offsetWidth ? String(el.offsetWidth) : '';
        const cx = clampLabelX(x, Number(el.dataset.w) || 40, vw);
        el.style.transform = `translate(-50%, -125%) translate(${cx}px, ${y}px)`;
        return true;
    }

    function projectLabels() {
        const flying = flight.dur > 0;
        const systemView = state.mode === 'system' && !flying;
        // Planet labels sit just above each planet.
        const vh = renderer.domElement.clientHeight;
        for (const p of planets) {
            if (!systemView) {
                p.label.style.display = 'none';
                continue;
            }
            p.orbitGroup.getWorldPosition(tmpC);
            // Screen radius of the planet, to lift the label above it.
            const d = tmpC.distanceTo(camera.position);
            const rPx = (PLANET_RADIUS / (d * Math.tan((camera.fov * Math.PI) / 360))) * (vh / 2);
            if (!placeLabel(p.label, tmpC, rPx * 0.9)) p.label.style.display = 'none';
        }
        const centre = state.mode === 'planet' ? planetCentre(state.planet, new THREE.Vector3()) : null;
        const toCam = centre ? camera.position.clone().sub(centre).normalize() : null;
        for (const m of state.levelMarkers.concat(state.chestMarkers)) {
            if (state.mode !== 'planet' || flying || m.planet !== state.planet || m.label.hidden) {
                m.label.style.display = 'none';
                continue;
            }
            m.grp.getWorldPosition(tmpC);
            const facing = tmpC.clone().sub(centre).normalize().dot(toCam) > 0.2;
            if (!facing || !placeLabel(m.label, tmpC)) m.label.style.display = 'none';
        }
    }

    LEVELS.forEach((level, i) => makeLevelMarker(level, i));
    CHESTS.forEach(makeChestMarker);
    refresh();
    animate();

    // Expose for playtests.
    mountEl.__globe = { focusOn, flyToPlanet, flyToSystem, refresh, state, planets, camera };
    return { refresh };
}
