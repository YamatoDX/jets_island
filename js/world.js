'use strict';
/* World: terrain maths, sky, ocean, islands, props, and all procedural models. */
const V3 = THREE.Vector3;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const rand = (a, b) => b === undefined ? Math.random() * (a === undefined ? 1 : a) : a + Math.random() * (b - a);

const ISLANDS = [
  { x: 0, z: 0, r: 420, ph: 0.7, name: 'Gravemoor' },
  { x: 1500, z: -450, r: 400, ph: 2.9, name: 'Bloodfen' },
  { x: 520, z: 1620, r: 440, ph: 4.6, name: "Wraith's Rest" }
];

function hash2(x, z) { const n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return n - Math.floor(n); }
function vnoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  return lerp(lerp(hash2(xi, zi), hash2(xi + 1, zi), u), lerp(hash2(xi, zi + 1), hash2(xi + 1, zi + 1), u), v);
}
function fbm(x, z) { return vnoise(x, z) * 0.5 + vnoise(x * 2.1, z * 2.1) * 0.25 + vnoise(x * 4.3, z * 4.3) * 0.125; }

function terrainH(x, z) {
  let h = -30;
  for (let k = 0; k < ISLANDS.length; k++) {
    const I = ISLANDS[k], dx = x - I.x, dz = z - I.z, d0 = Math.sqrt(dx * dx + dz * dz);
    if (d0 > I.r * 1.4) continue;
    const a = Math.atan2(dz, dx);
    const d = d0 / (I.r * (1 + 0.1 * Math.sin(3 * a + I.ph) + 0.05 * Math.sin(7 * a + I.ph * 2)));
    const s = 1 - smooth(0.72, 1.08, d);
    const land = 5 + fbm(x * 0.012 + I.ph, z * 0.012) * 9 + fbm(x * 0.05, z * 0.05) * 1.5;
    const hi = -30 + (land + 30) * s;
    if (hi > h) h = hi;
  }
  return h;
}
function islandAt(x, z) {
  for (let k = 0; k < ISLANDS.length; k++) {
    const I = ISLANDS[k];
    if (Math.hypot(x - I.x, z - I.z) < I.r * 1.2) return k;
  }
  return -1;
}

// ---------- textures ----------
function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); }
  t.anisotropy = 4;
  return t;
}
function grainTex(base, vari, repeat, streak) {
  return canvasTex(256, 256, (g, w, h) => {
    for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) {
      const v = base + (Math.random() - 0.5) * vari + (streak ? Math.sin(x * 0.35) * streak : 0);
      const c = clamp(v, 0, 255) | 0; g.fillStyle = `rgb(${c},${c},${c})`; g.fillRect(x, y, 2, 2);
    }
  }, repeat);
}
const TEX = {};
function initTextures() {
  TEX.ground = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#c4c4c4'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) { // soft blotches, wrapped at the edges so the tile is seamless
      const x = rand(w), y = rand(h), r = rand(8, 46), v = Math.random() < 0.5 ? 255 : 90, a = rand(0.05, 0.16);
      for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) {
        const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
        gr.addColorStop(0, `rgba(${v},${v},${v},${a})`); gr.addColorStop(1, `rgba(${v},${v},${v},0)`);
        g.fillStyle = gr; g.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
      }
    }
    for (let i = 0; i < 9000; i++) { const v = rand(120, 255) | 0; g.fillStyle = `rgba(${v},${v},${v},0.35)`; g.fillRect(rand(w), rand(h), 1.5, 1.5); }
  }, 48);
  TEX.planks = grainTex(170, 60, 2, 40);
  TEX.water = grainTex(128, 200, 60);
  TEX.glow = canvasTex(64, 64, (g) => {
    const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.3, 'rgba(255,255,255,0.5)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  });
  TEX.moon = canvasTex(256, 256, (g) => {
    const r = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    r.addColorStop(0, 'rgba(255,225,200,1)'); r.addColorStop(0.36, 'rgba(255,150,110,1)');
    r.addColorStop(0.4, 'rgba(255,60,40,0.35)'); r.addColorStop(1, 'rgba(255,0,0,0)');
    g.fillStyle = r; g.fillRect(0, 0, 256, 256);
    g.fillStyle = 'rgba(120,40,30,0.25)';
    for (let i = 0; i < 9; i++) { g.beginPath(); g.arc(128 + rand(-34, 34), 128 + rand(-34, 34), rand(4, 13), 0, 7); g.fill(); }
  });
  TEX.sky = canvasTex(2048, 1024, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#010208'); gr.addColorStop(0.3, '#070818'); gr.addColorStop(0.47, '#22102a');
    gr.addColorStop(0.5, '#3a1522'); gr.addColorStop(0.53, '#0a0810'); gr.addColorStop(1, '#020204');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 1800; i++) {
      const y = Math.pow(Math.random(), 1.4) * h * 0.47, a = rand(0.3, 1), s = Math.random() < 0.06 ? 2 : 1;
      g.fillStyle = `rgba(${200 + rand(55) | 0},${200 + rand(55) | 0},255,${a})`; g.fillRect(rand(w), y, s, s);
    }
    for (let i = 0; i < 40; i++) { // cloud wisps
      const x = rand(w), y = rand(h * 0.2, h * 0.47), rw = rand(80, 260);
      const r = g.createRadialGradient(x, y, 0, x, y, rw);
      r.addColorStop(0, 'rgba(70,50,80,0.16)'); r.addColorStop(1, 'rgba(60,40,70,0)');
      g.fillStyle = r; g.fillRect(x - rw, y - rw * 0.3, rw * 2, rw * 0.6);
    }
  });
}

// ---------- mesh helpers ----------
const std = (color, o) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.8, metalness: 0 }, o || {}));
const glowMat = (color) => new THREE.MeshBasicMaterial({ color });
const GEO = {};
function geoBox(w, h, d) { const k = 'b' + w + '_' + h + '_' + d; return GEO[k] || (GEO[k] = new THREE.BoxGeometry(w, h, d)); }
function box(w, h, d, mat, x, y, z, parent) {
  const m = new THREE.Mesh(geoBox(w, h, d), mat); m.position.set(x || 0, y || 0, z || 0);
  if (parent) parent.add(m); return m;
}
function cyl(rt, rb, h, mat, x, y, z, parent, seg) {
  const k = 'c' + rt + '_' + rb + '_' + h + '_' + (seg || 10);
  const m = new THREE.Mesh(GEO[k] || (GEO[k] = new THREE.CylinderGeometry(rt, rb, h, seg || 10)), mat);
  m.position.set(x || 0, y || 0, z || 0); if (parent) parent.add(m); return m;
}
// cylinder with axis along Z (rt = rear/+Z radius, rb = front/-Z radius)
function zcyl(rt, rb, len, mat, x, y, z, parent, seg) { const m = cyl(rt, rb, len, mat, x, y, z, parent, seg); m.rotation.x = Math.PI / 2; return m; }
function ball(r, mat, x, y, z, parent, seg) {
  const k = 's' + r + '_' + (seg || 10);
  const m = new THREE.Mesh(GEO[k] || (GEO[k] = new THREE.SphereGeometry(r, seg || 10, Math.max(6, (seg || 10) - 2))), mat);
  m.position.set(x || 0, y || 0, z || 0); if (parent) parent.add(m); return m;
}
function cone(r, h, mat, x, y, z, parent, seg) {
  const k = 'k' + r + '_' + h + '_' + (seg || 8);
  const m = new THREE.Mesh(GEO[k] || (GEO[k] = new THREE.ConeGeometry(r, h, seg || 8)), mat);
  m.position.set(x || 0, y || 0, z || 0); if (parent) parent.add(m); return m;
}
function glowSprite(color, size, opacity) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.glow, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: opacity === undefined ? 1 : opacity }));
  s.scale.set(size, size, 1); return s;
}

// ---------- environment ----------
const ENV = {};
function buildEnvironment(scene) {
  initTextures();
  const sky = new THREE.Mesh(new THREE.SphereGeometry(7000, 32, 20), new THREE.MeshBasicMaterial({ map: TEX.sky, side: THREE.BackSide, fog: false, depthWrite: false }));
  scene.add(sky); ENV.sky = sky;
  const moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.moon, fog: false, transparent: true, depthWrite: false }));
  moon.scale.set(1500, 1500, 1); scene.add(moon); ENV.moon = moon;
  ENV.moonDir = new V3(-0.45, 0.42, -0.78).normalize();

  ENV.hemi = new THREE.HemisphereLight(0x6f7fc4, 0x1a1420, 1.25); scene.add(ENV.hemi);
  ENV.sun = new THREE.DirectionalLight(0xb0b8ff, 1.5); ENV.sun.position.copy(ENV.moonDir).multiplyScalar(100); scene.add(ENV.sun);
  const red = new THREE.DirectionalLight(0xff4030, 0.2); red.position.set(0.6, 0.3, 0.7); scene.add(red);

  const water = new THREE.Mesh(new THREE.PlaneGeometry(16000, 16000, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0x0b2030, roughness: 0.22, metalness: 0.75, bumpMap: TEX.water, bumpScale: 1.4, transparent: true, opacity: 0.93 }));
  TEX.water.repeat.set(260, 260);
  water.rotation.x = -Math.PI / 2; scene.add(water); ENV.water = water;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(16000, 16000), new THREE.MeshBasicMaterial({ color: 0x020409 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -31; scene.add(floor);

  ISLANDS.forEach((I) => buildIsland(I, scene));
}

function buildIsland(I, scene) {
  const size = I.r * 2.75, seg = 150;
  const g = new THREE.PlaneGeometry(size, size, seg, seg); g.rotateX(-Math.PI / 2);
  const p = g.attributes.position, col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) + I.x, z = p.getZ(i) + I.z, h = terrainH(x, z);
    p.setY(i, h);
    const n = fbm(x * 0.03, z * 0.03), n2 = vnoise(x * 0.2, z * 0.2);
    let r, gg, b;
    if (h < 1.6) { const k = smooth(-6, 1.6, h); r = lerp(0.1, 0.5, k); gg = lerp(0.1, 0.44, k); b = lerp(0.12, 0.33, k); }
    else {
      const k = smooth(1.6, 4, h);
      const gr = [lerp(0.16, 0.3, n), lerp(0.24, 0.3, n2), lerp(0.11, 0.14, n)];
      if (n > 0.52) { gr[0] = 0.27; gr[1] = 0.2; gr[2] = 0.15; } // dead dirt patches
      r = lerp(0.5, gr[0], k); gg = lerp(0.44, gr[1], k); b = lerp(0.33, gr[2], k);
    }
    col[i * 3] = r; col[i * 3 + 1] = gg; col[i * 3 + 2] = b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, map: TEX.ground, roughness: 0.95 }));
  m.position.set(I.x, 0, I.z); scene.add(m);
}

/* Scatter instanced props. `blocked(x,z)` returns true where props must not go. */
function buildProps(scene, blocked) {
  const dummy = new THREE.Object3D();
  const perI = { trees: 85, rocks: 45, graves: 54 };
  const n = ISLANDS.length;
  const bark = std(0x1c1614, { roughness: 1 });
  const trunkG = new THREE.CylinderGeometry(0.1, 0.42, 7, 6); trunkG.translate(0, 3.5, 0);
  const branchG = new THREE.CylinderGeometry(0.03, 0.13, 3, 5); branchG.translate(0, 1.5, 0);
  const trunks = new THREE.InstancedMesh(trunkG, bark, perI.trees * n);
  const branches = new THREE.InstancedMesh(branchG, bark, perI.trees * n * 5);
  const rocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), std(0x3a3a42, { roughness: 1, flatShading: true }), perI.rocks * n);
  const stoneM = std(0x6a6c72, { roughness: 1 });
  const graves = new THREE.InstancedMesh(new THREE.BoxGeometry(0.7, 1.2, 0.18), stoneM, perI.graves * n);
  const crossV = new THREE.InstancedMesh(new THREE.BoxGeometry(0.16, 1.7, 0.16), stoneM, perI.graves * n);
  const crossH = new THREE.InstancedMesh(new THREE.BoxGeometry(0.8, 0.16, 0.16), stoneM, perI.graves * n);
  let ti = 0, bi = 0, ri = 0, gi = 0, ci = 0;
  const spot = (I, minR, maxR) => {
    for (let k = 0; k < 40; k++) {
      const a = rand(Math.PI * 2), d = I.r * rand(minR, maxR), x = I.x + Math.cos(a) * d, z = I.z + Math.sin(a) * d;
      if (terrainH(x, z) > 2.2 && !blocked(x, z)) return [x, z];
    }
    return null;
  };
  ISLANDS.forEach((I) => {
    for (let t = 0; t < perI.trees; t++) {
      const s = spot(I, 0.05, 0.9); if (!s) continue;
      const y = terrainH(s[0], s[1]), sc = rand(0.8, 1.7), yaw = rand(6.28);
      dummy.position.set(s[0], y - 0.2, s[1]); dummy.rotation.set(rand(-0.12, 0.12), yaw, rand(-0.12, 0.12)); dummy.scale.setScalar(sc);
      dummy.updateMatrix(); trunks.setMatrixAt(ti++, dummy.matrix);
      for (let b = 0; b < 5; b++) {
        dummy.position.set(s[0], y + (2.6 + b * 0.85 + rand(0.3)) * sc, s[1]);
        dummy.rotation.set(0, yaw + b * 2.2 + rand(0.6), (b % 2 ? 1 : -1) * rand(0.6, 1.15));
        dummy.scale.setScalar(sc * rand(0.6, 1.1)); dummy.updateMatrix(); branches.setMatrixAt(bi++, dummy.matrix);
      }
    }
    for (let t = 0; t < perI.rocks; t++) {
      const s = spot(I, 0.05, 0.98); if (!s) continue;
      dummy.position.set(s[0], terrainH(s[0], s[1]), s[1]); dummy.rotation.set(rand(3), rand(3), rand(3));
      dummy.scale.set(rand(0.5, 2.6), rand(0.4, 1.8), rand(0.5, 2.6)); dummy.updateMatrix(); rocks.setMatrixAt(ri++, dummy.matrix);
    }
    for (let c = 0; c < 3; c++) { // graveyards
      const s = spot(I, 0.15, 0.7); if (!s) continue;
      const yaw = rand(6.28);
      for (let k = 0; k < perI.graves / 3; k++) {
        const lx = (k % 6 - 2.5) * 2.4 + rand(-0.3, 0.3), lz = (Math.floor(k / 6) - 1) * 3.4 + rand(-0.3, 0.3);
        const x = s[0] + lx * Math.cos(yaw) - lz * Math.sin(yaw), z = s[1] + lx * Math.sin(yaw) + lz * Math.cos(yaw);
        const y = terrainH(x, z);
        if (y < 1.5) continue;
        dummy.scale.setScalar(rand(0.8, 1.3));
        if (k % 3 === 0) {
          dummy.position.set(x, y + 0.7, z); dummy.rotation.set(rand(-0.15, 0.15), -yaw, rand(-0.2, 0.2)); dummy.updateMatrix();
          crossV.setMatrixAt(ci, dummy.matrix);
          dummy.translateY(0.35); dummy.updateMatrix(); crossH.setMatrixAt(ci++, dummy.matrix);
        } else {
          dummy.position.set(x, y + 0.45, z); dummy.rotation.set(rand(-0.2, 0.2), -yaw, rand(-0.15, 0.15)); dummy.updateMatrix();
          graves.setMatrixAt(gi++, dummy.matrix);
        }
      }
    }
  });
  trunks.count = ti; branches.count = bi; rocks.count = ri; graves.count = gi; crossV.count = ci; crossH.count = ci;
  [trunks, branches, rocks, graves, crossV, crossH].forEach((m) => { m.frustumCulled = false; scene.add(m); });
}

// ---------- monster house ----------
function makeHouse(variant) {
  const g = new THREE.Group();
  const wall = std(0x4a3d38, { map: TEX.planks, roughness: 1 });
  const roofM = std(0x17141c, { roughness: 0.9, flatShading: true });
  const wc = variant % 2 ? 0x9dff3a : 0xff7a1a;
  const winM = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: wc, emissiveIntensity: 2.2 });
  const blk = std(0x050505);
  box(12, 8, 10, wall, 0, 4, 0, g);
  const roof = cone(9.6, 6, roofM, 0, 11, 0, g, 4); roof.rotation.y = Math.PI / 4; roof.scale.z = 0.86;
  box(4.2, 15, 4.2, wall, -5, 7.5, -3, g);
  const tr = cone(3.7, 7.5, roofM, -5, 18.7, -3, g, 4); tr.rotation.y = Math.PI / 4;
  box(1.2, 3, 1.2, wall, 4, 12, -2, g);
  box(2.2, 3.8, 0.3, blk, 0, 1.9, 5.05, g);
  box(4.4, 0.4, 2.4, wall, 0, 4.2, 6, g); box(0.3, 4, 0.3, wall, -2, 2, 7, g); box(0.3, 4, 0.3, wall, 2, 2, 7, g);
  const wins = [[-3.6, 5, 5.06, 0], [3.6, 5, 5.06, 0], [-5, 12, -0.84, 0], [6.06, 4.6, 0, 1], [-3.6, 2, 5.06, 0], [3.6, 2, 5.06, 0]];
  wins.forEach((w) => {
    const m = box(w[3] ? 0.1 : 1.3, 1.9, w[3] ? 1.3 : 0.1, winM, w[0], w[1], w[2], g);
    box(w[3] ? 0.14 : 0.12, 1.9, w[3] ? 0.12 : 0.14, blk, w[0], w[1], w[2], g); // mullion
    m.userData.win = true;
  });
  const halo = glowSprite(wc, 26, 0.35); halo.position.set(0, 5, 6); g.add(halo);
  const fire = glowSprite(0xff5a10, 30, 0); fire.position.set(0, 4, 0); g.add(fire);
  g.rotation.z = rand(-0.03, 0.03);
  g.userData = { winM, halo, fire };
  return g;
}

// ---------- jet (swing-wing twin-tail fighter; forward = -Z) ----------
function makeJet() {
  const g = new THREE.Group(), ext = new THREE.Group(); g.add(ext);
  const grey = std(0x848b94, { metalness: 0.65, roughness: 0.42 });
  const dark = std(0x2c3036, { metalness: 0.7, roughness: 0.5 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x223a55, metalness: 0.9, roughness: 0.08, transparent: true, opacity: 0.6 });
  zcyl(1.25, 1.05, 11, grey, 0, 0.2, -1, ext, 14);
  const nose = cone(1.05, 5.5, grey, 0, 0.2, -9.25, ext, 14); nose.rotation.x = -Math.PI / 2;
  const tip = cone(0.22, 1.4, dark, 0, 0.2, -12.3, ext, 8); tip.rotation.x = -Math.PI / 2;
  const can = ball(1, glass, 0, 1.05, -4.6, ext, 16); can.scale.set(0.78, 0.8, 3.1);
  box(5.6, 0.9, 10.5, grey, 0, -0.1, 3.2, ext);
  const glows = [];
  for (const s of [-1, 1]) {
    zcyl(0.98, 0.98, 9, grey, s * 1.75, -0.35, 4, ext, 12);
    zcyl(0.72, 0.95, 1.3, dark, s * 1.75, -0.35, 9.1, ext, 12);
    const gl = new THREE.Mesh(new THREE.CircleGeometry(0.7, 12), glowMat(0xff8a2a)); gl.position.set(s * 1.75, -0.35, 9.78); ext.add(gl);
    const fl = cone(0.62, 5, new THREE.MeshBasicMaterial({ color: 0xff9a3a, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }), s * 1.75, -0.35, 12.2, ext, 10);
    fl.rotation.x = Math.PI / 2; glows.push(fl);
    box(1.6, 1.5, 3.4, grey, s * 1.85, -0.3, -2, ext); box(1.45, 1.3, 0.1, dark, s * 1.85, -0.3, -3.72, ext);
    const tail = box(0.16, 3.3, 2.9, grey, s * 1.6, 2, 6.6, ext); tail.rotation.z = -s * 0.1; tail.rotation.x = -0.25;
    const stab = box(3.6, 0.13, 2.5, grey, s * 3.9, -0.2, 8, ext); stab.rotation.y = -s * 0.35;
    const mm = zcyl(0.13, 0.13, 3.2, std(0xe8e8e8), s * 2.9, -0.95, 1.5, ext, 8); mm.userData.x = 1;
    box(0.2, 0.5, 0.2, dark, s * 2.9, -0.65, 1.5, ext);
  }
  const wings = [];
  for (const s of [-1, 1]) {
    const piv = new THREE.Group(); piv.position.set(s * 2.5, 0.25, 1.2); ext.add(piv);
    const w = box(8.2, 0.2, 3.3, grey, s * 4.1, 0, 0.4, piv); w.scale.z = 1;
    box(8.2, 0.22, 0.25, dark, s * 4.1, 0, -1.3, piv);
    piv.userData.s = s; wings.push(piv);
  }
  // landing gear
  for (const p of [[0, -6], [-1.9, 3], [1.9, 3]]) { cyl(0.09, 0.09, 1.5, dark, p[0], -1.5, p[1], ext, 6); const wh = cyl(0.36, 0.36, 0.25, std(0x0a0a0a), p[0], -2.2, p[1], ext, 10); wh.rotation.z = Math.PI / 2; }
  // cockpit interior (only shown in cockpit view)
  const cp = new THREE.Group(); cp.visible = false; g.add(cp);
  const cdark = std(0x16181c, { roughness: 0.7 });
  box(1.7, 0.55, 0.5, cdark, 0, 0.82, -4.75, cp);
  box(1.9, 0.5, 0.9, cdark, 0, 0.5, -4.3, cp);
  box(0.16, 0.4, 3.2, cdark, -0.8, 0.86, -3.6, cp); box(0.16, 0.4, 3.2, cdark, 0.8, 0.86, -3.6, cp);
  const scr = glowMat(0x0a5a2c), scr2 = glowMat(0x6a4208);
  box(0.36, 0.26, 0.02, scr, -0.42, 0.86, -4.49, cp); box(0.36, 0.26, 0.02, scr, 0.42, 0.86, -4.49, cp); box(0.3, 0.2, 0.02, scr2, 0, 0.8, -4.49, cp);
  const bowL = box(0.07, 1.5, 0.07, cdark, -0.5, 1.75, -4.85, cp); bowL.rotation.z = -0.42; bowL.rotation.x = -0.35;
  const bowR = box(0.07, 1.5, 0.07, cdark, 0.5, 1.75, -4.85, cp); bowR.rotation.z = 0.42; bowR.rotation.x = -0.35;
  box(0.6, 0.04, 0.04, cdark, 0, 1.12, -4.6, cp); box(0.04, 0.5, 0.04, cdark, -0.3, 1.35, -4.6, cp); box(0.04, 0.5, 0.04, cdark, 0.3, 1.35, -4.6, cp);
  cyl(0.03, 0.03, 0.5, cdark, 0, 0.75, -3.95, cp, 6);
  g.userData = { ext, cp, wings, glows };
  return g;
}

// ---------- speed boat (forward = -Z) ----------
function makeBoat() {
  const g = new THREE.Group();
  const hull = std(0xd8d8de, { metalness: 0.3, roughness: 0.4 }), red = std(0x8c1414, { roughness: 0.5 }), dark = std(0x1d1f24, { metalness: 0.7, roughness: 0.4 });
  box(3.2, 1.1, 7, hull, 0, 0.35, 0.8, g);
  const bow = box(2.26, 1.1, 2.26, hull, 0, 0.35, -2.7, g); bow.rotation.y = Math.PI / 4; bow.scale.z = 1.6; bow.scale.x = 1;
  box(3.3, 0.18, 7.1, red, 0, 0.95, 0.8, g);
  box(2.4, 0.5, 4.2, dark, 0, 0.75, 1.4, g);
  const ws = box(2.4, 0.9, 0.08, new THREE.MeshStandardMaterial({ color: 0x335577, transparent: true, opacity: 0.45, metalness: 0.9, roughness: 0.1 }), 0, 1.5, -0.9, g); ws.rotation.x = -0.45;
  box(0.9, 0.9, 0.5, dark, 0, 1.2, 0.6, g); box(1, 1.2, 0.9, dark, 0, 0.9, 4.5, g);
  const piv = new THREE.Group(); piv.position.set(0, 1.55, -2.6); g.add(piv);
  cyl(0.12, 0.2, 0.9, dark, 0, -0.35, 0, piv, 8);
  const gun = new THREE.Group(); piv.add(gun);
  box(0.5, 0.35, 0.9, dark, 0, 0.15, 0, gun);
  zcyl(0.05, 0.05, 1.6, dark, -0.13, 0.18, -1.1, gun, 6); zcyl(0.05, 0.05, 1.6, dark, 0.13, 0.18, -1.1, gun, 6);
  g.userData = { piv, gun };
  return g;
}

// ---------- player (forward = -Z) ----------
function makePlayerModel() {
  const g = new THREE.Group();
  const skin = std(0xd9a57e), shirt = std(0x24405e), pants = std(0x1e2126), boot = std(0x0e0e10);
  const armM = std(0x505b66, { metalness: 0.9, roughness: 0.25 }), armD = std(0x1c2228, { metalness: 0.8, roughness: 0.35 }), cy = glowMat(0x4fe8ff);
  const armor = [];
  const A = (m) => { m.visible = false; armor.push(m); return m; };
  box(0.56, 0.72, 0.3, shirt, 0, 1.22, 0, g);
  A(box(0.62, 0.76, 0.36, armM, 0, 1.22, 0, g)); A(box(0.4, 0.3, 0.38, armD, 0, 1.0, 0, g));
  const reactor = A(cyl(0.09, 0.09, 0.04, cy, 0, 1.38, -0.19, g, 6)); reactor.rotation.x = Math.PI / 2;
  const head = ball(0.2, skin, 0, 1.78, 0, g, 12);
  A(ball(0.235, armM, 0, 1.79, 0, g, 12)); A(box(0.3, 0.05, 0.08, cy, 0, 1.81, -0.2, g));
  const hairM = std(0x2a1a10, { roughness: 0.6 });
  const hair = new THREE.Group(); hair.position.set(0, 1.86, 0); g.add(hair);
  const spikes = [];
  const sp = [[0, 0.16, 0, 0, 0], [0.12, 0.1, 0, 0, -0.7], [-0.12, 0.1, 0, 0, 0.7], [0, 0.1, 0.12, 0.7, 0], [0, 0.12, -0.1, -0.5, 0], [0.09, 0.13, 0.08, 0.4, -0.4], [-0.09, 0.13, 0.08, 0.4, 0.4]];
  sp.forEach((s) => { const c = cone(0.085, 0.3, hairM, s[0], s[1], s[2], hair, 5); c.rotation.set(s[3], 0, s[4]); spikes.push(c); });
  const longHair = new THREE.Group(); longHair.visible = false; g.add(longHair);
  for (let i = 0; i < 5; i++) { const c = cone(0.1 - i * 0.008, 0.36, hairM, (i % 2 ? 0.05 : -0.05), 1.74 - i * 0.2, 0.2 + i * 0.03, longHair, 5); c.rotation.x = Math.PI - 0.35; }
  const limb = (x, y, w, h, d, m, am) => {
    const p = new THREE.Group(); p.position.set(x, y, 0); g.add(p);
    box(w, h, d, m, 0, -h / 2, 0, p); A(box(w + 0.06, h * 0.96, d + 0.06, am, 0, -h / 2, 0, p)); return p;
  };
  const legL = limb(-0.15, 0.87, 0.2, 0.87, 0.22, pants, armM), legR = limb(0.15, 0.87, 0.2, 0.87, 0.22, pants, armM);
  box(0.21, 0.12, 0.3, boot, 0, -0.82, -0.04, legL); box(0.21, 0.12, 0.3, boot, 0, -0.82, -0.04, legR);
  const armL = limb(-0.38, 1.54, 0.16, 0.66, 0.18, shirt, armD), armR = limb(0.38, 1.54, 0.16, 0.66, 0.18, shirt, armD);
  box(0.185, 0.07, 0.2, cy, 0, -0.52, 0, armL); // wrist-comm
  const hand = new THREE.Group(); hand.position.set(0, -0.68, 0); hand.rotation.x = -Math.PI / 2; armR.add(hand);
  armR.rotation.x = Math.PI / 2;
  const thr = [];
  for (const L of [legL, legR]) { const f = cone(0.09, 0.7, new THREE.MeshBasicMaterial({ color: 0x66d8ff, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }), 0, -1.25, 0, L, 8); f.rotation.x = Math.PI; f.visible = false; thr.push(f); }
  // aura
  const aura = new THREE.Group(); aura.visible = false; g.add(aura);
  const auraM = new THREE.MeshBasicMaterial({ color: 0xffd23a, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const a1 = new THREE.Mesh(new THREE.ConeGeometry(1.0, 3.6, 14, 1, true), auraM); a1.position.y = 1.7; aura.add(a1);
  const a2 = new THREE.Mesh(new THREE.ConeGeometry(0.7, 2.9, 12, 1, true), auraM); a2.position.y = 1.4; aura.add(a2);
  const aGlow = glowSprite(0xffd23a, 5, 0.5); aGlow.position.y = 1.2; aura.add(aGlow);
  g.userData = { legL, legR, armL, armR, hand, armor, hairM, hair, spikes, longHair, thr, aura, auraM, a1, a2, aGlow, head };
  return g;
}

// ---------- monsters (forward = +Z) ----------
const EM = {};
function initEnemyMats() {
  EM.ghost = new THREE.MeshStandardMaterial({ color: 0xc8dcff, emissive: 0x5577cc, emissiveIntensity: 0.9, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false, roughness: 1 });
  EM.black = std(0x040406); EM.cyan = glowMat(0x9ff4ff); EM.red = glowMat(0xff1a1a); EM.yellow = glowMat(0xffd21a);
  EM.pale = std(0x9a988e, { roughness: 0.6 }); EM.cloth = std(0x0c0c10, { roughness: 0.9 }); EM.blood = std(0x3a0408, { roughness: 0.8 });
  EM.bone = std(0xe6e0cc, { roughness: 0.5 }); EM.hide = std(0x26281a, { roughness: 1, flatShading: true }); EM.hide2 = std(0x1a1810, { roughness: 1 });
}
function makeGhost() {
  const g = new THREE.Group(), n = new THREE.Group(); n.position.y = 1.2; g.add(n);
  const m = EM.ghost;
  const body = new THREE.Mesh(GEO.ghostBody || (GEO.ghostBody = new THREE.ConeGeometry(0.8, 2.7, 9, 2, true)), m); body.position.y = 0.2; n.add(body);
  const hd = ball(0.37, m, 0, 1.45, 0, n, 10); hd.scale.y = 1.2;
  ball(0.1, EM.black, -0.14, 1.52, 0.27, n, 8); ball(0.1, EM.black, 0.14, 1.52, 0.27, n, 8);
  ball(0.035, EM.cyan, -0.14, 1.52, 0.35, n, 6); ball(0.035, EM.cyan, 0.14, 1.52, 0.35, n, 6);
  const mo = ball(0.1, EM.black, 0, 1.26, 0.3, n, 8); mo.scale.set(1, 2.2, 0.7);
  const armL = cone(0.1, 1.0, m, -0.5, 0.95, 0.45, n, 6); armL.rotation.x = Math.PI / 2;
  const armR = cone(0.1, 1.0, m, 0.5, 0.95, 0.45, n, 6); armR.rotation.x = Math.PI / 2;
  g.userData.parts = { inner: n, armL, armR };
  return g;
}
function makeVampire() {
  const g = new THREE.Group();
  const limb = (x, y, w, h, d, m) => { const p = new THREE.Group(); p.position.set(x, y, 0); g.add(p); box(w, h, d, m, 0, -h / 2, 0, p); return p; };
  const legL = limb(-0.14, 0.9, 0.18, 0.9, 0.2, EM.cloth), legR = limb(0.14, 0.9, 0.18, 0.9, 0.2, EM.cloth);
  box(0.5, 0.72, 0.28, EM.cloth, 0, 1.26, 0, g); box(0.2, 0.5, 0.02, EM.blood, 0, 1.3, 0.15, g);
  const hd = ball(0.19, EM.pale, 0, 1.82, 0, g, 10); hd.scale.y = 1.18;
  box(0.34, 0.12, 0.34, EM.black, 0, 1.98, -0.03, g);
  const w = cone(0.07, 0.16, EM.black, 0, 1.93, 0.15, g, 4); w.rotation.x = Math.PI; // widow's peak
  const e1 = cone(0.04, 0.16, EM.pale, -0.2, 1.88, 0, g, 4); e1.rotation.z = 0.5; const e2 = cone(0.04, 0.16, EM.pale, 0.2, 1.88, 0, g, 4); e2.rotation.z = -0.5;
  ball(0.032, EM.red, -0.07, 1.85, 0.165, g, 6); ball(0.032, EM.red, 0.07, 1.85, 0.165, g, 6);
  box(0.12, 0.05, 0.02, EM.black, 0, 1.73, 0.17, g);
  const f1 = cone(0.014, 0.07, EM.bone, -0.035, 1.7, 0.18, g, 4); f1.rotation.x = Math.PI; const f2 = cone(0.014, 0.07, EM.bone, 0.035, 1.7, 0.18, g, 4); f2.rotation.x = Math.PI;
  const armL = limb(-0.34, 1.56, 0.13, 0.7, 0.14, EM.cloth), armR = limb(0.34, 1.56, 0.13, 0.7, 0.14, EM.cloth);
  for (const a of [armL, armR]) { ball(0.07, EM.pale, 0, -0.74, 0, a, 6); for (let i = -1; i <= 1; i++) { const c = cone(0.016, 0.16, EM.bone, i * 0.04, -0.86, 0, a, 4); c.rotation.x = Math.PI; } }
  armL.rotation.x = -1.25; armR.rotation.x = -1.25;
  const cape = new THREE.Group(); cape.position.set(0, 1.62, -0.17); g.add(cape);
  box(1.2, 1.6, 0.04, EM.cloth, 0, -0.75, -0.02, cape); box(1.1, 1.5, 0.02, EM.blood, 0, -0.75, 0.01, cape);
  const c1 = box(0.3, 0.3, 0.04, EM.cloth, -0.24, 0.12, 0.05, cape); c1.rotation.set(0.2, 0.5, 0.3);
  const c2 = box(0.3, 0.3, 0.04, EM.cloth, 0.24, 0.12, 0.05, cape); c2.rotation.set(0.2, -0.5, -0.3);
  cape.rotation.x = 0.18;
  g.scale.setScalar(1.15);
  g.userData.parts = { legL, legR, armL, armR, cape };
  return g;
}
function makeBrute() {
  const g = new THREE.Group(), n = new THREE.Group(); n.scale.setScalar(1.75); g.add(n);
  const limb = (x, y, z, w, h, d, m) => { const p = new THREE.Group(); p.position.set(x, y, z); n.add(p); box(w, h, d, m, 0, -h / 2, 0, p); return p; };
  const t = ball(0.6, EM.hide, 0, 1.25, 0, n, 8); t.scale.set(1.25, 1.1, 0.95);
  const b = ball(0.45, EM.hide2, 0, 0.9, 0.08, n, 8); b.scale.set(1.2, 0.9, 1);
  box(0.44, 0.38, 0.44, EM.hide, 0, 1.76, 0.36, n); box(0.42, 0.13, 0.4, EM.hide2, 0, 1.5, 0.42, n);
  box(0.36, 0.1, 0.05, EM.black, 0, 1.6, 0.58, n);
  for (let i = 0; i < 5; i++) { cone(0.03, 0.12, EM.bone, -0.16 + i * 0.08, 1.62, 0.59, n, 4); const u = cone(0.03, 0.1, EM.bone, -0.12 + i * 0.08, 1.63, 0.6, n, 4); u.rotation.x = Math.PI; }
  const h1 = cone(0.09, 0.6, EM.bone, -0.27, 2.1, 0.3, n, 6); h1.rotation.z = 0.6; const h2 = cone(0.09, 0.6, EM.bone, 0.27, 2.1, 0.3, n, 6); h2.rotation.z = -0.6;
  ball(0.055, EM.yellow, -0.11, 1.82, 0.58, n, 6); ball(0.055, EM.yellow, 0.11, 1.82, 0.58, n, 6);
  box(0.42, 0.06, 0.05, EM.hide2, 0, 1.9, 0.58, n).rotation.z = 0;
  const armL = limb(-0.8, 1.62, 0.1, 0.3, 1.3, 0.32, EM.hide), armR = limb(0.8, 1.62, 0.1, 0.3, 1.3, 0.32, EM.hide);
  for (const a of [armL, armR]) for (let i = -1; i <= 1; i++) { const c = cone(0.045, 0.3, EM.bone, i * 0.1, -1.4, 0.05, a, 4); c.rotation.x = Math.PI; }
  const legL = limb(-0.32, 0.72, 0, 0.34, 0.72, 0.38, EM.hide2), legR = limb(0.32, 0.72, 0, 0.34, 0.72, 0.38, EM.hide2);
  for (let i = 0; i < 4; i++) { const s = cone(0.09, 0.42, EM.bone, 0, 1.1 + i * 0.22, -0.5 + i * 0.03, n, 5); s.rotation.x = -1.1; }
  g.userData.parts = { legL, legR, armL, armR };
  return g;
}
