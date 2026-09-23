// Procedural, stylised KTM 890 Adventure (no logos, no third-party models).
// Units are metres. +x is forward, +y up, z lateral. Rear tyre contact at x=-0.76.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { MeshSurfaceSampler } from 'three/examples/jsm/math/MeshSurfaceSampler.js';

const V = (x, y, z = 0) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);

export function buildBike() {
  const mats = {
    orange: new THREE.MeshStandardMaterial({ color: 0xff6a00, roughness: 0.32, metalness: 0.15 }),
    white: new THREE.MeshStandardMaterial({ color: 0xe8e5de, roughness: 0.42 }),
    black: new THREE.MeshStandardMaterial({ color: 0x18181a, roughness: 0.55, metalness: 0.25 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x0b0b0b, roughness: 0.95 }),
    metal: new THREE.MeshStandardMaterial({ color: 0xa7adb3, roughness: 0.22, metalness: 0.95 }),
    engine: new THREE.MeshStandardMaterial({ color: 0x2b2d30, roughness: 0.45, metalness: 0.7 }),
    gold: new THREE.MeshStandardMaterial({ color: 0xd19a2a, roughness: 0.28, metalness: 0.85 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x9fc3d6, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.32 }),
    lamp: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xe6f6ff, emissiveIntensity: 4 }),
    tail: new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0xff1a1a, emissiveIntensity: 3 }),
  };
  const bike = new THREE.Group();
  bike.name = 'ktm890';
  const solids = [];

  function add(mesh, parent = bike) {
    parent.add(mesh);
    solids.push(mesh);
    return mesh;
  }
  function rod(a, b, r, mat, parent) {
    const d = V().subVectors(b, a);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, d.length(), 10), mat);
    m.position.copy(a).addScaledVector(d, 0.5);
    m.quaternion.setFromUnitVectors(UP, d.clone().normalize());
    return add(m, parent);
  }
  function tube(points, r, mat, parent) {
    const curve = new THREE.CatmullRomCurve3(points);
    return add(new THREE.Mesh(new THREE.TubeGeometry(curve, 24, r, 8, false), mat), parent);
  }
  function rbox(w, h, d, mat, x, y, z = 0, rz = 0, rad = 0.03) {
    const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, Math.min(rad, w / 2, h / 2, d / 2)), mat);
    m.position.set(x, y, z);
    m.rotation.z = rz;
    return add(m);
  }

  // ── wheels: 21" front, 18" rear, knobby tread
  function wheel(outerR, tubeR, width) {
    const w = new THREE.Group();
    const rimR = outerR - tubeR * 1.6;
    add(new THREE.Mesh(new THREE.TorusGeometry(outerR - tubeR, tubeR, 14, 56), mats.rubber), w);
    add(new THREE.Mesh(new THREE.TorusGeometry(rimR, 0.013, 8, 56), mats.metal), w);
    const hub = add(new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, width, 16), mats.metal), w);
    hub.rotation.x = Math.PI / 2;
    const knobs = new THREE.InstancedMesh(new THREE.BoxGeometry(0.045, 0.03, width * 0.9), mats.rubber, 40);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      q.setFromAxisAngle(V(0, 0, 1), a + Math.PI / 2);
      m4.compose(V(Math.cos(a) * (outerR - 0.008), Math.sin(a) * (outerR - 0.008), (i % 2 ? 0.012 : -0.012)), q, V(1, 1, 1));
      knobs.setMatrixAt(i, m4);
    }
    w.add(knobs);
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const side = i % 2 ? 1 : -1;
      rod(V(Math.cos(a) * 0.05, Math.sin(a) * 0.05, side * 0.04), V(Math.cos(a + 0.35) * rimR, Math.sin(a + 0.35) * rimR, side * 0.01), 0.0035, mats.metal, w);
    }
    return w;
  }
  const rear = wheel(0.35, 0.07, 0.15);
  rear.position.set(-0.76, 0.35, 0);
  bike.add(rear);
  const front = wheel(0.37, 0.058, 0.11);
  front.position.set(0.76, 0.37, 0);
  bike.add(front);
  // front discs
  for (const z of [-0.07, 0.07]) {
    const disc = add(new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.006, 32), mats.metal));
    disc.rotation.x = Math.PI / 2;
    disc.position.set(0.76, 0.37, z);
  }

  // ── fork (26.5° rake), triple clamp, bars, handguards, mirrors
  const rake = THREE.MathUtils.degToRad(26.5);
  const axle = V(0.76, 0.37);
  const forkDir = V(-Math.sin(rake), Math.cos(rake));
  const forkTop = axle.clone().addScaledVector(forkDir, 0.9);
  for (const z of [-0.105, 0.105]) {
    rod(V(axle.x, axle.y, z), V(axle.x, axle.y, z).addScaledVector(forkDir, 0.42), 0.03, mats.black);
    rod(V(axle.x, axle.y, z).addScaledVector(forkDir, 0.4), V(forkTop.x, forkTop.y, z), 0.024, mats.gold);
  }
  rbox(0.08, 0.05, 0.3, mats.black, forkTop.x, forkTop.y, 0, -rake);
  tube([V(0.3, 1.24, -0.43), V(0.33, 1.28, -0.2), V(0.33, 1.28, 0.2), V(0.3, 1.24, 0.43)], 0.012, mats.black);
  for (const z of [-0.4, 0.4]) {
    rbox(0.16, 0.06, 0.05, mats.orange, 0.36, 1.25, z, -0.1, 0.02);
    rod(V(0.3, 1.25, z * 0.72), V(0.27, 1.46, z * 0.82), 0.006, mats.black);
    rbox(0.03, 0.06, 0.1, mats.black, 0.27, 1.48, z * 0.84, 0, 0.01);
  }

  // ── tall adventure fairing, stacked vertical headlight, screen
  rbox(0.2, 0.34, 0.25, mats.white, 0.52, 1.13, 0, -0.42, 0.05);
  for (const z of [-0.13, 0.13]) rbox(0.26, 0.2, 0.02, mats.orange, 0.47, 1.06, z, -0.35, 0.01);
  rbox(0.03, 0.09, 0.1, mats.lamp, 0.615, 1.19, 0, -0.42, 0.012);
  rbox(0.03, 0.08, 0.09, mats.lamp, 0.575, 1.08, 0, -0.42, 0.012);
  const screen = rbox(0.012, 0.36, 0.3, mats.glass, 0.47, 1.46, 0, 0.35, 0.006);
  screen.userData.noSample = true;
  // front fender, hugging the tyre
  const fender = add(new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.035, 6, 24, 1.3), mats.white));
  fender.position.copy(axle);
  fender.rotation.z = 0.55;
  fender.scale.set(1, 1, 2.2);

  // ── orange trellis frame + black subframe
  for (const z of [-0.13, 0.13]) {
    tube([V(forkTop.x - 0.02, forkTop.y - 0.04, z * 0.5), V(0.12, 1.0, z), V(-0.16, 0.86, z), V(-0.28, 0.58, z * 0.9)], 0.016, mats.orange);
    tube([V(forkTop.x - 0.03, forkTop.y - 0.12, z * 0.5), V(0.22, 0.76, z), V(0.13, 0.44, z * 0.8)], 0.014, mats.orange);
    tube([V(-0.16, 0.9, z * 0.9), V(-0.5, 0.98, z * 0.8), V(-0.86, 1.06, z * 0.6)], 0.011, mats.black);
    tube([V(-0.28, 0.62, z * 0.9), V(-0.55, 0.86, z * 0.8), V(-0.8, 1.02, z * 0.6)], 0.009, mats.black);
  }

  // ── LC8c parallel twin + skid plate
  rbox(0.44, 0.34, 0.3, mats.engine, 0.02, 0.5, 0, 0, 0.04);
  rbox(0.22, 0.24, 0.34, mats.engine, 0.2, 0.72, 0, -0.62, 0.04);
  const clutch = add(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.03, 24), mats.metal));
  clutch.rotation.x = Math.PI / 2;
  clutch.position.set(-0.02, 0.47, 0.165);
  rbox(0.5, 0.04, 0.3, mats.black, 0.04, 0.28, 0, 0.08, 0.015);

  // ── the 890's signature low-slung tank, draped either side of the engine
  for (const z of [-0.2, 0.2]) {
    const pod = add(new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.24, 6, 14), mats.orange));
    pod.rotation.z = Math.PI / 2 - 0.2;
    pod.position.set(0.12, 0.66, z);
    pod.scale.set(1, 1, 0.8);
    rbox(0.28, 0.05, 0.02, mats.white, 0.1, 0.74, z * 1.35, -0.2, 0.01);
  }
  rbox(0.36, 0.12, 0.3, mats.white, 0.1, 0.98, 0, 0.12, 0.05);
  rbox(0.2, 0.05, 0.22, mats.black, 0.16, 1.05, 0, 0.18, 0.02);

  // ── seat, side panels, tail, rack, tail light
  rbox(0.46, 0.08, 0.28, mats.black, -0.22, 1.0, 0, -0.03, 0.035);
  rbox(0.3, 0.08, 0.24, mats.black, -0.56, 1.06, 0, -0.08, 0.035);
  for (const z of [-0.145, 0.145]) rbox(0.36, 0.17, 0.03, mats.orange, -0.36, 0.86, z, -0.1, 0.012);
  rbox(0.3, 0.07, 0.18, mats.white, -0.82, 1.08, 0, -0.12, 0.03);
  rbox(0.26, 0.015, 0.22, mats.black, -0.84, 1.14, 0, -0.1, 0.005);
  rbox(0.02, 0.03, 0.1, mats.tail, -0.975, 1.06, 0, 0, 0.008);

  // ── swingarm, shock, exhaust
  for (const z of [-0.1, 0.1]) rod(V(-0.27, 0.54, z), V(-0.76, 0.35, z * 0.9), 0.024, mats.metal);
  rod(V(-0.42, 0.44, 0), V(-0.24, 0.86, 0), 0.028, mats.orange);
  tube([V(0.3, 0.72, 0.1), V(0.33, 0.4, 0.1), V(0.12, 0.23, 0.08), V(-0.24, 0.34, 0.12), V(-0.42, 0.56, 0.17)], 0.022, mats.metal);
  rod(V(-0.4, 0.55, 0.18), V(-0.7, 0.72, 0.18), 0.058, mats.black);
  rod(V(-0.7, 0.72, 0.18), V(-0.74, 0.74, 0.18), 0.04, mats.metal);
  // pegs
  for (const z of [-0.17, 0.17]) rod(V(-0.12, 0.42, z), V(-0.12, 0.42, z * 1.4), 0.014, mats.metal);

  // ── blueprint edge overlay
  const edgeMat = new THREE.LineBasicMaterial({ color: 0x8be9ff, transparent: true, opacity: 0, depthWrite: false });
  for (const m of solids) {
    if (m.isInstancedMesh) continue;
    const e = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry, 28), edgeMat);
    e.raycast = () => {};
    m.add(e);
  }

  const allMats = Object.values(mats);
  for (const mt of allMats) mt.userData.baseOpacity = mt.opacity;
  let solid = -1;
  /** k=0 → pure blueprint wireframe, k=1 → solid machine. */
  function setBlueprint(k, edgeLevel = 1 - k) {
    edgeMat.opacity = Math.min(1, edgeLevel) * 0.9;
    if (k === solid) return;
    solid = k;
    for (const mt of allMats) {
      const target = mt.userData.baseOpacity * k;
      const needT = k < 0.999 || mt === mats.glass;
      if (mt.transparent !== needT) { mt.transparent = needT; mt.needsUpdate = true; }
      mt.opacity = target;
      mt.depthWrite = k > 0.5;
    }
  }

  // Pivot at rear tyre contact patch so wheelies rotate naturally.
  // root (placed by bike centre) → wheelie (pivot at rear contact) → bike
  const root = new THREE.Group();
  const wheelie = new THREE.Group();
  wheelie.position.set(-0.76, 0, 0);
  bike.position.set(0.76, 0, 0);
  wheelie.add(bike);
  root.add(wheelie);

  const obj = { root, wheelie, bike, front, rear, setBlueprint, solids, mats, credit: '' };
  loadRealBike(obj);
  return obj;
}

/**
 * If public/models/ktm.glb is present, load it and use it in place of the
 * procedural bike. Auto-normalises scale and ground contact; front direction
 * and credit come from public/models/ktm.json (facing, credit, yaw). Falls
 * back silently to the procedural bike when the file is absent or fails.
 */
async function loadRealBike(obj) {
  let cfg = {};
  try {
    const r = await fetch('models/ktm.json', { cache: 'no-store' });
    if (!r.ok) return; // no real model configured — keep procedural
    cfg = await r.json();
  } catch { return; }
  const url = cfg.file || 'models/ktm.glb';
  let GLTFLoader;
  try { ({ GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js')); } catch { return; }
  new GLTFLoader().load(url, (gltf) => {
    const model = gltf.scene;
    // orient: print STLs point an arbitrary way. cfg.up + cfg.front name the
    // model-space axes that should become world up (+y) and forward (+x); the
    // site rebases the model onto them. Falls back to rotX/rotY/rotZ (deg).
    const ax = (v, def) => { const t = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1], '-x': [-1, 0, 0], '-y': [0, -1, 0], '-z': [0, 0, -1] }; return new THREE.Vector3(...(t[v] || def)); };
    if (cfg.up || cfg.front) {
      const up = ax(cfg.up, [0, 1, 0]).normalize();
      const fwd = ax(cfg.front, [1, 0, 0]).normalize();
      const side = new THREE.Vector3().crossVectors(fwd, up).normalize();
      const trueUp = new THREE.Vector3().crossVectors(side, fwd).normalize();
      // basis(model→world) maps model fwd/up onto +x/+y; invert to rotate model
      const m = new THREE.Matrix4().makeBasis(fwd, trueUp, side).transpose();
      model.quaternion.setFromRotationMatrix(m);
    } else {
      const d = THREE.MathUtils.degToRad;
      model.rotation.set(d(cfg.rotX ?? 0), d(cfg.rotY ?? cfg.yaw ?? 0), d(cfg.rotZ ?? 0));
    }
    model.updateMatrixWorld(true);
    let box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const length = Math.max(size.x, size.z); // longest horizontal axis
    const s = (cfg.length ?? 1.95) / (length || 1);
    model.scale.setScalar(s);
    model.updateMatrixWorld(true);
    box = new THREE.Box3().setFromObject(model);
    const c = box.getCenter(new THREE.Vector3());
    model.position.x -= c.x; model.position.z -= c.z;
    model.position.y -= box.min.y; // ground contact

    // one clean CAD-orange material so the print model catches scene light
    const hex = (c, def) => (c == null ? def : typeof c === 'number' ? c : Number(c));
    const skin = new THREE.MeshStandardMaterial({
      color: new THREE.Color(hex(cfg.color, 0xc0450a)), metalness: 0.0, roughness: 0.55,
      emissive: new THREE.Color(hex(cfg.emissive, 0x2a0e00)), emissiveIntensity: 0.6,
      flatShading: false,
    });
    skin.userData.baseOpacity = 1;
    // blueprint edges so the intro wireframe still works
    const edgeMat = new THREE.LineBasicMaterial({ color: 0x8be9ff, transparent: true, opacity: 0, depthWrite: false });
    const realMats = [skin];
    model.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = false;
      if (!o.geometry.getAttribute('normal')) o.geometry.computeVertexNormals();
      o.material = skin;
      try { const e = new THREE.LineSegments(new THREE.EdgesGeometry(o.geometry, 46), edgeMat); e.raycast = () => {}; o.add(e); } catch {}
    });
    console.log('[bike] real model ready · world size', new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3()).toArray().map((n) => n.toFixed(2)).join(' × '));

    obj.bike.clear();
    obj.bike.add(model);
    obj.solids.length = 0;
    model.traverse((o) => { if (o.isMesh) obj.solids.push(o); });
    obj.front = obj.rear = new THREE.Group(); // wheel spin no-ops on the scan
    obj.credit = cfg.credit || '';
    const creditEl = document.getElementById('credit');
    if (creditEl && obj.credit) creditEl.innerHTML = ` · ${obj.credit}`;

    obj.setBlueprint = (k, edgeLevel = 1 - k) => {
      edgeMat.opacity = Math.min(1, edgeLevel) ** 2 * 0.85;
      for (const mt of realMats) {
        const t = k < 0.999;
        if (mt.transparent !== t) { mt.transparent = t; mt.needsUpdate = true; }
        mt.opacity = (mt.userData.baseOpacity ?? 1) * k;
        mt.depthWrite = k > 0.5;
      }
    };
  }, undefined, () => { /* load failed — procedural stays */ });
}

/** Sample N points over the bike's surfaces (local space, weighted by area). */
export function sampleBike(bikeObj, n) {
  const { bike, solids } = bikeObj;
  bike.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(bike.matrixWorld).invert();
  const items = [];
  let total = 0;
  for (const m of solids) {
    if (m.isInstancedMesh || m.userData.noSample) continue;
    const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry;
    const p = g.attributes.position;
    const mat = new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld);
    let area = 0;
    const a = V(), b = V(), c = V();
    for (let i = 0; i < p.count; i += 3) {
      a.fromBufferAttribute(p, i).applyMatrix4(mat);
      b.fromBufferAttribute(p, i + 1).applyMatrix4(mat);
      c.fromBufferAttribute(p, i + 2).applyMatrix4(mat);
      area += V().subVectors(b, a).cross(V().subVectors(c, a)).length() / 2;
    }
    items.push({ m, mat, area: Math.sqrt(area) });
    total += Math.sqrt(area);
  }
  const out = new Float32Array(n * 3);
  let k = 0;
  const tmp = V();
  for (const it of items) {
    const cnt = Math.round((it.area / total) * n);
    const s = new MeshSurfaceSampler(it.m).build();
    for (let i = 0; i < cnt && k < n; i++, k++) {
      s.sample(tmp);
      tmp.applyMatrix4(it.mat);
      out.set([tmp.x, tmp.y, tmp.z], k * 3);
    }
  }
  while (k < n) { out.copyWithin(k * 3, ((k * 7919) % Math.max(1, k)) * 3, ((k * 7919) % Math.max(1, k)) * 3 + 3); k++; }
  return out;
}
