// Galaxy home screen (3D, round 14): three star systems, each a striped sun
// with 2 or 3 cloisonne enamel planets on circular orbits, seen from straight above so
// every orbit is a true circle. Tap a system to zoom in, tap a planet to fly
// down to it and see its 10 levels on a winding road with bouncy level
// buttons and wobbling prize boxes. Planets and suns are painted from Sanzo
// Wada's colour combinations (src/config/planet-palettes.js). Procedurally
// generated textures, fully offline. Mounted by screens.js onto
// #welcome-screen. Reads progression (read-only) from src/progress.js and
// src/save.js; opens prize boxes through src/economy.js.
//
// Camera convention: the camera always looks straight down (world -y) with
// screen up along world -z. Each planet is tilted so its front (local +z,
// where the levels are) faces up, toward the camera.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { LEVELS, REGIONS } from '../config/levels.js';
import { CHESTS } from '../config/chests.js';
import { isLevelUnlocked, lockReason, levelRecord, totalStars } from '../progress.js';
import { loadSave, createStorage } from '../save.js';
import { showNotification } from './panels.js';
import './globe-candy.css';
import './start-page.css';
import { startPageMarkup, layoutPeople, bindPeopleTaps } from './start-page.js';
import { starRow, levelLabelHtml, clampLabelX, LOCK_ICON as LOCK_SVG } from './globe-labels.js';
import { latLngToXYZ, windingPath, chestStop, globeFitDistance, faceRotation, angleDelta, slerp, facesCamera, tiltedOffset, PLANET_VIEW_AIM_UP } from './globe-math.js';
import { PLANETS, SYSTEM_LAYOUTS, PLANET_LEVEL_POSITIONS, SUN_RADIUS } from '../config/solar-system.js';
import { orbitAngle, orbitPosition, systemCamera, galaxyCamera, planetStatus, systemStatus } from './solar-math.js';
import { planetPalette, starPalette, comboFor, hexToRgb } from '../config/planet-palettes.js';
import { takeChestRequest, chestDestination } from './pending-chest.js';
import { THEME, CONFETTI, hexNum } from '../config/theme.js';
import { cloisonnePlan, paintCloisonne, TEXTURE_W, TEXTURE_H } from './cloisonne.js';
import { buildingParts, buildingFor, buildingColors, standingUp, buildingExtent, labelLift, roofSurface, beamLift } from './buildings.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Level buttons: the planet's colour while open, gold once beaten.
const LOCKED_COLOR = 0x9aa6bf;
const COMPLETED_COLOR = hexNum(THEME.kin400);

const POWERUP_NAMES = {
    eureka: 'Eureka cure',
    blitz: 'Vax Blitz',
    pay: 'Stay Home Pay',
};

const GLOBE_RADIUS = 1;
const UP = new THREE.Vector3(0, 1, 0);

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

function rgba(hex, a) {
    const [r, g, b] = hexToRgb(hex);
    return `rgba(${r},${g},${b},${a})`;
}

function seedOf(id) {
    let h = 2166136261;
    for (const ch of id) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
    return h >>> 0;
}

// Planet texture: a cloisonne enamel ball (item 18). Gold wire cells filled
// with the planet's Wada colours, painted by src/ui/cloisonne.js. Drawn
// locally on a canvas, no downloads.
function makeWorldTexture({ combo, seed, index }) {
    const canvas = document.createElement('canvas');
    canvas.width = TEXTURE_W;
    canvas.height = TEXTURE_H;
    paintCloisonne(canvas.getContext('2d'), cloisonnePlan({ combo, seed, index }));
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
}

// Diagonal stripe texture for roads, orbits and suns.
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
    g.addColorStop(0, rgba(color, 1));
    g.addColorStop(0.4, rgba(color, 0.66));
    g.addColorStop(1, rgba(color, 0));
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

// A flat ring in the orbit plane (a true circle seen from above).
function makeOrbitRing(radius, tex, opacity = 0.55, width = 0.03) {
    const pts = [];
    for (let i = 0; i <= 128; i++) {
        const th = (i / 128) * Math.PI * 2;
        pts.push(new THREE.Vector3(radius * Math.cos(th), 0, radius * Math.sin(th)));
    }
    const curve = new THREE.CatmullRomCurve3(pts, true);
    const t = tex.clone();
    t.needsUpdate = true;
    t.repeat.set(Math.round(curve.getLength() * 6), 1);
    return new THREE.Mesh(
        new THREE.TubeGeometry(curve, 200, width, 8, true),
        new THREE.MeshBasicMaterial({ map: t, transparent: true, opacity, depthWrite: false })
    );
}

function givesText(gives) {
    return Object.entries(gives)
        .map(([id, n]) => `${POWERUP_NAMES[id] || id} x${n}`)
        .join(', ');
}

// Prize boxes open through src/economy.js, loaded on demand. Everything
// degrades gracefully if it cannot load.
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
        // 'title': the start page on one planet. 'galaxy': all three
        // systems. 'system': one sun and its planets. 'planet': flown down
        // to one planet.
        mode: 'title',
        system: 0,
        planet: 0,
    };
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    // ---- DOM shell -------------------------------------------------------
    mountEl.innerHTML = `
        <div class="globe-home candy on-start">
            <div class="globe-tint" id="globe-tint" aria-hidden="true"></div>
            <div class="globe-loading" id="globe-loading">Loading the galaxy...</div>
            <canvas class="globe-canvas" id="globe-canvas"></canvas>
            <div class="globe-labels" id="globe-labels"></div>
            <div class="globe-hud">
                <div class="globe-title">Galactic Outbreak</div>
                <div class="globe-planet-title" id="globe-planet-title" hidden></div>
                <div class="globe-stats">
                    <span class="globe-stat stat-stars" id="globe-hud-stars">0 stars</span>
                    <span class="globe-stat stat-funding" id="globe-hud-funding">0 funding</span>
                    <span class="globe-stat stat-lives" id="globe-hud-lives">0 lives saved</span>
                </div>
            </div>
            <button type="button" class="globe-back" id="globe-back" hidden aria-label="Back">
                <span aria-hidden="true">&#8249;</span> <b id="globe-back-text">Galaxy</b>
            </button>
            <button type="button" class="globe-play" id="globe-play">Play</button>
            <div class="globe-sheet" id="globe-sheet" hidden>
                <button class="globe-sheet-close" id="globe-sheet-close" aria-label="Close">&times;</button>
                <h2 id="globe-sheet-title"></h2>
                <p class="globe-sheet-sub" id="globe-sheet-sub"></p>
                <p class="globe-sheet-desc" id="globe-sheet-desc"></p>
                <button class="globe-sheet-btn" id="globe-sheet-action" hidden></button>
            </div>
            ${startPageMarkup()}
        </div>`;

    const canvas = mountEl.querySelector('#globe-canvas');
    const labelLayer = mountEl.querySelector('#globe-labels');
    const sheet = mountEl.querySelector('#globe-sheet');
    const playBtn = mountEl.querySelector('#globe-play');
    const backBtn = mountEl.querySelector('#globe-back');
    const backText = mountEl.querySelector('#globe-back-text');
    const planetTitle = mountEl.querySelector('#globe-planet-title');
    const startPage = mountEl.querySelector('#start-page');
    const startPeople = mountEl.querySelector('#start-people');
    const homeEl = mountEl.querySelector('.globe-home');
    const tintEl = mountEl.querySelector('#globe-tint');

    // ---- Renderer / scene ------------------------------------------------
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 400);
    camera.up.set(0, 0, -1); // screen up is world -z (looking straight down)
    camera.position.set(0, 30, 0);

    scene.add(new THREE.HemisphereLight(0xfff6e0, hexNum(THEME.ai700), 1.25));
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.9);
    keyLight.position.set(-3, 6, -2.5); // upper left of the screen
    scene.add(keyLight);
    const rim = new THREE.DirectionalLight(hexNum(THEME.kin300), 1.1);
    rim.position.set(4, -2, 3);
    scene.add(rim);

    // Twinkling stars far below the orbit plane.
    const sparkles = [];
    {
        const rand = mulberry32(7);
        const colors = [0xffffff, hexNum(THEME.kin300)];
        for (let layer = 0; layer < 2; layer++) {
            const pts = [];
            for (let i = 0; i < 520; i++) pts.push((rand() * 2 - 1) * 70, -18 - rand() * 30, (rand() * 2 - 1) * 70);
            const g = new THREE.BufferGeometry();
            g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
            const m = new THREE.PointsMaterial({ color: colors[layer], size: 0.32, transparent: true, opacity: 0.8, depthWrite: false });
            const p = new THREE.Points(g, m);
            scene.add(p);
            sparkles.push(p);
        }
    }

    // ---- Systems: sun, orbits, galaxy tap area -----------------------------
    const orbitStripe = makeStripeTexture(THEME.kin100, THEME.kin500);
    const systems = SYSTEM_LAYOUTS.map((layout) => {
        const sp = starPalette(comboFor(layout.system));
        const group = new THREE.Group();
        group.position.set(layout.centre.x, 0, layout.centre.z);
        scene.add(group);
        const sunMat = new THREE.MeshBasicMaterial({ map: makeStripeTexture(sp.stripeA, sp.stripeB) });
        sunMat.map.repeat.set(6, 3);
        const sun = new THREE.Mesh(new THREE.SphereGeometry(SUN_RADIUS, 48, 32), sunMat);
        group.add(sun);
        const glow = makeGlowSprite(sp.glow);
        glow.scale.set(SUN_RADIUS * 5.5, SUN_RADIUS * 5.5, 1);
        group.add(glow);
        const orbits = layout.planets.map((p) => {
            const ring = makeOrbitRing(p.orbitR, orbitStripe);
            group.add(ring);
            return ring;
        });
        // Big invisible disc: the whole system is a tap target in the galaxy view.
        const hit = new THREE.Mesh(new THREE.CircleGeometry(layout.extent * 1.05, 32), new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide }));
        hit.rotation.x = -Math.PI / 2;
        hit.userData = { kind: 'system', system: layout.index };
        group.add(hit);
        const label = document.createElement('button');
        label.type = 'button';
        label.className = 'globe-system-label';
        label.addEventListener('click', (e) => {
            e.stopPropagation();
            onSystemTapped(layout.index);
        });
        labelLayer.appendChild(label);
        return { layout, palette: sp, group, sun, sunMat, glow, orbits, hit, label, status: null, cam: null };
    });

    // Star lanes between the systems on the galaxy map.
    const lanes = [];
    for (let i = 0; i < systems.length - 1; i++) {
        const a = systems[i].layout.centre;
        const b = systems[i + 1].layout.centre;
        const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(a.x, -0.05, a.z), new THREE.Vector3(b.x, -0.05, b.z)]);
        const line = new THREE.Line(geo, new THREE.LineDashedMaterial({ color: hexNum(THEME.kin300), dashSize: 0.5, gapSize: 0.35, transparent: true, opacity: 0.55 }));
        line.computeLineDistances();
        scene.add(line);
        lanes.push(line);
    }

    // ---- Planets -----------------------------------------------------------
    // Each planet: an orbit group (position on the orbit) holding a tilt
    // group (front faces up), a scaled group (unit planet scaled to its
    // radius) and a `world` child that spins to face a level.
    const pickables = [];
    const tmpV = new THREE.Vector3();
    const tmpC = new THREE.Vector3();
    const v3 = (p) => new THREE.Vector3(p.x, p.y, p.z);
    const PER_LEG = 22;
    const brightStripe = makeStripeTexture('#ffffff', THEME.kin500);
    const paleStripe = makeStripeTexture(THEME.ai100, THEME.ai400);

    const planets = PLANETS.map((def, pi) => {
        const pal = planetPalette(comboFor(def.def));
        const orbitGroup = new THREE.Group();
        scene.add(orbitGroup);
        const tilt = new THREE.Group();
        tilt.rotation.x = -Math.PI / 2;
        orbitGroup.add(tilt);
        const scaled = new THREE.Group();
        scaled.scale.setScalar(def.radius);
        tilt.add(scaled);
        const world = new THREE.Group();
        scaled.add(world);
        const globe = new THREE.Mesh(
            new THREE.SphereGeometry(GLOBE_RADIUS, 64, 48),
            new THREE.MeshPhysicalMaterial({
                map: makeWorldTexture({ combo: comboFor(def.def), seed: seedOf(def.def.id), index: pi }),
                roughness: 0.42,
                clearcoat: 1,
                clearcoatRoughness: 0.18,
            })
        );
        world.add(globe);
        const atmosphere = new THREE.Mesh(new THREE.SphereGeometry(GLOBE_RADIUS * 1.16, 48, 32), atmosphereMaterial(pal.glow));
        scaled.add(atmosphere);

        // Big invisible ball so planets are easy to tap: at least 0.5 world
        // units across the radius, about 44 px on a 390 px phone.
        const hitR = Math.max(1.5, 0.5 / def.radius);
        const hit = new THREE.Mesh(new THREE.SphereGeometry(GLOBE_RADIUS * hitR, 12, 12), new THREE.MeshBasicMaterial({ visible: false }));
        hit.userData = { kind: 'planet', planet: pi };
        scaled.add(hit);

        // Pulsing ring around the planet with the next mission (faces the camera).
        const halo = new THREE.Mesh(
            new THREE.RingGeometry(1.32, 1.45, 64),
            new THREE.MeshBasicMaterial({ color: hexNum(THEME.kin300), transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false })
        );
        scaled.add(halo);

        const label = document.createElement('button');
        label.type = 'button';
        label.className = 'globe-planet-label';
        label.addEventListener('click', (e) => {
            e.stopPropagation();
            onPlanetTapped(pi);
        });
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
            palette: pal,
            index: pi,
            systemIndex: def.systemIndex,
            radius: def.radius,
            orbitGroup,
            scaled,
            world,
            globe,
            atmosphere,
            hit,
            halo,
            label,
            levelIdx,
            stops,
            pathPoints: stops.length > 1 ? windingPath(stops, { perLeg: PER_LEG, wiggle: 0.05, radius: 1.008 }).map(v3) : [],
            doneTube: null,
            todoTube: null,
            status: null,
            spin: { from: { x: 0, y: 0 }, to: { x: 0, y: 0 }, start: 0, dur: 0 },
        };
    });

    function planetOfLevelIndex(i) {
        return planets.findIndex((p) => p.levelIdx.includes(i));
    }

    // Orbit clock: runs in the galaxy and system views, holds still while
    // flown down to a planet so it never slides away.
    let orbitT = 0;
    function placePlanets() {
        const ang = orbitAngle(orbitT);
        for (const p of planets) {
            const layout = SYSTEM_LAYOUTS[p.systemIndex];
            const pos = orbitPosition(p.def, ang, layout.centre);
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
                new THREE.TubeGeometry(curve, Math.max(8, pts.length * 3), 0.02, 10, false),
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

    // Level stops are small Japanese buildings (item 19, src/ui/buildings.js):
    // one merged geometry per building type and role, shared by every stop.
    const ringGeo = new THREE.RingGeometry(0.1, 0.12, 40);
    const buildingGeoCache = new Map();
    function partGeometry(part) {
        let g;
        if (part.shape === 'box') g = new THREE.BoxGeometry(...part.size);
        else if (part.shape === 'roof' && part.straight) g = new THREE.CylinderGeometry(part.top * Math.SQRT2, part.bottom * Math.SQRT2, part.h, 4, 1, false, Math.PI / 4);
        else if (part.shape === 'roof') {
            // Curved roof with swept-up corners (round 23).
            const { positions, indices } = roofSurface(part);
            g = new THREE.BufferGeometry();
            g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
            g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array((positions.length / 3) * 2).fill(0), 2));
            g.setIndex(indices);
            g.computeVertexNormals();
        } else if (part.shape === 'beam') {
            const [w, h, d] = part.size;
            g = new THREE.BoxGeometry(w, h, d, 12, 1, 1);
            const pos = g.attributes.position;
            for (let i = 0; i < pos.count; i++) pos.setY(i, pos.getY(i) + beamLift(pos.getX(i), w, part.bend));
            g.computeVertexNormals();
        } else g = new THREE.CylinderGeometry(part.r, part.r, part.h, 8);
        g.translate(...part.pos);
        return g;
    }
    function buildingGeometries(type) {
        if (!buildingGeoCache.has(type)) {
            const byRole = {};
            for (const part of buildingParts(type)) (byRole[part.role] ||= []).push(partGeometry(part));
            const merged = {};
            for (const [role, geos] of Object.entries(byRole)) {
                merged[role] = mergeGeometries(geos.map((g) => (g.index ? g.toNonIndexed() : g)));
                geos.forEach((g) => g.dispose());
            }
            buildingGeoCache.set(type, merged);
        }
        return buildingGeoCache.get(type);
    }
    const BUILDING_WALL = hexNum(THEME.washi);
    const BUILDING_TRIM = hexNum(THEME.shu);
    const BUILDING_STONE = 0x8d8778;
    const BUILDING_DARK = hexNum(THEME.ai900);
    const shadowGeo = new THREE.CircleGeometry(0.15, 32);
    const shadowMat = new THREE.MeshBasicMaterial({ color: hexNum(THEME.ai900), transparent: true, opacity: 0.5, depthWrite: false });

    function markerColor(m) {
        if (!m.unlocked) return LOCKED_COLOR;
        if (m.done) return COMPLETED_COLOR;
        return planets[m.planet].palette.button;
    }

    // Stand a group on the planet surface at a unit vector, local +y outward.
    function standOn(grp, stop) {
        const anchor = v3(stop).multiplyScalar(GLOBE_RADIUS);
        grp.position.copy(anchor);
        grp.quaternion.setFromUnitVectors(UP, anchor.clone().normalize());
    }

    function makeLevelMarker(level, index) {
        const pi = planetOfLevelIndex(index);
        const planet = planets[pi];
        const local = planet.levelIdx.indexOf(index);
        const stop = planet.stops[local];
        const grp = new THREE.Group();
        standOn(grp, stop);

        const building = buildingFor(level);
        const body = new THREE.Group();
        const mats = {};
        for (const [role, geo] of Object.entries(buildingGeometries(building))) {
            const mat = role === 'roof'
                ? new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.1, side: THREE.DoubleSide })
                : role === 'gold'
                  ? new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3, metalness: 0.3 })
                  : new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: role === 'stone' ? 0.8 : 0.5 });
            mats[role] = mat;
            body.add(new THREE.Mesh(geo, mat));
        }
        const mat = mats.roof;
        grp.add(body);

        // Soft ground shadow, so a building stands out from busy enamel.
        const shadow = new THREE.Mesh(shadowGeo, shadowMat);
        shadow.rotation.x = -Math.PI / 2;
        shadow.position.y = 0.003;
        grp.add(shadow);

        const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.004;
        grp.add(ring);

        // Tap area: 0.15 of the planet radius, about 54 px across in the
        // planet view on a 390 px phone.
        const hit = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 8), new THREE.MeshBasicMaterial({ visible: false }));
        hit.userData = { kind: 'level', levelId: level.id };
        grp.add(hit);
        pickables.push(hit);

        const label = addLabel('', '');
        const marker = { kind: 'level', index, local, planet: pi, stop, level, building, grp, body, mat, mats, ring, label, unlocked: false, done: false, squishAt: -1 };
        state.levelMarkers.push(marker);
        planet.world.add(grp);
        return marker;
    }

    function paintLevelMarker(m) {
        const rec = levelRecord(state.save, m.level.id);
        m.unlocked = isLevelUnlocked(state.save, LEVELS, REGIONS, m.level.id);
        m.done = rec.completed;
        const current = m.index === state.nextIndex && m.unlocked && !m.done;
        const colors = buildingColors({
            unlocked: m.unlocked,
            done: m.done,
            current,
            button: markerColor(m),
            gold: hexNum(THEME.kin600),
            locked: LOCKED_COLOR,
            wall: BUILDING_WALL,
            trim: BUILDING_TRIM,
            stone: BUILDING_STONE,
            dark: BUILDING_DARK,
            finial: hexNum(THEME.kin400),
        });
        for (const [role, mat] of Object.entries(m.mats)) {
            mat.color.setHex(colors[role]);
            if (colors.dim) mat.color.multiplyScalar(0.72);
            mat.emissive.setHex(colors[role]);
            mat.emissiveIntensity = role === 'roof' || role === 'trim' || role === 'gold' ? colors.glow : 0;
        }
        m.label.innerHTML = levelLabelHtml(m.index, { unlocked: m.unlocked, completed: m.done, stars: rec.stars });
        m.label.dataset.w = '';
        m.label.classList.toggle('locked', !m.unlocked);
        m.label.classList.toggle('current', m.index === state.nextIndex && m.unlocked && !m.done);
    }

    function paintPlanet(p) {
        p.status = planetStatus(state.save, LEVELS, REGIONS, p.def);
        const st = p.status;
        const lock = st.unlocked ? '' : `<span class="globe-label-lock" aria-label="Locked">${LOCK_SVG}</span>`;
        p.label.innerHTML = `<span class="globe-planet-name">${p.def.name}</span>` +
            (st.unlocked ? `<span class="globe-planet-stars">&#9733; ${st.stars}/${st.maxStars}</span>` : lock);
        p.label.setAttribute('aria-label', `${p.def.name}${st.unlocked ? `, ${st.stars} of ${st.maxStars} stars` : ', locked'}`);
        p.label.classList.toggle('locked', !st.unlocked);
        p.label.dataset.w = '';
        // Locked planets look frosted (paler) until you reach them.
        p.globe.material.color.setHex(st.unlocked ? 0xffffff : 0xb9c1d2);
    }

    function paintSystem(s) {
        s.status = systemStatus(state.save, LEVELS, REGIONS, s.layout);
        const st = s.status;
        // Locked: show what is missing, the stars or the planet before it.
        const firstPlanet = PLANETS.findIndex((p) => p.systemIndex === s.layout.index);
        const before = firstPlanet > 0 ? PLANETS[firstPlanet - 1].name : '';
        const missing = st.have < st.need ? `${st.need} stars` : `Beat ${before}`;
        const detail = st.unlocked
            ? `<span class="globe-system-stars">&#9733; ${st.stars}/${st.maxStars}</span>`
            : `<span class="globe-system-need">${LOCK_SVG} ${missing}</span>`;
        s.label.innerHTML = `<span class="globe-system-name">${s.layout.system.name}</span>${detail}`;
        s.label.setAttribute('aria-label', `${s.layout.system.name}${st.unlocked ? `, ${st.stars} of ${st.maxStars} stars` : `, locked: ${missing}`}`);
        s.label.classList.toggle('locked', !st.unlocked);
        s.label.dataset.w = '';
        s.sunMat.color.setHex(st.unlocked ? 0xffffff : 0x7d889f);
        s.glow.material.opacity = st.unlocked ? 1 : 0.35;
    }

    // Prize box: a wrapped gift with a ribbon and bow, on its planet's road.
    function makeChestMarker(chest) {
        const pi = planetOfLevelIndex(chest.afterLevelIndex);
        if (pi < 0) return null;
        const planet = planets[pi];
        const local = planet.levelIdx.indexOf(chest.afterLevelIndex);
        const stop = chestStop(planet.stops, local);
        const grp = new THREE.Group();
        standOn(grp, stop);

        const wrap = new THREE.MeshPhysicalMaterial({ color: hexNum(THEME.ai600), roughness: 0.3, clearcoat: 1 });
        const ribbonMat = new THREE.MeshPhysicalMaterial({ color: hexNum(THEME.kin400), roughness: 0.2, metalness: 0.35, clearcoat: 1 });
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
        gift.scale.setScalar(1.1);
        grp.add(gift);

        const glow = makeGlowSprite('#f3d27a');
        glow.scale.set(0.36, 0.36, 1);
        glow.position.y = 0.06;
        grp.add(glow);

        const hit = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 8), new THREE.MeshBasicMaterial({ visible: false }));
        hit.position.y = 0.05;
        hit.userData = { kind: 'chest', chestId: chest.id };
        grp.add(hit);
        pickables.push(hit);
        planet.world.add(grp);

        const label = addLabel('<span class="globe-label-chest">Prize box</span>', 'chest-label');
        const marker = { kind: 'chest', chest, planet: pi, grp, gift, lidGroup, wrap, glow, label, chestState: 'locked', squishAt: -1 };
        // The "Open me!" tag floats above the box; tapping it opens the box too.
        label.addEventListener('click', (e) => {
            e.stopPropagation();
            onChestTapped(marker);
        });
        state.chestMarkers.push(marker);
        return marker;
    }

    function setChestVisual(marker, chestState) {
        marker.chestState = chestState;
        const col = chestState === 'locked' ? 0x9aa6bf : chestState === 'opened' ? hexNum(THEME.ai200) : hexNum(THEME.ai600);
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
        const colors = CONFETTI;
        const origin = new THREE.Vector3();
        at.getWorldPosition(origin);
        const centre = new THREE.Vector3();
        planets[state.planet].orbitGroup.getWorldPosition(centre);
        const out = origin.clone().sub(centre).normalize();
        const scale = planets[state.planet].radius / 0.55;
        const pieces = [];
        for (let i = 0; i < count; i++) {
            const m = new THREE.Mesh(confettiGeo, new THREE.MeshBasicMaterial({ color: colors[i % colors.length], transparent: true }));
            m.position.copy(origin);
            m.scale.setScalar(scale);
            const v = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5)
                .multiplyScalar(0.02)
                .addScaledVector(out, 0.018 + Math.random() * 0.015)
                .multiplyScalar(scale);
            m.userData = { v, spin: new THREE.Vector3(Math.random(), Math.random(), Math.random()).multiplyScalar(0.4) };
            scene.add(m);
            pieces.push(m);
        }
        bursts.push({ pieces, start: performance.now(), scale });
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
        const planet = planets[marker.planet];
        const title = `Level ${marker.index + 1}: ${level.name}`;
        if (!unlocked) {
            openSheet({ title, sub: 'Locked', desc: lockReason(state.save, LEVELS, REGIONS, level.id) || 'Locked.', actionLabel: null });
            return;
        }
        openSheet({
            title,
            sub: `${planet.def.name}, mission ${marker.local + 1} of ${planet.levelIdx.length}`,
            desc: done ? `${level.blurb} Best: ${starRow(rec.stars)}` : level.blurb,
            actionLabel: done ? 'Play again' : 'Play',
            onAction: () => {
                closeSheet();
                if (onPlayLevel) onPlayLevel(level.id);
            },
        });
    }

    function showLockedPlanetSheet(p) {
        openSheet({
            title: `Planet ${p.def.name}`,
            sub: `${SYSTEM_LAYOUTS[p.systemIndex].system.name}: locked`,
            desc: `${p.def.def.tagline ? p.def.def.tagline + ' ' : ''}${p.status?.reason || 'Beat the planet before it to fly here.'}`,
            actionLabel: 'Take a look',
            onAction: () => {
                closeSheet();
                flyToPlanet(p.index);
            },
        });
    }

    function showLockedSystemSheet(s) {
        openSheet({
            title: s.layout.system.name,
            sub: 'Locked',
            desc: `${s.layout.system.tagline} ${s.status?.reason || ''}`.trim(),
            actionLabel: 'Take a look',
            onAction: () => {
                closeSheet();
                flyToSystem(s.layout.index);
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
            openSheet({ title: 'Prize box', sub: 'Already opened', desc: `This box is empty. ${contains.replace('Contains', 'It held')}`, actionLabel: null });
            return;
        }
        openSheet({ title: 'Prize box', sub: 'Ready to open', desc: contains, actionLabel: 'Open it', onAction: () => handleChestOpen(marker) });
    }

    function onChestTapped(marker) {
        marker.squishAt = performance.now();
        chestOpenState(marker.chest).then((st) => {
            if (st === 'openable') handleChestOpen(marker);
            else showChestSheet(marker);
        });
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
        marker.squishAt = performance.now();
        confetti(marker.gift, 60);
        state.save = loadSave(createStorage());
        refreshHUD();
        closeSheet();
        showNotification(`Prize box opened: ${givesText(loot)}!`, 'success');
    }

    // ---- Camera flights ------------------------------------------------------
    // One tween moves the camera position and what it looks at. Every
    // camera spot is straight above what it looks at, so a flight keeps
    // looking straight down and orbits stay circles all the way.
    const flight = { fromPos: new THREE.Vector3(), toPos: new THREE.Vector3(), fromLook: new THREE.Vector3(), toLook: new THREE.Vector3(), start: 0, dur: 0, arc: 0 };
    const look = new THREE.Vector3(); // where the camera is looking right now
    let galaxyCam = null;

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
        // Long hops between systems rise up a little in the middle.
        const hop = flight.fromLook.distanceTo(flight.toLook);
        flight.arc = hop > 6 ? Math.min(14, hop * 0.5) : 0;
    }

    function planetFitDistance(pi) {
        return globeFitDistance({ radius: 1.06 * planets[pi].radius, fovDeg: camera.fov, aspect: camera.aspect, margin: 1.0 });
    }

    // Item 23: seen from a tilted angle (globe-math.js tiltedOffset), not
    // straight down, so buildings show their walls.
    function planetCameraSpot(pi) {
        const c = planetCentre(pi);
        const o = tiltedOffset(planetFitDistance(pi));
        const aim = c.clone().add(new THREE.Vector3(0, 0, -PLANET_VIEW_AIM_UP * planets[pi].radius));
        return { pos: aim.clone().add(new THREE.Vector3(o.x, o.y, o.z)), look: aim };
    }

    function flyToPlanet(pi, { focusIndex = null, dur = 1100 } = {}) {
        const p = planets[pi];
        state.mode = 'planet';
        state.planet = pi;
        state.system = p.systemIndex;
        spinPlanet(p, facingStop(p, focusIndex), dur * 0.8);
        controls.enabled = false;
        userTurning = false;
        const spot = planetCameraSpot(pi);
        startFlight(spot.pos, spot.look, dur);
        updateChrome();
    }

    function flyToSystem(si, dur = 1000) {
        state.mode = 'system';
        state.system = si;
        controls.enabled = false;
        userTurning = false;
        const sc = systems[si].cam;
        startFlight(v3(sc.position), v3(sc.target), dur);
        closeSheet();
        updateChrome();
    }

    function flyToGalaxy(dur = 1100) {
        state.mode = 'galaxy';
        controls.enabled = false;
        userTurning = false;
        startFlight(v3(galaxyCam.position), v3(galaxyCam.target), dur);
        closeSheet();
        updateChrome();
    }

    // What to turn toward you: the middle of the planet's face, nudged a
    // little toward the chosen level, so the whole road stays on screen.
    const FACE_CENTRE = latLngToXYZ(-3, -90, 1);
    function facingStop(p, levelIndex) {
        const local = levelIndex != null ? p.levelIdx.indexOf(levelIndex) : -1;
        if (local < 0) return FACE_CENTRE;
        return slerp(FACE_CENTRE, p.stops[local], 0.12);
    }

    // Spin one planet so a surface point faces you.
    function spinPlanet(p, stop, dur = 900) {
        const target = faceRotation(stop, 0.7);
        p.spin.from = { x: p.world.rotation.x, y: p.world.rotation.y };
        p.spin.to = { x: target.x, y: p.world.rotation.y + angleDelta(p.world.rotation.y, target.y) };
        p.spin.start = performance.now();
        p.spin.dur = reduceMotion ? 1 : dur;
    }

    // Planet view: spin to a level and re-centre the camera above.
    function focusOn(levelIndex, dur = 900) {
        const pi = planetOfLevelIndex(levelIndex);
        if (pi < 0) return;
        if (state.mode !== 'planet' || state.planet !== pi) {
            flyToPlanet(pi, { focusIndex: levelIndex, dur: Math.max(dur, 900) });
            return;
        }
        const p = planets[pi];
        spinPlanet(p, facingStop(p, levelIndex), dur);
        controls.enabled = false;
        userTurning = false;
        const spot = planetCameraSpot(pi);
        startFlight(spot.pos, spot.look, dur);
    }

    // ---- Start page ----------------------------------------------------------
    // The planet sits in the lower middle with room above it for the title
    // and the bouncing crowd standing on its top edge.
    function titleFrame() {
        const c = planetCentre(state.planet);
        const r = planets[state.planet].radius;
        const lookAt = c.clone().add(new THREE.Vector3(0, 0, -r * 0.55)); // screen up is -z
        const pos = lookAt.clone().add(new THREE.Vector3(0, planetFitDistance(state.planet) * 1.35, 0));
        return { pos, lookAt };
    }
    function placeTitleCamera() {
        const { pos, lookAt } = titleFrame();
        camera.position.copy(pos);
        look.copy(lookAt);
        camera.lookAt(look);
    }
    function enterTitle() {
        const pi = planetOfLevelIndex(state.nextIndex);
        state.mode = 'title';
        state.planet = pi >= 0 ? pi : 0;
        state.system = planets[state.planet].systemIndex;
        spinPlanet(planets[state.planet], FACE_CENTRE, 1);
        controls.enabled = false;
        placePlanets();
        placeTitleCamera();
        updateChrome();
    }
    // The planet's outline on screen, in CSS pixels, for pinning the people.
    function titleCircle() {
        const c = planetCentre(state.planet, new THREE.Vector3());
        const vw = renderer.domElement.clientWidth;
        const vh = renderer.domElement.clientHeight;
        tmpV.copy(c).project(camera);
        if (tmpV.z > 1) return null;
        const d = c.distanceTo(camera.position);
        const r = (planets[state.planet].radius / (d * Math.tan((camera.fov * Math.PI) / 360))) * (vh / 2);
        return { cx: (tmpV.x * 0.5 + 0.5) * vw, cy: (-tmpV.y * 0.5 + 0.5) * vh, r };
    }
    function leaveTitle() {
        if (state.mode !== 'title') return;
        startPage.classList.add('leaving');
        homeEl.classList.remove('on-start');
        flyToSystem(state.system, 1400);
        setTimeout(() => {
            startPage.hidden = true;
            startPage.classList.remove('leaving');
        }, 520);
    }
    mountEl.querySelector('#start-play').addEventListener('click', leaveTitle);
    bindPeopleTaps(startPeople);

    function updateChrome() {
        const mode = state.mode;
        const inPlanet = mode === 'planet';
        const inSystem = mode === 'system';
        backBtn.hidden = !(inPlanet || inSystem);
        planetTitle.hidden = !(inPlanet || inSystem);
        homeEl.classList.toggle('in-planet', inPlanet || inSystem);
        homeEl.dataset.mode = mode;
        const layout = SYSTEM_LAYOUTS[state.system];
        if (inPlanet) {
            const p = planets[state.planet];
            planetTitle.innerHTML = `<span class="globe-planet-title-name">${p.def.name}</span><span class="globe-planet-title-region">${layout.system.name}</span>`;
            backText.textContent = 'Planets';
            backBtn.setAttribute('aria-label', `Back to the planets of ${layout.system.name}`);
        } else if (inSystem) {
            planetTitle.innerHTML = `<span class="globe-planet-title-name">${layout.system.name}</span><span class="globe-planet-title-region">${layout.planets.length} inhabited planets</span>`;
            backText.textContent = 'Galaxy';
            backBtn.setAttribute('aria-label', 'Back to the galaxy');
        }
        // The sky takes the tint of the system you are in.
        tintEl.style.setProperty('--tint', systems[state.system].palette.sky);
        tintEl.classList.toggle('on', mode !== 'galaxy');
    }
    backBtn.addEventListener('click', () => {
        if (state.mode === 'planet') flyToSystem(state.system);
        else if (state.mode === 'system') flyToGalaxy();
    });

    // ---- Taps -------------------------------------------------------------------
    function onSystemTapped(si) {
        if (state.mode !== 'galaxy') return;
        const s = systems[si];
        if (s.status && !s.status.unlocked) {
            showLockedSystemSheet(s);
            return;
        }
        closeSheet();
        flyToSystem(si);
    }

    function onPlanetTapped(pi) {
        if (state.mode !== 'system') return;
        const p = planets[pi];
        if (p.systemIndex !== state.system) return;
        if (p.status && !p.status.unlocked) {
            showLockedPlanetSheet(p);
            return;
        }
        closeSheet();
        const next = p.levelIdx.includes(state.nextIndex) ? state.nextIndex : null;
        flyToPlanet(p.index, { focusIndex: next });
    }

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
        if (state.mode === 'title' || flight.dur > 0) return;
        const moved = Math.hypot(e.clientX - downX, e.clientY - downY);
        if (moved > 10 || performance.now() - downT > 600) return; // a drag
        const rect = canvas.getBoundingClientRect();
        pointerNDC.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        pointerNDC.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(pointerNDC, camera);

        if (state.mode === 'galaxy') {
            const hits = raycaster.intersectObjects(systems.map((s) => s.hit), false);
            if (hits.length) onSystemTapped(hits[0].object.userData.system);
            else closeSheet();
            return;
        }

        if (state.mode === 'system') {
            const inSystem = planets.filter((p) => p.systemIndex === state.system).map((p) => p.hit);
            const hits = raycaster.intersectObjects(inSystem, false);
            if (hits.length) onPlanetTapped(hits[0].object.userData.planet);
            else closeSheet();
            return;
        }

        const centre = planetCentre(state.planet, new THREE.Vector3());
        const onPlanet = pickables.filter((h) => {
            const m = h.userData.kind === 'level'
                ? state.levelMarkers.find((x) => x.level.id === h.userData.levelId)
                : state.chestMarkers.find((x) => x.chest.id === h.userData.chestId);
            return m && m.planet === state.planet;
        });
        const hits = raycaster.intersectObjects(onPlanet, false).filter((h) => {
            // Ignore markers on the far side of the planet.
            h.object.getWorldPosition(tmpV);
            return facesCamera(tmpV, centre, camera.position);
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
                showLevelSheet(marker);
            }
        } else if (ud.kind === 'chest') {
            const marker = state.chestMarkers.find((m) => m.chest.id === ud.chestId);
            if (marker) onChestTapped(marker);
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

    // A prize box tapped on the award screen: fly to its planet, then open it.
    function openRequestedChest(chestId) {
        const dest = chestDestination(chestId, { chests: CHESTS, levels: LEVELS, planets: PLANETS });
        if (!dest) return false;
        const marker = state.chestMarkers.find((m) => m.chest.id === chestId);
        if (!marker) return false;
        homeEl.classList.remove('on-start');
        startPage.hidden = true;
        const dur = 1300;
        flyToPlanet(dest.planetIndex, { focusIndex: dest.levelIndex, dur });
        setTimeout(() => handleChestOpen(marker), (reduceMotion ? 0 : dur) + 250);
        return true;
    }

    function refresh() {
        state.save = loadSave(createStorage());
        refreshHUD();
        const prevNext = state.nextIndex;
        const prevPlanet = planetOfLevelIndex(prevNext);
        state.nextIndex = findNextIndex();
        for (const p of planets) paintPlanet(p);
        for (const s of systems) paintSystem(s);
        for (const m of state.levelMarkers) paintLevelMarker(m);
        for (const p of planets) buildPath(p);
        refreshChests();
        const next = state.levelMarkers[state.nextIndex];
        playBtn.textContent = next && next.done ? `Play level ${state.nextIndex + 1} again` : `Play level ${state.nextIndex + 1}`;
        const nextPlanet = planetOfLevelIndex(state.nextIndex);
        const chestId = refresh.ran ? takeChestRequest() : null;
        if (!refresh.ran) {
            // App launch: the start page, on the planet with the next mission.
            enterTitle();
        } else if (chestId && openRequestedChest(chestId)) {
            // Handled: flying to the prize box.
        } else if (prevNext !== state.nextIndex) {
            if (nextPlanet !== prevPlanet) {
                const newSystem = planets[nextPlanet].systemIndex !== planets[prevPlanet].systemIndex;
                const where = newSystem ? `New star system: ${SYSTEM_LAYOUTS[planets[nextPlanet].systemIndex].system.name}!` : `New planet unlocked: ${planets[nextPlanet].def.name}!`;
                showNotification(where, 'success');
                flyToPlanet(nextPlanet, { focusIndex: state.nextIndex, dur: newSystem ? 2200 : 1600 });
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
        for (const s of systems) s.cam = systemCamera({ fovDeg: camera.fov, aspect: camera.aspect, layout: s.layout });
        galaxyCam = galaxyCamera({ fovDeg: camera.fov, aspect: camera.aspect });
        controls.minDistance = planetFitDistance(state.planet) * 0.6;
        controls.maxDistance = planetFitDistance(state.planet) * 1.4;
        if (flight.dur === 0) {
            if (state.mode === 'system') {
                const sc = systems[state.system].cam;
                camera.position.copy(v3(sc.position));
                look.copy(v3(sc.target));
                camera.lookAt(look);
            } else if (state.mode === 'galaxy') {
                camera.position.copy(v3(galaxyCam.position));
                look.copy(v3(galaxyCam.target));
                camera.lookAt(look);
            } else if (state.mode === 'title') placeTitleCamera();
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

        // Planets orbit in the galaxy and system views, never while flying
        // or flown down to one, so a planet holds still under the camera.
        const overview = state.mode === 'system' || state.mode === 'galaxy';
        if (overview && !reduceMotion && flight.dur === 0) {
            orbitT += dt;
            placePlanets();
        }

        const nextPlanet = planetOfLevelIndex(state.nextIndex);
        for (const p of planets) {
            if (p.spin.dur > 0) {
                const k = Math.min(1, (now - p.spin.start) / p.spin.dur);
                const e = ease(k);
                p.world.rotation.x = p.spin.from.x + (p.spin.to.x - p.spin.from.x) * e;
                p.world.rotation.y = p.spin.from.y + (p.spin.to.y - p.spin.from.y) * e;
                if (k >= 1) p.spin.dur = 0;
            } else if (!reduceMotion && !(state.mode === 'planet' && state.planet === p.index)) {
                // Idle: planets turn slowly while you look at the system.
                p.world.rotation.y += overview ? dt * 0.15 : state.mode === 'title' ? dt * 0.12 : 0;
            }
            // The planet with the next mission wears a pulsing gold ring.
            const isNext = p.index === nextPlanet && state.mode === 'system';
            p.halo.material.opacity = isNext && !reduceMotion ? 0.55 + 0.35 * Math.sin(t * 3) : isNext ? 0.7 : 0;
        }
        for (const s of systems) {
            s.sun.rotation.y += dt * 0.2;
            const showOrbits = overview || flight.dur > 0;
            for (const o of s.orbits) o.visible = showOrbits;
        }
        for (const l of lanes) l.visible = state.mode === 'galaxy' || flight.dur > 0;

        // Camera flight.
        if (flight.dur > 0) {
            const k = Math.min(1, (now - flight.start) / flight.dur);
            const e = ease(k);
            camera.position.lerpVectors(flight.fromPos, flight.toPos, e);
            look.lerpVectors(flight.fromLook, flight.toLook, e);
            camera.position.y += Math.sin(k * Math.PI) * flight.arc;
            camera.lookAt(look);
            if (k >= 1) {
                flight.dur = 0;
                if (state.mode === 'planet') {
                    controls.target.copy(look);
                    controls.minDistance = planetFitDistance(state.planet) * 0.6;
                    controls.maxDistance = planetFitDistance(state.planet) * 1.4;
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
            if (m.planet !== state.planet) continue;
            const current = m.index === state.nextIndex && m.unlocked && !m.done;
            let sy = 1;
            let sxz = 1;
            let lift = 0;
            if (current && !reduceMotion) {
                const ph = (t * 2.2) % 1;
                lift = Math.max(0, Math.sin(ph * Math.PI)) * 0.035;
                const squash = ph < 0.08 || ph > 0.92 ? 0.82 : 1.06;
                sy = squash;
                sxz = 1 / Math.sqrt(squash);
                m.ring.material.opacity = 0.7 * (1 - ((t * 0.9) % 1));
                m.ring.scale.setScalar(1 + ((t * 0.9) % 1) * 1.2);
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
            leanTowardViewer(m);
        }
        // Prize boxes wobble when ready, pop when tapped.
        for (const m of state.chestMarkers) {
            if (m.planet !== state.planet) continue;
            const ready = m.chestState === 'openable';
            m.gift.rotation.y = ready && !reduceMotion ? Math.sin(t * 6) * 0.18 * (Math.sin(t * 1.5) > 0.3 ? 1 : 0.15) : 0;
            m.gift.position.y = ready && !reduceMotion ? Math.abs(Math.sin(t * 3)) * 0.02 : 0;
            if (m.glow.visible) m.glow.material.opacity = 0.6 + 0.4 * Math.sin(t * 4);
            if (m.squishAt > 0) {
                const k = (now - m.squishAt) / 350;
                const s = k < 1 ? 1 + Math.sin(k * Math.PI) * 0.25 : 1;
                m.gift.scale.setScalar(1.1 * s);
                if (k >= 1) m.squishAt = -1;
            }
        }
        // Stars twinkle.
        sparkles[0].material.opacity = 0.55 + 0.35 * Math.sin(t * 2.1);
        sparkles[1].material.opacity = 0.55 + 0.35 * Math.sin(t * 1.7 + 1.5);

        // Confetti bursts.
        for (let i = bursts.length - 1; i >= 0; i--) {
            const b = bursts[i];
            const age = (now - b.start) / 1400;
            for (const p of b.pieces) {
                p.position.add(p.userData.v);
                p.userData.v.multiplyScalar(0.95);
                p.userData.v.z += 0.0006 * b.scale; // falls toward the bottom of the screen
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
        if (state.mode === 'title' || startPage.classList.contains('leaving')) layoutPeople(startPeople, titleCircle());

        if (firstFrame) {
            firstFrame = false;
            const loading = mountEl.querySelector('#globe-loading');
            if (loading) {
                loading.classList.add('fade');
                setTimeout(() => loading.remove(), 600);
            }
        }
    }

    // Buildings turn their fronts to the viewer and stand up on the planet;
    // one seen almost head on tips back a little (buildings.js standingUp).
    const _lean = { up: new THREE.Vector3(), toCam: new THREE.Vector3(), n: new THREE.Vector3(), u: new THREE.Vector3(), f: new THREE.Vector3(), r: new THREE.Vector3(), m: new THREE.Matrix4(), q: new THREE.Quaternion(), gq: new THREE.Quaternion(), p: new THREE.Vector3() };
    function leanTowardViewer(m) {
        const L = _lean;
        m.grp.getWorldPosition(L.p);
        m.grp.getWorldQuaternion(L.gq);
        L.n.set(0, 1, 0).applyQuaternion(L.gq);
        L.toCam.copy(camera.position).sub(L.p).normalize();
        L.up.set(0, 1, 0).applyQuaternion(camera.quaternion);
        const u = standingUp(L.n, L.toCam, L.up);
        L.u.set(u.x, u.y, u.z);
        L.f.copy(L.toCam).addScaledVector(L.u, -L.toCam.dot(L.u));
        if (L.f.lengthSq() < 1e-6) L.f.set(0, 0, 1).applyQuaternion(L.gq);
        L.f.normalize();
        L.r.crossVectors(L.u, L.f).normalize();
        L.m.makeBasis(L.r, L.u, L.f);
        L.q.setFromRotationMatrix(L.m);
        m.body.quaternion.copy(L.gq.invert().multiply(L.q));
    }

    // HTML labels: system names in the galaxy view, planet names in a
    // system view, level numbers and prize boxes on the planet you flew to.
    function placeLabel(el, world, extraUp = 0) {
        tmpV.copy(world).project(camera);
        const vw = renderer.domElement.clientWidth;
        const vh = renderer.domElement.clientHeight;
        const x = (tmpV.x * 0.5 + 0.5) * vw;
        const y = (-tmpV.y * 0.5 + 0.5) * vh - extraUp;
        if (tmpV.z > 1 || x < 0 || x > vw || y < 0 || y > vh) return false;
        el.style.display = 'flex';
        if (!el.dataset.w) el.dataset.w = el.offsetWidth ? String(el.offsetWidth) : '';
        const cx = clampLabelX(x, Number(el.dataset.w) || 40, vw);
        el.style.transform = `translate(-50%, -125%) translate(${cx}px, ${y}px)`;
        return true;
    }

    function pxPerUnitAt(point) {
        const vh = renderer.domElement.clientHeight;
        const d = point.distanceTo(camera.position);
        return vh / 2 / (d * Math.tan((camera.fov * Math.PI) / 360));
    }

    const tmpTop = new THREE.Vector3();
    function projectLabels() {
        const flying = flight.dur > 0;
        const galaxyView = state.mode === 'galaxy' && !flying;
        const systemView = state.mode === 'system' && !flying;
        for (const s of systems) {
            if (!galaxyView) {
                s.label.style.display = 'none';
                continue;
            }
            s.group.getWorldPosition(tmpC);
            // Pin the label to the top edge of the system's outer orbit.
            const up = s.layout.extent * pxPerUnitAt(tmpC);
            if (!placeLabel(s.label, tmpC, up * 0.92)) s.label.style.display = 'none';
            s.label.classList.toggle('current', s.layout.index === planets[planetOfLevelIndex(state.nextIndex)].systemIndex);
        }
        for (const p of planets) {
            if (!systemView || p.systemIndex !== state.system) {
                p.label.style.display = 'none';
                continue;
            }
            p.orbitGroup.getWorldPosition(tmpC);
            const rPx = p.radius * pxPerUnitAt(tmpC);
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
            // Level labels sit on their building's ridge: project the ridge
            // (the building's top, after the lean) and lift by the gap.
            let lift = 0;
            if (m.building) {
                // 0.85: tuck under thin spires and finials, onto the roof itself.
                tmpTop.set(0, buildingExtent(m.building).height * 0.85, 0);
                m.body.localToWorld(tmpTop).project(camera);
                tmpV.copy(tmpC).project(camera);
                const vh = renderer.domElement.clientHeight;
                lift = labelLift((-tmpV.y * 0.5 + 0.5) * vh, (-tmpTop.y * 0.5 + 0.5) * vh);
            }
            if (!facing || !placeLabel(m.label, tmpC, lift)) m.label.style.display = 'none';
        }
    }

    LEVELS.forEach((level, i) => makeLevelMarker(level, i));
    CHESTS.forEach(makeChestMarker);
    refresh();
    animate();

    // Expose for playtests.
    mountEl.__globe = { focusOn, flyToPlanet, flyToSystem, flyToGalaxy, refresh, state, planets, systems, camera, leaveTitle, openRequestedChest };
    return { refresh };
}
