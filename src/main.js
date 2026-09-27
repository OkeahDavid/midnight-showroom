import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { animate, createTimeline, onScroll, stagger } from 'animejs';
import { CARS } from './cars.js';

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const sanitize = THREE.PropertyBinding.sanitizeNodeName;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- renderer
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.localClippingEnabled = true;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1f1f1f);
scene.fog = new THREE.Fog(0x1f1f1f, 16, 34);

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(studioEnvironment(), 0.02).texture;

const camera = new THREE.PerspectiveCamera(32, innerWidth / innerHeight, 0.1, 100);

// warm key + cool rim, like the peach highlights on animejs.com
const key = new THREE.DirectionalLight(0xffc7a6, 2.2);
key.position.set(-6, 5, 4);
const rim = new THREE.DirectionalLight(0x9fc4ff, 1.0);
rim.position.set(6, 3, -6);
scene.add(key, rim, new THREE.AmbientLight(0xffffff, 0.15));

// ---------------------------------------------------------------- selective bloom
// Only things on the GLOW layer (lamps, the floor ring) bloom. Blooming the whole frame also
// caught sharp reflections on rims and chrome and turned them into glowing starbursts.
const GLOW = 1;
const glowLayer = new THREE.Layers();
glowLayer.set(GLOW);
const blackMat = new THREE.MeshBasicMaterial({ color: 0x000000 });

const glowComposer = new EffectComposer(renderer);
glowComposer.renderToScreen = false;
glowComposer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.55, 0.3, 0);
glowComposer.addPass(bloom);

const mixPass = new ShaderPass(new THREE.ShaderMaterial({
  uniforms: { baseTexture: { value: null }, bloomTexture: { value: glowComposer.renderTarget2.texture } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: 'uniform sampler2D baseTexture; uniform sampler2D bloomTexture; varying vec2 vUv; void main() { gl_FragColor = texture2D(baseTexture, vUv) + texture2D(bloomTexture, vUv); }',
}), 'baseTexture');
mixPass.needsSwap = true;

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(mixPass);
composer.addPass(new OutputPass());

const stash = new Map();
function renderGlow() {
  // non-glowing solids turn black so they still hide lamps behind them; see-through glass is
  // skipped entirely so headlights can shine through their lenses
  scene.traverseVisible((o) => {
    if (!o.isMesh && !o.isLineSegments) return;
    if (o.layers.test(glowLayer)) return;
    const mats = [].concat(o.material);
    const see = mats.some((m) => (m.transparent && m.opacity < 0.9) || m.wireframe);
    stash.set(o, { material: o.material, visible: o.visible });
    if (see || o.isLineSegments) o.visible = false;
    else o.material = blackMat;
  });
  const bg = scene.background;
  scene.background = null;
  glowComposer.render();
  scene.background = bg;
  stash.forEach((s, o) => { o.material = s.material; o.visible = s.visible; });
  stash.clear();
}

// ---------------------------------------------------------------- camera state
// intro and scroll each drive their own object; the render loop combines them
const intro = { yaw: 0, elev: 0, dist: 1, lookY: 0 };
// pan slides the car sideways on screen so it clears each section's text
const scroll = { yaw: 0, elev: 0, dist: 1, lookY: 0, pan: 0 };
const base = { yaw: 0.75, elev: 0.26, dist: 9.5 };
const lookAt = new THREE.Vector3();

function updateCamera() {
  const yaw = base.yaw + intro.yaw + scroll.yaw;
  const elev = THREE.MathUtils.clamp(base.elev + intro.elev + scroll.elev, 0.02, 1.5);
  // portrait screens: back off so the whole car fits the narrow frame, and sit it lower, under the text
  const portrait = Math.max(0, 1 - camera.aspect);
  const dist = base.dist * intro.dist * scroll.dist * THREE.MathUtils.clamp(0.9 / camera.aspect, 1, 2.1);
  camera.position.set(
    Math.sin(yaw) * Math.cos(elev) * dist,
    Math.sin(elev) * dist,
    Math.cos(yaw) * Math.cos(elev) * dist,
  );
  // narrower screens get less pan so the car doesn't slide out of frame
  // (portrait layouts stack text above the car, so no pan at all)
  const pan = camera.aspect < 1 ? 0 : scroll.pan * THREE.MathUtils.clamp(camera.aspect / 1.8, 0.35, 1);
  const px = Math.cos(yaw) * pan, pz = -Math.sin(yaw) * pan;
  camera.position.x += px;
  camera.position.z += pz;
  lookAt.set(px, 0.55 + intro.lookY + scroll.lookY + portrait * 3.2, pz);
  camera.lookAt(lookAt);
}

// ---------------------------------------------------------------- reveal (scan) planes
// solid keeps z >= scanZ, wireframe keeps z <= scanZ; sweeping scanZ front→back paints the car in
const solidPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 1000);
const wirePlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0);
function setScan(z) {
  solidPlane.constant = -z;
  wirePlane.constant = z;
}

const wireMat = new THREE.MeshBasicMaterial({
  color: 0x8fd3ff,
  wireframe: true,
  transparent: true,
  opacity: 0.22,
  depthWrite: false,
  clippingPlanes: [wirePlane],
  toneMapped: false,
});

// ---------------------------------------------------------------- floor ring
let ring = null;
let ringCount = 0;
function buildRing(len) {
  if (ring) { scene.remove(ring); ring.geometry.dispose(); }
  const r = len * 0.66;
  const geo = new THREE.RingGeometry(r, r + 0.035, 360, 1);
  const colors = [];
  const pos = geo.attributes.position;
  const col = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const a = Math.atan2(pos.getY(i), pos.getX(i));
    col.setHSL(((a / (Math.PI * 2)) + 1.3) % 1, 0.95, 0.55);
    colors.push(col.r * 1.4, col.g * 1.4, col.b * 1.4);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  ringCount = geo.index.count;
  geo.setDrawRange(0, 0);
  ring = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, side: THREE.DoubleSide }));
  ring.layers.enable(GLOW);
  ring.rotation.x = -Math.PI / 2;
  ring.rotation.z = Math.PI / 2;
  ring.position.y = 0.01;
  scene.add(ring);
}
function drawRing(duration = 1600, erase = false) {
  const s = { n: erase ? ringCount : 0 };
  return animate(s, {
    n: erase ? 0 : ringCount,
    duration,
    ease: 'inOutQuart',
    onUpdate: () => ring.geometry.setDrawRange(0, Math.floor(s.n / 6) * 6),
  });
}

// ---------------------------------------------------------------- car loading
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const entries = new Map();   // id -> prepared car
const loading = new Map();   // id -> promise

function loadCar(car, onProgress) {
  if (entries.has(car.id)) return Promise.resolve(entries.get(car.id));
  if (loading.has(car.id)) return loading.get(car.id);
  const p = new Promise((resolve, reject) => {
    loader.load(car.model3d.url.href, (gltf) => {
      const entry = prepareCar(car, gltf.scene);
      entries.set(car.id, entry);
      resolve(entry);
    }, (e) => { if (e.total && onProgress) onProgress(e.loaded / e.total); }, reject);
  });
  loading.set(car.id, p);
  return p;
}

function prepareCar(car, model) {
  const cfg = car.model3d;
  const root = new THREE.Group();     // moved when driving
  const fix = new THREE.Group();      // orientation + scale
  fix.add(model);
  root.add(fix);
  root.updateMatrixWorld(true);

  (cfg.hide || []).forEach((n) => { const o = model.getObjectByName(sanitize(n)); if (o) o.visible = false; });

  let ground = null;
  if (cfg.ground) model.traverse((o) => { if (o.isMesh && [].concat(o.material).some((m) => m.name === cfg.ground)) ground = o; });
  const bodyBox = () => {
    const b = new THREE.Box3();
    model.traverse((o) => { if (o.isMesh && o !== ground && isVisible(o)) b.expandByObject(o); });
    return b;
  };

  // longest horizontal axis becomes Z; cfg.flip turns the car round if it faces -Z
  let box = bodyBox();
  let size = box.getSize(new THREE.Vector3());
  if (size.x > size.z) fix.rotation.y = Math.PI / 2;
  if (cfg.flip) fix.rotation.y += Math.PI;
  root.updateMatrixWorld(true);

  box = bodyBox();
  size = box.getSize(new THREE.Vector3());
  fix.scale.setScalar(car.lengthM / size.z);
  root.updateMatrixWorld(true);
  box = bodyBox();
  const c = box.getCenter(new THREE.Vector3());
  fix.position.set(-c.x, -box.min.y, -c.z);
  root.updateMatrixWorld(true);
  box = bodyBox();
  size = box.getSize(new THREE.Vector3());
  const dims = { len: size.z, h: size.y, w: size.x, front: box.max.z, back: box.min.z };

  // --- materials
  const lightFront = new Set(cfg.lights?.front || []);
  const lightRear = new Set(cfg.lights?.rear || []);
  const paintNames = new Set(cfg.paint || []);
  const accentNames = new Set(cfg.accent || []);
  const paintMats = [], accentMats = [], coatMats = [], frontLights = [], rearLights = [];
  const seen = new Set();
  const meshes = [];
  model.traverse((o) => { if (o.isMesh) meshes.push(o); });
  meshes.forEach((o) => {
    if (o === ground) return;
    o.frustumCulled = false; // parts fly outside their original bounds during the intro
    const swap = (m) => {
      if (lightFront.has(m.name) || lightRear.has(m.name)) {
        const isFront = lightFront.has(m.name);
        const l = m.clone();
        l.clippingPlanes = [solidPlane];
        l.emissive = new THREE.Color(isFront ? (cfg.lights.frontColor ?? 0xdff1ff) : 0xff1a1a);
        l.emissiveIntensity = 0;
        l.toneMapped = false;
        l.userData.baseOpacity = l.opacity;
        (isFront ? frontLights : rearLights).push(l);
        o.layers.enable(GLOW);
        return l;
      }
      if (!seen.has(m)) {
        seen.add(m);
        m.clippingPlanes = [solidPlane];
        // a perfect mirror turns the key light into a pinpoint that the bloom blows up
        const minRough = m.metalness > 0.8 ? 0.2 : 0.08;
        if (m.roughness < minRough) m.roughness = minRough;
        if (m.transmission > 0) {
          // transmission needs an extra full-scene render pass; too heavy for an iGPU
          m.transmission = 0;
          m.transparent = true;
          m.opacity = Math.min(m.opacity, 0.35);
          m.roughness = 0.05;
          m.color?.set(0x0b0d10);
        }
        if (paintNames.has(m.name)) {
          // some exports ship paint as metal=1 / rough=1, which only shows a blurred env
          if (m.metalness >= 0.99 && m.roughness >= 0.99) { m.metalness = 0.45; m.roughness = 0.45; }
          m.userData.orig = { map: m.map, color: m.color.clone(), metalness: m.metalness, roughness: m.roughness, clearcoat: m.clearcoat ?? 0 };
          paintMats.push(m);
        }
        if (accentNames.has(m.name)) accentMats.push(m);
        // a mirror-smooth clear-coat shell blows highlights out through the bloom
        if (m.name === 'coat') { m.roughness = 0.14; coatMats.push(m); }
      }
      return m;
    };
    o.material = Array.isArray(o.material) ? o.material.map(swap) : swap(o.material);
  });

  // --- floor: the model's own baked shadow if it has one, else a soft radial one
  let shadowMats;
  if (ground) {
    shadowMats = [].concat(ground.material);
    shadowMats.forEach((m) => { m.transparent = true; m.opacity = 0; m.depthWrite = false; });
  } else {
    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(dims.w * 1.9, dims.len * 1.35),
      new THREE.MeshBasicMaterial({ map: radialTexture(), transparent: true, depthWrite: false, opacity: 0 }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.005;
    root.add(shadow);
    shadowMats = [shadow.material];
  }

  // --- wheels: re-pivot each wheel node round its own centre so it can roll
  const wheels = [];
  const lateral = new THREE.Vector3(1, 0, 0);
  for (const n of cfg.wheels || []) {
    const w = model.getObjectByName(sanitize(n));
    if (!w) { console.warn(`[${car.id}] wheel not found: ${n}`); continue; }
    const wb = new THREE.Box3().setFromObject(w);
    const wc = wb.getCenter(new THREE.Vector3());
    const ws = wb.getSize(new THREE.Vector3());
    const pivot = new THREE.Group();
    pivot.name = `${w.name}_pivot`;
    w.parent.add(pivot);
    pivot.position.copy(w.parent.worldToLocal(wc.clone()));
    pivot.attach(w);
    const inv = new THREE.Quaternion();
    pivot.parent.getWorldQuaternion(inv).invert();
    wheels.push({ pivot, axis: lateral.clone().applyQuaternion(inv).normalize(), radius: ws.y / 2 });
  }

  // --- parts for the explode intro
  const partsRoot = findPartsRoot(model);
  const parts = partsRoot.children.filter((p) => !ground || (p !== ground && !p.getObjectById(ground.id)));

  root.visible = false;
  scene.add(root);
  return { car, root, model, dims, paintMats, accentMats, coatMats, frontLights, rearLights, shadowMats, wheels, parts, meshes: meshes.filter((m) => m !== ground) };
}

function isVisible(o) {
  for (let p = o; p; p = p.parent) if (!p.visible) return false;
  return true;
}

function spinWheels(entry, travelled) {
  for (const w of entry.wheels) w.pivot.setRotationFromAxisAngle(w.axis, travelled / w.radius);
}

function setLights(entry, on, instant = false) {
  const apply = (mats, intensity) => mats.forEach((m) => {
    const target = { emissiveIntensity: on ? intensity : 0, opacity: on ? Math.max(m.userData.baseOpacity, 0.9) : m.userData.baseOpacity };
    if (instant) Object.assign(m, target);
    else animate(m, { ...target, duration: 180, ease: on ? 'outBounce' : 'outQuad' });
  });
  apply(entry.frontLights, 4);
  apply(entry.rearLights, 3);
}

// ---------------------------------------------------------------- paint
const FINISH = {
  solid: { metalness: 0.05, roughness: 0.32, clearcoat: 1 },
  metallic: { metalness: 0.6, roughness: 0.3, clearcoat: 1 },
  matte: { metalness: 0.35, roughness: 0.72, clearcoat: 0 },
};
function tint(m, hex, instant) {
  const c = new THREE.Color(hex);
  if (instant) m.color.copy(c);
  else animate(m.color, { r: c.r, g: c.g, b: c.b, duration: 700, ease: 'outQuad' });
}

function applyPaint(entry, paint, instant = false) {
  entry.paintMats.forEach((m) => {
    const o = m.userData.orig;
    if (paint.carbon) {
      // back to the model's own exposed-carbon texture
      if (m.map !== o.map) { m.map = o.map; m.needsUpdate = true; }
      tint(m, o.color, instant);
      Object.assign(m, { metalness: o.metalness, roughness: o.roughness });
      if ('clearcoat' in m) m.clearcoat = o.clearcoat;
      return;
    }
    const f = FINISH[paint.finish] || FINISH.metallic;
    // a painted body loses the carbon weave; plain paint materials have no map to begin with
    if (o.map && m.map) { m.map = null; m.needsUpdate = true; }
    tint(m, paint.hex, instant);
    Object.assign(m, { metalness: f.metalness, roughness: f.roughness });
    if ('clearcoat' in m) m.clearcoat = f.clearcoat ? o.clearcoat || f.clearcoat : 0;
  });
  if (paint.accent) entry.accentMats.forEach((m) => tint(m, paint.accent, instant));
  // the Porsche's separate glossy clear-coat shell can't be matte
  entry.coatMats.forEach((m) => (m.visible = paint.finish !== 'matte'));
}

function swatchBackground(p) {
  if (p.carbon) return `linear-gradient(135deg, #1c1c1c 55%, ${p.accent} 55%)`;
  if (p.accent) return `linear-gradient(135deg, ${p.hex} 70%, ${p.accent} 70%)`;
  return p.hex;
}

// ---------------------------------------------------------------- intro: parts fly in, scan paints, lights on
function explode(entry) {
  const { dims } = entry;
  const centre = new THREE.Vector3(0, dims.h * 0.4, 0);
  const tmp = new THREE.Vector3();
  return entry.parts.map((p, i) => {
    const home = p.position.clone();
    const homeRot = p.rotation.clone();
    const wc = new THREE.Box3().setFromObject(p).getCenter(new THREE.Vector3());
    const dir = wc.clone().sub(centre);
    // mostly up and out, and not too far: big parts thrown toward the camera fill the whole frame
    dir.y = Math.max(dir.y, 0) + 0.9;
    if (dir.lengthSq() < 1e-4) dir.set(0, 1, 0);
    dir.normalize();
    const spread = dims.len * (0.3 + seeded(i) * 0.35);
    const worldStart = p.getWorldPosition(new THREE.Vector3()).addScaledVector(dir, spread);
    const localStart = p.parent.worldToLocal(tmp.copy(worldStart)).clone();
    const jitter = (k) => (seeded(i * 7 + k) - 0.5) * 0.8;
    p.position.copy(localStart);
    p.rotation.set(homeRot.x + jitter(1), homeRot.y + jitter(2), homeRot.z + jitter(3));
    // distance from the centre decides the order: inner parts land first
    return { p, home, homeRot, order: wc.length() };
  }).sort((a, b) => a.order - b.order);
}

function playIntro(entry) {
  const { dims } = entry;
  // visible before collecting wires: isVisible() walks up to the root, which starts hidden
  setScan(1000);
  entry.root.visible = true;
  const wires = entry.meshes.filter(isVisible).map((o) => {
    const w = new THREE.Mesh(o.geometry, wireMat);
    w.frustumCulled = false;
    o.add(w);
    return w;
  });
  const sheet = new THREE.Mesh(
    new THREE.PlaneGeometry(dims.w * 1.25, dims.h * 1.35),
    new THREE.MeshBasicMaterial({ color: 0x8fd3ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }),
  );
  sheet.position.y = dims.h * 0.6;
  sheet.add(new THREE.LineSegments(
    new THREE.EdgesGeometry(sheet.geometry),
    new THREE.LineBasicMaterial({ color: 0xcfeeff, transparent: true, opacity: 0, toneMapped: false }),
  ));
  scene.add(sheet);

  // everything stays wireframe until the scan starts (setScan(1000) above), wherever the parts are flying
  const partAnims = explode(entry);
  Object.assign(intro, { yaw: -1.4, elev: 0.9, dist: 1.7, lookY: 0.4 });

  // cars with 100+ parts get a tighter stagger so every part has landed before the scan
  const stagger = Math.min(55, 1100 / partAnims.length);
  const flight = 1400;
  const landed = 300 + (partAnims.length - 1) * stagger + flight;
  const scanStart = Math.max(2600, landed + 100);
  const scanDur = 1800;

  return new Promise((resolve) => {
    const tl = createTimeline({
      defaults: { ease: 'outExpo' },
      onComplete: () => {
        setScan(dims.back - 1000);
        wires.forEach((w) => w.removeFromParent());
        sheet.removeFromParent();
        resolve();
      },
    });
    // camera swoops down from above while parts fly home
    tl.add(intro, { yaw: 0, elev: 0, dist: 1, lookY: 0, duration: scanStart + 1000, ease: 'inOutQuart' }, 0);
    partAnims.forEach(({ p, home, homeRot }, i) => {
      const at = 300 + i * stagger;
      tl.add(p.position, { x: home.x, y: home.y, z: home.z, duration: flight }, at);
      tl.add(p.rotation, { x: homeRot.x, y: homeRot.y, z: homeRot.z, duration: flight }, at);
    });
    const scan = { z: dims.front + 0.05 };
    tl.add(sheet.material, { opacity: [0, 0.12], duration: 250, ease: 'linear' }, scanStart)
      .add(sheet.children[0].material, { opacity: [0, 0.9], duration: 250, ease: 'linear' }, scanStart)
      .add(scan, {
        z: dims.back - 0.05,
        duration: scanDur,
        ease: 'inOutSine',
        onUpdate: () => {
          if (tl.currentTime < scanStart) return; // stay all-wireframe until the sheet arrives
          setScan(scan.z);
          sheet.position.z = scan.z;
        },
      }, scanStart)
      .add(sheet.material, { opacity: 0, duration: 300, ease: 'linear' }, scanStart + scanDur - 200)
      .add(sheet.children[0].material, { opacity: 0, duration: 300, ease: 'linear' }, scanStart + scanDur - 200)
      .add(entry.shadowMats, { opacity: 1, duration: 1200, ease: 'outQuad' }, scanStart + 400)
      .call(() => { setLights(entry, true); drawRing(); }, scanStart + scanDur - 100);
  });
}

// ---------------------------------------------------------------- transitions: drive out, drive in
const DRIVE = 20; // metres travelled on and off stage

function driveOut(entry) {
  const s = { z: 0 };
  return new Promise((resolve) => animate(s, {
    z: DRIVE,
    duration: 1300,
    ease: 'inQuad',
    onUpdate: () => { entry.root.position.z = s.z; spinWheels(entry, s.z); },
    onComplete: () => {
      entry.root.visible = false;
      entry.root.position.z = 0;
      resolve();
    },
  }));
}

function driveIn(entry) {
  const s = { z: -DRIVE };
  setScan(-1000); // show everything
  setLights(entry, false, true);
  entry.shadowMats.forEach((m) => (m.opacity = 1));
  entry.root.position.z = s.z;
  entry.root.visible = true;
  spinWheels(entry, s.z);
  return new Promise((resolve) => animate(s, {
    z: 0,
    duration: 1900,
    ease: 'outQuart',
    onUpdate: () => { entry.root.position.z = s.z; spinWheels(entry, s.z); },
    onComplete: resolve,
  }));
}

// ---------------------------------------------------------------- UI
const $ = (sel) => document.querySelector(sel);
const picker = $('#picker');
const pctEl = $('#loader-pct');
let current = null;   // active entry
let busy = false;

CARS.forEach((car) => {
  const b = document.createElement('button');
  b.className = 'pick';
  b.dataset.id = car.id;
  b.innerHTML = `<span class="pick-brand">${car.brand}</span><span class="pick-model">${car.short}</span>`;
  b.addEventListener('click', () => showCar(car.id));
  b.addEventListener('pointerenter', () => loadCar(car)); // warm the cache on hover
  picker.appendChild(b);
});

function renderText(car) {
  document.title = `${car.brand} ${car.model} · Midnight Showroom`;
  picker.querySelectorAll('.pick').forEach((b) => b.setAttribute('aria-current', b.dataset.id === car.id ? 'true' : 'false'));
  $('#hero-brand').textContent = `${car.brand} · ${car.generation}`;
  $('#hero-model').textContent = car.model;
  $('#hero-years').textContent = car.years;
  $('#hero-lede').textContent = car.lede;
  $('#specs').innerHTML = car.specs.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
  $('#story').innerHTML = car.story.map((t) => `<p>${t}</p>`).join('');
  $('#details').innerHTML = car.details.map((t) => `<li>${t}</li>`).join('');
  $('#paint-note').textContent = car.paintNote || 'Factory colours offered on this model. Swatches are on-screen approximations.';
  const sw = $('#swatches');
  sw.innerHTML = '';
  car.paints.forEach((p) => {
    const b = document.createElement('button');
    b.className = 'swatch';
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', 'false');
    b.innerHTML = `<i style="background:${swatchBackground(p)}"></i><span>${p.name}<small>${p.code}</small></span>`;
    b.addEventListener('click', () => {
      sw.querySelectorAll('.swatch').forEach((s) => s.setAttribute('aria-checked', 'false'));
      b.setAttribute('aria-checked', 'true');
      if (current?.car.id === car.id) applyPaint(current, p);
    });
    sw.appendChild(b);
  });
}

function hideText() {
  document.querySelectorAll('.panel > *').forEach((el) => { el.style.opacity = 0; el.style.transform = 'translateY(24px)'; });
}

function revealText(panel) {
  animate(panel.children, { opacity: [0, 1], translateY: [24, 0], delay: stagger(90), duration: 900, ease: 'outExpo' });
}

const io = new IntersectionObserver((entries) => {
  entries.forEach((e) => { if (e.isIntersecting) { revealText(e.target); io.unobserve(e.target); } });
}, { threshold: 0.3 });
function observePanels() {
  document.querySelectorAll('.panel:not(.hero)').forEach((p) => { io.unobserve(p); io.observe(p); });
}

async function scrollToTop() {
  if (scrollY < 2) return;
  scrollTo({ top: 0, behavior: reducedMotion ? 'auto' : 'smooth' });
  const t0 = performance.now();
  while (scrollY > 2 && performance.now() - t0 < 1500) await wait(50);
}

function carById(id) { return CARS.find((c) => c.id === id) || CARS[0]; }

function stageCar(entry) {
  const car = entry.car;
  current = entry;
  renderText(car);
  base.dist = car.lengthM * 2.1;
  buildRing(entry.dims.len);
  if (car.paints[0]) {
    applyPaint(entry, car.paints[0], true);
    $('#swatches .swatch')?.setAttribute('aria-checked', 'true');
  }
}

function showInstantly(entry) {
  entry.root.visible = true;
  entry.shadowMats.forEach((m) => (m.opacity = 1));
  setScan(-1000);
  setLights(entry, true, true);
  ring.geometry.setDrawRange(0, ringCount);
}

async function showCar(id) {
  const car = carById(id);
  if (busy || current?.car.id === car.id) return;
  busy = true;
  history.replaceState(null, '', `#${car.id}`);
  const btn = picker.querySelector(`[data-id="${car.id}"]`);
  btn.classList.add('loading');
  const nextPromise = loadCar(car);
  await scrollToTop();
  document.body.classList.add('locked');
  hideText();
  if (current && !reducedMotion) {
    drawRing(900, true);
    await driveOut(current);
  } else if (current) {
    current.root.visible = false;
  }
  const next = await nextPromise;
  btn.classList.remove('loading');
  stageCar(next);
  if (reducedMotion) showInstantly(next);
  else {
    await driveIn(next);
    setLights(next, true);
    drawRing(1200);
  }
  revealText($('.hero'));
  observePanels();
  document.body.classList.remove('locked');
  busy = false;
}

// first car: load, then the part-by-part assembly
async function start() {
  const car = carById(location.hash.slice(1));
  busy = true;
  const entry = await loadCar(car, (f) => (pctEl.textContent = Math.round(f * 100) + '%'));
  stageCar(entry);
  $('#loader').classList.add('done');
  renderer.setAnimationLoop(tick);
  if (reducedMotion) showInstantly(entry);
  else await playIntro(entry);
  document.body.classList.remove('locked');
  setupScroll();
  revealText($('.hero'));
  observePanels();
  busy = false;
  preloadRest();
}

async function preloadRest() {
  for (const car of CARS) {
    if (entries.has(car.id)) continue;
    await new Promise((r) => (window.requestIdleCallback || setTimeout)(r));
    await loadCar(car).catch((e) => console.error(e));
  }
}

addEventListener('hashchange', () => showCar(location.hash.slice(1)));

// ---------------------------------------------------------------- scroll
function setupScroll() {
  createTimeline({
    defaults: { duration: 1000, ease: 'inOutSine' },
    autoplay: onScroll({
      target: '#track',
      enter: { target: 'top', container: 'top' },
      leave: { target: 'bottom', container: 'bottom' },
      sync: 0.12,
    }),
  })
    .add(scroll, { yaw: 0.85, elev: -0.2, dist: 1.05, lookY: 0.0, pan: 1.6 })      // side profile, specs right
    .add(scroll, { yaw: 2.55, elev: 0.1, dist: 1.15, lookY: 0.05, pan: -1.5 })     // rear three-quarter, story left
    .add(scroll, { yaw: 3.9, elev: 0.75, dist: 1.2, lookY: -0.1, pan: 1.7 })       // high view, details right
    .add(scroll, { yaw: Math.PI * 2 - 0.2, elev: 0.05, dist: 0.95, lookY: -0.6, pan: 0 }); // paint, car lifted above swatches
}

// ---------------------------------------------------------------- loop
function tick() {
  updateCamera();
  renderGlow();
  composer.render();
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
  glowComposer.setSize(innerWidth, innerHeight);
  bloom.resolution.set(innerWidth / 2, innerHeight / 2);
});

start().catch((err) => { pctEl.textContent = 'Failed to load'; console.error(err); });

// ---------------------------------------------------------------- helpers
function findPartsRoot(model) {
  // the node with the most children is the one holding the separate car parts
  let best = model;
  model.traverse((o) => { if (o.children.length > best.children.length) best = o; });
  return best;
}

function seeded(n) {
  const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function radialTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grd.addColorStop(0, 'rgba(0,0,0,0.85)');
  grd.addColorStop(0.55, 'rgba(0,0,0,0.45)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// dark studio with soft light strips; every emitter stays under the bloom threshold
// so reflections read as streaks on the paint instead of blowing out into glow
function studioEnvironment() {
  const env = new THREE.Scene();
  env.add(new THREE.Mesh(
    new THREE.SphereGeometry(20, 32, 16),
    new THREE.MeshBasicMaterial({ color: 0x2a2a2a, side: THREE.BackSide }),
  ));
  const strip = (w, h, color, intensity, pos, lookAt = [0, 0, 0]) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide }),
    );
    m.position.set(...pos);
    m.lookAt(...lookAt);
    env.add(m);
  };
  strip(14, 3, 0xffffff, 1.2, [0, 9, 0]);          // overhead softbox
  strip(2, 10, 0xffb38a, 1.6, [-9, 3, 2]);         // warm peach strip, left
  strip(2, 10, 0x9fc4ff, 1.1, [9, 3, -2]);         // cool strip, right
  strip(10, 1.2, 0xffffff, 0.8, [0, 2, -10]);      // low rear fill
  return env;
}

// dev-only handle for inspecting the scene from the console
if (process.env.NODE_ENV !== 'production') window.__showroom = { THREE, scene, entries, camera, bloom, applyPaint, showCar };
