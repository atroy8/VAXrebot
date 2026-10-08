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
// Layout: a small custom 3D force simulation (repulsion + link springs +
// centering gravity) warmed up synchronously on layout, then settled
// per-frame. Touch: OrbitControls (rotate / pinch zoom); a quick tap
// (not a drag) raycasts nodes first, then links, and fires the same
// onNodeClick / onLinkClick callbacks game.js wires to tool application.
//
// Fully offline: three.js and all face PNGs are bundled by Vite.
// Perf: pixel ratio capped at 2, shared geometry/materials, one
// LineSegments draw for all links, per-node work is O(1) per frame.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// Bundle every face frame at build time so the game works fully offline.
// Map ends up as: textures[state][frame] -> THREE.Texture
const faceModules = import.meta.glob('../assets/faces/*/*.png', {
    eager: true,
    query: '?url',
    import: 'default',
});

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
// Link tap tolerance in world units.
const LINK_TAP_TOLERANCE = 0.45;

// Physics tuning (world units, per-frame integration).
const REST_LENGTH = 3.0;
const SPRING_K = 0.08;
const REPEL_DIST = 3.0;
const REPEL_K = 1.6;
const GRAVITY = 0.015;
const DAMPING = 0.85;
const MAX_SPEED = 1.5;
const WARMUP_STEPS = 160;

const _tmp = new THREE.Vector3();
const _tmp2 = new THREE.Vector3();
const _ray = new THREE.Ray();

const sphereGeometry = new THREE.SphereGeometry(NODE_RADIUS, 14, 10);
const sphereMaterials = {};
for (const state of STATES) {
    sphereMaterials[state] = new THREE.MeshLambertMaterial({ color: STATE_COLORS[state] });
}
const particleGeometry = new THREE.SphereGeometry(0.16, 8, 6);
const particleMaterial = new THREE.MeshBasicMaterial({ color: 0xdc3545 });

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
        this.controls = null;
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
        this.paused = false;
        this.physicsSettled = true;
        this.settleCalmFrames = 0;
        this.lastTime = 0;
    }

    setup({ onNodeClick, onLinkClick }) {
        this.onNodeClick = onNodeClick;
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
        canvas.style.touchAction = 'none';
        this.container.appendChild(canvas);

        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(48, 1, 0.1, 200);
        this.camera.position.set(0, 5, 20);

        this.scene.add(new THREE.HemisphereLight(0xffffff, 0x223344, 1.0));
        const dir = new THREE.DirectionalLight(0xffffff, 0.9);
        dir.position.set(5, 10, 7);
        this.scene.add(dir);

        this.controls = new OrbitControls(this.camera, canvas);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.12;
        this.controls.minDistance = 4;
        this.controls.maxDistance = 45;
        this.controls.enablePan = false;

        this.nodeGroup = new THREE.Group();
        this.scene.add(this.nodeGroup);

        this.resize();
        this.resizeObserver = new ResizeObserver(() => this.resize());
        this.resizeObserver.observe(this.container);

        this.bindTap(canvas);

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
        if (this.controls) {
            this.controls.dispose();
            this.controls = null;
        }
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

        group.position.copy(pos);
        this.nodeGroup.add(group);
        this.nodePickMeshes.push(sphere);

        return {
            node,
            group,
            sphere,
            sprite,
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
            fibonacciSphere(nodes.length, 4 + nodes.length * 0.09, starts);
        }
        let i = 0;
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
                if (node.state === 'recovered' || node.state === 'vaccinated') {
                    obj.anim.happyUntil = now + 1000;
                    obj.anim.bounceUntil = now + 450;
                }
                obj.prevState = node.state;
            }
        }
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
        if (countChanged || isInitial) {
            const radius = 4 + nodes.length * 0.09;
            this.camera.position.set(0, radius * 0.45, radius * 2.6);
            this.controls.target.set(0, 0, 0);
            for (let s = 0; s < WARMUP_STEPS; s++) this.layoutStep();
        }
        this.physicsSettled = false;
        this.settleCalmFrames = 0;
    }

    rebuildLinks() {
        if (this.linkMesh) {
            this.scene.remove(this.linkMesh);
            this.linkMesh.geometry.dispose();
            this.linkMesh = null;
        }
        const count = this.links.length;
        this.linkPositions = new Float32Array(count * 6);
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(this.linkPositions, 3));
        this.linkMesh = new THREE.LineSegments(
            geo,
            new THREE.LineBasicMaterial({ color: 0x8fa3bf, transparent: true, opacity: 0.45 })
        );
        this.linkMesh.frustumCulled = false;
        this.scene.add(this.linkMesh);
        this.syncLinkPositions();
    }

    syncLinkPositions() {
        if (!this.linkMesh) return;
        const arr = this.linkPositions;
        let k = 0;
        for (const link of this.links) {
            const a = this.nodeObjs.get(link.source && link.source.id);
            const b = this.nodeObjs.get(link.target && link.target.id);
            const pa = a ? a.pos : _tmp.set(0, 0, 0);
            const pb = b ? b.pos : _tmp2.set(0, 0, 0);
            arr[k++] = pa.x; arr[k++] = pa.y; arr[k++] = pa.z;
            arr[k++] = pb.x; arr[k++] = pb.y; arr[k++] = pb.z;
        }
        this.linkMesh.geometry.attributes.position.needsUpdate = true;
    }

    // ---- Layout ------------------------------------------------------------

    layoutStep() {
        const objs = [...this.nodeObjs.values()];
        const n = objs.length;
        // Pairwise repulsion (n <= 60, so O(n^2) is trivial).
        for (let i = 0; i < n; i++) {
            const a = objs[i];
            for (let j = i + 1; j < n; j++) {
                const b = objs[j];
                _tmp.subVectors(a.pos, b.pos);
                const d2 = _tmp.lengthSq();
                if (d2 < REPEL_DIST * REPEL_DIST && d2 > 1e-6) {
                    const d = Math.sqrt(d2);
                    _tmp.multiplyScalar(((REPEL_DIST - d) * REPEL_K) / d);
                    a.vel.add(_tmp);
                    b.vel.sub(_tmp);
                }
            }
        }
        // Link springs.
        for (const link of this.links) {
            const a = this.nodeObjs.get(link.source && link.source.id);
            const b = this.nodeObjs.get(link.target && link.target.id);
            if (!a || !b) continue;
            _tmp.subVectors(b.pos, a.pos);
            const d = _tmp.length() || 0.001;
            _tmp.multiplyScalar(((d - REST_LENGTH) * SPRING_K) / d);
            a.vel.add(_tmp);
            b.vel.sub(_tmp);
        }
        // Integrate with centering gravity and damping.
        let maxSpeed = 0;
        for (const o of objs) {
            o.vel.addScaledVector(o.pos, -GRAVITY);
            const sp = o.vel.length();
            if (sp > MAX_SPEED) o.vel.multiplyScalar(MAX_SPEED / sp);
            o.vel.multiplyScalar(DAMPING);
            o.pos.add(o.vel);
            if (o.pos.length() > 15) o.pos.setLength(15);
            if (sp > maxSpeed) maxSpeed = sp;
        }
        return maxSpeed;
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
        const now = performance.now();

        if (!this.paused && !this.physicsSettled) {
            const maxSpeed = this.layoutStep();
            if (maxSpeed < 0.01) {
                this.settleCalmFrames++;
                if (this.settleCalmFrames > 30) this.physicsSettled = true;
            } else {
                this.settleCalmFrames = 0;
            }
        }

        // Camera-facing direction, reused to float each face sprite just off
        // the sphere surface so faces stay readable and occlude correctly.
        _tmp2.subVectors(this.camera.position, this.controls.target).normalize();
        const faceOffset = NODE_RADIUS + 0.08;

        for (const obj of this.nodeObjs.values()) {
            obj.group.position.copy(obj.pos);
            const frame = this.frameFor(obj, now);
            const tex = faceTextures[obj.node.state]?.[frame] || faceTextures.healthy.idle;
            if (obj.sprite.material.map !== tex) obj.sprite.material.map = tex;

            // Scale bounce right after a vaccinate / recover action lands.
            let scale = FACE_SCALE;
            if (now < obj.anim.bounceUntil) {
                const p = 1 - (obj.anim.bounceUntil - now) / 450;
                scale = FACE_SCALE * (1 + 0.3 * Math.sin(Math.PI * Math.min(1, Math.max(0, p))));
            }
            obj.sprite.scale.set(scale, scale, 1);
            obj.sprite.position.copy(_tmp2).multiplyScalar(faceOffset);
        }

        this.syncLinkPositions();

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

        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }

    // ---- Tool hookup: tap to select / apply ---------------------------------

    bindTap(canvas) {
        const ndc = new THREE.Vector2();
        let downX = 0, downY = 0, downT = 0;

        canvas.addEventListener('pointerdown', (e) => {
            downX = e.clientX; downY = e.clientY; downT = performance.now();
        });
        canvas.addEventListener('pointerup', (e) => {
            const moved = Math.hypot(e.clientX - downX, e.clientY - downY);
            if (moved > 10 || performance.now() - downT > 600) return; // it was a drag
            this.handleTap(e, ndc);
        });
    }

    handleTap(event, ndc) {
        const rect = this.renderer.domElement.getBoundingClientRect();
        ndc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        ndc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(ndc, this.camera);

        // Nodes first (same priority as the D3 view's circle hit targets).
        const hits = raycaster.intersectObjects(this.nodePickMeshes, false);
        if (hits.length > 0) {
            const obj = this.nodeObjs.get(hits[0].object.userData.nodeId);
            if (obj && this.onNodeClick) this.onNodeClick(event, obj.node);
            return;
        }

        // Then links, for the sever tool: manual ray-to-segment test keeps
        // this independent of Line raycast internals.
        _ray.copy(raycaster.ray);
        let best = null;
        let bestDist = Infinity;
        for (const link of this.links) {
            const a = this.nodeObjs.get(link.source && link.source.id);
            const b = this.nodeObjs.get(link.target && link.target.id);
            if (!a || !b) continue;
            const distSq = _ray.distanceSqToSegment(a.pos, b.pos, null, _tmp);
            if (distSq < LINK_TAP_TOLERANCE * LINK_TAP_TOLERANCE) {
                const along = _tmp.distanceToSquared(_ray.origin);
                if (along < bestDist) {
                    bestDist = along;
                    best = link;
                }
            }
        }
        if (best && this.onLinkClick) this.onLinkClick(event, best);
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
        if (!paused) {
            this.physicsSettled = false;
            this.settleCalmFrames = 0;
        }
    }
}
