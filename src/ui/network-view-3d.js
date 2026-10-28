// Three.js 3D network view for VAXrebot (convergence-3d branch).
//
// Replaces the D3 2D NetworkView with the exact same public interface so
// src/game.js only needs its import line swapped:
//   setup({ onNodeClick, onLinkClick })
//   update(nodes, links, isInitial)
//   animateVirus(source, target)
//   setPaused(paused)
//
// Rendering: one low-poly sphere per node (shared geometry, one shared
// material per state color), plus a billboarded face sprite per node using
// the generated 128px PNG set in src/assets/faces/<state>/{idle,blink,
// reaction|cough|happy|sleepy}.png. Face animation timing follows
// src/assets/faces/README.md: blink ~150ms every 3-5s (random offset),
// cough cycling for sick states, happy flash on state change, sleepy
// alternation for quarantined, static reaction for dead.
//
// Round 1 (nightly 2026-10-10): the network is now FLAT and abstract.
// Nodes sit on one plane (z = 0) viewed head-on, so the graph reads like a
// clear diagram you can drag, pinch and twist. Links are
// thick color-coded ribbons (red pulse = live transmission route, faded =
// protected end), infected nodes pulse, and severing a link plays a snap:
// the two halves whip back to their nodes, sparks fly, a ring flashes and
// the nodes recoil apart.
//
// Layout: a small custom force simulation (repulsion + link springs +
// centering gravity) warmed up synchronously on layout, then settled
// per-frame. Touch: see network-gestures.js (drag a person, pan, pinch to
// zoom, twist to rotate); a quick tap
// (not a drag) raycasts nodes first, then links, and fires the same
// onNodeClick / onLinkClick callbacks game.js wires to tool application.
//
// Fully offline: three.js and all face PNGs are bundled by Vite.
// Perf: pixel ratio capped at 2, shared geometry/materials, one
// LineSegments draw for all links, per-node work is O(1) per frame.
import * as THREE from 'three';
import { WEB_INK, backdropPlan, applyBackdrop, planetDefFor } from './web-backdrop.js';
import { comboFor } from '../config/planet-palettes.js';
import { PLANET_DEFS } from '../config/levels.js';
import {
    cameraUp,
    panView,
    twoFingerView,
    zoomAt,
    rotateAt,
    pickGrab,
    isDrag,
    isOffFit,
    screenToWorld,
} from './network-gestures.js';
import { fitCamera } from './game-screen-model.js';
import { pickTapTarget } from './tap-target.js';
import { layoutStep as forceStep, settleLayout, nextAlpha, layoutForAspect, LAYOUT } from './force-layout.js';
import { isBoxed } from './care-box-model.js';
import { linkStyle, LINK_WIDTHS } from './link-style.js';
import {
    LAYOUT_3D,
    ORBIT,
    layoutStep3d,
    layout3dForAspect,
    settleLayout3d,
    nextAlpha3d,
    liftTo3d,
    flattenTo2d,
    orbitPosition,
    orbitDrag,
    zoom3d,
    fitOrbit,
    easeOrbit,
    ribbonOffset,
    normalizedDepths,
    loadViewMode,
    saveViewMode,
    yawToward,
    personScaleFor,
    backDepth,
    layoutForPersonScale,
    MIN_PERSON_PX,
    MAX_PERSON_SCALE,
} from './web3d.js';

// 3D web mode (round 15): deep space behind the web, and fog so far people
// fade a little and near ones read first.
const SPACE_FOG = 0x0d1a3d;
// Who each person tool can be used on (mirrors canUseTool in src/sim/engine.js).
export const TOOL_TARGET_STATES = {
    vaccinate: ['healthy'],
    quarantine: ['healthy', 'infected', 'recovered'],
};
const safeStorage = () => {
    try {
        return window.localStorage;
    } catch {
        return null;
    }
};

// Bundle every face frame at build time so the game works fully offline.
// Map ends up as: textures[state][frame] -> THREE.Texture
const faceModules = import.meta.glob('../assets/faces/*/*.png', {
    eager: true,
    query: '?url',
    import: 'default',
});

// Item 20: length of the gentle death moment (animateDeath).
export const DEATH_MS = 1600;
const STATES = ['healthy', 'exposed', 'infected', 'recovered', 'vaccinated', 'quarantined', 'dead'];

// Third frame is named by content (see src/assets/faces/README.md).
const REACTION_FRAME = {
    healthy: 'reaction.png',
    exposed: 'cough.png',
    infected: 'cough.png',
    recovered: 'happy.png',
    vaccinated: 'happy.png',
    quarantined: 'sleepy.png',
    dead: 'reaction.png',
};

const STATE_COLORS = {
    healthy: 0x28a745,
    exposed: 0xffc107,
    infected: 0xdc3545,
    recovered: 0x0dcaf0,
    vaccinated: 0x6f42c1,
    quarantined: 0xfd7e14,
    dead: 0x6c757d,
};

const NODE_RADIUS = 0.55;
const FACE_SCALE = 1.15;
// World units kept free around the network when framing it. People are 1.1
// wide, so 1.2 keeps the outer ring clear of the edges without wasting space.
const FIT_PAD = 1.2;
// Height of the button row at the top of the web (Key, 2D/3D), in CSS px.
export const TOP_BUTTONS_PX = 54;

// Link ribbon widths and colour keys come from link-style.js.
const LINK_COLORS = {
    normal: new THREE.Color(0x8fa3bf),
    blocked: new THREE.Color(0x56627a),
    risk: new THREE.Color(0xff4d6d),
    // Plain lines while Sever is selected: a touch deeper than normal so they
    // read as cuttable without drowning out the red at-risk lines.
    cuttable: new THREE.Color(0x6f86a8),
};
// Item 22 (round 25): on the paper-light 2D scene the 3D colours were faint
// (red lines 2.9:1 against the old cream). 2D draws deeper ink instead, so
// lines keep their contrast on every planet's tinted paper (see
// web-backdrop.js and tests/web-backdrop.test.js).
const LINK_COLORS_2D = {
    normal: new THREE.Color(WEB_INK.normal2d),
    blocked: new THREE.Color(0x56627a),
    risk: new THREE.Color(WEB_INK.risk2d),
    cuttable: new THREE.Color(0x5f7699),
};

// Physics lives in force-layout.js (stable, cools to rest).
const WARMUP_STEPS = 400;

const _tmp = new THREE.Vector3();
const _tmp2 = new THREE.Vector3();
const _proj = new THREE.Vector3();

const sphereGeometry = new THREE.SphereGeometry(NODE_RADIUS, 14, 10);
const sphereMaterials = {};
for (const state of STATES) {
    sphereMaterials[state] = new THREE.MeshLambertMaterial({ color: STATE_COLORS[state] });
}
// Round 16: sick people never fade into the 3D fog, so they stay the
// brightest thing in the web even at the back.
sphereMaterials.infected.fog = false;
const particleGeometry = new THREE.SphereGeometry(0.16, 8, 6);
const sparkGeometry = new THREE.CircleGeometry(0.09, 8);
const ringGeometry = new THREE.RingGeometry(0.62, 0.78, 36);
// The red pulse ring around a sick person draws on top of everything and
// ignores the fog (round 16), so in the 3D web you can see a sick person
// through the crowd in front of them, like an x-ray alert.
const pulseMaterial = new THREE.MeshBasicMaterial({ color: 0xff4d6d, transparent: true, opacity: 0.6, depthWrite: false, depthTest: false, fog: false });
const PULSE_RENDER_ORDER = 6;
// Red at-risk lines drawn over the faces in 3D (item 15): above faces, below
// the badges (5) and the sick pulse ring (6).
export const RISK_OVERLAY_RENDER_ORDER = 4;
export const RISK_OVERLAY_OPACITY = 0.9;
const particleMaterial = new THREE.MeshBasicMaterial({ color: 0xdc3545 });

// Puzzle badges (round 14): a vermilion crown for the super-spreader and a
// gold star for the Envoy, drawn once on a canvas, plus a halo ring each.
function badgeTexture(draw) {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 128;
    const g = c.getContext('2d');
    // Round token with a white rim so it reads on any face colour.
    g.beginPath();
    g.arc(64, 64, 58, 0, Math.PI * 2);
    g.fillStyle = '#ffffff';
    g.fill();
    g.beginPath();
    g.arc(64, 64, 50, 0, Math.PI * 2);
    g.fillStyle = draw.bg;
    g.fill();
    g.fillStyle = draw.fg;
    g.beginPath();
    draw.path(g);
    g.fill();
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
}
const BADGES = {
    superSpreader: {
        bg: '#c8432f',
        fg: '#fff3d6',
        ring: 0xc8432f,
        // A three-point crown.
        path: (g) => {
            g.moveTo(30, 84);
            g.lineTo(26, 46);
            g.lineTo(46, 62);
            g.lineTo(64, 36);
            g.lineTo(82, 62);
            g.lineTo(102, 46);
            g.lineTo(98, 84);
            g.closePath();
        },
    },
    envoy: {
        bg: '#c9a227',
        fg: '#ffffff',
        ring: 0xddb94a,
        // A five-point star.
        path: (g) => {
            for (let i = 0; i < 10; i++) {
                const r = i % 2 === 0 ? 34 : 15;
                const a = -Math.PI / 2 + (i * Math.PI) / 5;
                const x = 64 + r * Math.cos(a);
                const y = 66 + r * Math.sin(a);
                if (i === 0) g.moveTo(x, y);
                else g.lineTo(x, y);
            }
            g.closePath();
        },
    },
};
let badgeMaterials = null;
function getBadgeMaterials() {
    if (badgeMaterials) return badgeMaterials;
    badgeMaterials = {};
    for (const [kind, def] of Object.entries(BADGES)) {
        badgeMaterials[kind] = {
            sprite: new THREE.SpriteMaterial({ map: badgeTexture(def), transparent: true, depthWrite: false, depthTest: false }),
            ring: new THREE.MeshBasicMaterial({ color: def.ring, transparent: true, opacity: 0.85, depthWrite: false }),
        };
    }
    return badgeMaterials;
}
const haloGeometry = new THREE.RingGeometry(0.8, 0.98, 40);

export function badgeKind(node) {
    if (node && node.superSpreader) return 'superSpreader';
    if (node && node.envoy) return 'envoy';
    return null;
}

function loadFaceTextures() {
    const loader = new THREE.TextureLoader();
    const textures = {};
    for (const state of STATES) {
        textures[state] = {};
        const frames = { idle: 'idle.png', blink: 'blink.png', reaction: REACTION_FRAME[state] };
        for (const [frame, file] of Object.entries(frames)) {
            const key = `../assets/faces/${state}/${file}`;
            const url = faceModules[key];
            const tex = loader.load(url);
            tex.colorSpace = THREE.SRGBColorSpace;
            textures[state][frame] = tex;
        }
    }
    return textures;
}
// Loaded once per page lifetime; shared across level restarts.
const faceTextures = loadFaceTextures();

// Sunflower spiral on the z = 0 plane: even spacing, no overlaps at start.
function sunflowerDisc(n, radius, out) {
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < n; i++) {
        const r = radius * Math.sqrt((i + 0.5) / Math.max(1, n));
        out.push(new THREE.Vector3(Math.cos(golden * i) * r, Math.sin(golden * i) * r, 0));
    }
}

function fibonacciSphere(n, radius, out) {
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < n; i++) {
        const y = 1 - (i / Math.max(1, n - 1)) * 2;
        const r = Math.sqrt(Math.max(0, 1 - y * y));
        const theta = golden * i;
        out.push(new THREE.Vector3(Math.cos(theta) * r * radius, y * radius, Math.sin(theta) * r * radius));
    }
}

export class NetworkView {
    constructor() {
        this.renderer = null;
        this.scene = null;
        this.camera = null;
        // Camera view (see network-gestures.js) and the view that fits the
        // whole network, for the Fit button and zoom limits.
        this.cam = { cx: 0, cy: 0, distance: 24, roll: 0 };
        this.fitView = null;
        this.grabbed = null;
        this.container = null;
        this.resizeObserver = null;
        this.rafId = 0;
        this.clock = new THREE.Clock();

        this.onNodeClick = null;
        this.onLinkClick = null;

        // id -> { group, sphere, sprite, pos, vel, anim, prevState }
        this.nodeObjs = new Map();
        this.links = [];
        this.linkMesh = null;
        this.linkPositions = null;
        this.nodePickMeshes = [];

        this.particles = [];
        this.effects = []; // sever snaps, sparks, flashes: { update(now) -> done }
        this.toolMode = null;
        // Item 14 (round 20): people grow until the farthest one is at least
        // MIN_PERSON_PX wide on screen. Set in frameNetwork.
        this.personScale = 1;
        this.shakeUntil = 0;
        this.paused = false;
        this.physicsSettled = true;
        this.alpha = 0;
        this.lastLinkKey = -1;
        this.lastTime = 0;
        // '3d': a floating web you orbit. '2d': the flat diagram.
        this.mode = loadViewMode(safeStorage());
        this.cam3 = { yaw: 0.5, pitch: 0.28, distance: 24, tx: 0, ty: 0, tz: 0 };
        this.fit3 = null;
        this.lastTouch = 0;
    }

    get is3d() {
        return this.mode === '3d';
    }

    // Item 22 (round 25): paint the planet's scene behind the web. Called
    // before setup so the 3D fog can match the planet's night sky.
    paintBackdrop(regionId) {
        const def = planetDefFor(regionId, PLANET_DEFS);
        applyBackdrop(document.querySelector('.network-container'), def ? backdropPlan(comboFor(def)) : null);
    }

    setup({ onNodeClick, onLinkClick, onBoxed = null }) {
        this.onNodeClick = onNodeClick;
        this.onBoxed = onBoxed;
        this.onLinkClick = onLinkClick;
        this.teardown();

        this.container = document.querySelector('.network-container');
        // The D3 svg stays in the DOM (network-view.js is kept unwired);
        // hide it so only the WebGL canvas shows.
        const svg = document.getElementById('network-svg');
        if (svg) svg.style.display = 'none';

        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        const canvas = this.renderer.domElement;
        canvas.style.position = 'absolute';
        canvas.style.inset = '0';
        // setSize(..., false) leaves CSS size alone; pin it to the container so
        // high-DPI phones do not show a 2x or 3x zoomed corner of the scene.
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        canvas.style.touchAction = 'none';
        this.container.appendChild(canvas);

        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(48, 1, 0.1, 200);
        this.camera.position.set(0, 0, 24);

        this.scene.add(new THREE.HemisphereLight(0xffffff, 0x223344, 1.0));
        const dir = new THREE.DirectionalLight(0xffffff, 0.9);
        dir.position.set(5, 10, 7);
        this.scene.add(dir);


        this.nodeGroup = new THREE.Group();
        this.scene.add(this.nodeGroup);

        this.resize();
        this.resizeObserver = new ResizeObserver(() => this.resize());
        this.resizeObserver.observe(this.container);

        this.bindGestures(canvas);
        this.mountFitButton();
        this.mountModeButton();
        this.applyModeLook();

        this.lastTime = performance.now();
        const loop = () => {
            this.rafId = requestAnimationFrame(loop);
            this.tick();
        };
        loop();
    }

    teardown() {
        if (this.rafId) cancelAnimationFrame(this.rafId);
        this.rafId = 0;
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
            this.resizeObserver = null;
        }
        this.gestureCleanup?.();
        this.gestureCleanup = null;
        this.fitBtn?.remove();
        this.fitBtn = null;
        this.modeBtn?.remove();
        this.modeBtn = null;
        this.container?.classList.remove('is-3d');
        if (this.renderer) {
            // Per-node sprite materials are per-setup; shared geometry and
            // state materials live at module level and are not disposed.
            for (const obj of this.nodeObjs.values()) {
                obj.sprite.material.dispose();
            }
            if (this.linkMesh) {
                this.linkMesh.geometry.dispose();
                this.linkMesh.material.dispose();
                this.linkMesh = null;
            }
            for (const p of this.particles) {
                this.scene.remove(p.mesh);
            }
            this.particles = [];
            for (const e of this.effects) e.dispose?.();
            this.effects = [];
            this.renderer.dispose();
            this.renderer.domElement.remove();
            this.renderer = null;
        }
        this.nodeObjs.clear();
        this.links = [];
        this.nodePickMeshes = [];
        this.scene = null;
        this.camera = null;
    }

    resize() {
        if (!this.renderer || !this.container) return;
        const w = this.container.clientWidth || 1;
        const h = this.container.clientHeight || 1;
        this.renderer.setSize(w, h, false);
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
        // The view changed shape (rotation, browser bar): reshape gently.
        const before = this._layoutAspect;
        this.layoutParams();
        if (before !== undefined && Math.abs(this._layoutAspect - before) >= 0.1) {
            this.alpha = Math.max(this.alpha || 0, LAYOUT.reheatAlpha);
            this.physicsSettled = false;
            this.autoFit = true;
        }
        if (this.nodeObjs.size) {
            // Round 25: the first level can be set up before the game screen
            // has its real size; size people again for the real view so
            // nobody drops under 44 px.
            for (let k = 0; k < 4; k++) {
                this.frameNetwork();
                const before = this.personScale;
                this.updatePersonScale();
                if (Math.abs(this.personScale - before) < 0.01) break;
            }
        }
    }

    // ---- Node / link management -------------------------------------------

    makeNodeObj(node, pos) {
        const group = new THREE.Group();
        const sphere = new THREE.Mesh(sphereGeometry, sphereMaterials[node.state] || sphereMaterials.healthy);
        sphere.userData.nodeId = node.id;
        group.add(sphere);

        const spriteMaterial = new THREE.SpriteMaterial({
            map: faceTextures[node.state]?.idle || faceTextures.healthy.idle,
            transparent: true,
            depthWrite: false,
        });
        const sprite = new THREE.Sprite(spriteMaterial);
        sprite.scale.set(FACE_SCALE, FACE_SCALE, 1);
        group.add(sprite);

        const pulse = new THREE.Mesh(ringGeometry, pulseMaterial);
        pulse.position.z = -0.05;
        pulse.visible = node.state === 'infected';
        pulse.renderOrder = PULSE_RENDER_ORDER;
        group.add(pulse);

        // Puzzle badge and halo (super-spreader crown, Envoy star).
        let badge = null;
        let halo = null;
        const kind = badgeKind(node);
        if (kind) {
            const mats = getBadgeMaterials()[kind];
            halo = new THREE.Mesh(haloGeometry, mats.ring);
            halo.position.z = -0.04;
            group.add(halo);
            badge = new THREE.Sprite(mats.sprite);
            badge.scale.set(0.8, 0.8, 1);
            badge.position.set(0.52, 0.56, 0.6);
            badge.renderOrder = 5;
            group.add(badge);
        }

        group.position.copy(pos);
        this.nodeGroup.add(group);
        this.nodePickMeshes.push(sphere);

        return {
            node,
            group,
            sphere,
            sprite,
            pulse,
            badge,
            halo,
            badgeKind: kind,
            pos: pos.clone(),
            vel: new THREE.Vector3(),
            prevState: node.state,
            anim: {
                blinkAt: performance.now() + Math.random() * 4000,
                happyUntil: 0,
                bounceUntil: 0,
                coughOffset: Math.random() * 400,
                sleepyOffset: Math.random() * 2000,
            },
        };
    }

    update(nodes, links, isInitial = false) {
        if (!this.scene) return;
        const now = performance.now();

        // Like D3's forceLink, resolve numeric source/target ids to node
        // refs once so game.js can keep reading link.source.id.
        const byId = new Map(nodes.map((n) => [n.id, n]));
        for (const link of links) {
            if (typeof link.source === 'number') link.source = byId.get(link.source);
            if (typeof link.target === 'number') link.target = byId.get(link.target);
        }
        this.links = links;

        const seen = new Set();
        const countChanged = nodes.length !== this.nodeObjs.size;
        const starts = [];
        if (countChanged || isInitial) {
            if (this.is3d) fibonacciSphere(nodes.length, 2.5 + Math.cbrt(nodes.length) * 1.6, starts);
            else sunflowerDisc(nodes.length, 3 + Math.sqrt(nodes.length) * 1.2, starts);
        }
        let i = 0;
        const leaving = [];
        let boxChanged = false;
        for (const node of nodes) {
            seen.add(node.id);
            let obj = this.nodeObjs.get(node.id);
            if (!obj) {
                obj = this.makeNodeObj(node, starts[i] || new THREE.Vector3().randomDirection().multiplyScalar(6));
                this.nodeObjs.set(node.id, obj);
            } else {
                obj.node = node;
            }
            i++;

            // State changes: swap sphere color, reset face to idle, and
            // schedule the happy flash for vaccinate / recover actions.
            if (obj.prevState !== node.state) {
                obj.sphere.material = sphereMaterials[node.state] || sphereMaterials.healthy;
                obj.sprite.material.map = faceTextures[node.state]?.idle || faceTextures.healthy.idle;
                obj.pulse.visible = node.state === 'infected';
                if (node.state === 'recovered' || node.state === 'vaccinated') {
                    obj.anim.happyUntil = now + 1000;
                    obj.anim.bounceUntil = now + 450;
                }
                obj.prevState = node.state;
            }

            // Isolated, in treatment or cured: the person leaves the network
            // and flies to the care box on the right (game.js animates it).
            const boxed = isBoxed(node);
            if (obj.boxed !== boxed) {
                const wasShown = obj.boxed === false;
                obj.boxed = boxed;
                obj.group.visible = !boxed;
                if (boxed && wasShown && !isInitial) leaving.push({ node, from: this.screenPoint(obj.pos) });
                if (!isInitial) boxChanged = true;
            }
        }
        if (leaving.length && this.onBoxed) this.onBoxed(leaving);
        // Remove nodes that left the network.
        for (const [id, obj] of this.nodeObjs) {
            if (!seen.has(id)) {
                this.nodeGroup.remove(obj.group);
                obj.sprite.material.dispose();
                this.nodeObjs.delete(id);
                const pi = this.nodePickMeshes.indexOf(obj.sphere);
                if (pi >= 0) this.nodePickMeshes.splice(pi, 1);
            }
        }

        // Healthy nodes sitting next to a fresh vaccination get the brief
        // healthy "protected" reaction (per faces README).
        if (!isInitial) {
            const vaccinatedIds = new Set(
                [...this.nodeObjs.values()].filter((o) => o.node.state === 'vaccinated').map((o) => o.node.id)
            );
            if (vaccinatedIds.size > 0) {
                for (const link of links) {
                    const s = link.source && link.source.id;
                    const t = link.target && link.target.id;
                    for (const [a, b] of [[s, t], [t, s]]) {
                        if (vaccinatedIds.has(b)) {
                            const obj = this.nodeObjs.get(a);
                            if (obj && obj.node.state === 'healthy' && obj.prevState === 'healthy') {
                                obj.anim.happyUntil = Math.max(obj.anim.happyUntil, now + 800);
                            }
                        }
                    }
                }
            }
        }

        this.rebuildLinks();

        // Frame the network and (re)run the layout when the population changes.
        const linkKey = this.links.length;
        if (countChanged || isInitial) {
            // Settle, frame, size people for the phone, and settle again with
            // room for the bigger people (two passes are enough to converge).
            if (isInitial) this.personScale = 1;
            for (let pass = 0; pass < 5; pass++) {
                if (this.is3d) settleLayout3d(this.layoutObjs(), this.layoutPairs(), { maxSteps: WARMUP_STEPS, P: this.layoutParams3d() });
                else settleLayout(this.layoutObjs(), this.layoutPairs(), { maxSteps: WARMUP_STEPS, P: this.layoutParams() });
                // Round 16: a level opens with the web turned so the first sick
                // people face you, instead of hiding behind the crowd.
                if (isInitial && this.is3d) this.faceTheSick();
                this.frameNetwork();
                const before = this.personScale;
                this.updatePersonScale();
                if (Math.abs(this.personScale - before) < 0.04) break;
            }
            // Last nudges without moving anyone: the fit padding grows with
            // people, so check the size once more at the final framing.
            for (let k = 0; k < 4; k++) {
                this.frameNetwork();
                const before = this.personScale;
                this.updatePersonScale();
                if (this.personScale - before < 0.01) break;
            }
            this.alpha = 0;
            for (const o of this.nodeObjs.values()) o.vel.set(0, 0, 0);
            this.frameNetwork();
            this.autoFit = true;
            this.physicsSettled = true;
        } else if (linkKey !== this.lastLinkKey) {
            // A link was severed: let the network relax gently. Vaccinate
            // changes no links, so the people you are tapping stay put.
            this.alpha = Math.max(this.alpha || 0, LAYOUT.reheatAlpha);
            this.physicsSettled = false;
        } else if (boxChanged) {
            // Someone left for the care box: close the gap very gently.
            this.alpha = Math.max(this.alpha || 0, LAYOUT.reheatAlpha * 0.5);
            this.physicsSettled = false;
        }
        this.lastLinkKey = linkKey;
    }

    // Links are flat ribbons (two triangles each) in one mesh, so width and
    // color can carry meaning; plain GL lines are always 1px.
    rebuildLinks() {
        if (this.linkMesh) {
            this.scene.remove(this.linkMesh);
            this.linkMesh.geometry.dispose();
            this.linkMesh = null;
        }
        if (this.riskMesh) {
            this.scene.remove(this.riskMesh);
            this.riskMesh.geometry.dispose();
            this.riskMesh = null;
        }
        const count = this.links.length;
        this.linkPositions = new Float32Array(count * 12);
        this.linkColors = new Float32Array(count * 12);
        const index = [];
        for (let i = 0; i < count; i++) {
            const o = i * 4;
            index.push(o, o + 1, o + 2, o + 2, o + 1, o + 3);
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(this.linkPositions, 3));
        geo.setAttribute('color', new THREE.BufferAttribute(this.linkColors, 3));
        geo.setIndex(index);
        this.linkMesh = new THREE.Mesh(
            geo,
            new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide })
        );
        this.linkMesh.frustumCulled = false;
        this.linkMesh.renderOrder = -1;
        this.scene.add(this.linkMesh);

        // Item 15 (round 20): in 3D the red at-risk lines are drawn a second
        // time on top of everyone (no depth test), so a red line that passes
        // behind a face still shows from any angle. Other lines stay behind.
        this.riskPositions = new Float32Array(count * 12);
        this.riskColors = new Float32Array(count * 12);
        const rgeo = new THREE.BufferGeometry();
        rgeo.setAttribute('position', new THREE.BufferAttribute(this.riskPositions, 3));
        rgeo.setAttribute('color', new THREE.BufferAttribute(this.riskColors, 3));
        rgeo.setIndex(index);
        this.riskMesh = new THREE.Mesh(
            rgeo,
            new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: RISK_OVERLAY_OPACITY, depthWrite: false, depthTest: false, side: THREE.DoubleSide, fog: false })
        );
        this.riskMesh.frustumCulled = false;
        this.riskMesh.renderOrder = RISK_OVERLAY_RENDER_ORDER;
        this.scene.add(this.riskMesh);
        this.syncLinkPositions(performance.now());
    }

    // 'risk' = an infectious, unisolated node touching a healthy one (the
    // virus can cross here tomorrow). 'blocked' = a protected end.
    linkKind(link) {
        const s = link.source && link.source.state;
        const t = link.target && link.target.state;
        const hot = (x) => x === 'infected';
        const open = (x) => x === 'healthy' || x === 'exposed';
        if ((hot(s) && open(t)) || (hot(t) && open(s))) return 'risk';
        const safe = (x) => x === 'vaccinated' || x === 'quarantined' || x === 'recovered';
        if (safe(s) || safe(t)) return 'blocked';
        return 'normal';
    }

    syncLinkPositions(now = performance.now()) {
        if (!this.linkMesh) return;
        const pos = this.linkPositions;
        const col = this.linkColors;
        const rpos = this.riskPositions;
        const rcol = this.riskColors;
        const overlay = this.is3d && !!this.riskMesh;
        const severing = this.toolMode === 'severLink';
        const pulse = 0.65 + 0.35 * Math.abs(Math.sin(now / 260));
        let k = 0;
        let c = 0;
        for (const link of this.links) {
            const a = this.nodeObjs.get(link.source && link.source.id);
            const b = this.nodeObjs.get(link.target && link.target.id);
            const pa = a ? a.pos : _tmp.set(0, 0, 0);
            const pb = b ? b.pos : _tmp2.set(0, 0, 0);
            const kind = this.linkKind(link);
            const hidden = (a && a.boxed) || (b && b.boxed);
            const style = linkStyle(kind, severing);
            // Lines grow with people, but more gently (square root), so a
            // boss web of big faces does not turn into thick bars.
            const w = hidden ? 0 : (style.width * Math.sqrt(this.personScale)) / 2;
            if (this.is3d) {
                // Ribbons turn to face the camera so they keep their width
                // from every angle.
                const o = ribbonOffset(pa, pb, this.camera.position, w);
                pos[k++] = pa.x + o.x; pos[k++] = pa.y + o.y; pos[k++] = pa.z + o.z;
                pos[k++] = pa.x - o.x; pos[k++] = pa.y - o.y; pos[k++] = pa.z - o.z;
                pos[k++] = pb.x + o.x; pos[k++] = pb.y + o.y; pos[k++] = pb.z + o.z;
                pos[k++] = pb.x - o.x; pos[k++] = pb.y - o.y; pos[k++] = pb.z - o.z;
            } else {
                const dx = pb.x - pa.x;
                const dy = pb.y - pa.y;
                const len = Math.hypot(dx, dy) || 1;
                const nx = (-dy / len) * w;
                const ny = (dx / len) * w;
                pos[k++] = pa.x + nx; pos[k++] = pa.y + ny; pos[k++] = -0.1;
                pos[k++] = pa.x - nx; pos[k++] = pa.y - ny; pos[k++] = -0.1;
                pos[k++] = pb.x + nx; pos[k++] = pb.y + ny; pos[k++] = -0.1;
                pos[k++] = pb.x - nx; pos[k++] = pb.y - ny; pos[k++] = -0.1;
            }
            const base = (this.is3d ? LINK_COLORS : LINK_COLORS_2D)[style.color];
            const m = style.pulse ? pulse : 1;
            const onTop = overlay && kind === 'risk' && !hidden;
            for (let v = 0; v < 4; v++) {
                // Overlay copy of this quad, or a zero-area quad when not red.
                const at = k - 12 + v * 3;
                rpos[at] = onTop ? pos[at] : pa.x;
                rpos[at + 1] = onTop ? pos[at + 1] : pa.y;
                rpos[at + 2] = onTop ? pos[at + 2] : pa.z;
                rcol[c] = base.r * m; rcol[c + 1] = base.g * m; rcol[c + 2] = base.b * m;
                col[c++] = base.r * m; col[c++] = base.g * m; col[c++] = base.b * m;
            }
        }
        this.linkMesh.geometry.attributes.position.needsUpdate = true;
        this.linkMesh.geometry.attributes.color.needsUpdate = true;
        if (this.riskMesh) {
            this.riskMesh.visible = overlay;
            this.riskMesh.geometry.attributes.position.needsUpdate = true;
            this.riskMesh.geometry.attributes.color.needsUpdate = true;
        }
    }

    // Client (CSS pixel) position of a world point, for DOM effects.
    screenPoint(pos) {
        if (!this.renderer || !this.camera) return null;
        const v = new THREE.Vector3(pos.x, pos.y, pos.z || 0).project(this.camera);
        const rect = this.renderer.domElement.getBoundingClientRect();
        return { x: rect.left + ((v.x + 1) / 2) * rect.width, y: rect.top + ((1 - v.y) / 2) * rect.height };
    }

    // Fit the whole network on screen (portrait phones included).
    // Uses the network's bounding box, so a lopsided layout is centred too.
    fitTarget() {
        const pts = [];
        for (const o of this.nodeObjs.values()) if (!o.boxed) pts.push(o.pos);
        return fitCamera(pts, { fovDeg: this.camera.fov, aspect: this.camera.aspect, pad: FIT_PAD + 0.6 * (this.personScale - 1), topReserve: this.topReserve() });
    }

    // Share of the view's height the Key and 2D/3D buttons cover at the top
    // (they sit 8 px down and are 44 px tall), plus a little air.
    topReserve() {
        const h = this.container?.clientHeight || 0;
        return h > 0 ? Math.min(0.2, TOP_BUTTONS_PX / h) : 0;
    }

    fitTarget3d() {
        const pts = [];
        for (const o of this.nodeObjs.values()) if (!o.boxed) pts.push(o.pos);
        return fitOrbit(pts, { fovDeg: this.camera.fov, aspect: this.camera.aspect, pad: FIT_PAD + 0.6 * (this.personScale - 1), yaw: this.cam3.yaw, pitch: this.cam3.pitch });
    }

    // Turn the 3D web so the sick people are on the camera's side.
    faceTheSick() {
        const all = [];
        const sick = [];
        for (const o of this.nodeObjs.values()) {
            if (o.boxed) continue;
            all.push(o.pos);
            if (o.node.state === 'infected') sick.push(o.pos);
        }
        this.cam3 = { ...this.cam3, yaw: yawToward(sick, all, this.cam3.yaw) };
    }

    frameNetwork() {
        if (this.is3d) {
            this.fit3 = this.fitTarget3d();
            this.cam3 = { ...this.fit3 };
            this.applyCamera();
            return;
        }
        const { cx, cy, distance } = this.fitTarget();
        this.fitView = { cx, cy, distance, roll: 0 };
        this.cam = { ...this.fitView };
        this.applyCamera();
    }

    // Point the three.js camera at the current view: straight down, turned
    // by roll. Matches worldToScreen in network-gestures.js.
    applyCamera() {
        if (this.is3d) {
            const p = orbitPosition(this.cam3);
            this.camera.position.set(p.x, p.y, p.z);
            this.camera.up.set(0, 1, 0);
            this.camera.lookAt(this.cam3.tx, this.cam3.ty, this.cam3.tz);
            return;
        }
        const { cx, cy, distance, roll } = this.cam;
        const up = cameraUp(roll);
        this.camera.position.set(cx, cy, distance);
        this.camera.up.set(up.x, up.y, 0);
        this.camera.lookAt(cx, cy, 0);
    }

    viewBox() {
        const rect = this.renderer.domElement.getBoundingClientRect();
        return { rect, widthPx: rect.width || 1, heightPx: rect.height || 1, fovDeg: this.camera.fov };
    }

    // Back to the fitted, upright view (Fit button), easing there.
    resetView() {
        this.autoFit = true;
        this.lastTouch = 0;
    }

    // ---- 2D / 3D switch -----------------------------------------------------

    mountModeButton() {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'network-mode-btn';
        btn.addEventListener('click', () => this.setViewMode(this.is3d ? '2d' : '3d'));
        this.container.appendChild(btn);
        this.modeBtn = btn;
        this.updateModeButton();
    }

    updateModeButton() {
        if (!this.modeBtn) return;
        this.modeBtn.textContent = this.is3d ? '2D' : '3D';
        this.modeBtn.setAttribute('aria-label', this.is3d ? 'Switch to the flat view' : 'Switch to the 3D view');
        this.modeBtn.setAttribute('aria-pressed', String(this.is3d));
    }

    // First time in the 3D web on this device: one line on how to move it.
    showOrbitHintOnce() {
        const KEY = 'galactic-outbreak.orbit-hint.v1';
        const store = safeStorage();
        try {
            if (store?.getItem(KEY)) return;
            store?.setItem(KEY, '1');
        } catch {
            /* blocked storage: show it every time, harmless */
        }
        const el = document.createElement('div');
        el.className = 'orbit-hint';
        el.setAttribute('role', 'status');
        el.textContent = 'Drag empty space to spin the web. Pinch to zoom.';
        this.container?.appendChild(el);
        setTimeout(() => el.remove(), 4800);
    }

    applyModeLook() {
        if (this.is3d) this.showOrbitHintOnce();
        this.container?.classList.toggle('is-3d', this.is3d);
        // Fog fades the back of the 3D web into the planet's night sky (item 22).
        const sky = this.container ? getComputedStyle(this.container).getPropertyValue('--bd-night-top').trim() : '';
        if (this.scene) this.scene.fog = this.is3d ? new THREE.Fog(sky || SPACE_FOG, 14, 60) : null;
        this.reduceMotion = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    }

    setViewMode(mode) {
        const next = mode === '2d' ? '2d' : '3d';
        if (next === this.mode) return;
        this.mode = next;
        saveViewMode(safeStorage(), next);
        const objs = [...this.nodeObjs.values()];
        if (this.is3d) liftTo3d(objs);
        else flattenTo2d(objs);
        for (const o of objs) o.vel.set(0, 0, 0);
        this.alpha = 1;
        this.physicsSettled = false;
        this.autoFit = true;
        this.lastTouch = 0;
        this.applyModeLook();
        this.updateModeButton();
        if (this.is3d) this.faceTheSick();
        this.frameNetwork();
        this.updatePersonScale();
    }

    // While the layout is still spreading out, keep easing the camera so the
    // whole network stays on screen. Stops as soon as the player pans or zooms.
    easeToFit(rate = 0.15) {
        if (this.is3d) {
            this.fit3 = this.fitTarget3d();
            this.cam3 = easeOrbit(this.cam3, this.fit3, rate);
            return;
        }
        const { cx, cy, distance } = this.fitTarget();
        this.fitView = { cx, cy, distance, roll: 0 };
        const c = this.cam;
        let dr = -c.roll;
        if (dr > Math.PI) dr -= 2 * Math.PI;
        if (dr < -Math.PI) dr += 2 * Math.PI;
        this.cam = {
            cx: c.cx + (cx - c.cx) * rate,
            cy: c.cy + (cy - c.cy) * rate,
            distance: c.distance + (distance - c.distance) * rate,
            roll: Math.abs(dr) < 0.002 ? 0 : c.roll + dr * rate,
        };
    }

    // While Sever is selected, at-risk links get bolder (see link-style.js).
    setToolMode(toolId) {
        this.toolMode = toolId;
    }

    // ---- Layout ------------------------------------------------------------

    // People in the care box are out of the network and out of the layout.
    // Layout tuned to the view's shape, so a tall phone gets a tall network
    // (bigger people) instead of a small circle. See layoutForAspect.
    viewAspect() {
        const w = this.container?.clientWidth || 0;
        const h = this.container?.clientHeight || 0;
        return w > 0 && h > 0 ? w / h : 1;
    }

    layoutParams() {
        const aspect = Math.round(this.viewAspect() * 20) / 20; // ignore tiny resizes
        if (!this._layoutParams || this._layoutAspect !== aspect || this._layoutScale !== this.personScale) {
            this._layoutAspect = aspect;
            this._layoutScale = this.personScale;
            this._layoutParams = layoutForPersonScale(layoutForAspect(aspect), this.personScale);
        }
        return this._layoutParams;
    }

    layoutParams3d() {
        const aspect = Math.round(this.viewAspect() * 20) / 20;
        if (!this._layout3d || this._layout3dAspect !== aspect || this._layout3dScale !== this.personScale) {
            this._layout3dAspect = aspect;
            this._layout3dScale = this.personScale;
            this._layout3d = layoutForPersonScale(layout3dForAspect(aspect, LAYOUT_3D), this.personScale);
        }
        return this._layout3d;
    }

    // Item 14: grow people until the farthest one is MIN_PERSON_PX wide at
    // the fitted view (in 2D everyone sits at the camera distance).
    updatePersonScale() {
        const heightPx = this.container?.clientHeight || 0;
        if (!heightPx || !this.camera) return;
        const pts = [];
        for (const o of this.nodeObjs.values()) if (!o.boxed) pts.push(o.pos);
        if (!pts.length) return;
        const view = this.is3d ? this.cam3 : { distance: this.cam.distance, tx: this.cam.cx, ty: this.cam.cy, tz: 0 };
        const depth = this.is3d ? backDepth(pts, view) : view.distance;
        // Ask for people at their current size: the factor compounds.
        const want = personScaleFor({ faceWorld: FACE_SCALE * this.personScale, depth, heightPx, fovDeg: this.camera.fov, minPx: MIN_PERSON_PX });
        this.personScale = Math.min(MAX_PERSON_SCALE, this.personScale * want);
    }

    layoutObjs() {
        return [...this.nodeObjs.values()].filter((o) => !o.boxed);
    }

    layoutPairs() {
        const pairs = [];
        for (const link of this.links) {
            const a = this.nodeObjs.get(link.source && link.source.id);
            const b = this.nodeObjs.get(link.target && link.target.id);
            if (a && b && a !== b && !a.boxed && !b.boxed) pairs.push([a, b]);
        }
        return pairs;
    }

    // One cooled step; returns the fastest node speed.
    layoutStep() {
        if (this.is3d) {
            const sp = layoutStep3d(this.layoutObjs(), this.layoutPairs(), this.alpha, this.layoutParams3d());
            this.alpha = nextAlpha3d(this.alpha);
            return sp;
        }
        const speed = forceStep(this.layoutObjs(), this.layoutPairs(), this.alpha, this.layoutParams());
        this.alpha = nextAlpha(this.alpha);
        return speed;
    }

    // ---- Per-frame ----------------------------------------------------------

    frameFor(obj, now) {
        const state = obj.node.state;
        const anim = obj.anim;
        if (state === 'dead') return 'reaction';
        if (now < anim.happyUntil) return 'reaction';
        if (state === 'infected' || state === 'exposed') {
            // Cough cycling ~400ms, offset per node so they don't sync.
            return Math.floor((now + anim.coughOffset) / 400) % 2 === 0 ? 'idle' : 'reaction';
        }
        if (state === 'quarantined') {
            // Slow sleepy alternation ~2s.
            return Math.floor((now + anim.sleepyOffset) / 2000) % 2 === 0 ? 'idle' : 'reaction';
        }
        if (now >= anim.blinkAt) {
            if (now < anim.blinkAt + 150) return 'blink';
            anim.blinkAt = now + 3000 + Math.random() * 2000;
        }
        return 'idle';
    }

    tick() {
        if (!this.renderer) return;
        // Off screen (results, map): skip all work so the phone stays cool.
        if (!this.container || !this.container.offsetParent) return;
        const now = performance.now();

        if (!this.paused && !this.physicsSettled) {
            const maxSpeed = this.layoutStep();
            // Cooled (alpha 0) and still: stop stepping until the next reheat.
            if (this.alpha === 0 && maxSpeed < 0.002) this.physicsSettled = true;
        }

        // Camera-facing direction, reused to float each face sprite just off
        // the sphere surface so faces stay readable and occlude correctly.
        _tmp2.set(0, 0, 1); // in 2D the camera always looks straight down
        const faceOffset = NODE_RADIUS + 0.08;
        if (this.is3d) {
            // Slow drift so the depth reads, paused while a tool is chosen
            // or for a few seconds after any touch.
            const dt = Math.min(0.05, (now - (this.lastTime || now)) / 1000);
            if (!this.toolMode && !this.grabbed && now - this.lastTouch > ORBIT.driftPauseMs && !this.reduceMotion) {
                this.cam3 = { ...this.cam3, yaw: this.cam3.yaw + ORBIT.driftRadPerS * dt };
            }
            this.applyCamera();
            // Fog tracks the zoom: people at the back of the web fade toward
            // the night sky, so near and far read at a glance.
            if (this.scene.fog) {
                this.scene.fog.near = this.cam3.distance * 0.8;
                this.scene.fog.far = this.cam3.distance * 2.1;
            }
        }
        this.lastTime = now;

        for (const obj of this.nodeObjs.values()) {
            obj.group.position.copy(obj.pos);
            obj.group.scale.setScalar(this.personScale);
            // In 3D each person (ring, halo, badge) turns to face the camera.
            if (this.is3d) obj.group.quaternion.copy(this.camera.quaternion);
            else obj.group.quaternion.identity();
            const frame = this.frameFor(obj, now);
            const tex = faceTextures[obj.node.state]?.[frame] || faceTextures.healthy.idle;
            if (obj.sprite.material.map !== tex) obj.sprite.material.map = tex;
            // Sick faces skip the fog too (round 16), so they read at any depth.
            const wantFog = obj.node.state !== 'infected';
            if (obj.sprite.material.fog !== wantFog) {
                obj.sprite.material.fog = wantFog;
                obj.sprite.material.needsUpdate = true;
            }

            // Scale bounce right after a vaccinate / recover action lands.
            let scale = FACE_SCALE;
            if (now < obj.anim.bounceUntil) {
                const p = 1 - (obj.anim.bounceUntil - now) / 450;
                scale = FACE_SCALE * (1 + 0.3 * Math.sin(Math.PI * Math.min(1, Math.max(0, p))));
            }
            obj.sprite.scale.set(scale, scale, 1);
            obj.sprite.position.copy(_tmp2).multiplyScalar(faceOffset);
        }

        // Infected nodes pulse so the threats stand out at a glance.
        const beat = 1 + 0.18 * Math.sin(now / 180);
        for (const obj of this.nodeObjs.values()) {
            if (obj.pulse.visible) obj.pulse.scale.setScalar(beat);
            // The carrier's crown halo throbs while it can still spread.
            if (obj.halo && obj.badgeKind === 'superSpreader') {
                const live = obj.node.state === 'infected';
                obj.halo.scale.setScalar(live ? 1 + 0.12 * Math.sin(now / 140) : 1);
                obj.halo.material.opacity = live ? 0.9 : 0.4;
            }
        }

        this.syncLinkPositions(now);

        for (let i = this.effects.length - 1; i >= 0; i--) {
            if (this.effects[i].update(now)) {
                this.effects[i].dispose?.();
                this.effects.splice(i, 1);
            }
        }

        // Virus particles (infection events).
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            const t = Math.min(1, (now - p.start) / 900);
            p.mesh.position.lerpVectors(p.from, p.to, t);
            // Slight arc so the particle reads as traveling, not sliding.
            p.mesh.position.y += Math.sin(t * Math.PI) * 0.8;
            if (t >= 1) {
                this.scene.remove(p.mesh);
                this.particles.splice(i, 1);
            }
        }

        if (this.autoFit && this.nodeObjs.size) this.easeToFit();
        this.applyCamera();
        this.updateFitButton();
        // Tiny camera shake on a sever, restored right after the render.
        let sx = 0;
        let sy = 0;
        if (now < this.shakeUntil) {
            const k = (this.shakeUntil - now) / 140;
            sx = (Math.random() - 0.5) * 0.12 * k;
            sy = (Math.random() - 0.5) * 0.12 * k;
            this.camera.position.x += sx;
            this.camera.position.y += sy;
        }
        this.renderer.render(this.scene, this.camera);
        this.camera.position.x -= sx;
        this.camera.position.y -= sy;
    }

    // ---- Sever snap ------------------------------------------------------------
    // Called by game.js just before the link is removed from the network.
    animateSever(link) {
        if (!this.scene) return;
        const a = this.nodeObjs.get(link.source && link.source.id);
        const b = this.nodeObjs.get(link.target && link.target.id);
        if (!a || !b) return;
        const start = performance.now();
        const mid = new THREE.Vector3().addVectors(a.pos, b.pos).multiplyScalar(0.5);
        const scene = this.scene;
        const halfLen = a.pos.distanceTo(b.pos) / 2;

        // 1. Two stubs whip back into their nodes with an elastic overshoot.
        const stubMat = new THREE.MeshBasicMaterial({ color: 0xffb03a, transparent: true, depthWrite: false });
        const stubGeo = new THREE.PlaneGeometry(1, LINK_WIDTHS.severRisk);
        // In 3D the flat stubs would show edge on, so only sparks, the
        // ring and the recoil play there.
        const stubs = (this.is3d ? [] : [a, b]).map((end) => {
            const m = new THREE.Mesh(stubGeo, stubMat);
            m.position.z = 0.02;
            scene.add(m);
            return { m, end };
        });
        const elastic = (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -9 * t) * Math.cos(t * 13));
        this.effects.push({
            update: (now) => {
                const t = Math.min(1, (now - start) / 380);
                const remain = Math.max(0.0001, halfLen * (1 - elastic(t)));
                for (const { m, end } of stubs) {
                    const dir = _tmp.subVectors(mid, end.pos).normalize();
                    m.scale.x = remain;
                    m.position.set(end.pos.x + dir.x * remain * 0.5, end.pos.y + dir.y * remain * 0.5, 0.02);
                    m.rotation.z = Math.atan2(dir.y, dir.x) + Math.sin(t * 20) * 0.25 * (1 - t);
                }
                stubMat.opacity = 1 - t * 0.6;
                return t >= 1;
            },
            dispose: () => {
                for (const { m } of stubs) scene.remove(m);
                stubGeo.dispose();
                stubMat.dispose();
            },
        });

        // 2. Sparks burst from the cut point.
        const sparks = [];
        for (let i = 0; i < 16; i++) {
            const mat = new THREE.MeshBasicMaterial({ color: i % 3 ? 0xffd23f : 0xffffff, transparent: true, depthWrite: false });
            const m = new THREE.Mesh(sparkGeometry, mat);
            m.position.copy(mid);
            if (!this.is3d) m.position.setZ(0.1);
            else m.quaternion.copy(this.camera.quaternion);
            scene.add(m);
            const ang = Math.random() * Math.PI * 2;
            const sp = 4 + Math.random() * 6;
            // Sparks fly across the screen plane (world x and y in 2D).
            const right = new THREE.Vector3(1, 0, 0);
            const up = new THREE.Vector3(0, 1, 0);
            if (this.is3d) {
                right.applyQuaternion(this.camera.quaternion);
                up.applyQuaternion(this.camera.quaternion);
            }
            sparks.push({ m, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, right, up });
        }
        let last = start;
        this.effects.push({
            update: (now) => {
                const dt = Math.min(0.05, (now - last) / 1000);
                last = now;
                const t = Math.min(1, (now - start) / 480);
                for (const s of sparks) {
                    s.vx *= 0.9;
                    s.vy *= 0.9;
                    s.m.position.addScaledVector(s.right, s.vx * dt).addScaledVector(s.up, s.vy * dt);
                    s.m.material.opacity = 1 - t;
                    s.m.scale.setScalar(1 - t * 0.6);
                }
                return t >= 1;
            },
            dispose: () => {
                for (const s of sparks) {
                    scene.remove(s.m);
                    s.m.material.dispose();
                }
            },
        });

        // 3. A white ring flashes outward.
        const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false });
        const ring = new THREE.Mesh(ringGeometry, ringMat);
        ring.position.copy(mid);
        if (this.is3d) ring.quaternion.copy(this.camera.quaternion);
        else ring.position.setZ(0.05);
        scene.add(ring);
        this.effects.push({
            update: (now) => {
                const t = Math.min(1, (now - start) / 300);
                ring.scale.setScalar(0.3 + t * 2.2);
                ringMat.opacity = 0.9 * (1 - t);
                return t >= 1;
            },
            dispose: () => {
                scene.remove(ring);
                ringMat.dispose();
            },
        });

        // 4. The two nodes recoil apart, and the screen ticks.
        const away = _tmp2.subVectors(b.pos, a.pos);
        if (!this.is3d) away.setZ(0);
        away.normalize().multiplyScalar(0.55);
        b.vel.add(away);
        a.vel.sub(away);
        this.physicsSettled = false;
        this.alpha = Math.max(this.alpha || 0, LAYOUT.reheatAlpha);
        this.shakeUntil = start + 140;
        this.lastTouch = start;
    }

    // Item 20 (round 24): a gentle death moment. The person's face turns
    // grey and drifts up as it fades, with one slow pale ring, before the
    // person leaves the web. About 1.6 s, no flash, no shake.
    animateDeath(node) {
        if (!this.scene) return;
        const obj = this.nodeObjs.get(node && node.id);
        if (!obj) return;
        const start = performance.now();
        const scene = this.scene;
        const pos = obj.pos.clone();
        const scale = (obj.group.scale && obj.group.scale.x) || 1;
        const up = new THREE.Vector3(0, 1, 0);
        if (this.is3d) up.applyQuaternion(this.camera.quaternion);
        const mat = new THREE.SpriteMaterial({
            map: faceTextures.dead?.idle || faceTextures.recovered?.idle || faceTextures.healthy.idle,
            color: 0xdfe6f2,
            transparent: true,
            depthWrite: false,
        });
        const ghost = new THREE.Sprite(mat);
        ghost.scale.set(FACE_SCALE * scale, FACE_SCALE * scale, 1);
        ghost.position.copy(pos);
        if (!this.is3d) ghost.position.setZ(0.3);
        ghost.renderOrder = 6;
        scene.add(ghost);
        const ringMat = new THREE.MeshBasicMaterial({ color: 0xcfe0ff, transparent: true, depthWrite: false });
        const ring = new THREE.Mesh(ringGeometry, ringMat);
        ring.position.copy(pos);
        if (this.is3d) ring.quaternion.copy(this.camera.quaternion);
        else ring.position.setZ(0.05);
        scene.add(ring);
        const ease = (t) => 1 - Math.pow(1 - t, 3);
        this.effects.push({
            update: (now) => {
                const t = Math.min(1, (now - start) / DEATH_MS);
                const e = ease(t);
                ghost.position.copy(pos).addScaledVector(up, 1.3 * scale * e);
                if (!this.is3d) ghost.position.setZ(0.3);
                const g = FACE_SCALE * scale * (1 + 0.15 * e);
                ghost.scale.set(g, g, 1);
                mat.opacity = 0.95 * (1 - t);
                const tr = Math.min(1, t / 0.7);
                ring.scale.setScalar(scale * (0.6 + 1.6 * ease(tr)));
                ringMat.opacity = 0.55 * (1 - tr);
                return t >= 1;
            },
            dispose: () => {
                scene.remove(ghost);
                scene.remove(ring);
                mat.dispose();
                ringMat.dispose();
            },
        });
    }

    // ---- Tool hookup: tap to select / apply ---------------------------------

    bindGestures(canvas) {
        const pts = new Map(); // pointerId -> { x, y } (client px)
        let press = null; // the single-finger press being tracked
        let twoPrev = null;

        const local = (e) => {
            const r = canvas.getBoundingClientRect();
            return { x: e.clientX - r.left, y: e.clientY - r.top };
        };
        const limits = () => ({ fitDistance: this.fitView?.distance });
        const userMoved = () => {
            this.autoFit = false;
        };
        const fit3Distance = () => this.fit3?.distance;
        // 3D: move a held person across the plane through them that faces
        // the camera, so they stay under the finger at their depth.
        const raycaster = new THREE.Raycaster();
        const plane = new THREE.Plane();
        const hitPoint = new THREE.Vector3();
        const dragTo3d = (obj, pt) => {
            const box = this.viewBox();
            const ndc = new THREE.Vector2((pt.x / box.widthPx) * 2 - 1, -(pt.y / box.heightPx) * 2 + 1);
            raycaster.setFromCamera(ndc, this.camera);
            this.camera.getWorldDirection(_tmp);
            plane.setFromNormalAndCoplanarPoint(_tmp, obj.pos);
            if (raycaster.ray.intersectPlane(plane, hitPoint)) obj.pos.copy(hitPoint);
        };

        const grabNodeAt = (pt) => {
            const box = this.viewBox();
            const nodes = [];
            for (const obj of this.nodeObjs.values()) {
                if (obj.node.removed || obj.boxed) continue;
                const p = this.screenPoint(obj.pos);
                nodes.push({ x: p.x - box.rect.left, y: p.y - box.rect.top, r: 0, obj });
            }
            return pickGrab(pt, nodes)?.obj || null;
        };

        const release = () => {
            if (this.grabbed) {
                this.grabbed.pinned = false;
                this.grabbed.vel.set(0, 0, 0);
                // Let the stretched network spring back into shape.
                this.alpha = Math.max(this.alpha || 0, LAYOUT.reheatAlpha);
                this.physicsSettled = false;
                this.grabbed = null;
            }
        };

        const onDown = (e) => {
            this.lastTouch = performance.now();
            canvas.setPointerCapture?.(e.pointerId);
            const pt = local(e);
            pts.set(e.pointerId, pt);
            if (pts.size === 1) {
                const rotate = e.pointerType === 'mouse' && (e.button === 2 || e.shiftKey);
                press = { id: e.pointerId, start: pt, last: pt, t: performance.now(), dragging: false, rotate, grab: rotate ? null : grabNodeAt(pt) };
            } else {
                // A second finger turns any press into a pinch or twist.
                release();
                if (press) press.cancelled = true;
                const [a, b] = [...pts.values()];
                twoPrev = [a, b];
            }
        };

        const onMove = (e) => {
            if (!pts.has(e.pointerId)) return;
            const pt = local(e);
            pts.set(e.pointerId, pt);
            const box = this.viewBox();
            this.lastTouch = performance.now();
            if (pts.size >= 2 && twoPrev && this.is3d) {
                // Pinch to zoom; moving both fingers together also orbits.
                const [a, b] = [...pts.values()];
                const d0 = Math.hypot(twoPrev[0].x - twoPrev[1].x, twoPrev[0].y - twoPrev[1].y) || 1;
                const d1 = Math.hypot(a.x - b.x, a.y - b.y) || 1;
                this.cam3 = zoom3d(this.cam3, d1 / d0, fit3Distance());
                const mx = (a.x + b.x - twoPrev[0].x - twoPrev[1].x) / 2;
                const my = (a.y + b.y - twoPrev[0].y - twoPrev[1].y) / 2;
                this.cam3 = orbitDrag(this.cam3, mx, my);
                twoPrev = [a, b];
                userMoved();
                return;
            }
            if (pts.size >= 2 && twoPrev) {
                const [a, b] = [...pts.values()];
                this.cam = twoFingerView(this.cam, twoPrev[0], twoPrev[1], a, b, box, limits());
                twoPrev = [a, b];
                userMoved();
                return;
            }
            if (!press || press.cancelled || press.id !== e.pointerId) return;
            if (!press.dragging && isDrag(press.start, pt)) press.dragging = true;
            if (!press.dragging) return;
            if (press.rotate) {
                const cx = box.widthPx / 2;
                const cy = box.heightPx / 2;
                const a0 = Math.atan2(press.last.y - cy, press.last.x - cx);
                const a1 = Math.atan2(pt.y - cy, pt.x - cx);
                this.cam = rotateAt(this.cam, { x: cx, y: cy }, a1 - a0, box);
                userMoved();
            } else if (press.grab) {
                const obj = press.grab;
                if (!this.grabbed) {
                    this.grabbed = obj;
                    obj.pinned = true;
                }
                if (this.is3d) {
                    dragTo3d(obj, pt);
                } else {
                    const w = screenToWorld(pt, this.cam, box);
                    obj.pos.set(w.x, w.y, 0);
                }
                // Keep the layout warm while dragging so contacts follow.
                this.alpha = Math.max(this.alpha || 0, LAYOUT.reheatAlpha);
                this.physicsSettled = false;
                // A held person no longer counts as a reason to re-frame.
                this.autoFit = false;
            } else if (this.is3d) {
                // One finger on empty space orbits the web.
                this.cam3 = orbitDrag(this.cam3, pt.x - press.last.x, pt.y - press.last.y);
                userMoved();
            } else {
                this.cam = panView(this.cam, press.last, pt, box);
                userMoved();
            }
            press.last = pt;
        };

        const onUp = (e) => {
            if (!pts.has(e.pointerId)) return;
            pts.delete(e.pointerId);
            if (pts.size < 2) twoPrev = null;
            if (pts.size === 1) {
                // One finger left after a pinch: keep panning from here, no tap.
                const [id, p] = [...pts.entries()][0];
                press = { id, start: p, last: p, t: performance.now(), dragging: true, grab: null, cancelled: false };
                return;
            }
            if (!press || press.id !== e.pointerId) return;
            const wasTap = !press.dragging && !press.cancelled && performance.now() - press.t <= 600;
            release();
            press = null;
            if (wasTap && e.type === 'pointerup') this.handleTap(e);
        };

        const onWheel = (e) => {
            e.preventDefault();
            const pt = local(e);
            const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015));
            this.lastTouch = performance.now();
            if (this.is3d) {
                this.cam3 = zoom3d(this.cam3, factor, fit3Distance());
                userMoved();
                return;
            }
            this.cam = zoomAt(this.cam, pt, factor, this.viewBox(), limits());
            userMoved();
        };
        const noMenu = (e) => e.preventDefault();

        canvas.addEventListener('pointerdown', onDown);
        canvas.addEventListener('pointermove', onMove);
        canvas.addEventListener('pointerup', onUp);
        canvas.addEventListener('pointercancel', onUp);
        canvas.addEventListener('wheel', onWheel, { passive: false });
        canvas.addEventListener('contextmenu', noMenu);
        this.gestureCleanup = () => {
            canvas.removeEventListener('pointerdown', onDown);
            canvas.removeEventListener('pointermove', onMove);
            canvas.removeEventListener('pointerup', onUp);
            canvas.removeEventListener('pointercancel', onUp);
            canvas.removeEventListener('wheel', onWheel);
            canvas.removeEventListener('contextmenu', noMenu);
        };
    }

    // A small Fit button appears once the player has moved, zoomed or turned
    // the network; tapping it eases back to the whole network, upright.
    mountFitButton() {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'network-fit-btn';
        btn.textContent = 'Fit';
        btn.setAttribute('aria-label', 'Show the whole network');
        btn.hidden = true;
        btn.addEventListener('click', () => this.resetView());
        this.container.appendChild(btn);
        this.fitBtn = btn;
    }

    updateFitButton() {
        if (!this.fitBtn) return;
        const show = this.is3d
            ? !this.autoFit && !!this.fit3 && Math.abs(this.cam3.distance / this.fit3.distance - 1) > 0.08
            : !this.autoFit && isOffFit(this.cam, this.fitView);
        if (this.fitBtn.hidden === show) this.fitBtn.hidden = !show;
    }

    // Screen-space, tool-aware picking (see tap-target.js): Sever snaps to
    // the nearest link, person tools snap to the nearest person.
    handleTap(event) {
        const rect = this.renderer.domElement.getBoundingClientRect();
        const toScreen = (v) => {
            _proj.copy(v).project(this.camera);
            return { x: rect.left + (_proj.x * 0.5 + 0.5) * rect.width, y: rect.top + (-_proj.y * 0.5 + 0.5) * rect.height };
        };
        const nodes = [];
        const screenOf = new Map();
        const camDist = [];
        // With a person tool chosen, only people it can work on are
        // candidates, so a vaccinated face in front never swallows a tap
        // meant for the healthy person just behind it.
        const valid = TOOL_TARGET_STATES[this.toolMode];
        for (const obj of this.nodeObjs.values()) {
            if (obj.node.removed || obj.boxed) continue;
            if (valid && !valid.includes(obj.node.state)) continue;
            const c = toScreen(obj.pos);
            // Radius on screen: offset along the camera's right vector so it
            // stays right in 3D at any angle.
            _tmp2.set(NODE_RADIUS * this.personScale, 0, 0).applyQuaternion(this.camera.quaternion).add(obj.pos);
            const edge = toScreen(_tmp2);
            screenOf.set(obj, c);
            nodes.push({ x: c.x, y: c.y, r: Math.hypot(edge.x - c.x, edge.y - c.y), node: obj.node });
            camDist.push(obj.pos.distanceTo(this.camera.position));
        }
        if (this.is3d) normalizedDepths(camDist).forEach((d, i) => (nodes[i].depth = d));
        const links = [];
        const tool = this.toolMode;
        if (!tool || tool === 'severLink') {
            for (const link of this.links) {
                const a = this.nodeObjs.get(link.source && link.source.id);
                const b = this.nodeObjs.get(link.target && link.target.id);
                const sa = a && screenOf.get(a);
                const sb = b && screenOf.get(b);
                if (!sa || !sb) continue;
                const kind = this.linkKind(link);
                links.push({ ax: sa.x, ay: sa.y, bx: sb.x, by: sb.y, link, atRisk: kind === 'risk' || kind === 'sever' });
            }
        }
        const mode = tool === 'severLink' ? 'link' : tool ? 'node' : null;
        const hit = pickTapTarget({ x: event.clientX, y: event.clientY, mode, nodes, links });
        if (!hit) return;
        if (hit.kind === 'node' && this.onNodeClick) this.onNodeClick(event, hit.node.node);
        else if (hit.kind === 'link' && this.onLinkClick) this.onLinkClick(event, hit.link.link);
    }

    // ---- Same supporting API as the D3 view ----------------------------------

    animateVirus(source, target) {
        if (!this.scene) return;
        const a = this.nodeObjs.get(source && source.id);
        const b = this.nodeObjs.get(target && target.id);
        if (!a || !b) return;
        const mesh = new THREE.Mesh(particleGeometry, particleMaterial);
        mesh.position.copy(a.pos);
        this.scene.add(mesh);
        this.particles.push({ mesh, from: a.pos.clone(), to: b.pos.clone(), start: performance.now() });
    }

    setPaused(paused) {
        // Pause halts the force layout only; face animations and rendering
        // keep running so the network stays alive while the sim is paused.
        this.paused = paused;
        if (!paused) this.physicsSettled = false;
    }
}
