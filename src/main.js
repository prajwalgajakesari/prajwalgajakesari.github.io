import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { buildBike } from './bike.js';
import { startStage, crestStage } from './stages/earth.js';
import { mapStage, himalayaStage } from './stages/data.js';
import { machineStage, printStage, orbitStage } from './stages/space.js';
import { TULIPS } from './tulips.js';
import { Engine } from './audio.js';
import { clamp, lerp, smooth, rng } from './util.js';

const $ = (id) => document.getElementById(id);
const mobile = matchMedia('(max-width: 760px)').matches || matchMedia('(pointer: coarse)').matches;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ───────────────────────── roadbook ─────────────────────────
TULIPS.space = '<path d="M12 21 V8.5"/><path d="M 12 2.6 L 15.6 8.6 L 8.4 8.6 Z" fill="currentColor"/><ellipse cx="12" cy="14.5" rx="9.5" ry="3.2" transform="rotate(-14 12 14.5)"/>';
const BOXES = [
  { total: 0, part: 0, icon: 'start', note: 'Start control', sub: 'SS · Beyond', cap: '041' },
  { total: 12.4, part: 12.4, icon: 'keep-left', note: 'Liaison · who', sub: 'MotoGenie India', cap: '118' },
  { total: 64.8, part: 52.4, icon: 'summit', note: 'SS Himalaya', sub: 'Manali → K-La', cap: '352' },
  { total: 443.45, part: 378.65, icon: 'hairpin-right', note: 'The machine', sub: 'AI tooling', cap: '007' },
  { total: 512.0, part: 68.55, icon: 'danger-3', note: 'Crest · full gas', sub: 'Do not lift', cap: '090', danger: true },
  { total: 512.03, part: 0.03, icon: 'space', note: 'Leave the ground', sub: 'Aerospace · printing', cap: '↑' },
  { total: Infinity, part: Infinity, icon: 'finish', note: 'Finish · orbit', sub: 'Contact', cap: '—' },
];
const fmtKm = (v) => (Number.isFinite(v) ? v.toFixed(2) : '∞');
const svg = (id) => `<svg viewBox="0 0 24 24" aria-hidden="true">${TULIPS[id] || ''}</svg>`;
const sections = [...document.querySelectorAll('.stage')];
const roll = $('rb-roll');
const track = document.createElement('div');
track.className = 'rb-track';
roll.appendChild(track);
BOXES.forEach((b, i) => {
  const li = document.createElement('li');
  li.innerHTML = `<button type="button" class="rb-box${b.danger ? ' danger' : ''}" aria-label="Box ${i + 1}: ${b.note}">
    <span class="rb-dist"><span class="rb-num">${String(i + 1).padStart(2, '0')}</span><span class="rb-total">${fmtKm(b.total)}</span><span class="rb-part">${fmtKm(b.part)}</span></span>
    <span class="rb-tulip">${svg(b.icon)}</span>
    <span class="rb-note">${b.note}<span class="rb-cap">CAP ${b.cap}</span></span></button>`;
  li.querySelector('button').addEventListener('click', () => goTo(i));
  track.appendChild(li);
});
const boxEls = [...track.querySelectorAll('.rb-box')];
$('rbf-body').innerHTML = BOXES.map((b, i) => `<tr><td><b>${fmtKm(b.total)}</b>${fmtKm(b.part)} · #${i + 1}</td><td>${svg(b.icon)}</td><td>${b.note}<small>${b.sub} · CAP ${b.cap}</small></td></tr>`).join('');
const dlg = $('rb-full');
$('rb-open').addEventListener('click', () => dlg.showModal());
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

const bike = buildBike();
scene.add(bike.root);
const ctx = { bike, ready, mobile, reduced, dpr };
const stages = renderer ? [startStage(ctx), mapStage(ctx), himalayaStage(ctx), machineStage(ctx), crestStage(ctx), printStage(ctx), orbitStage(ctx)] : [];
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
  // warm every shader up front so stage changes don't hitch
  stages.forEach((s) => (s.group.visible = true));
  try { renderer.compile(scene, camera); } catch (e) { /* non-fatal */ }
  stages.forEach((s) => (s.group.visible = false));
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
let cur = -1, fcKey = '';
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
    boxEls.forEach((b, k) => b.classList.toggle('active', k === i));
    const boxH = boxEls[0]?.offsetHeight || 100, boxW = boxEls[0]?.offsetWidth || 176;
    if (mobile || innerWidth <= 760) track.style.transform = `translateX(${Math.max(0, i * boxW - (roll.clientWidth - boxW) / 2) * -1}px)`;
    else track.style.transform = `translateY(${clamp((roll.clientHeight - boxH) / 3 - i * boxH, roll.clientHeight - BOXES.length * boxH, 0)}px)`;
    document.body.classList.toggle('space', !!st?.space);
    if (st) {
      st.group.visible = true;
      scene.fog = st.fog ? new THREE.Fog(st.fog[0], st.fog[1], st.fog[2]) : null;
      const u = sky.material.uniforms;
      u.top.value.set(st.sky.top); u.horizon.value.set(st.sky.horizon); u.bottom.value.set(st.sky.bottom);
      u.sunDir.value.fromArray(st.sky.sunDir); u.sunColor.value.set(st.sky.sunColor); u.sunAmt.value = st.sky.sun;
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
  starMat.uniforms.uOp.value = lerp(starMat.uniforms.uOp.value, starsTarget, Math.min(1, dt * 4));
  starMat.uniforms.uTime.value = time;

  // veil: a dip to black between stages
  if (st) {
    const last = stages.length - 1;
    const fin = i > 0 ? 1 - smooth(0, 0.05, t) : 0;
    const fout = i < last ? smooth(0.95, 1, t) : 0;
    veil.style.opacity = Math.max(fin, fout).toFixed(3);
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
    const gear = speed < 3 ? 'N' : String(Math.min(6, Math.ceil(speed / 42)));
    H.spd.textContent = hud.spd ?? Math.round(speed);
    H.gear.textContent = hud.gear ?? gear;
    H.rpmv.textContent = Math.round(shownRpm).toLocaleString('en-IN');
    H.rpm.style.width = `${clamp(shownRpm / 9500) * 100}%`;
    H.alt.textContent = hud.alt;
    H.g.textContent = clamp(gForce, 0, 4.5).toFixed(1);
    const b = BOXES[i], nb = BOXES[i + 1];
    const odo = hud.odo ?? (hud.odoKm != null ? hud.odoKm : Number.isFinite(nb?.total) ? lerp(b.total, nb.total, t) : b.total);
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

requestAnimationFrame(frame);
