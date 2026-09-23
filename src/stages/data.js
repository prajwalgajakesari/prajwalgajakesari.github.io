// Stage 02 (India from MotoGenie data) and stage 03 (Manali → Khardung La, real elevation).
import * as THREE from 'three';
import { clamp, lerp, smooth, ease, fbm, noise, rng, glowTexture, textSprite, COLOR_OUT } from '../util.js';

const K = 0.55; // world units per degree
export const lonLatToMap = (lon, lat) => [(lon - 80) * K, -(lat - 22) * K];
export function decode(x, y) {
  return [((x + 32768) / 65535) * 30 + 68, ((y + 32768) / 65535) * 31.5 + 6];
}

export function placesMaterial(px) {
  return new THREE.ShaderMaterial({
    uniforms: { uReveal: { value: 0 }, uTime: { value: 0 }, uPx: { value: px }, uLift: { value: 3 } },
    vertexShader: /* glsl */ `
      attribute float aRand; uniform float uReveal, uTime, uPx, uLift; varying float vA; varying float vR;
      void main() {
        vec3 p = position;
        float r = smoothstep(aRand, aRand + 0.08, uReveal * 1.1);
        p.y += (1.0 - r) * uLift;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float tw = 0.7 + 0.3 * sin(uTime * 2.0 + aRand * 60.0);
        gl_PointSize = uPx * (0.8 + aRand * 0.9) * tw * (14.0 / -mv.z);
        vA = r; vR = aRand;
      }`,
    fragmentShader: /* glsl */ `
      varying float vA; varying float vR;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d) * vA;
        if (a < 0.01) discard;
        vec3 col = mix(vec3(1.0, 0.35, 0.0), vec3(1.0, 0.82, 0.55), vR);
        gl_FragColor = vec4(col * a, a);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
}

export function placesGeometry(places, project) {
  const n = places.length / 2;
  const pos = new Float32Array(n * 3), rnd = new Float32Array(n);
  const R = rng(3);
  for (let i = 0; i < n; i++) {
    const [lon, lat] = decode(places[i * 2], places[i * 2 + 1]);
    const v = project(lon, lat);
    pos.set(v, i * 3);
    rnd[i] = R();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aRand', new THREE.BufferAttribute(rnd, 1));
  return geo;
}

// ───────────────────────── 02 · LIAISON (India) ─────────────────────────
export function mapStage(ctx) {
  const g = new THREE.Group();
  const grid = new THREE.GridHelper(60, 60, 0x1d2a3a, 0x121a26);
  grid.position.y = -0.02;
  g.add(grid);

  const pmat = placesMaterial(3 * ctx.dpr);
  const rmat = new THREE.ShaderMaterial({
    uniforms: { uReveal: { value: 0 } },
    vertexShader: /* glsl */ `
      attribute float aProg; attribute float aDelay; uniform float uReveal; varying float vA;
      void main() { vA = clamp((uReveal * 1.7 - aDelay - aProg * 0.45) * 5.0, 0.0, 1.0); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      varying float vA;
      void main() { if (vA < 0.01) discard; gl_FragColor = vec4(vec3(1.0, 0.42, 0.05) * vA * 0.18, vA); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });

  const LEH = lonLatToMap(77.577, 34.153);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.16, 0.2, 48), new THREE.MeshBasicMaterial({ color: 0x8be9ff, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(LEH[0], 0.02, LEH[1]);
  const lbl = textSprite('LEH', { color: '#8be9ff', size: 0.55, sub: '3,500 m · gateway to Khardung La' });
  lbl.position.set(LEH[0], 0.55, LEH[1]);
  g.add(ring, lbl);

  ctx.ready.then(({ places, routes }) => {
    g.add(new THREE.Points(placesGeometry(places, (lon, lat) => { const [x, z] = lonLatToMap(lon, lat); return [x, 0, z]; }), pmat));
    // routes: [u16 count][count × (i16, i16)] …
    const dv = new DataView(routes);
    const pos = [], prog = [], delay = [];
    const R = rng(5);
    let o = 0;
    while (o < routes.byteLength) {
      const n = dv.getUint16(o, true); o += 2;
      const d = R() * 0.6;
      let prev = null;
      for (let i = 0; i < n; i++) {
        const [lon, lat] = decode(dv.getInt16(o, true), dv.getInt16(o + 2, true)); o += 4;
        const [x, z] = lonLatToMap(lon, lat);
        if (prev) { pos.push(prev[0], 0.01, prev[1], x, 0.01, z); prog.push((i - 1) / n, i / n); delay.push(d, d); }
        prev = [x, z];
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('aProg', new THREE.Float32BufferAttribute(prog, 1));
    geo.setAttribute('aDelay', new THREE.Float32BufferAttribute(delay, 1));
    g.add(new THREE.LineSegments(geo, rmat));
  });

  const p0 = new THREE.Vector3(1.2, 30, 11), p1 = new THREE.Vector3(5, 12, 3), p2 = new THREE.Vector3(LEH[0] + 1.6, 2.4, LEH[1] + 3.4);
  const l0 = new THREE.Vector3(1.4, 0, 0.5), l2 = new THREE.Vector3(LEH[0], 0.2, LEH[1]);
  const bez = (a, b, c, s) => a.clone().multiplyScalar((1 - s) ** 2).addScaledVector(b, 2 * (1 - s) * s).addScaledVector(c, s * s);
  return {
    name: 'map', group: g,
    fog: null,
    sky: { top: 0x03050b, horizon: 0x0b1424, bottom: 0x03050b, sunDir: [0, -1, 0], sunColor: 0x000000, sun: 0 },
    stars: 0.7, offset: 0.12,
    update(t, time, dt, { camera }) {
      const s = ease(clamp(t));
      pmat.uniforms.uReveal.value = smooth(0.02, 0.5, t);
      pmat.uniforms.uTime.value = time;
      rmat.uniforms.uReveal.value = smooth(0.12, 0.7, t);
      camera.position.copy(bez(p0, p1, p2, s));
      camera.lookAt(l0.clone().lerp(l2, smooth(0.2, 1, t)));
      const pulse = (time * 0.8) % 1;
      ring.scale.setScalar(1 + pulse * 2.5);
      ring.material.opacity = (1 - pulse) * smooth(0.55, 0.8, t);
      lbl.material.opacity = smooth(0.7, 0.9, t);
    },
    hud(t) { return { alt: `${Math.round(lerp(12000, 3500, ease(clamp(t)))).toLocaleString('en-IN')} m` }; },
    fc: [[0, 'Loading MotoGenie: 14,738 places · 3,246 routes.'], [0.35, 'Every glowing line is a road someone can ride.'], [0.7, 'Descending on Leh. Next box: the Himalaya.']],
  };
}

// ───────────────────────── 03 · SS HIMALAYA ─────────────────────────
export function himalayaStage(ctx) {
  const g = new THREE.Group();
  const state = { prof: null, total: 378.65, peak: 5411 };
  const XS = 0.28;
  const pathX = (km) => (km - state.total / 2) * XS;
  const pathZ = (km) => Math.sin(km * 0.045) * 5 + Math.sin(km * 0.011 + 1) * 9;
  const elev = (km) => {
    const P = state.prof;
    if (!P) return 2000;
    const k = clamp(km, 0, state.total);
    let i = 1;
    while (i < P.km.length - 1 && P.km[i] < k) i++;
    const f = clamp((k - P.km[i - 1]) / (P.km[i] - P.km[i - 1] || 1));
    return lerp(P.m[i - 1], P.m[i], f);
  };
  const pathY = (km) => (elev(km) - 2000) / 1000 * 3.2;
  const P = (km) => new THREE.Vector3(pathX(km), pathY(km), pathZ(km));
  // ridged multifractal → sharp Himalayan ridgelines instead of soft fbm blobs
  const ridged = (x, z, oct = 5) => {
    let s = 0, amp = 0.5, f = 1, norm = 0, prev = 1;
    for (let i = 0; i < oct; i++) {
      let n = 1 - Math.abs(noise(x * f + 11, z * f + 7) * 2 - 1);
      n *= n;                       // sharpen the crest
      s += amp * n * prev;          // concentrate detail on the ridges
      prev = clamp(n * 1.4);
      norm += amp; amp *= 0.5; f *= 2.07;
    }
    return s / norm;
  };
  const heightAt = (x, z) => {
    const km = x / XS + state.total / 2;
    const d = Math.abs(z - pathZ(clamp(km, 0, state.total)));
    // low valley floor by the road, towering ridges to either side
    const relief = ridged(x * 0.05 + 4, z * 0.05);
    const m = relief * 30 * smooth(2, 18, d) + smooth(9, 30, d) * 4;
    return pathY(km) - 0.06 + m;
  };

  const uniforms = {
    uSun: { value: new THREE.Vector3(0.55, 0.30, -0.72) },
    uFog: { value: new THREE.Color(0x2b2f4c) },
    uFogNear: { value: 26 }, uFogFar: { value: 105 },
    uRider: { value: new THREE.Vector3() },
  };
  const tmat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      attribute float aRelief; varying vec3 vW; varying vec3 vN; varying float vRel;
      void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); vRel = aRelief; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uSun; uniform vec3 uFog; uniform float uFogNear, uFogFar; uniform vec3 uRider;
      varying vec3 vW; varying vec3 vN; varying float vRel;
      float iso(float v) { float f = fract(v); float w = fwidth(v); return 1.0 - smoothstep(0.0, w * 1.2, min(f, 1.0 - f)); }
      void main() {
        vec3 n = normalize(vN);
        vec3 sd = normalize(uSun);
        float dif = max(dot(n, sd), 0.0);
        float sky = 0.5 + 0.5 * n.y;                       // hemispheric sky term
        float h = vW.y;

        // rock: cool slate in the valley → warm lit granite up high, streaked by slope
        vec3 rock = mix(vec3(0.085, 0.10, 0.14), vec3(0.36, 0.30, 0.25), smoothstep(-1.0, 16.0, h));
        rock *= 0.8 + 0.35 * smoothstep(0.2, 0.9, n.y);     // darker on the cliffs
        // snow caps prominent ridges (relief) at any altitude, plus a general
        // high-altitude dusting; steep faces stay rocky so peaks keep their shape
        float snowRelief = smoothstep(6.0, 18.0, vRel);
        float snowAlt = smoothstep(9.0, 22.0, h) * 0.7;
        float snowMask = max(snowRelief, snowAlt) * smoothstep(0.46, 0.84, n.y);
        vec3 snow = mix(vec3(0.50, 0.58, 0.76), vec3(0.96, 0.98, 1.05), dif);
        vec3 albedo = mix(rock, snow, snowMask);

        // dawn key + cool sky fill
        vec3 keyCol = vec3(1.0, 0.72, 0.46);
        vec3 skyCol = vec3(0.34, 0.44, 0.66);
        vec3 col = albedo * (skyCol * sky * 0.55 + keyCol * dif * 1.2 + 0.05);
        col += keyCol * pow(dif, 2.0) * smoothstep(7.0, 22.0, h) * 0.28;   // alpenglow on sunlit ridges

        float camd = length(vW - cameraPosition);
        float near = 1.0 - smoothstep(18.0, 72.0, camd);
        col += iso(h * 0.5) * vec3(0.36, 0.72, 0.98) * 0.09 * near;         // subtle altitude contours
        float rd = length(vW - uRider);
        col += vec3(1.0, 0.46, 0.14) * exp(-rd * rd * 0.9) * 0.28;          // tight rider warmth

        float fg = smoothstep(uFogNear, uFogFar, camd);
        col = mix(col, uFog, fg);
        gl_FragColor = vec4(col, 1.0);
        ${COLOR_OUT}
      }`,
  });
  const terrain = new THREE.Mesh(new THREE.BufferGeometry(), tmat);
  g.add(terrain);

  const road = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: 0xff7a1a, toneMapped: false }));
  const roadGhost = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: 0xf3ecdc, transparent: true, opacity: 0.18, depthWrite: false }));
  g.add(road, roadGhost);

  const rider = new THREE.Group();
  rider.add(new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffe0b0, toneMapped: false })));
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('rgba(255,150,60,1)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  halo.scale.set(0.7, 0.7, 1);
  rider.add(halo);
  g.add(rider);

  const hemi = new THREE.HemisphereLight(0x8090c0, 0x201810, 0.4);
  const d1 = new THREE.DirectionalLight(0xffc0a0, 1); d1.position.set(20, 20, -30);
  const d2 = new THREE.DirectionalLight(0x6080ff, 0.4); d2.position.set(-20, 10, 20);
  const pl = new THREE.PointLight(0xff8a2b, 1.1, 4, 2);
  rider.add(pl);
  g.add(hemi, d1, d2);

  let peakKm = 0, segs = 1, radial = 6;
  ctx.ready.then(({ prof }) => {
    state.prof = prof;
    state.total = prof.km[prof.km.length - 1];
    state.peak = Math.max(...prof.m);
    peakKm = prof.km[prof.m.indexOf(state.peak)];
    const W = 124, D = 64;
    const geo = new THREE.PlaneGeometry(W, D, ctx.mobile ? 200 : 320, ctx.mobile ? 100 : 160);
    geo.rotateX(-Math.PI / 2);
    const p = geo.attributes.position;
    const rel = new Float32Array(p.count);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      const y = heightAt(x, z);
      p.setY(i, y);
      const km = clamp(x / XS + state.total / 2, 0, state.total);
      rel[i] = y - (pathY(km) - 0.06); // local prominence above the valley floor
    }
    geo.setAttribute('aRelief', new THREE.BufferAttribute(rel, 1));
    geo.computeVertexNormals();
    terrain.geometry.dispose();
    terrain.geometry = geo;
    const pts = [];
    for (let i = 0; i <= 400; i++) { const v = P((i / 400) * state.total); v.y += 0.05; pts.push(v); }
    const curve = new THREE.CatmullRomCurve3(pts);
    segs = 800;
    road.geometry = new THREE.TubeGeometry(curve, segs, 0.045, radial, false);
    roadGhost.geometry = new THREE.TubeGeometry(curve, segs, 0.03, 4, false);
    const peak = textSprite('KHARDUNG LA', { color: '#f3ecdc', size: 1.1, sub: `${state.peak.toLocaleString('en-IN')} m on the profile` });
    peak.position.copy(P(peakKm)).add(new THREE.Vector3(0, 1.6, 0));
    const manali = textSprite('MANALI', { color: '#f3ecdc', size: 0.9, sub: `${Math.round(prof.m[0]).toLocaleString('en-IN')} m` });
    manali.position.copy(P(0)).add(new THREE.Vector3(0, 1.3, 0));
    g.add(peak, manali);
    const len = document.getElementById('ride-len');
    if (len) len.textContent = `${Math.round(state.total)} km`;
    const pk = document.getElementById('ride-peak');
    if (pk) pk.textContent = `${state.peak.toLocaleString('en-IN')} m`;
  });

  let km = 0, camY = null;
  const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
  return {
    name: 'himalaya', group: g,
    fog: null,
    sky: { top: 0x070d22, horizon: 0x4a4468, bottom: 0x151522, sunDir: [0.5, 0.06, -0.8], sunColor: 0xff9a8a, sun: 0.6 },
    stars: 0.45, offset: 0,
    update(t, time, dt, { camera }) {
      km = ease(clamp((t - 0.03) / 0.94)) * state.total;
      const pos = P(km);
      rider.position.copy(pos).add(new THREE.Vector3(0, 0.12, 0));
      uniforms.uRider.value.copy(pos);
      road.geometry.setDrawRange(0, Math.floor((km / state.total) * segs) * radial * 6);
      const ahead = P(Math.min(km + 10, state.total + 10));
      const back = P(Math.max(km - 16, -16));
      const dir = ahead.clone().sub(back).setY(0).normalize();
      const side = new THREE.Vector3(-dir.z, 0, dir.x);
      camPos.copy(pos).addScaledVector(dir, -8).addScaledVector(side, 1.5).add(new THREE.Vector3(0, 5.5, 0));
      let ground = -1e9;
      for (let k = 1; k <= 4; k++) { const q = pos.clone().lerp(camPos, k / 4); ground = Math.max(ground, heightAt(q.x, q.z) + 1.2 + k * 0.4); }
      camPos.y = Math.max(camPos.y, ground);
      camY = camY == null ? camPos.y : lerp(camY, camPos.y, Math.min(1, dt * 3));
      camPos.y = camY;
      camLook.copy(pos).addScaledVector(dir, 3).add(new THREE.Vector3(0, 0.4, 0));
      camera.position.copy(camPos);
      camera.lookAt(camLook);
      halo.material.opacity = 0.5 + Math.sin(time * 6) * 0.15;
    },
    hud(t) { return { alt: `${Math.round(elev(km)).toLocaleString('en-IN')} m`, odoKm: 64.8 + km }; },
    fc: [[0, 'Profile loaded: Manali → Khardung La, real elevation.'], [0.35, 'Oxygen thinning. Pilot unbothered.'], [0.7, 'Summit in sight. Next box: the machine.']],
  };
}
