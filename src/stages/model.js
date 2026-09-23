// Node 04 · Model — points snap into a star schema: a fact table ringed by dimensions.
import * as THREE from 'three';
import { clamp, lerp, smooth, ease, rng, COLOR_OUT } from '../util.js';

function tableLabel(title, rows, accent) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const draw = () => {
    g.clearRect(0, 0, 512, 256);
    g.fillStyle = 'rgba(10,12,18,0.92)'; g.fillRect(0, 0, 512, 256);
    g.fillStyle = accent; g.fillRect(0, 0, 512, 52);
    g.fillStyle = '#07080c'; g.font = '700 34px "JetBrains Mono", monospace';
    g.textBaseline = 'middle'; g.fillText(title, 18, 27);
    g.fillStyle = '#e8e5de'; g.font = '400 26px "JetBrains Mono", monospace';
    rows.forEach((r, i) => { g.fillStyle = i === 0 ? accent : '#b9c2cc'; g.fillText(r, 18, 84 + i * 40); });
    g.strokeStyle = 'rgba(255,255,255,0.14)'; g.lineWidth = 2; g.strokeRect(1, 1, 510, 254);
    tex.needsUpdate = true;
  };
  draw();
  document.fonts?.ready.then(draw);
  return tex;
}

export function modelStage(ctx) {
  const g = new THREE.Group();
  const R = rng(66);

  const FACT = { title: 'fact_ride', accent: '#ff6a00', rows: ['ride_id  PK', 'route_id  FK', 'place_id  FK', 'season_id FK', 'distance_km', 'ascent_m'], pos: new THREE.Vector3(0, 0, 0), w: 2.6, h: 2.0 };
  const DIMS = [
    { title: 'dim_route', accent: '#8be9ff', rows: ['route_id PK', 'name', 'difficulty', 'days'] },
    { title: 'dim_place', accent: '#8be9ff', rows: ['place_id PK', 'name', 'category', 'is_gem'] },
    { title: 'dim_season', accent: '#8be9ff', rows: ['season_id PK', 'window', 'passable'] },
    { title: 'dim_region', accent: '#8be9ff', rows: ['region_id PK', 'state', 'altitude'] },
    { title: 'dim_permit', accent: '#8be9ff', rows: ['permit_id PK', 'zone', 'inner_line'] },
  ];
  const ringR = 4.6;
  DIMS.forEach((d, i) => {
    const a = (i / DIMS.length) * Math.PI * 2 - Math.PI / 2;
    d.pos = new THREE.Vector3(Math.cos(a) * ringR, Math.sin(a) * ringR * 0.62, Math.sin(a * 1.3) * 0.6);
    d.w = 1.9; d.h = 1.35;
  });
  const TABLES = [FACT, ...DIMS];

  // table cards (billboarded slabs)
  const cards = [];
  TABLES.forEach((t) => {
    const mat = new THREE.MeshBasicMaterial({ map: tableLabel(t.title, t.rows, t.accent), transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(t.w, t.h), mat);
    m.position.copy(t.pos);
    m.renderOrder = 2;
    g.add(m);
    cards.push(m);
    t.card = m;
  });

  // relationship beams fact <-> dims
  const beamPos = [];
  DIMS.forEach((d) => { beamPos.push(FACT.pos.x, FACT.pos.y, FACT.pos.z, d.pos.x, d.pos.y, d.pos.z); });
  const beamGeo = new THREE.BufferGeometry();
  beamGeo.setAttribute('position', new THREE.Float32BufferAttribute(beamPos, 3));
  const beamMat = new THREE.LineBasicMaterial({ color: 0x3f7fa0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  g.add(new THREE.LineSegments(beamGeo, beamMat));

  // particle field: scattered cloud -> snapped into table rows
  const N = ctx.mobile ? 4000 : 8000;
  const aA = new Float32Array(N * 3), aB = new Float32Array(N * 3), rnd = new Float32Array(N), tint = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    rnd[i] = R();
    aA.set([(R() - 0.5) * 26, (R() - 0.5) * 16, (R() - 0.5) * 26], i * 3);
    const t = TABLES[Math.floor(R() * R() * TABLES.length)]; // bias toward fact
    const col = Math.floor(R() * 4), row = Math.floor(R() * 6);
    aB.set([
      t.pos.x + (col - 1.5) * (t.w / 4.5) + (R() - 0.5) * 0.05,
      t.pos.y + (2.5 - row) * (t.h / 7) + (R() - 0.5) * 0.03,
      t.pos.z + (R() - 0.5) * 0.06,
    ], i * 3);
    tint[i] = t === FACT ? 1 : 0;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(aA, 3));
  geo.setAttribute('aB', new THREE.BufferAttribute(aB, 3));
  geo.setAttribute('aRand', new THREE.BufferAttribute(rnd, 1));
  geo.setAttribute('aTint', new THREE.BufferAttribute(tint, 1));
  const pmat = new THREE.ShaderMaterial({
    uniforms: { uSnap: { value: 0 }, uTime: { value: 0 }, uPx: { value: 2.1 * ctx.dpr } },
    vertexShader: /* glsl */ `
      attribute vec3 aB; attribute float aRand; attribute float aTint;
      uniform float uSnap, uTime, uPx; varying float vS; varying float vT;
      void main() {
        float s = smoothstep(0.0, 1.0, clamp((uSnap - aRand * 0.35) / 0.65, 0.0, 1.0));
        vec3 p = mix(position, aB, s);
        p += (1.0 - s) * vec3(sin(uTime * 0.6 + aRand * 30.0), cos(uTime * 0.5 + aRand * 21.0), sin(uTime * 0.7 + aRand * 12.0)) * 0.4;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = uPx * (0.7 + aRand) * (10.0 / -mv.z);
        vS = s; vT = aTint;
      }`,
    fragmentShader: /* glsl */ `
      varying float vS; varying float vT;
      void main() {
        float a = smoothstep(0.5, 0.05, length(gl_PointCoord - 0.5));
        if (a < 0.02) discard;
        vec3 raw = vec3(0.55, 0.62, 0.72);
        vec3 fact = vec3(1.0, 0.42, 0.02);
        vec3 dim = vec3(0.35, 0.85, 1.0);
        vec3 col = mix(raw, mix(dim, fact, vT), vS);
        gl_FragColor = vec4(col * a * (0.6 + vS * 0.6), a);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const cloud = new THREE.Points(geo, pmat);
  cloud.frustumCulled = false;
  g.add(cloud);

  // ETL packets flowing dim -> fact along the beams
  const M = 240;
  const pa = new Float32Array(M * 3), pb = new Float32Array(M * 3), po = new Float32Array(M);
  for (let i = 0; i < M; i++) {
    const d = DIMS[i % DIMS.length];
    pa.set([d.pos.x, d.pos.y, d.pos.z], i * 3);
    pb.set([FACT.pos.x, FACT.pos.y, FACT.pos.z], i * 3);
    po[i] = R();
  }
  const pgeo = new THREE.BufferGeometry();
  pgeo.setAttribute('position', new THREE.BufferAttribute(pa, 3));
  pgeo.setAttribute('aB', new THREE.BufferAttribute(pb, 3));
  pgeo.setAttribute('aO', new THREE.BufferAttribute(po, 1));
  const packMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uOp: { value: 0 }, uPx: { value: 5 * ctx.dpr } },
    vertexShader: /* glsl */ `
      attribute vec3 aB; attribute float aO; uniform float uTime, uPx;
      void main() { vec3 p = mix(position, aB, fract(uTime * 0.35 + aO)); vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = uPx * (10.0 / -mv.z); }`,
    fragmentShader: /* glsl */ `uniform float uOp; void main() { float a = smoothstep(0.5, 0.0, length(gl_PointCoord - 0.5)) * uOp; gl_FragColor = vec4(vec3(0.6, 0.95, 1.0) * a, a); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const packets = new THREE.Points(pgeo, packMat);
  packets.frustumCulled = false;
  g.add(packets);

  const grid = new THREE.GridHelper(50, 50, 0x14324a, 0x0c1a28);
  grid.position.y = -5.5;
  g.add(grid);

  const up = new THREE.Vector3(0, 1, 0);
  return {
    name: 'model', group: g, fog: null,
    sky: { top: 0x03060e, horizon: 0x0a1626, bottom: 0x03060e, sunDir: [0, -1, 0], sunColor: 0x000000, sun: 0 },
    stars: 0.4, offset: 0.14, space: true,
    update(t, time, dt, { camera }) {
      const snap = smooth(0.12, 0.62, t);
      pmat.uniforms.uSnap.value = snap;
      pmat.uniforms.uTime.value = time;
      const reveal = smooth(0.45, 0.75, t);
      beamMat.opacity = reveal * 0.5;
      packMat.uniforms.uOp.value = reveal;
      packMat.uniforms.uTime.value = time;
      cards.forEach((m, i) => { m.material.opacity = smooth(0.4 + i * 0.03, 0.62 + i * 0.03, t) * 0.96; m.quaternion.copy(camera.quaternion); });

      const a = -0.5 + t * 1.0 + time * 0.03;
      const r = lerp(11, 8.4, smooth(0.1, 0.8, t));
      camera.position.set(Math.sin(a) * r, lerp(3.2, 1.4, t), Math.cos(a) * r);
      camera.lookAt(0, 0, 0);
    },
    hud() { return { alt: 'MODEL', gear: 'ETL' }; },
    fc: [[0, 'Landing raw records…'], [0.3, 'Deriving keys. Building dim tables.'], [0.55, 'Star schema resolved: 1 fact, 5 dimensions.'], [0.8, 'Grain: one row per ride.']],
  };
}
