// Stage 01 (start gate at blue hour) and stage 05 (the crest jump at golden hour).
import * as THREE from 'three';
import { clamp, lerp, smooth, ease, fbm, rng, glowTexture } from '../util.js';

function lightRig(g, { hemiSky, hemiGround, hemi, key, keyPos, rim, rimPos }) {
  const h = new THREE.HemisphereLight(hemiSky, hemiGround, hemi);
  const k = new THREE.DirectionalLight(key, 1);
  k.position.copy(keyPos);
  const r = new THREE.DirectionalLight(rim, 1);
  r.position.copy(rimPos);
  const p = new THREE.PointLight(0xffffff, 0, 8, 2);
  g.add(h, k, r, p);
  return { h, k, r, p };
}

function bannerTexture(lines) {
  const c = document.createElement('canvas');
  c.width = 2048; c.height = 256;
  const g = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const draw = () => {
    g.fillStyle = '#0d0f14'; g.fillRect(0, 0, 2048, 256);
    g.fillStyle = '#ff6a00'; g.fillRect(0, 0, 2048, 18); g.fillRect(0, 238, 2048, 18);
    for (let i = 0; i < 16; i++) { g.fillStyle = i % 2 ? '#f3ecdc' : '#0d0f14'; g.fillRect(i * 22, 18, 22, 110); g.fillStyle = i % 2 ? '#0d0f14' : '#f3ecdc'; g.fillRect(i * 22, 128, 22, 110); }
    for (let i = 0; i < 16; i++) { g.fillStyle = i % 2 ? '#f3ecdc' : '#0d0f14'; g.fillRect(2048 - 352 + i * 22, 18, 22, 110); g.fillStyle = i % 2 ? '#0d0f14' : '#f3ecdc'; g.fillRect(2048 - 352 + i * 22, 128, 22, 110); }
    g.fillStyle = '#f3ecdc';
    g.font = '900 150px "Big Shoulders Display", Impact, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(lines, 1024, 136);
    tex.needsUpdate = true;
  };
  draw();
  document.fonts?.ready.then(draw);
  return tex;
}

function dangerBoard() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#f3ecdc'; g.fillRect(0, 0, 256, 256);
  g.strokeStyle = '#111'; g.lineWidth = 10; g.strokeRect(5, 5, 246, 246);
  g.fillStyle = '#ff3b30';
  for (let i = 0; i < 3; i++) { g.fillRect(58 + i * 58, 40, 24, 120); g.beginPath(); g.arc(70 + i * 58, 200, 15, 0, 7); g.fill(); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function dustPoints(n, color, size) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  geo.setAttribute('alpha', new THREE.BufferAttribute(new Float32Array(n), 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uSize: { value: size }, uMap: { value: glowTexture() } },
    vertexShader: /* glsl */ `
      attribute float alpha; varying float vA; uniform float uSize;
      void main() { vA = alpha; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = uSize * (0.6 + alpha) * (60.0 / -mv.z); }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform sampler2D uMap; varying float vA;
      void main() { float a = texture2D(uMap, gl_PointCoord).a * vA; if (a < 0.01) discard; gl_FragColor = vec4(uColor, a * 0.55); }`,
    transparent: true, depthWrite: false,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  return pts;
}

// ───────────────────────── 01 · START ─────────────────────────
export function startStage(ctx) {
  const g = new THREE.Group();
  const R = rng(7);

  const geo = new THREE.PlaneGeometry(260, 260, ctx.mobile ? 120 : 200, ctx.mobile ? 120 : 200);
  geo.rotateX(-Math.PI / 2);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    const flat = smooth(5, 22, Math.hypot(x * 0.8, z));
    const h = (fbm(x * 0.025 + 3, z * 0.025) * 7 - 2.2 + Math.sin(x * 0.06 + z * 0.03) * 1.2) * flat + Math.sin(x * 1.3 + z * 0.4) * 0.015;
    p.setY(i, h);
  }
  geo.computeVertexNormals();
  g.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x9c7552, roughness: 1 })));

  // start gantry over the bike
  const black = new THREE.MeshStandardMaterial({ color: 0x111214, roughness: 0.6, metalness: 0.4 });
  for (const z of [-3.4, 3.4]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.28, 4.8, 0.28), black);
    post.position.set(-3.4, 2.4, z);
    g.add(post);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.95, 7.1), black);
  beam.position.set(-3.4, 4.55, 0);
  g.add(beam);
  const banner = new THREE.Mesh(new THREE.PlaneGeometry(7.0, 0.875), new THREE.MeshStandardMaterial({ map: bannerTexture('GROUND TO ORBIT'), roughness: 0.7, emissive: 0xffffff, emissiveIntensity: 0.12 }));
  banner.material.emissiveMap = banner.material.map;
  banner.rotation.y = Math.PI / 2;
  banner.position.set(-3.22, 4.55, 0);
  g.add(banner);
  const lamps = [];
  for (let i = 0; i < 5; i++) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 12), new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0x000000, emissiveIntensity: 4 }));
    m.position.set(-3.2, 3.92, -1.2 + i * 0.6);
    g.add(m);
    lamps.push(m);
  }

  const L = lightRig(g, {
    hemiSky: 0x7f95c8, hemiGround: 0x3a2618, hemi: 0.55,
    key: 0xffa060, keyPos: new THREE.Vector3(-30, 6, -40),
    rim: 0x6fa0ff, rimPos: new THREE.Vector3(25, 12, 20),
  });
  L.k.intensity = 3.2; L.r.intensity = 1.1;
  L.p.color.set(0xdff4ff); L.p.position.set(1.6, 1.2, 0); L.p.distance = 10;

  const DN = ctx.mobile ? 500 : 1100;
  const dust = dustPoints(DN, 0xffc48a, 1.2);
  const dp = dust.geometry.attributes.position.array, da = dust.geometry.attributes.alpha.array;
  const seeds = Array.from({ length: DN }, () => [R() * 60 - 30, R() * 4, R() * 40 - 28, R()]);
  g.add(dust);

  // roost behind the rear wheel when revving / launching
  const roost = dustPoints(400, 0xd9b48a, 2.4);
  const rp = roost.geometry.attributes.position.array, ra = roost.geometry.attributes.alpha.array;
  const rseeds = Array.from({ length: 400 }, () => [R(), R(), R(), R()]);
  g.add(roost);

  let bx = 0;
  return {
    name: 'start', group: g,
    fog: [0x1a1c2c, 18, 140],
    sky: { top: 0x050a1e, horizon: 0x8a4a3a, bottom: 0x120d0c, sunDir: [-0.6, -0.03, -0.8], sunColor: 0xff8a40, sun: 0.7 },
    stars: 0.55,
    offset: 0.1,
    bike: true,
    enter({ bike }) { bike.root.position.set(0, 0, 0); bike.root.rotation.set(0, 0, 0); bike.root.scale.setScalar(1); },
    update(t, time, dt, { bike, camera, rpm, wheelie }) {
      const intro = clamp(time / 3.4);
      bike.setBlueprint(smooth(0.38, 1, intro), intro < 0.3 ? intro / 0.3 : 1 - smooth(0.6, 1, intro) * 0.88);
      const rf = clamp((rpm - 1400) / 8100);
      const go = smooth(0.62, 1, t);
      bx = go * go * 26;
      bike.root.position.set(bx, Math.sin(time * (rpm / 60) * 6.283) * 0.004 * (0.3 + rf), 0);
      bike.wheelie.rotation.z = wheelie * 0.5 + go * 0.12;
      bike.front.rotation.z = -bx / 0.37;
      bike.rear.rotation.z = -bx / 0.35 - time * rf * 6;

      const a = lerp(0.9, 1.34, ease(clamp(t / 0.62)));
      const r = lerp(7.6, 5.2, t);
      camera.position.set(Math.sin(a) * r + bx * 0.35, lerp(1.25, 0.75, ease(t)), Math.cos(a) * r);
      camera.lookAt(bx * 0.8 - 0.2, lerp(1.25, 1.0, t), 0);

      const lit = rf > 0.97 || t > 0.62 ? 6 : Math.floor(rf * 5.99);
      lamps.forEach((m, i) => { m.material.emissive.set(lit === 6 ? 0x19ff5a : i < lit ? 0xff1a1a : 0x000000); });
      L.p.intensity = 1.5 + rf * 2;

      for (let i = 0; i < DN; i++) {
        const s = seeds[i];
        const x = ((s[0] + time * (0.4 + s[3] * 0.6) + 30) % 60) - 30;
        dp[i * 3] = x; dp[i * 3 + 1] = s[1] + Math.sin(time * 0.5 + s[3] * 9) * 0.3; dp[i * 3 + 2] = s[2];
        da[i] = 0.15 + s[3] * 0.4;
      }
      dust.geometry.attributes.position.needsUpdate = true;
      dust.geometry.attributes.alpha.needsUpdate = true;

      const roostAmt = Math.max(rf * 0.8, go > 0 ? 1 : 0);
      for (let i = 0; i < 400; i++) {
        const s = rseeds[i];
        const age = (time * (0.8 + s[3]) + s[0]) % 1;
        rp[i * 3] = bx - 0.9 - age * (1.5 + s[1] * 3.5);
        rp[i * 3 + 1] = 0.05 + age * (0.4 + s[2] * 1.4) - age * age * 0.6;
        rp[i * 3 + 2] = (s[2] - 0.5) * (0.3 + age * 1.8);
        ra[i] = (1 - age) * roostAmt;
      }
      roost.geometry.attributes.position.needsUpdate = true;
      roost.geometry.attributes.alpha.needsUpdate = true;
    },
    hud(t) { return { alt: '0 m' }; },
    fc: [[0, 'Pilot detected: Prajwal P · machine: KTM 890 Adventure.'], [0.3, 'Stage armed. Hold to rev, or scroll to twist the throttle.'], [0.6, 'Green lights. Go go go.']],
  };
}

// ───────────────────────── 05 · CREST ─────────────────────────
const CREST_H = 3.4;
function crestProfile(x) {
  if (x <= 0) return CREST_H * Math.pow(Math.max(0, (x + 34) / 34), 2.2);
  return CREST_H - 7.6 * smooth(0, 10, x);
}
function crestGround(x, z) {
  const warp = (fbm(z * 0.05 + 11, 2) - 0.5) * 7 * smooth(2, 12, Math.abs(z));
  const dunes = (fbm(x * 0.04, z * 0.04 + 5) - 0.5) * 3 * smooth(3, 18, Math.abs(z));
  return crestProfile(x + warp) + dunes + Math.sin(x * 2.1 + z * 0.7) * 0.02;
}

export function crestStage(ctx) {
  const g = new THREE.Group();
  const R = rng(19);
  const geo = new THREE.PlaneGeometry(200, 120, ctx.mobile ? 160 : 260, ctx.mobile ? 80 : 120);
  geo.rotateX(-Math.PI / 2);
  geo.translate(10, 0, -46);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, crestGround(p.getX(i), p.getZ(i)));
  geo.computeVertexNormals();
  g.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xd49a5c, roughness: 1 })));

  const board = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshStandardMaterial({ map: dangerBoard(), roughness: 0.8, emissive: 0xffffff, emissiveIntensity: 0.25 }));
  board.material.emissiveMap = board.material.map;
  board.position.set(-4, crestProfile(-4) + 1.5, -2.2);
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.4, 0.06), new THREE.MeshStandardMaterial({ color: 0x222 }));
  post.position.set(-4, crestProfile(-4) + 0.7, -2.25);
  g.add(board, post);

  const L = lightRig(g, {
    hemiSky: 0xffb070, hemiGround: 0x5a3018, hemi: 0.6,
    key: 0xffa24a, keyPos: new THREE.Vector3(25, 8, -100),
    rim: 0xffd29a, rimPos: new THREE.Vector3(-20, 20, 30),
  });
  L.k.intensity = 4; L.r.intensity = 0.5;
  L.p.color.set(0xffc080);

  const sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('rgba(255,210,150,1)'), color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  sun.scale.set(26, 26, 1);
  sun.material.opacity = 0.55;
  sun.position.set(28, 12, -120);
  g.add(sun);

  const BN = ctx.mobile ? 500 : 1000;
  const burst = dustPoints(BN, 0xc9965e, 1.1);
  const bp = burst.geometry.attributes.position.array, ba = burst.geometry.attributes.alpha.array;
  const bs = Array.from({ length: BN }, () => [R() * 8 - 1, R() * 5 + 0.5, R() * 6 - 3, R() * 0.35, R()]);
  g.add(burst);

  const skyTop = new THREE.Color(), skyHor = new THREE.Color();
  const cTop0 = new THREE.Color(0x2b2452), cTop1 = new THREE.Color(0x010207);
  const cHor0 = new THREE.Color(0xffa24a), cHor1 = new THREE.Color(0x3a1c30);

  let jumpH = 0;
  return {
    name: 'crest', group: g,
    fog: [0xe0955a, 60, 320],
    sky: { top: 0x2b2452, horizon: 0xffa24a, bottom: 0x6a3a20, sunDir: [0.22, 0.09, -1], sunColor: 0xffc070, sun: 1.4 },
    stars: 0,
    offset: 0.18,
    bike: true,
    enter({ bike }) { bike.root.rotation.set(0, 0, 0); bike.root.scale.setScalar(1); bike.setBlueprint(1, 0); bike.wheelie.rotation.z = 0; },
    update(t, time, dt, { bike, camera, sky, scene, setStars }) {
      let bx, by, pitch;
      const TAKEOFF = 0.34;
      if (t < TAKEOFF) {
        const s = ease(t / TAKEOFF);
        bx = -30 + s * 30;
        by = crestProfile(bx);
        pitch = Math.atan2(crestProfile(bx + 0.8) - crestProfile(bx - 0.8), 1.6);
      } else {
        const u = (t - TAKEOFF) / (1 - TAKEOFF);
        bx = u * 34;
        by = CREST_H + u * 9 + u * u * u * 70;
        pitch = 0.22 + u * 0.2 + Math.sin(u * 3) * 0.05;
      }
      const u = clamp((t - TAKEOFF) / (1 - TAKEOFF));
      jumpH = Math.max(0, by - CREST_H);
      bike.root.position.set(bx, by, 0);
      bike.root.rotation.set(Math.sin(u * 4) * 0.05 * u, 0, pitch);
      bike.front.rotation.z = -bx / 0.37;
      bike.rear.rotation.z = -bx / 0.35 - time * 4;

      camera.position.set(bx - 1.6 + u * 2, 1.2 + by * 0.5 + crestProfile(Math.min(bx, 0)) * 0.35, 6.2 + u * 12);
      camera.lookAt(bx + 0.4, by + 0.9 + u * 3, 0);

      skyTop.copy(cTop0).lerp(cTop1, smooth(0, 0.9, u));
      skyHor.copy(cHor0).lerp(cHor1, smooth(0.1, 1, u));
      sky.uniforms.top.value.copy(skyTop);
      sky.uniforms.horizon.value.copy(skyHor);
      setStars(smooth(0.4, 1, u));
      scene.fog.color.copy(skyHor).lerp(cHor0, 0.3);

      for (let i = 0; i < BN; i++) {
        const s = bs[i];
        const age = Math.max(0, (t - TAKEOFF) * 5 - s[3]);
        const on = age > 0 ? 1 : 0;
        bp[i * 3] = s[0] * 0.3 + (s[0] + 3) * age * 0.9;
        bp[i * 3 + 1] = CREST_H + s[1] * age - 2.2 * age * age;
        bp[i * 3 + 2] = s[2] * (0.2 + age);
        ba[i] = on * clamp(1 - age / 2.2) * (0.15 + s[4] * 0.35);
        if (bp[i * 3 + 1] < crestProfile(bp[i * 3]) - 0.2) ba[i] = 0;
      }
      burst.geometry.attributes.position.needsUpdate = true;
      burst.geometry.attributes.alpha.needsUpdate = true;
      L.p.position.set(bx + 1, by + 1, 1);
      L.p.intensity = 0.6;
    },
    hud(t) { return { alt: t < 0.34 ? `${(crestProfile(-30 + ease(t / 0.34) * 30)).toFixed(1)} m` : `${Math.round(jumpH)} m AGL` }; },
    fc: [[0, '!!! Crest ahead. Roadbook ends here.'], [0.3, 'Full gas. Front going light.'], [0.5, 'Air time: indefinite.'], [0.75, 'Trajectory nominal. Pilot refuses to land.']],
  };
}
