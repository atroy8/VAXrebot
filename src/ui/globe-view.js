// Candy planet home screen (3D): glossy candy world, a candy-cane road
// through the levels, bouncy level buttons, wobbling prize boxes, candy HUD. Procedurally generated texture, fully
// offline. Mounted by screens.js onto #welcome-screen, replacing the video
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
import { starRow, levelLabelHtml, clampLabelX } from './globe-labels.js';
import { latLngToXYZ, windingPath, chestStop, globeFitDistance, faceRotation, angleDelta } from './globe-math.js';

// Level marker positions (lat/lng, degrees), spread across the three regions.
const LEVEL_POSITIONS = [
    // A road that winds once around the planet, about 35 degrees per hop,
    // so every level button has room on a phone screen.
    { lat: 18, lng: -90 }, // r1-care-home
    { lat: 34, lng: -52 }, // r1-elementary
    { lat: 12, lng: -20 }, // r1-old-town
    { lat: 30, lng: 14 }, // r2-festival
    { lat: 4, lng: 44 }, // r2-high-school
    { lat: 24, lng: 78 }, // r2-airport
    { lat: -2, lng: 110 }, // r3-metro
    { lat: 18, lng: 146 }, // r3-harbor
    { lat: -6, lng: -176 }, // r3-hub
];

// Candy button colors per region; gold once a level is beaten.
const REGION_COLORS = {
    hometown: 0x2ee59d,
    national: 0x3ab0ff,
    global: 0xff4f9a,
};
const LOCKED_COLOR = 0xb9b3cc;
const COMPLETED_COLOR = 0xffc93c;

const POWERUP_NAMES = {
    eureka: 'Eureka cure',
    blitz: 'Vax Blitz',
    pay: 'Stay Home order',
};

const GLOBE_RADIUS = 1;

function latLngToVec3(lat, lng, radius) {
    const phi = ((90 - lat) * Math.PI) / 180;
    const theta = ((lng + 180) * Math.PI) / 180;
    return new THREE.Vector3(
        -radius * Math.sin(phi) * Math.cos(theta),
        radius * Math.cos(phi),
        radius * Math.sin(phi) * Math.sin(theta)
    );
}

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

function makeWorldTexture() {
    const w = 1024;
    const h = 512;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');

    const ocean = ctx.createLinearGradient(0, 0, 0, h);
    ocean.addColorStop(0, '#4fd1ff');
    ocean.addColorStop(0.5, '#2bb3f3');
    ocean.addColorStop(1, '#4fd1ff');
    ctx.fillStyle = ocean;
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

    const rand = mulberry32(20261015);
    const blobs = [];
    for (let c = 0; c < 9; c++) {
        const cx = rand() * w;
        const cy = h * 0.2 + rand() * h * 0.6;
        const base = 34 + rand() * 52;
        const color = CANDY[c % CANDY.length];
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

function atmosphereMaterial() {
    return new THREE.ShaderMaterial({
        uniforms: {
            glowColor: { value: new THREE.Color(0xffc6ec) },
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
                <div class="globe-stats">
                    <span class="globe-stat stat-stars" id="globe-hud-stars">0 stars</span>
                    <span class="globe-stat stat-funding" id="globe-hud-funding">0 funding</span>
                    <span class="globe-stat stat-lives" id="globe-hud-lives">0 lives saved</span>
                </div>
            </div>
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

    // ---- Renderer / scene ------------------------------------------------
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
    let fitDistance = 3.2;
    camera.position.set(0, 0, fitDistance);

    scene.add(new THREE.HemisphereLight(0xfff1fb, 0x7a5cff, 1.25));
    const sun = new THREE.DirectionalLight(0xffffff, 1.9);
    sun.position.set(3, 4, 5);
    scene.add(sun);
    const rim = new THREE.DirectionalLight(0xffb3e6, 1.2);
    rim.position.set(-4, -2, -3);
    scene.add(rim);

    // Twinkling sugar sparkles in the sky.
    const sparkles = [];
    {
        const rand = mulberry32(7);
        const colors = [0xffffff, 0xfff3a8, 0xffc6ec, 0xb9f6ff];
        for (let layer = 0; layer < 2; layer++) {
            const pts = [];
            for (let i = 0; i < 160; i++) {
                const v = new THREE.Vector3(rand() * 2 - 1, rand() * 2 - 1, -rand()).normalize().multiplyScalar(12 + rand() * 10);
                pts.push(v.x, v.y, v.z);
            }
            const g = new THREE.BufferGeometry();
            g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
            const m = new THREE.PointsMaterial({ color: colors[layer * 2], size: 0.16, transparent: true, opacity: 0.8, depthWrite: false });
            const p = new THREE.Points(g, m);
            scene.add(p);
            sparkles.push(p);
        }
    }

    const world = new THREE.Group();
    scene.add(world);

    const globe = new THREE.Mesh(
        new THREE.SphereGeometry(GLOBE_RADIUS, 64, 48),
        new THREE.MeshPhysicalMaterial({ map: makeWorldTexture(), roughness: 0.42, clearcoat: 1, clearcoatRoughness: 0.18 })
    );
    world.add(globe);

    const atmosphere = new THREE.Mesh(new THREE.SphereGeometry(GLOBE_RADIUS * 1.16, 48, 32), atmosphereMaterial());
    scene.add(atmosphere);

    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.enableZoom = true;
    controls.rotateSpeed = 0.6;
    controls.autoRotate = false;
    let userTurning = false;
    controls.addEventListener('start', () => {
        userTurning = true;
    });

    // ---- Path and markers ---------------------------------------------------
    const pickables = [];
    const tmpV = new THREE.Vector3();
    const levelStops = LEVEL_POSITIONS.map((p) => latLngToXYZ(p.lat, p.lng, 1));
    const v3 = (p) => new THREE.Vector3(p.x, p.y, p.z);

    // Candy-cane road through every level. Two tubes: the bright part up to
    // the next mission, a pale part for what is still ahead.
    const pathPoints = windingPath(levelStops, { perLeg: 28, wiggle: 0.07, radius: 1.008 }).map(v3);
    const PER_LEG = 28;
    let doneTube = null;
    let todoTube = null;
    const brightStripe = makeStripeTexture('#ffffff', '#ff4f8b');
    const paleStripe = makeStripeTexture('#ffffff', '#d9c8ff');
    function buildPath() {
        for (const t of [doneTube, todoTube]) {
            if (t) {
                world.remove(t);
                t.geometry.dispose();
            }
        }
        const split = Math.min(pathPoints.length - 1, Math.max(1, state.nextIndex * PER_LEG));
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
            world.add(mesh);
            return mesh;
        };
        doneTube = make(pathPoints.slice(0, split + 1), brightStripe, 1);
        todoTube = make(pathPoints.slice(split), paleStripe, 0.8);
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
        return REGION_COLORS[m.level.regionId] || 0xffffff;
    }

    function makeLevelMarker(level, index) {
        const pos = LEVEL_POSITIONS[index];
        const anchor = latLngToVec3(pos.lat, pos.lng, GLOBE_RADIUS * 1.0);
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

        const hit = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 8), new THREE.MeshBasicMaterial({ visible: false }));
        hit.userData = { kind: 'level', levelId: level.id };
        grp.add(hit);
        pickables.push(hit);

        const label = addLabel('', '');
        const marker = { kind: 'level', index, level, grp, body, mat, ring, label, anchor, unlocked: false, done: false, squishAt: -1 };
        state.levelMarkers.push(marker);
        world.add(grp);
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

    // Prize box: a wrapped gift with a ribbon and bow.
    function makeChestMarker(chest) {
        const stop = chestStop(levelStops, chest.afterLevelIndex);
        const anchor = v3(stop).multiplyScalar(GLOBE_RADIUS * 1.0);
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
        world.add(grp);

        const label = addLabel('<span class="globe-label-chest">Prize box</span>', 'chest-label');
        const marker = { kind: 'chest', chest, grp, gift, lidGroup, wrap, glow, label, anchor, chestState: 'locked' };
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

    // ---- Confetti and taps ----------------------------------------------------
    const bursts = [];
    const confettiGeo = new THREE.BoxGeometry(0.018, 0.006, 0.01);
    function confetti(at, count = 36) {
        if (reduceMotion) return;
        const colors = [0xff4d6d, 0xffd60a, 0x4cc9f0, 0x80ed99, 0xb388ff, 0xffffff];
        const origin = new THREE.Vector3();
        at.getWorldPosition(origin);
        const out = origin.clone().normalize();
        const pieces = [];
        for (let i = 0; i < count; i++) {
            const m = new THREE.Mesh(confettiGeo, new THREE.MeshBasicMaterial({ color: colors[i % colors.length], transparent: true }));
            m.position.copy(origin);
            const v = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(0.03).addScaledVector(out, 0.025 + Math.random() * 0.02);
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

    // ---- Focus: spin the planet so a level faces you -----------------------
    const spin = { from: { x: 0, y: 0 }, to: { x: 0, y: 0 }, start: 0, dur: 0 };
    function focusOn(stop, dur = 900) {
        const target = faceRotation(stop, 0.7);
        spin.from = { x: world.rotation.x, y: world.rotation.y };
        spin.to = { x: target.x, y: world.rotation.y + angleDelta(world.rotation.y, target.y) };
        spin.start = performance.now();
        spin.dur = reduceMotion ? 1 : dur;
        // Bring the camera back to the front so the facing math holds.
        camFrom.copy(camera.position);
        userTurning = false;
    }
    const camFrom = new THREE.Vector3();

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
        const hits = raycaster.intersectObjects(pickables, false).filter((h) => {
            // Ignore markers on the far side of the planet.
            h.object.getWorldPosition(tmpV);
            return tmpV.dot(camera.position) > 0;
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
                focusOn(levelStops[marker.index], 600);
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
        state.nextIndex = findNextIndex();
        for (const m of state.levelMarkers) paintLevelMarker(m);
        buildPath();
        refreshChests();
        const next = state.levelMarkers[state.nextIndex];
        playBtn.textContent = next && next.done ? `Play level ${state.nextIndex + 1} again` : `Play level ${state.nextIndex + 1}`;
        if (prevNext !== state.nextIndex || !refresh.ran) focusOn(levelStops[state.nextIndex], refresh.ran ? 1200 : 1);
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
        fitDistance = globeFitDistance({ radius: 1.06, fovDeg: camera.fov, aspect: camera.aspect, margin: 1.0 });
        controls.minDistance = fitDistance * 0.6;
        controls.maxDistance = fitDistance * 1.4;
        if (!userTurning) camera.position.setLength(fitDistance);
    }
    new ResizeObserver(resize).observe(mountEl);
    resize();

    const ease = (t) => 1 - Math.pow(1 - t, 3);
    const camDir = new THREE.Vector3();
    let firstFrame = true;
    function animate() {
        requestAnimationFrame(animate);
        // Only draw while the map is on screen; levels get the whole phone.
        if (!mountEl.classList.contains('active')) return;
        const t = clock.getElapsedTime();
        const now = performance.now();

        // Planet spin toward the focused level.
        if (spin.dur > 0) {
            const k = Math.min(1, (now - spin.start) / spin.dur);
            const e = ease(k);
            world.rotation.x = spin.from.x + (spin.to.x - spin.from.x) * e;
            world.rotation.y = spin.from.y + (spin.to.y - spin.from.y) * e;
            if (!userTurning) camera.position.lerpVectors(camFrom, tmpV.set(0, 0, fitDistance), e);
            if (k >= 1) spin.dur = 0;
        } else if (!userTurning && !reduceMotion) {
            // Idle: a slow, gentle sway so the planet feels alive.
            world.rotation.y += Math.sin(t * 0.4) * 0.0004;
        }
        // Floating planet.
        world.position.y = reduceMotion ? 0 : Math.sin(t * 1.2) * 0.015;
        atmosphere.position.y = world.position.y;

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
                p.userData.v.y -= 0.0009;
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

        controls.update();
        renderer.render(scene, camera);

        // Project labels; hide markers facing away from the camera.
        camDir.copy(camera.position).normalize();
        for (const m of state.levelMarkers.concat(state.chestMarkers)) {
            m.grp.getWorldPosition(tmpV);
            const facing = tmpV.clone().normalize().dot(camDir) > 0.2;
            tmpV.project(camera);
            const vw = renderer.domElement.clientWidth;
            const x = (tmpV.x * 0.5 + 0.5) * vw;
            const y = (-tmpV.y * 0.5 + 0.5) * renderer.domElement.clientHeight;
            if (facing && !m.label.hidden && x >= 0 && x <= vw) {
                m.label.style.display = 'flex';
                // Measure once per content change, then keep the label on screen.
                if (!m.label.dataset.w) m.label.dataset.w = m.label.offsetWidth ? String(m.label.offsetWidth) : '';
                const cx = clampLabelX(x, Number(m.label.dataset.w) || 40, vw);
                m.label.style.transform = `translate(-50%, -125%) translate(${cx}px, ${y}px)`;
            } else {
                m.label.style.display = 'none';
            }
        }

        if (firstFrame) {
            firstFrame = false;
            const loading = mountEl.querySelector('#globe-loading');
            if (loading) {
                loading.classList.add('fade');
                setTimeout(() => loading.remove(), 600);
            }
        }
    }

    LEVELS.forEach((level, i) => makeLevelMarker(level, i));
    CHESTS.forEach(makeChestMarker);
    refresh();
    animate();

    // Expose for playtests.
    mountEl.__globe = { focusOn, state };
    return { refresh };
}
