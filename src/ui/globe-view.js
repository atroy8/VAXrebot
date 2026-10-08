// 3D globe home/start screen: ambient rotating world, tappable level nodes,
// supply crate markers, candy HUD. Procedurally generated texture, fully
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

// Level marker positions (lat/lng, degrees), spread across the three regions.
const LEVEL_POSITIONS = [
    { lat: 35, lng: -100 }, // r1-care-home
    { lat: 28, lng: -88 }, // r1-elementary
    { lat: 22, lng: -75 }, // r1-old-town
    { lat: 45, lng: -45 }, // r2-festival
    { lat: 42, lng: -15 }, // r2-high-school
    { lat: 48, lng: 10 }, // r2-airport
    { lat: 10, lng: 45 }, // r3-metro
    { lat: -5, lng: 80 }, // r3-harbor
    { lat: -15, lng: 120 }, // r3-hub
];

const REGION_COLORS = {
    hometown: 0x4ade80,
    national: 0x60a5fa,
    global: 0xf472b6,
};
const LOCKED_COLOR = 0x64748b;
const COMPLETED_COLOR = 0xffd23f;

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

// Procedural stylized world texture: ocean gradient, soft landmass blobs,
// ice caps. Drawn locally on a canvas, no downloads.
function makeWorldTexture() {
    const w = 1024;
    const h = 512;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');

    const ocean = ctx.createLinearGradient(0, 0, 0, h);
    ocean.addColorStop(0, '#123a6d');
    ocean.addColorStop(0.5, '#1b5f9e');
    ocean.addColorStop(1, '#123a6d');
    ctx.fillStyle = ocean;
    ctx.fillRect(0, 0, w, h);

    const rand = mulberry32(20261008);
    // Landmass blobs: clustered arcs so continents feel clustered, not dots.
    for (let c = 0; c < 9; c++) {
        const cx = rand() * w;
        const cy = h * 0.18 + rand() * h * 0.64;
        const base = 40 + rand() * 70;
        for (let b = 0; b < 26; b++) {
            const ang = rand() * Math.PI * 2;
            const dist = rand() * base * 1.6;
            const r = base * (0.35 + rand() * 0.65);
            const x = cx + Math.cos(ang) * dist;
            const y = cy + Math.sin(ang) * dist * 0.7;
            const g = ctx.createRadialGradient(x, y, 0, x, y, r);
            g.addColorStop(0, '#3f9e5f');
            g.addColorStop(0.75, '#357e4f');
            g.addColorStop(1, 'rgba(53,126,79,0)');
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    // Ice caps.
    ctx.fillStyle = '#dfeefb';
    ctx.fillRect(0, 0, w, 18);
    ctx.fillRect(0, h - 26, w, 26);
    const topFade = ctx.createLinearGradient(0, 18, 0, 60);
    topFade.addColorStop(0, 'rgba(223,238,251,0.9)');
    topFade.addColorStop(1, 'rgba(223,238,251,0)');
    ctx.fillStyle = topFade;
    ctx.fillRect(0, 18, w, 42);
    const botFade = ctx.createLinearGradient(0, h - 26, 0, h - 68);
    botFade.addColorStop(0, 'rgba(223,238,251,0.9)');
    botFade.addColorStop(1, 'rgba(223,238,251,0)');
    ctx.fillStyle = botFade;
    ctx.fillRect(0, h - 68, w, 42);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
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
            glowColor: { value: new THREE.Color(0x4dabf7) },
            intensity: { value: 0.85 },
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
                float rim = pow(1.0 - abs(vNormal.z), 3.0);
                gl_FragColor = vec4(glowColor, rim * intensity);
            }`,
        side: THREE.BackSide,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
    });
}

function starRow(stars) {
    return '★'.repeat(stars) + '☆'.repeat(3 - stars);
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
        labels: [],
        levelMarkers: [],
        chestMarkers: [],
        selected: null,
        nextPlayableIndex: 0,
    };

    // ---- DOM shell -------------------------------------------------------
    mountEl.innerHTML = `
        <div class="globe-home">
            <div class="globe-loading" id="globe-loading">Loading the world...</div>
            <canvas class="globe-canvas" id="globe-canvas"></canvas>
            <div class="globe-labels" id="globe-labels"></div>
            <div class="globe-hud">
                <div class="globe-title">VAXrebot</div>
                <div class="globe-stats">
                    <span class="globe-stat" id="globe-hud-stars">0 stars</span>
                    <span class="globe-stat" id="globe-hud-funding">0 funding</span>
                    <span class="globe-stat" id="globe-hud-lives">0 lives saved</span>
                </div>
            </div>
            <div class="globe-sheet" id="globe-sheet" hidden>
                <button class="globe-sheet-close" id="globe-sheet-close" aria-label="Close">x</button>
                <h2 id="globe-sheet-title"></h2>
                <p class="globe-sheet-sub" id="globe-sheet-sub"></p>
                <p class="globe-sheet-desc" id="globe-sheet-desc"></p>
                <button class="globe-sheet-btn" id="globe-sheet-action" hidden></button>
            </div>
        </div>`;

    const canvas = mountEl.querySelector('#globe-canvas');
    const labelLayer = mountEl.querySelector('#globe-labels');
    const sheet = mountEl.querySelector('#globe-sheet');

    // ---- Renderer / scene ------------------------------------------------
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    camera.position.set(0, 0.4, 3.1);

    scene.add(new THREE.AmbientLight(0xffffff, 0.75));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(4, 2, 3);
    scene.add(sun);

    // Starfield backdrop.
    {
        const starGeo = new THREE.BufferGeometry();
        const pts = [];
        const rand = mulberry32(7);
        for (let i = 0; i < 700; i++) {
            const v = new THREE.Vector3(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1).normalize();
            pts.push(v.x * 40, v.y * 40, v.z * 40);
        }
        starGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
        scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xcfe4ff, size: 0.12 })));
    }

    const world = new THREE.Group();
    scene.add(world);

    const globe = new THREE.Mesh(
        new THREE.SphereGeometry(GLOBE_RADIUS, 48, 32),
        new THREE.MeshStandardMaterial({ map: makeWorldTexture(), roughness: 0.85, metalness: 0.05 })
    );
    world.add(globe);

    // Graticule dots on the surface for a stylized look.
    {
        const pts = [];
        for (let lat = -60; lat <= 60; lat += 15) {
            for (let lng = -180; lng < 180; lng += 15) {
                pts.push(...latLngToVec3(lat, lng, GLOBE_RADIUS * 1.004).toArray());
            }
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
        world.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 0.008, transparent: true, opacity: 0.35 })));
    }

    const atmosphere = new THREE.Mesh(new THREE.SphereGeometry(GLOBE_RADIUS * 1.18, 48, 32), atmosphereMaterial());
    scene.add(atmosphere);

    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.enableZoom = true;
    controls.minDistance = 2.0;
    controls.maxDistance = 5.0;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.5;

    // ---- Markers ----------------------------------------------------------
    const pickables = [];
    const tmpV = new THREE.Vector3();

    function addLabel(text, cls) {
        const el = document.createElement('div');
        el.className = `globe-marker-label ${cls || ''}`;
        el.innerHTML = text;
        labelLayer.appendChild(el);
        return el;
    }

    function makeLevelMarker(level, index) {
        const pos = LEVEL_POSITIONS[index];
        const anchor = latLngToVec3(pos.lat, pos.lng, GLOBE_RADIUS * 1.02);
        const grp = new THREE.Group();
        grp.position.copy(anchor);

        const unlocked = isLevelUnlocked(state.save, LEVELS, REGIONS, level.id);
        const rec = levelRecord(state.save, level.id);
        const done = rec.completed;
        const color = !unlocked ? LOCKED_COLOR : done ? COMPLETED_COLOR : REGION_COLORS[level.regionId] || 0xffffff;

        const core = new THREE.Mesh(
            new THREE.OctahedronGeometry(0.05),
            new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.2, emissive: color, emissiveIntensity: unlocked ? 0.35 : 0 })
        );
        grp.add(core);

        // Invisible generous hit target for forgiving touch taps.
        const hit = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), new THREE.MeshBasicMaterial({ visible: false }));
        hit.userData = { kind: 'level', levelId: level.id };
        grp.add(hit);
        pickables.push(hit);

        // Glow for the next playable mission.
        let glow = null;
        if (unlocked && !done) {
            glow = makeGlowSprite('#ffd23f');
            glow.scale.set(0.34, 0.34, 1);
            grp.add(glow);
        }

        const label = addLabel(
            `<span class="globe-label-num">${index + 1}</span><span class="globe-label-stars">${done ? starRow(rec.stars) : unlocked ? '' : 'lock'}</span>`,
            !unlocked ? 'locked' : ''
        );
        const marker = { kind: 'level', index, level, grp, core, glow, label, anchor, unlocked, done };
        state.levelMarkers.push(marker);
        world.add(grp);
        return marker;
    }

    function setChestVisual(marker, chestState) {
        marker.grp.userData.chestState = chestState;
        const { body, lid, lock, glow } = marker.parts;
        const gold = new THREE.Color(0xffb03a);
        const grey = new THREE.Color(0x5b6472);
        const openCol = new THREE.Color(0x3a4150);
        const col = chestState === 'openable' ? gold : chestState === 'opened' ? openCol : grey;
        body.material.color.copy(col);
        body.material.emissive.copy(col);
        body.material.emissiveIntensity = chestState === 'openable' ? 0.5 : 0;
        lid.material.color.copy(col);
        lid.material.emissive.copy(col);
        lid.material.emissiveIntensity = chestState === 'openable' ? 0.5 : 0;
        lid.rotation.x = chestState === 'opened' ? -1.9 : 0;
        lock.visible = chestState !== 'opened';
        glow.visible = chestState === 'openable';
    }

    function makeChestMarker(chest) {
        const anchor = latLngToVec3(chest.lat, chest.lng, GLOBE_RADIUS * 1.02);
        const grp = new THREE.Group();
        grp.position.copy(anchor);
        grp.lookAt(0, 0, 0);
        grp.rotateX(-Math.PI / 2); // chest stands upright on the surface

        const bodyMat = new THREE.MeshStandardMaterial({ color: 0x5b6472, roughness: 0.5 });
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.09, 0.1), bodyMat);
        body.position.y = 0.045;
        const lid = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.04, 0.1), bodyMat.clone());
        lid.geometry.translate(0, 0.02, -0.05); // pivot at the back edge
        lid.position.set(0, 0.09, 0.05);
        const lock = new THREE.Mesh(
            new THREE.BoxGeometry(0.03, 0.04, 0.02),
            new THREE.MeshStandardMaterial({ color: 0xffd23f, roughness: 0.3, metalness: 0.4 })
        );
        lock.position.set(0, 0.07, 0.055);
        const glow = makeGlowSprite('#ffb03a');
        glow.scale.set(0.5, 0.5, 1);
        glow.position.y = 0.08;

        body.userData = lid.userData = lock.userData = { kind: 'chest', chestId: chest.id };
        pickables.push(body, lid, lock);
        grp.add(body, lid, lock, glow);
        world.add(grp);

        const label = addLabel('<span class="globe-label-chest">supply crate</span>', 'chest-label');
        const marker = { kind: 'chest', chest, grp, label, anchor, parts: { body, lid, lock, glow } };
        state.chestMarkers.push(marker);
        return marker;
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
        for (const m of state.chestMarkers) {
            setChestVisual(m, await chestOpenState(m.chest));
        }
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
    }
    function closeSheet() {
        sheet.hidden = true;
    }
    sheet.querySelector('#globe-sheet-close').addEventListener('click', closeSheet);

    function showLevelSheet(marker) {
        const { level, unlocked, done } = marker;
        const rec = levelRecord(state.save, level.id);
        const region = regionById(level.regionId);
        if (!unlocked) {
            openSheet({
                title: `Mission ${marker.index + 1}: ${level.name}`,
                sub: 'Locked',
                desc: lockReason(state.save, LEVELS, REGIONS, level.id) || 'Locked.',
                actionLabel: null,
            });
            return;
        }
        openSheet({
            title: `Mission ${marker.index + 1}: ${level.name}`,
            sub: region ? region.name : '',
            desc: done ? `${level.blurb} Best: ${starRow(rec.stars)}` : level.blurb,
            actionLabel: done ? 'Play again' : 'Start mission',
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
                title: 'Supply crate',
                sub: 'Locked',
                desc: `Earn at least 1 star on "${level ? level.name : 'an earlier mission'}" to unlock this crate.`,
                actionLabel: null,
            });
            return;
        }
        if (st === 'opened') {
            openSheet({
                title: 'Supply crate',
                sub: 'Already opened',
                desc: `This crate is empty. ${contains.replace('Contains', 'It contained')}`,
                actionLabel: null,
            });
            return;
        }
        openSheet({
            title: 'Supply crate',
            sub: 'Ready to open',
            desc: contains,
            actionLabel: 'Open crate',
            onAction: () => handleChestOpen(marker),
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
            showNotification('Crates are not wired up yet. The economy update will unlock them.', 'info');
            return;
        }
        // The economy contract returns { ok, reason?, gives?, save }. Be
        // lenient: older variants may return the gives object directly or
        // throw on failure.
        let result = null;
        try {
            result = await econ.openChest(chest.id);
        } catch {
            showNotification('Could not open the crate right now. Try again later.', 'error');
            return;
        }
        if (result && result.ok === false) {
            showNotification(result.reason || 'Could not open the crate right now.', 'error');
            return;
        }
        // Reward toast: prefer what openChest returned, fall back to the crate
        // definition from chests.js.
        const loot = (result && (result.gives || result.granted)) || chest.gives;
        setChestVisual(marker, 'opened');
        state.save = loadSave(createStorage());
        closeSheet();
        showNotification(`Crate opened: ${givesText(loot)}. Nice haul!`, 'success');
    }

    // ---- Tap handling ---------------------------------------------------------
    const raycaster = new THREE.Raycaster();
    const pointerNDC = new THREE.Vector2();
    let downX = 0;
    let downY = 0;
    let downT = 0;

    function ndcFromEvent(e) {
        const rect = canvas.getBoundingClientRect();
        pointerNDC.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        pointerNDC.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    }

    canvas.addEventListener('pointerdown', (e) => {
        downX = e.clientX;
        downY = e.clientY;
        downT = performance.now();
    });
    canvas.addEventListener('pointerup', (e) => {
        const moved = Math.hypot(e.clientX - downX, e.clientY - downY);
        if (moved > 10 || performance.now() - downT > 600) return; // it was a drag
        ndcFromEvent(e);
        raycaster.setFromCamera(pointerNDC, camera);
        const hits = raycaster.intersectObjects(pickables, false);
        if (!hits.length) {
            closeSheet();
            return;
        }
        const ud = hits[0].object.userData;
        if (ud.kind === 'level') {
            const marker = state.levelMarkers.find((m) => m.level.id === ud.levelId);
            if (marker) showLevelSheet(marker);
        } else if (ud.kind === 'chest') {
            const marker = state.chestMarkers.find((m) => m.chest.id === ud.chestId);
            if (marker) {
                chestOpenState(marker.chest).then((st) => {
                    if (st === 'openable') handleChestOpen(marker);
                    else showChestSheet(marker);
                });
            }
        }
    });

    // ---- HUD --------------------------------------------------------------------
    function refreshHUD() {
        const starsEl = mountEl.querySelector('#globe-hud-stars');
        const fundEl = mountEl.querySelector('#globe-hud-funding');
        const livesEl = mountEl.querySelector('#globe-hud-lives');
        const stars = totalStars(state.save);
        if (starsEl) starsEl.textContent = `${stars} star${stars === 1 ? '' : 's'}`;
        if (fundEl) fundEl.textContent = `${state.save.funding} funding`;
        if (livesEl) livesEl.textContent = `${state.save.livesSaved.toLocaleString()} lives saved`;
    }

    function refresh() {
        state.save = loadSave(createStorage());
        refreshHUD();
        for (const m of state.levelMarkers) {
            const unlocked = isLevelUnlocked(state.save, LEVELS, REGIONS, m.level.id);
            const rec = levelRecord(state.save, m.level.id);
            m.unlocked = unlocked;
            m.done = rec.completed;
            const color = !unlocked ? LOCKED_COLOR : rec.completed ? COMPLETED_COLOR : REGION_COLORS[m.level.regionId] || 0xffffff;
            m.core.material.color.setHex(color);
            m.core.material.emissive.setHex(color);
            m.core.material.emissiveIntensity = unlocked ? 0.35 : 0;
            m.label.innerHTML = `<span class="globe-label-num">${m.index + 1}</span><span class="globe-label-stars">${rec.completed ? starRow(rec.stars) : unlocked ? '' : 'lock'}</span>`;
            m.label.classList.toggle('locked', !unlocked);
        }
        refreshChests();
    }

    // ---- Animation ---------------------------------------------------------------
    const clock = new THREE.Clock();
    function resize() {
        const w = mountEl.clientWidth || window.innerWidth;
        const h = mountEl.clientHeight || window.innerHeight;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
    }
    new ResizeObserver(resize).observe(mountEl);
    resize();

    const camDir = new THREE.Vector3();
    let firstFrame = true;
    function animate() {
        requestAnimationFrame(animate);
        const t = clock.getElapsedTime();

        // Gentle bob on markers so the world feels alive.
        for (const m of state.levelMarkers) {
            const s = 1 + (m.glow ? Math.sin(t * 3) * 0.12 : 0);
            m.core.scale.setScalar(s);
            m.core.rotation.y += 0.01;
        }
        for (const m of state.chestMarkers) {
            const cs = m.grp.userData.chestState;
            if (cs === 'openable') m.grp.position.y = m.anchor.y + Math.sin(t * 2.5) * 0.02;
        }

        controls.update();
        renderer.render(scene, camera);

        // Project labels; hide markers facing away from the camera.
        camDir.copy(camera.position).normalize();
        for (const m of state.levelMarkers.concat(state.chestMarkers)) {
            m.grp.getWorldPosition(tmpV);
            const facing = tmpV.clone().normalize().dot(camDir) > 0.18;
            if (facing) {
                tmpV.project(camera);
                const x = (tmpV.x * 0.5 + 0.5) * renderer.domElement.clientWidth;
                const y = (-tmpV.y * 0.5 + 0.5) * renderer.domElement.clientHeight;
                m.label.style.display = 'block';
                m.label.style.transform = `translate(-50%, -130%) translate(${x}px, ${y}px)`;
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

    // Build markers, then start the render loop.
    LEVELS.forEach((level, i) => makeLevelMarker(level, i));
    CHESTS.forEach(makeChestMarker);
    refresh();
    animate();

    return { refresh };
}
