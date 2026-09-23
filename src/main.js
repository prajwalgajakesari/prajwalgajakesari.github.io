import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { buildBike } from './bike.js';
import { startStage } from './stages/earth.js';
import { mapStage, himalayaStage } from './stages/data.js';
import { modelStage } from './stages/model.js';
import { machineStage, printStage, orbitStage } from './stages/space.js';
import { Engine } from './audio.js';
import { clamp, lerp, smooth, ease, rng } from './util.js';

const $ = (id) => document.getElementById(id);
const mobile = matchMedia('(max-width: 760px)').matches || matchMedia('(pointer: coarse)').matches;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ───────────────────────── pipeline rail ─────────────────────────
const ICONS = {
  source: '<circle cx="12" cy="12" r="4.4"/><path d="M12 3v3.6M12 17.4V21M3 12h3.6M17.4 12H21"/>',
  ingest: '<path d="M12 3v10.5"/><path d="M7.5 9.5 12 14l4.5-4.5"/><path d="M4 19.5h16"/>',
  enrich: '<path d="M3 18 9 8l4 5 3-4 4 9Z"/>',
  model: '<rect x="9.5" y="9.5" width="5" height="5" rx="1"/><rect x="2.5" y="3" width="4.5" height="4"/><rect x="17" y="3" width="4.5" height="4"/><rect x="2.5" y="17" width="4.5" height="4"/><rect x="17" y="17" width="4.5" height="4"/><path d="M7 5.5 9.8 10M17 5.5 14.2 10M7 18.5 9.8 14M17 18.5 14.2 14"/>',
  serve: '<circle cx="5" cy="12" r="1.8"/><circle cx="19" cy="6" r="1.8"/><circle cx="19" cy="18" r="1.8"/><path d="M6.6 11 17.4 6.6M6.6 13 17.4 17.4"/>',
  launch: '<path d="M12 21v-4"/><path d="M12 3c2.5 2.4 3.5 5.5 3.5 8.5 0 2-.7 3.7-1.5 5h-4c-.8-1.3-1.5-3-1.5-5C8.5 8.5 9.5 5.4 12 3Z"/><path d="M8.5 15 6 18h3M15.5 15 18 18h-3"/>',
  orbit: '<circle cx="12" cy="12" r="4"/><ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(-24 12 12)"/>',
};
const NODES = [
  { key: 'source', name: 'Source', sub: 'rider #001', detail: 'KTM 890 · GPS stream' },
  { key: 'ingest', name: 'Ingest', sub: 'MotoGenie', detail: '14,738 places · 3,246 routes' },
  { key: 'enrich', name: 'Enrich', sub: 'Himalaya', detail: 'altitude · season · permits' },
  { key: 'model', name: 'Model', sub: 'star schema', detail: 'Trino · DataForge · CivilOS' },
  { key: 'serve', name: 'Serve', sub: 'apps + AI', detail: 'MotoGenie · agent tooling' },
  { key: 'launch', name: 'Launch', sub: 'additive', detail: 'print → 100 km' },
  { key: 'orbit', name: 'Orbit', sub: 'sink', detail: 'contact' },
];
const ODO = [0, 12.4, 64.8, 443.5, 512, 512.1, Infinity]; // cumulative km, drives the odometer
const svg = (key) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[key] || ''}</svg>`;
const sections = [...document.querySelectorAll('.stage')];
const nodeList = $('rail-nodes');
NODES.forEach((n, i) => {
  const li = document.createElement('li');
  li.innerHTML = `<button type="button" class="node" aria-label="Node ${i + 1}: ${n.name}">
    <span class="node-glyph">${svg(n.key)}</span>
    <span class="node-txt"><span class="node-name">${String(i + 1).padStart(2, '0')} · ${n.name}</span><span class="node-sub">${n.sub}</span></span>
    <span class="node-dot"></span></button>`;
  li.querySelector('button').addEventListener('click', () => goTo(i));
  nodeList.appendChild(li);
});
const nodeEls = [...nodeList.querySelectorAll('.node')];
$('rbf-body').innerHTML = NODES.map((n, i) => `<tr><td><b>${String(i + 1).padStart(2, '0')}</b>${n.name}</td><td>${svg(n.key)}</td><td>${n.sub}<small>${n.detail}</small></td></tr>`).join('');
const dlg = $('rb-full');
$('rail-log').addEventListener('click', () => dlg.showModal());
$('rbf-close').addEventListener('click', () => dlg.close());
$('rbf-print').addEventListener('click', () => window.print());

function goTo(i) {
  const s = sections[i];
  const y = i === 0 ? 0 : s.offsetTop + innerHeight * 0.1;
  window.scrollTo({ top: y, behavior: reduced ? 'auto' : 'smooth' });
}

// reveal on scroll
const io = new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && e.target.classList.add('in')), { threshold: 0.12 });
document.querySelectorAll('.reveal').forEach((el) => io.observe(el));

// ───────────────────────── flight computer ─────────────────────────
const fcText = $('fc-text');
let fcTarget = '', fcShown = '', fcTimer = 0;
function fc(text, instant = false) {
  if (text === fcTarget) return;
  fcTarget = text;
  if (instant || reduced) { fcShown = text; fcText.textContent = text; return; }
  fcShown = '';
  clearInterval(fcTimer);
  fcTimer = setInterval(() => {
    fcShown = fcTarget.slice(0, fcShown.length + 1);
    fcText.textContent = fcShown;
    if (fcShown === fcTarget) clearInterval(fcTimer);
  }, 22);
}

// ───────────────────────── renderer ─────────────────────────
let renderer = null;
try {
  renderer = new THREE.WebGLRenderer({ canvas: $('gl'), antialias: true, powerPreference: 'high-performance' });
} catch (e) { renderer = null; }
if (!renderer) {
  document.body.classList.add('no-webgl');
  fc('WebGL unavailable. Running in instrument-only mode.', true);
}

const dpr = Math.min(devicePixelRatio || 1, mobile ? 1.5 : 1.75);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.05, 2000);
let composer = null;

// sky dome + stars follow the camera
const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), new THREE.ShaderMaterial({
  uniforms: {
    top: { value: new THREE.Color() }, horizon: { value: new THREE.Color() }, bottom: { value: new THREE.Color() },
    sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunColor: { value: new THREE.Color() }, sunAmt: { value: 0 },
  },
  vertexShader: /* glsl */ `varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position.z = gl_Position.w; }`,
  fragmentShader: /* glsl */ `
    uniform vec3 top, horizon, bottom, sunDir, sunColor; uniform float sunAmt; varying vec3 vDir;
    void main() {
      vec3 d = normalize(vDir);
      vec3 c = d.y > 0.0 ? mix(horizon, top, smoothstep(0.0, 0.32, d.y)) : mix(horizon, bottom, smoothstep(0.0, 0.2, -d.y));
      float s = max(dot(d, normalize(sunDir)), 0.0);
      c += sunColor * sunAmt * (pow(s, 900.0) * 8.0 + pow(s, 18.0) * 0.35 + pow(s, 4.0) * 0.06);
      gl_FragColor = vec4(c, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
  side: THREE.BackSide, depthWrite: false, fog: false,
}));
sky.frustumCulled = false;
sky.renderOrder = -2;
scene.add(sky);
// eased sky target so stage changes cross-fade the horizon instead of snapping
const skyTarget = { top: new THREE.Color(), horizon: new THREE.Color(), bottom: new THREE.Color(), sunDir: new THREE.Vector3(0, 1, 0), sunColor: new THREE.Color(), sunAmt: 0 };

const SN = mobile ? 1500 : 3500;
const starGeo = new THREE.BufferGeometry();
const sp = new Float32Array(SN * 3), ss = new Float32Array(SN);
const SR = rng(99);
for (let i = 0; i < SN; i++) {
  const u = SR() * 2 - 1, a = SR() * Math.PI * 2, r = Math.sqrt(1 - u * u);
  sp.set([r * Math.cos(a) * 800, u * 800, r * Math.sin(a) * 800], i * 3);
  ss[i] = Math.pow(SR(), 3);
}
starGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
starGeo.setAttribute('aS', new THREE.BufferAttribute(ss, 1));
const starMat = new THREE.ShaderMaterial({
  uniforms: { uOp: { value: 0 }, uTime: { value: 0 }, uPx: { value: dpr } },
  vertexShader: /* glsl */ `attribute float aS; uniform float uTime, uPx; varying float vS;
    void main() { vS = aS * (0.7 + 0.3 * sin(uTime * 3.0 + position.x)); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position.z = gl_Position.w * 0.99999; gl_PointSize = uPx * (1.0 + aS * 2.5); }`,
  fragmentShader: /* glsl */ `uniform float uOp; varying float vS; void main() { float a = smoothstep(0.5, 0.1, length(gl_PointCoord - 0.5)) * uOp * (0.3 + vS); gl_FragColor = vec4(vec3(0.85, 0.9, 1.0) * a, a); }`,
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
});
const stars = new THREE.Points(starGeo, starMat);
stars.frustumCulled = false;
stars.renderOrder = -1;
scene.add(stars);
let starsTarget = 0;
const setStars = (v) => { starsTarget = v; };

// data
let resolveReady;
const ready = new Promise((r) => (resolveReady = r));
Promise.all([
  fetch('data/places.bin').then((r) => r.arrayBuffer()),
  fetch('data/routes.bin').then((r) => r.arrayBuffer()),
  fetch('data/khardungla.json').then((r) => r.json()),
]).then(([p, routes, prof]) => resolveReady({ places: new Int16Array(p), routes, prof }))
  .catch((e) => console.warn('data load failed', e));

const bike = buildBike({ renderer, mobile });
scene.add(bike.root);
const ctx = { bike, ready, mobile, reduced, dpr };
const stages = renderer ? [startStage(ctx), mapStage(ctx), himalayaStage(ctx), modelStage(ctx), machineStage(ctx), printStage(ctx), orbitStage(ctx)] : [];
stages.forEach((s) => { s.group.visible = false; scene.add(s.group); });

if (renderer) {
  renderer.setPixelRatio(dpr);
  renderer.setSize(innerWidth, innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.localClippingEnabled = true;
  if (!mobile) {
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.55, 0.55, 0.82));
    composer.addPass(new OutputPass());
  }
}

// Warm shaders PER STAGE (only that stage's group + bike visible) so each
// program is compiled for its own light setup. Compiling with every stage
// visible at once builds a combined-lights variant that every stage then
// re-compiles on its first scroll-in — that was the ~400 ms hitch at each
// boundary. Re-run once the async bike + terrain exist.
const warmRT = renderer ? new THREE.WebGLRenderTarget(8, 8) : null;
function warmStages() {
  if (!renderer) return;
  // compile() alone left the first real draw to link programs + upload buffers
  // (the 72-155 ms hitch). Actually RENDER each stage once to a tiny offscreen
  // target: that forces the full compile + VBO upload with no on-screen flash.
  const vis = stages.map((s) => s.group.visible); // the main loop only re-shows a
  const bvis = bike.root.visible;                 // group on a transition, so restore
  const prevRT = renderer.getRenderTarget();       // whatever was showing
  renderer.setRenderTarget(warmRT);
  stages.forEach((s) => (s.group.visible = false));
  for (const s of stages) {
    s.group.visible = true;
    bike.root.visible = !!s.bike;
    if (s.bike) s.group.add(bike.root);
    try { renderer.render(scene, camera); } catch (e) { /* non-fatal */ }
    s.group.visible = false;
  }
  stages.forEach((s, idx) => (s.group.visible = vis[idx]));
  renderer.setRenderTarget(prevRT);
  scene.add(bike.root);
  bike.root.visible = bvis;
}
if (renderer) {
  warmStages(); // static stages up front
  let rewarmed = false;
  const rewarm = () => { if (rewarmed || !renderer) return; rewarmed = true; requestAnimationFrame(warmStages); };
  Promise.all([ready.catch(() => {}), new Promise((r) => bike.onModelReady(() => r()))]).then(rewarm);
  setTimeout(rewarm, 3500); // backstop if the real model never loads
}

// ───────────────────────── scroll model ─────────────────────────
let metrics = [];
function measure() {
  metrics = sections.map((s) => ({ top: s.offsetTop, h: s.offsetHeight }));
}
measure();
addEventListener('load', measure);
new ResizeObserver(measure).observe(document.body);

let sSmooth = scrollY, sPrev = scrollY;
function stageAt(s) {
  const vh = innerHeight;
  const last = metrics.length - 1;
  for (let i = 0; i <= last; i++) {
    const m = metrics[i];
    let t;
    if (i === 0) t = s / (m.h - vh * 0.5);
    else if (i === last) t = (s + vh * 0.5 - m.top) / (m.h - vh * 0.5);
    else t = (s + vh * 0.5 - m.top) / m.h;
    if (t < 1 || i === last) return { i, t: clamp(t, 0, 1) };
  }
  return { i: 0, t: 0 };
}

// ───────────────────────── HUD ─────────────────────────
const H = { spd: $('h-spd'), spdU: $('h-spd-u'), rpm: $('h-rpm'), rpmv: $('h-rpmv'), gear: $('h-gear'), alt: $('h-alt'), g: $('h-g'), odo: $('h-odo'), hud: $('hud') };
let speed = 0, speedPrev = 0, gForce = 1, lastHud = 0;

// ───────────────────────── rev + eggs ─────────────────────────
const engine = new Engine();
const revBtn = $('rev');
let revving = false, rpm = 1400, audioIdleUntil = 0;
const revOn = (e) => { e?.preventDefault?.(); revving = true; revBtn.classList.add('on'); engine.start(); };
const revOff = () => { revving = false; revBtn.classList.remove('on'); audioIdleUntil = performance.now() + 5000; };
revBtn.addEventListener('pointerdown', revOn);
['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => revBtn.addEventListener(ev, revOff));
revBtn.addEventListener('keydown', (e) => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) revOn(e); });
revBtn.addEventListener('keyup', (e) => { if (e.key === ' ' || e.key === 'Enter') revOff(); });

let wheelie = 0, wheelieT = -1;
let typed = '';
addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey || dlg.open && e.key !== 'Escape') return;
  const k = e.key.toLowerCase();
  typed = (typed + k).slice(-6);
  if (typed.endsWith('launch')) {
    typed = '';
    fc('LAUNCH command accepted. Skipping to orbit.', true);
    goTo(sections.length - 1);
    return;
  }
  if (k === 'w' && cur === 0) wheelieT = 0;
  if (k === 'r') { dlg.open ? dlg.close() : dlg.showModal(); }
});

// ───────────────────────── loop ─────────────────────────
let cur = -1, fcKey = '', firstStage = true, skyBlendUntil = 0;
const clock = new THREE.Clock();
const shake = new THREE.Vector3();
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const time = clock.elapsedTime;

  const target = scrollY;
  sSmooth += (target - sSmooth) * Math.min(1, dt * (reduced ? 12 : 5.5));
  if (Math.abs(target - sSmooth) < 0.1) sSmooth = target;
  const vel = Math.abs(sSmooth - sPrev) / Math.max(dt, 1e-3);
  sPrev = sSmooth;

  const { i, t } = stageAt(sSmooth);
  const st = stages[i];
  if (i !== cur) {
    if (stages[cur]) stages[cur].group.visible = false;
    cur = i;
    nodeEls.forEach((b, k) => { b.classList.toggle('active', k === i); b.classList.toggle('done', k < i); });
    // centre the active node in the horizontal rail on mobile only (never scroll the page)
    if (innerWidth <= 760) { const el = nodeEls[i]; if (el) nodeList.scrollTo({ left: el.offsetLeft - (nodeList.clientWidth - el.offsetWidth) / 2, behavior: reduced ? 'auto' : 'smooth' }); }
    document.body.classList.toggle('space', !!st?.space);
    if (st) {
      st.group.visible = true;
      scene.fog = st.fog ? new THREE.Fog(st.fog[0], st.fog[1], st.fog[2]) : null;
      skyTarget.top.set(st.sky.top); skyTarget.horizon.set(st.sky.horizon); skyTarget.bottom.set(st.sky.bottom);
      skyTarget.sunDir.fromArray(st.sky.sunDir); skyTarget.sunColor.set(st.sky.sunColor); skyTarget.sunAmt = st.sky.sun;
      if (firstStage) { // no cross-fade into the very first stage
        const u = sky.material.uniforms;
        u.top.value.copy(skyTarget.top); u.horizon.value.copy(skyTarget.horizon); u.bottom.value.copy(skyTarget.bottom);
        u.sunDir.value.copy(skyTarget.sunDir); u.sunColor.value.copy(skyTarget.sunColor); u.sunAmt.value = skyTarget.sunAmt;
        firstStage = false;
      }
      skyBlendUntil = time + 1.2; // cross-fade the sky only right after a change, then let live stages own it
      starsTarget = st.stars;
      if (st.bike) { bike.root.visible = true; bike.root.position.set(0, 0, 0); bike.root.quaternion.identity(); st.enter?.({ bike }); }
      else bike.root.visible = false;
      if (st.bike) st.group.add(bike.root);
    }
  }

  // throttle: hold-to-rev in the start stage, otherwise follow scroll speed
  if (revving) rpm = Math.min(9500, rpm + dt * 7000) - (rpm > 9350 ? Math.random() * 300 : 0);
  else rpm = Math.max(1400, rpm - dt * 5200);
  const inStart = cur === 0;
  engine.set(rpm, inStart && (revving || performance.now() < audioIdleUntil) ? 0.35 : 0);
  if (!inStart && engine.on && !revving) engine.stop();
  revBtn.style.setProperty('--rev', ((rpm - 1400) / 8100).toFixed(3));

  if (wheelieT >= 0) {
    wheelieT += dt;
    wheelie = wheelieT < 0.5 ? smooth(0, 0.5, wheelieT) : wheelieT < 2.2 ? 1 - Math.sin((wheelieT - 0.5) * 3) * 0.08 : 1 - smooth(2.2, 2.8, wheelieT);
    if (wheelieT > 2.8) { wheelieT = -1; wheelie = 0; }
  }

  if (st) {
    st.update(t, time, dt, { bike, camera, rpm, wheelie, sky: sky.material, scene, setStars });
    if (redline && !reduced) {
      shake.set((Math.random() - 0.5) * 0.02, (Math.random() - 0.5) * 0.02, 0);
      camera.position.add(shake);
    }
    const w = innerWidth, h = innerHeight;
    const off = innerWidth > 760 ? st.offset || 0 : 0;
    if (off) camera.setViewOffset(w, h, -off * w, 0, w, h); else camera.clearViewOffset();
  }
  sky.position.copy(camera.position);
  stars.position.copy(camera.position);
  // ease the sky toward the active stage's palette right after a change; once
  // settled we stop, so stages that animate their own sky (e.g. LAUNCH) win.
  if (time < skyBlendUntil) {
    const su = sky.material.uniforms, sk = Math.min(1, dt * 3.2);
    su.top.value.lerp(skyTarget.top, sk); su.horizon.value.lerp(skyTarget.horizon, sk); su.bottom.value.lerp(skyTarget.bottom, sk);
    su.sunDir.value.lerp(skyTarget.sunDir, sk); su.sunColor.value.lerp(skyTarget.sunColor, sk);
    su.sunAmt.value = lerp(su.sunAmt.value, skyTarget.sunAmt, sk);
  }
  starMat.uniforms.uOp.value = lerp(starMat.uniforms.uOp.value, starsTarget, Math.min(1, dt * 4));
  starMat.uniforms.uTime.value = time;

  // veil: an eased dip toward dark between stages, wide enough to feel like a
  // breath rather than a blink but still peaking at the swap to hide it
  if (st) {
    const last = stages.length - 1;
    const fin = i > 0 ? 1 - smooth(0, 0.09, t) : 0;
    const fout = i < last ? smooth(0.91, 1, t) : 0;
    veil.style.opacity = ease(Math.max(fin, fout)).toFixed(3);
  }

  // telemetry
  const kmh = clamp(vel * 0.075, 0, 245);
  speed = lerp(speed, kmh, Math.min(1, dt * 3));
  gForce = lerp(gForce, 1 + Math.abs(speed - speedPrev) / Math.max(dt, 1e-3) / 35, Math.min(1, dt * 2));
  speedPrev = speed;
  redline = speed > 185 || (inStart && rpm > 9300);
  if (time - lastHud > 0.06) {
    lastHud = time;
    const hud = st ? st.hud(t) : { alt: '—' };
    const shownRpm = inStart && rpm > 1500 ? rpm : 1400 + ((speed % 42) / 42) * 8100 * clamp(speed / 20);
    const gear = speed < 3 ? 'idle' : Math.round(clamp(speed / 245) * 100) + '%';
    H.spd.textContent = hud.spd ?? Math.round(speed);
    H.gear.textContent = hud.gear ?? gear;
    H.rpmv.textContent = Math.round(shownRpm).toLocaleString('en-IN');
    H.rpm.style.width = `${clamp(shownRpm / 9500) * 100}%`;
    H.alt.textContent = hud.alt;
    H.g.textContent = clamp(gForce, 0, 4.5).toFixed(1);
    const odo = hud.odo ?? (hud.odoKm != null ? hud.odoKm : Number.isFinite(ODO[i + 1]) ? lerp(ODO[i], ODO[i + 1], t) : ODO[i]);
    H.odo.textContent = typeof odo === 'number' ? (Number.isFinite(odo) ? odo.toFixed(2).padStart(7, '0') : '∞') : odo;
    H.hud.classList.toggle('redline', redline);
  }

  if (st) {
    let line = '';
    if (st.fcDynamic) line = st.fcDynamic(t);
    else if (st.fc) for (const [th, text] of st.fc) if (t >= th) line = text;
    const key = `${i}:${line}`;
    if (key !== fcKey) { fc(line, !!st.fcDynamic && line.startsWith('Printing')); fcKey = key; }
  }

  if (renderer) (composer || renderer).render(scene, camera);
  requestAnimationFrame(frame);
}
let redline = false;
const veil = $('veil');

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer?.setSize(innerWidth, innerHeight);
  composer?.setSize(innerWidth, innerHeight);
  measure();
  if (stages[cur]) stages[cur].group.visible = false;
  cur = -1; // re-enter the stage so the rail re-centres
});

// stats from the data manifest
fetch('data/meta.json').then((r) => r.json()).then((m) => {
  $('stat-places').textContent = m.places.toLocaleString('en-IN');
  $('stat-routes').textContent = m.routes.toLocaleString('en-IN');
}).catch(() => {});

// credit for the 3D bike scan (CC BY): filled from bike.js when a real model loads
const credit = $('credit');
if (credit && bike.credit) credit.innerHTML = ` · ${bike.credit}`;

requestAnimationFrame(frame);
