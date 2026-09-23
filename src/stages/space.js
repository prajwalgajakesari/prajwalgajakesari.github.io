// Stage 04 (bike → neural net), stage 06 (rocket printed layer by layer, then launch), stage 07 (orbit).
import * as THREE from 'three';
import { clamp, lerp, smooth, ease, rng, glowTexture, COLOR_OUT } from '../util.js';
import { sampleBike } from '../bike.js';
import { placesGeometry, placesMaterial } from './data.js';

// ───────────────────────── 04 · THE MACHINE ─────────────────────────
export function machineStage(ctx) {
  const g = new THREE.Group();
  const R = rng(42);
  const N = ctx.mobile ? 5000 : 9000;
  const layers = [5, 9, 13, 13, 9, 5];
  const nodes = [];
  layers.forEach((n, li) => {
    for (let j = 0; j < n; j++) nodes.push({ li, v: new THREE.Vector3(-7 + (li / (layers.length - 1)) * 14, (j - (n - 1) / 2) * 0.62, Math.sin(j * 1.7 + li) * 0.7) });
  });
  const edges = [];
  for (const a of nodes) for (const b of nodes) if (b.li === a.li + 1) edges.push([a.v, b.v]);

  const aA = sampleBike(ctx.bike, N);
  const S = 2.6;
  for (let i = 0; i < N; i++) { aA[i * 3] *= S; aA[i * 3 + 1] = (aA[i * 3 + 1] - 0.72) * S; aA[i * 3 + 2] *= S; }
  const aB = new Float32Array(N * 3), rnd = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    rnd[i] = R();
    let v;
    if (R() < 0.4) {
      const n = nodes[Math.floor(R() * nodes.length)].v;
      v = n.clone().add(new THREE.Vector3(R() - 0.5, R() - 0.5, R() - 0.5).multiplyScalar(0.22));
    } else {
      const [a, b] = edges[Math.floor(R() * edges.length)];
      v = a.clone().lerp(b, R());
    }
    aB.set([v.x, v.y, v.z], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(aA, 3));
  geo.setAttribute('aB', new THREE.BufferAttribute(aB, 3));
  geo.setAttribute('aRand', new THREE.BufferAttribute(rnd, 1));
  const pmat = new THREE.ShaderMaterial({
    uniforms: { uMorph: { value: 0 }, uTime: { value: 0 }, uPx: { value: 2.2 * ctx.dpr } },
    vertexShader: /* glsl */ `
      attribute vec3 aB; attribute float aRand; uniform float uMorph, uTime, uPx; varying float vM; varying float vR;
      void main() {
        float m = smoothstep(0.0, 1.0, clamp((uMorph - aRand * 0.3) / 0.7, 0.0, 1.0));
        vec3 p = mix(position, aB, m);
        float swirl = m * (1.0 - m) * 4.0;
        p += vec3(sin(aRand * 40.0 + uTime), cos(aRand * 23.0 + uTime * 0.7), sin(aRand * 17.0)) * swirl * 1.6;
        p += vec3(sin(uTime * 1.3 + aRand * 30.0), cos(uTime * 1.1 + aRand * 20.0), 0.0) * 0.015;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = uPx * (0.7 + aRand) * (10.0 / -mv.z);
        vM = m; vR = aRand;
      }`,
    fragmentShader: /* glsl */ `
      varying float vM; varying float vR;
      void main() {
        float a = smoothstep(0.5, 0.05, length(gl_PointCoord - 0.5));
        if (a < 0.01) discard;
        vec3 col = mix(vec3(1.0, 0.42, 0.02), vec3(0.45, 0.9, 1.0), vM);
        col = mix(col, vec3(1.0), vR * 0.2);
        gl_FragColor = vec4(col * a * 0.9, a);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const cloud = new THREE.Points(geo, pmat);
  cloud.frustumCulled = false;
  g.add(cloud);

  const epos = new Float32Array(edges.length * 6);
  edges.forEach(([a, b], i) => epos.set([a.x, a.y, a.z, b.x, b.y, b.z], i * 6));
  const egeo = new THREE.BufferGeometry();
  egeo.setAttribute('position', new THREE.BufferAttribute(epos, 3));
  const emat = new THREE.LineBasicMaterial({ color: 0x5fd4ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  g.add(new THREE.LineSegments(egeo, emat));

  const M = 420;
  const pa = new Float32Array(M * 3), pb = new Float32Array(M * 3), ps = new Float32Array(M), po = new Float32Array(M);
  for (let i = 0; i < M; i++) {
    const [a, b] = edges[Math.floor(R() * edges.length)];
    pa.set([a.x, a.y, a.z], i * 3); pb.set([b.x, b.y, b.z], i * 3); ps[i] = 0.3 + R() * 0.7; po[i] = R();
  }
  const pgeo = new THREE.BufferGeometry();
  pgeo.setAttribute('position', new THREE.BufferAttribute(pa, 3));
  pgeo.setAttribute('aB', new THREE.BufferAttribute(pb, 3));
  pgeo.setAttribute('aS', new THREE.BufferAttribute(ps, 1));
  pgeo.setAttribute('aO', new THREE.BufferAttribute(po, 1));
  const pulseMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uOp: { value: 0 }, uPx: { value: 6 * ctx.dpr } },
    vertexShader: /* glsl */ `
      attribute vec3 aB; attribute float aS; attribute float aO; uniform float uTime, uPx;
      void main() { vec3 p = mix(position, aB, fract(uTime * aS * 0.5 + aO)); vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = uPx * (10.0 / -mv.z); }`,
    fragmentShader: /* glsl */ `
      uniform float uOp;
      void main() { float a = smoothstep(0.5, 0.0, length(gl_PointCoord - 0.5)) * uOp; gl_FragColor = vec4(vec3(1.0, 0.95, 0.85) * a, a); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const pulses = new THREE.Points(pgeo, pulseMat);
  pulses.frustumCulled = false;
  g.add(pulses);

  const grid = new THREE.GridHelper(60, 60, 0x14324a, 0x0c1a28);
  grid.position.y = -4.2;
  g.add(grid);

  return {
    name: 'machine', group: g, fog: null,
    sky: { top: 0x020308, horizon: 0x071222, bottom: 0x020308, sunDir: [0, -1, 0], sunColor: 0x000000, sun: 0 },
    stars: 0.35, offset: 0.14, space: true,
    update(t, time, dt, { camera }) {
      const m = smooth(0.14, 0.7, t);
      pmat.uniforms.uMorph.value = m;
      pmat.uniforms.uTime.value = time;
      emat.opacity = smooth(0.55, 0.85, t) * 0.35;
      pulseMat.uniforms.uOp.value = smooth(0.6, 0.9, t);
      pulseMat.uniforms.uTime.value = time;
      const a = -0.22 + t * 1.1 + time * 0.02;
      const r = lerp(9.5, 14, smooth(0.1, 0.8, t));
      camera.position.set(Math.sin(a) * r, lerp(0.8, 2.2, t), Math.cos(a) * r);
      camera.lookAt(0, 0, 0);
    },
    hud() { return { alt: 'SIM' }; },
    fc: [[0, 'Converting machine to network…'], [0.35, 'Weights initialising. 9,000 parameters in the air.'], [0.65, 'The bike is learning to ride itself.']],
  };
}

// ───────────────────────── 06 · PRINT → LAUNCH ─────────────────────────
const PROFILE = [
  [0.0, 0.0], [0.3, 0.0], [0.27, 0.1], [0.19, 0.28], [0.2, 0.38], [0.43, 0.46], [0.46, 0.56],
  [0.46, 3.2], [0.45, 3.35], [0.41, 3.7], [0.33, 4.1], [0.21, 4.5], [0.09, 4.82], [0.0, 4.95],
];
const TOP = 4.95;
function radiusAt(h) {
  for (let i = 1; i < PROFILE.length; i++) {
    if (PROFILE[i][1] >= h) {
      const [r0, y0] = PROFILE[i - 1], [r1, y1] = PROFILE[i];
      return lerp(r0, r1, clamp((h - y0) / (y1 - y0 || 1)));
    }
  }
  return 0;
}

function stripes(n, light, dark) {
  const c = document.createElement('canvas');
  c.width = 4; c.height = 256;
  const g = c.getContext('2d');
  for (let y = 0; y < 256; y++) { g.fillStyle = y % 2 ? dark : light; g.fillRect(0, y, 4, 1); }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1, n / 256);
  return t;
}
function bands() {
  const c = document.createElement('canvas');
  c.width = 4; c.height = 1024;
  const g = c.getContext('2d');
  g.fillStyle = '#ecebe6'; g.fillRect(0, 0, 4, 1024);
  const band = (v0, v1, col) => { g.fillStyle = col; g.fillRect(0, 1024 - v1 * 1024, 4, (v1 - v0) * 1024); };
  band(0.0, 0.16, '#2a2c30');
  band(0.52, 0.56, '#ff6a00');
  band(0.6, 0.62, '#ff6a00');
  band(0.9, 1.0, '#ff6a00');
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function printStage(ctx) {
  const g = new THREE.Group();
  const R = rng(11);
  const clip = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
  const plate = 0.12;

  const bed = new THREE.Mesh(new THREE.BoxGeometry(5, 0.12, 5), new THREE.MeshStandardMaterial({ color: 0x1a1b1f, roughness: 0.4, metalness: 0.6 }));
  bed.position.y = plate / 2;
  const bedGrid = new THREE.GridHelper(5, 20, 0xff6a00, 0x3a2a20);
  bedGrid.position.y = plate + 0.002;
  const floor = new THREE.Mesh(new THREE.CircleGeometry(40, 48), new THREE.MeshStandardMaterial({ color: 0x0b0a0b, roughness: 0.9 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.8;
  const stand = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.8, 5.6), new THREE.MeshStandardMaterial({ color: 0x121214, roughness: 0.7 }));
  stand.position.y = -0.4;
  g.add(bed, bedGrid, floor, stand);

  const frame = new THREE.Group();
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x222428, roughness: 0.5, metalness: 0.7 });
  for (const [x, z] of [[-2.6, -2.6], [2.6, -2.6], [-2.6, 2.6], [2.6, 2.6]]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 6.4, 0.12), frameMat);
    post.position.set(x, 3.2, z);
    frame.add(post);
  }
  for (const [x, z, w, d] of [[0, -2.6, 5.3, 0.12], [0, 2.6, 5.3, 0.12], [-2.6, 0, 0.12, 5.3], [2.6, 0, 0.12, 5.3]]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, 0.12, d), frameMat);
    b.position.set(x, 6.4, z);
    frame.add(b);
  }
  g.add(frame);
  const gantry = new THREE.Group();
  const bar = new THREE.Mesh(new THREE.BoxGeometry(5.3, 0.1, 0.16), new THREE.MeshStandardMaterial({ color: 0xff6a00, roughness: 0.4, metalness: 0.3 }));
  gantry.add(bar);
  const head = new THREE.Group();
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.22, 16), new THREE.MeshStandardMaterial({ color: 0xc0c4c8, metalness: 0.9, roughness: 0.2 }));
  cone.rotation.x = Math.PI;
  cone.position.y = -0.06;
  const block = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.2, 0.22), new THREE.MeshStandardMaterial({ color: 0x1a1a1a }));
  block.position.y = 0.14;
  const tip = new THREE.PointLight(0xff7a1a, 3, 3, 2);
  tip.position.y = -0.2;
  head.add(cone, block, tip);
  g.add(gantry, head);

  const rocket = new THREE.Group();
  const lathe = new THREE.LatheGeometry(PROFILE.map(([r, y]) => new THREE.Vector2(r, y)), 72);
  // lathe v follows profile index; remap to true height so layers and bands are even
  const lp = lathe.attributes.position, luv = lathe.attributes.uv;
  for (let i = 0; i < luv.count; i++) luv.setY(i, lp.getY(i) / TOP);
  const layerBump = stripes(Math.round(TOP / 0.02), '#ffffff', '#6a6a6a');
  const body = new THREE.MeshStandardMaterial({ map: bands(), bumpMap: layerBump, bumpScale: 1.2, roughness: 0.55, metalness: 0.05, clippingPlanes: [clip] });
  const hot = new THREE.MeshBasicMaterial({ color: 0xff7a1a, side: THREE.BackSide, clippingPlanes: [clip], toneMapped: false });
  rocket.add(new THREE.Mesh(lathe, body), new THREE.Mesh(lathe, hot));
  const fin = new THREE.Shape();
  fin.moveTo(0, 0.5); fin.lineTo(0.5, 0.25); fin.lineTo(0.5, 0.0); fin.lineTo(0, 1.5); fin.lineTo(0, 0.5);
  const finGeo = new THREE.ExtrudeGeometry(fin, { depth: 0.04, bevelEnabled: false });
  finGeo.translate(0.42, 0, -0.02);
  const finMat = new THREE.MeshStandardMaterial({ color: 0xff6a00, roughness: 0.45, bumpMap: stripes(Math.round(1 / 0.02), '#ffffff', '#6a6a6a'), bumpScale: 1, clippingPlanes: [clip] });
  for (let i = 0; i < 4; i++) {
    const f = new THREE.Group();
    f.add(new THREE.Mesh(finGeo, finMat), new THREE.Mesh(finGeo, hot));
    f.rotation.y = (i / 4) * Math.PI * 2 + Math.PI / 4;
    rocket.add(f);
  }
  rocket.position.y = plate;
  g.add(rocket);

  const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.014, 8, 96), new THREE.MeshBasicMaterial({ color: 0xffb070, toneMapped: false }));
  ring.rotation.x = Math.PI / 2;
  g.add(ring);

  // exhaust plume
  const EN = ctx.mobile ? 900 : 1800;
  const eg = new THREE.BufferGeometry();
  const eDir = new Float32Array(EN * 3), eR = new Float32Array(EN);
  for (let i = 0; i < EN; i++) { const a = R() * 6.283, s = R(); eDir.set([Math.cos(a) * s, 0, Math.sin(a) * s], i * 3); eR[i] = R(); }
  eg.setAttribute('position', new THREE.BufferAttribute(eDir, 3));
  eg.setAttribute('aR', new THREE.BufferAttribute(eR, 1));
  const emat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uOn: { value: 0 }, uPx: { value: 16 * ctx.dpr }, uOrigin: { value: new THREE.Vector3() } },
    vertexShader: /* glsl */ `
      attribute float aR; uniform float uTime, uPx; uniform vec3 uOrigin; varying float vAge;
      void main() {
        float age = fract(uTime * 1.6 + aR);
        vec3 p = uOrigin + vec3(position.x * (0.12 + age * 1.6), -age * (2.5 + aR * 3.5), position.z * (0.12 + age * 1.6));
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = uPx * (0.4 + age * 1.6) * (8.0 / -mv.z);
        vAge = age;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uOn; varying float vAge;
      void main() {
        float a = smoothstep(0.5, 0.0, length(gl_PointCoord - 0.5)) * (1.0 - vAge) * uOn;
        if (a < 0.01) discard;
        vec3 col = mix(vec3(1.0, 0.95, 0.8), vec3(1.0, 0.35, 0.05), smoothstep(0.0, 0.5, vAge));
        gl_FragColor = vec4(col * a, a);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const plume = new THREE.Points(eg, emat);
  plume.frustumCulled = false;
  g.add(plume);
  const flame = new THREE.PointLight(0xff8a2b, 0, 18, 1.6);
  g.add(flame);

  const hemi = new THREE.HemisphereLight(0xc8c4c0, 0x100c0a, 0.7);
  const key = new THREE.DirectionalLight(0xfff0e0, 1.6); key.position.set(6, 9, 7);
  const rim = new THREE.DirectionalLight(0x6aa8ff, 0.35); rim.position.set(-8, 6, -6);
  g.add(hemi, key, rim);

  const skyTop = new THREE.Color(), cA = new THREE.Color(0x0e0c10), cB = new THREE.Color(0x010207);
  let h = 0, alt = 0, launch = 0;
  return {
    name: 'print', group: g, fog: [0x0b0a0d, 14, 60],
    sky: { top: 0x0e0c10, horizon: 0x1c1512, bottom: 0x0b0a0d, sunDir: [0, -1, 0], sunColor: 0x000000, sun: 0 },
    stars: 0, offset: 0.15,
    update(t, time, dt, { camera, sky, setStars, scene }) {
      h = smooth(0.02, 0.6, t) * TOP;
      launch = clamp((t - 0.7) / 0.3);
      const lift = Math.pow(launch, 2.2) * 90;
      rocket.position.y = plate + lift;
      clip.constant = t < 0.62 ? plate + h : 1e5;
      const r = radiusAt(h);
      const printing = t > 0.02 && t < 0.6;
      ring.visible = printing;
      ring.position.y = plate + h;
      ring.scale.setScalar(Math.max(r, 0.01));
      const th = time * 9;
      head.position.set(Math.cos(th) * r, plate + h + 0.28, Math.sin(th) * r);
      tip.intensity = printing ? 3 + Math.sin(time * 40) : 0;
      const gy = t < 0.62 ? plate + h + 0.48 : plate + TOP + 0.48 + smooth(0.62, 0.7, t) * 1.2;
      gantry.position.set(0, gy, head.position.z);
      head.visible = t < 0.66;
      frame.position.y = -smooth(0.64, 0.72, t) * 7.5;
      gantry.visible = t < 0.72;

      emat.uniforms.uOn.value = smooth(0.66, 0.72, t);
      emat.uniforms.uTime.value = time;
      emat.uniforms.uOrigin.value.set(0, rocket.position.y + 0.02, 0);
      flame.position.set(0, rocket.position.y - 0.6, 0);
      flame.intensity = smooth(0.66, 0.72, t) * (60 + Math.sin(time * 50) * 12);

      if (t < 0.7) {
        const a = time * 0.12 + t * 2.4;
        const rr = lerp(8.2, 6.4, t);
        camera.position.set(Math.sin(a) * rr, 1.6 + h * 0.6, Math.cos(a) * rr);
        camera.lookAt(0, 0.4 + h * 0.62, 0);
      } else {
        const a = time * 0.12 + 0.7 * 2.4;
        const rr = lerp(6.8, 11, launch);
        camera.position.set(Math.sin(a) * rr, 3.6 + lift * 0.72, Math.cos(a) * rr);
        camera.lookAt(0, rocket.position.y + 2.6, 0);
      }
      skyTop.copy(cA).lerp(cB, launch);
      sky.uniforms.top.value.copy(skyTop);
      sky.uniforms.horizon.value.copy(new THREE.Color(0x1c1512).lerp(new THREE.Color(0x061026), launch));
      setStars(smooth(0.2, 0.9, launch));
      scene.fog.far = lerp(60, 400, launch);
      alt = Math.pow(launch, 2.2) * 100;
    },
    hud(t) {
      if (t < 0.7) return { alt: '0 m' };
      return { alt: alt < 1 ? `${Math.round(alt * 1000)} m` : `${alt.toFixed(1)} km` };
    },
    fcDynamic(t) {
      if (t < 0.02) return 'Slicing rocket: 248 layers · 0.02 mm.';
      if (t < 0.6) return `Printing layer ${Math.max(1, Math.round((h / TOP) * 248))} / 248`;
      if (t < 0.7) return 'Print complete. Clearing the gantry.';
      if (launch < 0.35) return 'Ignition. Liftoff.';
      if (launch < 0.97) return 'Max-Q. Pilot grinning.';
      return 'Passing the Kármán line · 100 km.';
    },
  };
}

// ───────────────────────── 07 · ORBIT ─────────────────────────
export function orbitStage(ctx) {
  const g = new THREE.Group();
  const RE = 6;
  const tilt = new THREE.Group();
  tilt.rotation.x = THREE.MathUtils.degToRad(-10);
  g.position.y = -6.2;
  const spin = new THREE.Group();
  tilt.add(spin);
  g.add(tilt);
  const sunDir = new THREE.Vector3(1, 0.25, 0.35).normalize();

  const earth = new THREE.Mesh(new THREE.SphereGeometry(RE, 96, 64), new THREE.ShaderMaterial({
    uniforms: { uSun: { value: sunDir } },
    vertexShader: /* glsl */ `
      varying vec2 vUv; varying vec3 vN; varying vec3 vP;
      void main() { vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vP = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uSun; varying vec2 vUv; varying vec3 vN; varying vec3 vP;
      void main() {
        vec3 n = normalize(vN);
        float day = smoothstep(-0.2, 0.5, dot(n, uSun));
        vec3 col = mix(vec3(0.0005, 0.0015, 0.004), vec3(0.003, 0.012, 0.03), day);
        vec2 gg = vUv * vec2(24.0, 12.0);
        vec2 fw = fwidth(gg);
        vec2 l = 1.0 - smoothstep(vec2(0.0), fw * 1.2, abs(fract(gg - 0.5) - 0.5));
        col += max(l.x, l.y) * vec3(0.03, 0.12, 0.2) * (0.3 + 0.7 * day);
        vec3 V = normalize(cameraPosition - vP);
        col += pow(1.0 - max(dot(n, V), 0.0), 4.0) * vec3(0.1, 0.35, 0.8) * (0.15 + day);
        gl_FragColor = vec4(col, 1.0);
        ${COLOR_OUT}
      }`,
  }));
  spin.add(earth);
  const atmo = new THREE.Mesh(new THREE.SphereGeometry(RE * 1.06, 64, 48), new THREE.ShaderMaterial({
    vertexShader: /* glsl */ `varying vec3 vN; void main() { vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `varying vec3 vN; void main() { float i = pow(max(0.72 - dot(vN, vec3(0.0, 0.0, 1.0)), 0.0), 5.0); gl_FragColor = vec4(vec3(0.2, 0.5, 1.0) * i * 0.6, i); }`,
    side: THREE.BackSide, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  g.add(atmo);

  const pmat = placesMaterial(1.6 * ctx.dpr);
  pmat.uniforms.uReveal.value = 1;
  pmat.uniforms.uLift.value = 0;
  ctx.ready.then(({ places }) => {
    const toSphere = (lon, lat) => {
      const la = THREE.MathUtils.degToRad(lat), lo = THREE.MathUtils.degToRad(lon);
      const r = RE * 1.004;
      return [r * Math.cos(la) * Math.sin(lo), r * Math.sin(la), r * Math.cos(la) * Math.cos(lo)];
    };
    spin.add(new THREE.Points(placesGeometry(places, toSphere), pmat));
  });

  const orbitTilt = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.42, 0, -0.18));
  const OR = 8.4;
  const orbitAt = (a) => new THREE.Vector3(Math.cos(a) * OR, 0, Math.sin(a) * OR).applyQuaternion(orbitTilt);
  const ringPts = Array.from({ length: 257 }, (_, i) => orbitAt((i / 256) * Math.PI * 2));
  const orbitLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(ringPts), new THREE.LineBasicMaterial({ color: 0x8be9ff, transparent: true, opacity: 0.22, depthWrite: false }));
  g.add(orbitLine);
  const TN = 160;
  const trailGeo = new THREE.BufferGeometry();
  trailGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TN * 3), 3));
  const tcol = new Float32Array(TN * 3);
  for (let i = 0; i < TN; i++) { const f = 1 - i / TN; tcol.set([1 * f, 0.42 * f * f, 0.05 * f], i * 3); }
  trailGeo.setAttribute('color', new THREE.BufferAttribute(tcol, 3));
  const trail = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({ vertexColors: true, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false }));
  trail.frustumCulled = false;
  g.add(trail);

  const hemi = new THREE.HemisphereLight(0x6080c0, 0x000000, 0.3);
  const sun = new THREE.DirectionalLight(0xfff4e8, 3.2); sun.position.copy(sunDir).multiplyScalar(50);
  const fill = new THREE.DirectionalLight(0x4a7aff, 0.6); fill.position.set(-20, -5, 10);
  const pl = new THREE.PointLight(0xff8a2b, 0, 3, 2);
  g.add(hemi, sun, fill, pl);

  const m4 = new THREE.Matrix4();
  return {
    name: 'orbit', group: g, fog: null,
    sky: { top: 0x000000, horizon: 0x02040a, bottom: 0x000000, sunDir: sunDir.toArray(), sunColor: 0xfff0dd, sun: 1.2 },
    stars: 1, offset: 0, space: true, bike: true,
    enter({ bike }) { bike.root.scale.setScalar(0.3); bike.setBlueprint(1, 0.35); bike.wheelie.rotation.z = 0; },
    update(t, time, dt, { camera, bike }) {
      spin.rotation.y = THREE.MathUtils.degToRad(-80) + time * 0.02;
      const a = -1.1 + time * 0.18 + t * 1.6;
      const p = orbitAt(a), p2 = orbitAt(a + 0.01);
      const T = p2.clone().sub(p).normalize();
      const N = p.clone().normalize();
      const Z = new THREE.Vector3().crossVectors(T, N);
      m4.makeBasis(T, N, Z);
      bike.root.position.copy(p);
      bike.root.quaternion.setFromRotationMatrix(m4);
      bike.front.rotation.z -= dt * 3;
      bike.rear.rotation.z -= dt * 3;
      pl.position.copy(p).addScaledVector(N, 0.4);
      pl.intensity = 1.2;
      const arr = trail.geometry.attributes.position.array;
      for (let i = 0; i < TN; i++) arr.set(orbitAt(a - 0.12 - i * 0.012).toArray(), i * 3);
      trail.geometry.attributes.position.needsUpdate = true;
      const s = ease(clamp(t));
      camera.position.set(lerp(1.5, -2.5, s), lerp(1.2, 2.4, s), lerp(17, 14, s));
      camera.lookAt(lerp(0.4, 1.0, s), -1.5, 0);
    },
    hud() { return { alt: '408 km', spd: '28,080', gear: '6', odo: '∞' }; },
    fc: [[0, 'Orbit achieved · 7.8 km/s · 408 km.'], [0.35, 'India passing below: 14,738 places, still lit.'], [0.6, 'Status: DNF. Still airborne.']],
  };
}
