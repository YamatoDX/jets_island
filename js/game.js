'use strict';
/* DREADMOOR — main game logic */
(function () {
  const $ = (id) => document.getElementById(id);
  const PI = Math.PI;

  // ---------- renderer / scene ----------
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', logarithmicDepthBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.3;
  renderer.domElement.id = 'gl';
  document.body.insertBefore(renderer.domElement, document.body.firstChild);
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x0c0a16, 0.0011);
  const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 9500);
  camera.rotation.order = 'YXZ'; scene.add(camera);
  const hudC = $('jethud'), hud = hudC.getContext('2d');
  function resize() {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
    hudC.width = window.innerWidth; hudC.height = window.innerHeight;
  }
  window.addEventListener('resize', resize); resize();

  buildEnvironment(scene);
  initEnemyMats();

  // lights that follow the action
  const flash = new THREE.SpotLight(0xdde4ff, 500, 150, 0.5, 0.6, 1.4);
  camera.add(flash); camera.add(flash.target); flash.target.position.set(0, 0, -10);
  const muzzleL = new THREE.PointLight(0xffc070, 0, 40, 1.6); scene.add(muzzleL);
  const boomL = new THREE.PointLight(0xff8030, 0, 260, 1.4); scene.add(boomL);
  const auraL = new THREE.PointLight(0xffd23a, 0, 60, 1.5); scene.add(auraL);
  let skyFlash = 0, shake = 0, time = 0;

  // ---------- world layout ----------
  const houses = [], jets = [], boats = [], enemies = [], projectiles = [], delayed = [], pads = [];
  const GEAR = 2.56;
  ISLANDS.forEach((I, k) => {
    for (let h = 0; h < 4; h++) {
      const a = I.ph + 0.4 + h * PI / 2, d = I.r * (0.36 + 0.13 * (h % 2));
      const x = I.x + Math.cos(a) * d, z = I.z + Math.sin(a) * d, y = terrainH(x, z);
      const g = makeHouse(h + k); g.position.set(x, y - 0.4, z);
      const yaw = Math.atan2(I.x - x, I.z - z); g.rotation.y = yaw; scene.add(g);
      houses.push({ g, x, z, y, hp: 1500, alive: true, isl: k, spawnT: rand(1, 4), fx: Math.sin(yaw), fz: Math.cos(yaw) });
    }
    const pa = I.ph + 0.4 + PI / 4, pd = I.r * 0.13;
    pads.push({ x: I.x + Math.cos(pa) * pd, z: I.z + Math.sin(pa) * pd });
  });
  function addJet(x, z, yaw) {
    const g = makeJet(), y = terrainH(x, z) + GEAR; g.position.set(x, y, z); g.rotation.order = 'YXZ'; g.rotation.y = yaw; scene.add(g);
    for (let i = 0; i < 4; i++) { // pad lights
      const s = glowSprite(i % 2 ? 0x40ff80 : 0xff4040, 3, 0.9), lx = x + (i < 2 ? -14 : 14), lz = z + (i % 2 ? -16 : 16);
      s.position.set(lx, terrainH(lx, lz) + 0.6, lz); scene.add(s);
    }
    jets.push({ g, pos: g.position, yaw, pitch: 0, roll: 0, speed: 0, thr: 0, home: { x, y, z, yaw }, gunT: 0, mslT: 0, ret: false, side: 1, lock: null });
  }
  pads.forEach((p, k) => addJet(p.x, p.z, ISLANDS[k].ph));
  addJet(pads[0].x + 36, pads[0].z + 10, ISLANDS[0].ph);
  ISLANDS.forEach((I) => {
    for (const off of [1.3, 1.3 + PI * 0.75, 1.3 + PI * 1.4]) {
      const a = I.ph + off; let d = I.r * 0.6;
      while (terrainH(I.x + Math.cos(a) * d, I.z + Math.sin(a) * d) > -2.6 && d < I.r * 1.5) d += 3;
      d += 5;
      const g = makeBoat(), x = I.x + Math.cos(a) * d, z = I.z + Math.sin(a) * d; g.rotation.order = 'YXZ';
      g.position.set(x, 0.15, z); scene.add(g);
      const bc = glowSprite(0x40c0ff, 2.2, 0.9); bc.position.set(0, 3.2, 4.4); g.add(bc);
      boats.push({ g, pos: g.position, yaw: Math.atan2(-Math.cos(a), -Math.sin(a)), speed: 0, gunT: 0, ph: rand(6) });
    }
  });
  buildProps(scene, (x, z) => {
    for (const p of pads) if (Math.hypot(x - p.x, z - p.z) < 62) return true;
    for (const h of houses) if (Math.hypot(x - h.x, z - h.z) < 19) return true;
    return false;
  });

  // ---------- FX pools ----------
  const tmpC = new THREE.Color();
  class LinePool {
    constructor(n) {
      this.n = n; this.pos = new Float32Array(n * 6); this.col = new Float32Array(n * 6);
      this.life = new Float32Array(n); this.max = new Float32Array(n); this.base = new Float32Array(n * 3); this.i = 0;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
      this.mesh = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false }));
      this.mesh.frustumCulled = false; scene.add(this.mesh);
    }
    add(a, b, color, life) {
      const i = this.i; this.i = (i + 1) % this.n;
      this.pos.set([a.x, a.y, a.z, b.x, b.y, b.z], i * 6);
      tmpC.setHex(color); this.base.set([tmpC.r, tmpC.g, tmpC.b], i * 3);
      this.life[i] = this.max[i] = life;
    }
    update(dt) {
      for (let i = 0; i < this.n; i++) {
        if (this.life[i] <= 0) continue;
        this.life[i] -= dt; const k = Math.max(0, this.life[i] / this.max[i]);
        for (let v = 0; v < 2; v++) for (let c = 0; c < 3; c++) this.col[i * 6 + v * 3 + c] = this.base[i * 3 + c] * k;
      }
      this.mesh.geometry.attributes.position.needsUpdate = true; this.mesh.geometry.attributes.color.needsUpdate = true;
    }
  }
  const tracers = new LinePool(160), bolts = new LinePool(900);

  const PN = 3000, pPos = new Float32Array(PN * 3), pCol = new Float32Array(PN * 3), pVel = new Float32Array(PN * 3), pBase = new Float32Array(PN * 3);
  const pLife = new Float32Array(PN), pMax = new Float32Array(PN), pGrav = new Float32Array(PN); let pI = 0;
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3)); pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
  const pMesh = new THREE.Points(pGeo, new THREE.PointsMaterial({ size: 1.5, map: TEX.glow, vertexColors: true, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, sizeAttenuation: true }));
  pMesh.frustumCulled = false; scene.add(pMesh);
  function emit(p, count, speed, color, life, grav, up) {
    tmpC.setHex(color);
    for (let k = 0; k < count; k++) {
      const i = pI; pI = (pI + 1) % PN;
      pPos[i * 3] = p.x; pPos[i * 3 + 1] = p.y; pPos[i * 3 + 2] = p.z;
      const a = rand(PI * 2), b = Math.acos(rand(-1, 1)), s = speed * rand(0.3, 1);
      pVel[i * 3] = Math.sin(b) * Math.cos(a) * s; pVel[i * 3 + 1] = Math.cos(b) * s + (up || 0); pVel[i * 3 + 2] = Math.sin(b) * Math.sin(a) * s;
      pBase[i * 3] = tmpC.r; pBase[i * 3 + 1] = tmpC.g; pBase[i * 3 + 2] = tmpC.b;
      pLife[i] = pMax[i] = life * rand(0.5, 1); pGrav[i] = grav || 0;
    }
  }
  function updateParticles(dt) {
    for (let i = 0; i < PN; i++) {
      if (pLife[i] <= 0) continue;
      pLife[i] -= dt;
      const k = Math.max(0, pLife[i] / pMax[i]), j = i * 3;
      pVel[j + 1] -= pGrav[i] * dt;
      pPos[j] += pVel[j] * dt; pPos[j + 1] += pVel[j + 1] * dt; pPos[j + 2] += pVel[j + 2] * dt;
      pCol[j] = pBase[j] * k; pCol[j + 1] = pBase[j + 1] * k; pCol[j + 2] = pBase[j + 2] * k;
    }
    pGeo.attributes.position.needsUpdate = true; pGeo.attributes.color.needsUpdate = true;
  }

  const flashes = [], flashPool = [];
  const sphG = new THREE.SphereGeometry(1, 16, 12), ringG = new THREE.RingGeometry(0.82, 1, 40), beamG = new THREE.CylinderGeometry(1, 1, 1, 12, 1, true);
  function addFlash(kind, pos, color, r0, r1, life) {
    let f = flashPool.pop();
    if (!f) { f = { mesh: new THREE.Mesh(sphG, new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false })) }; }
    f.mesh.geometry = kind === 'ring' ? ringG : kind === 'beam' ? beamG : sphG;
    f.mesh.material.color.setHex(color); f.mesh.position.copy(pos); f.mesh.rotation.set(kind === 'ring' ? -PI / 2 : 0, 0, 0);
    f.kind = kind; f.r0 = r0; f.r1 = r1; f.life = f.max = life; f.len = 1;
    scene.add(f.mesh); flashes.push(f); return f;
  }
  function addBeam(a, b, color, radius, life) {
    const mid = a.clone().add(b).multiplyScalar(0.5), f = addFlash('beam', mid, color, radius, radius * 0.2, life);
    f.len = a.distanceTo(b);
    f.mesh.quaternion.setFromUnitVectors(new V3(0, 1, 0), b.clone().sub(a).normalize());
  }
  function updateFlashes(dt) {
    for (let i = flashes.length - 1; i >= 0; i--) {
      const f = flashes[i]; f.life -= dt;
      const k = 1 - Math.max(0, f.life / f.max), r = lerp(f.r0, f.r1, k);
      if (f.kind === 'beam') f.mesh.scale.set(r, f.len, r); else f.mesh.scale.setScalar(r);
      f.mesh.material.opacity = (1 - k) * (f.kind === 'ring' ? 0.8 : 0.9);
      if (f.life <= 0) { scene.remove(f.mesh); flashes.splice(i, 1); flashPool.push(f); }
    }
  }
  function lightning(a, b, color, life, jitter, strands) {
    for (let s = 0; s < (strands || 2); s++) {
      const n = 9; let prev = a.clone();
      for (let i = 1; i <= n; i++) {
        const p = a.clone().lerp(b, i / n);
        if (i < n) { p.x += rand(-jitter, jitter); p.y += rand(-jitter, jitter) * 0.5; p.z += rand(-jitter, jitter); }
        bolts.add(prev, p, color, life);
        if (s === 0 && i > 2 && Math.random() < 0.25) bolts.add(p, p.clone().add(new V3(rand(-jitter, jitter) * 3, -rand(jitter * 2), rand(-jitter, jitter) * 3)), color, life * 0.7);
        prev = p;
      }
    }
  }
  const volAt = (p) => { const v = clamp(1 - camera.position.distanceTo(p) / 500, 0, 1); return v * v; };
  function boom(pos, rad, color) {
    const v = volAt(pos);
    AudioSys.play('explosion', v * clamp(rad / 14, 0.5, 1.3));
    addFlash('sph', pos, color || 0xffa040, rad * 0.25, rad * 1.1, 0.35);
    addFlash('ring', new V3(pos.x, Math.max(pos.y, Math.max(terrainH(pos.x, pos.z), 0) + 0.4), pos.z), color || 0xffc080, rad * 0.3, rad * 2, 0.5);
    emit(pos, Math.min(90, 20 + rad * 3), rad * 1.6, color || 0xffa030, 1.0, 9, rad * 0.5);
    emit(pos, 22, rad * 0.8, 0xffe9b0, 0.5, 0, 0);
    boomL.position.copy(pos); boomL.position.y += 3; boomL.color.setHex(color || 0xff8030); boomL.intensity = 2500;
    shake = Math.max(shake, v * 0.9);
  }
  function explode(pos, rad, dmg, color) {
    boom(pos, rad, color);
    for (const e of enemies) {
      if (!e.alive) continue;
      const d = Math.hypot(e.pos.x - pos.x, e.pos.y + e.h * 0.5 - pos.y, e.pos.z - pos.z);
      if (d < rad + e.hr) damageEnemy(e, dmg * (1 - 0.6 * d / (rad + e.hr)));
    }
    for (const h of houses) if (h.alive && Math.hypot(h.x - pos.x, h.z - pos.z) < rad + 8 && pos.y < h.y + 24) damageHouse(h, dmg);
  }
  function skyBolt(target, dmg, rad) {
    const top = new V3(target.x + rand(-30, 30), target.y + 190, target.z + rand(-30, 30));
    lightning(top, target, 0xbfe0ff, 0.45, 7, 3);
    skyFlash = Math.max(skyFlash, 2.2 * volAt(target) + 0.4);
    AudioSys.play('thunder', 0.3 + volAt(target) * 0.7);
    addFlash('sph', target, 0x9fd0ff, 1, rad, 0.3);
    emit(target, 40, 16, 0x9fd0ff, 0.7, 12, 6);
    if (dmg) {
      for (const e of enemies) if (e.alive && Math.hypot(e.pos.x - target.x, e.pos.z - target.z) < rad + e.hr) damageEnemy(e, dmg);
      for (const h of houses) if (h.alive && Math.hypot(h.x - target.x, h.z - target.z) < rad + 8) damageHouse(h, dmg * 0.6);
    }
  }
  function say(text, pitch, rate) {
    try {
      const u = new SpeechSynthesisUtterance(text); u.pitch = pitch || 0.6; u.rate = rate || 0.95; u.volume = 1;
      window.speechSynthesis.cancel(); window.speechSynthesis.speak(u);
    } catch (e) { /* speech unavailable */ }
  }

  // ---------- UI helpers ----------
  let msgT = 0, bigT = 0;
  function msg(t, dur) { const m = $('msg'); m.textContent = t; m.style.opacity = 1; msgT = dur || 3; }
  function big(t, dur, color) { const b = $('big'); b.textContent = t; b.style.opacity = 1; b.style.color = color || '#cfeaff'; bigT = dur || 1; }

  // ---------- player ----------
  const WEAPONS = [
    // mag = rounds per magazine (reserve is infinite), kick = camera climb per shot (rad), ads = zoomed FOV
    { id: 'handgun', key: '1', name: 'Handgun', dmg: 34, rate: 0.13, spread: 0.011, adsSpread: 0.0012, snd: 'pistol', recoil: 0.035, kick: 0.012, bloom: 0.003, mag: 15, reload: 1.4, semi: true, ads: 62 },
    { id: 'revolver', key: '2', name: 'Revolver', dmg: 140, rate: 0.42, spread: 0.009, adsSpread: 0.0005, snd: 'revolver', recoil: 0.09, kick: 0.04, bloom: 0.006, mag: 6, reload: 2.3, semi: true, ads: 60 },
    { id: 'ak', key: '3', name: 'AK-47', dmg: 42, rate: 0.1, spread: 0.02, adsSpread: 0.0016, snd: 'rifle', recoil: 0.03, kick: 0.0085, bloom: 0.0022, mag: 30, reload: 2.4, ads: 52 },
    { id: 'm416', key: '4', name: 'M416', dmg: 33, rate: 0.075, spread: 0.016, adsSpread: 0.0009, snd: 'rifle2', recoil: 0.02, kick: 0.0055, bloom: 0.0015, mag: 30, reload: 2.1, ads: 48 },
    { id: 'm249', key: '5', name: 'M249 Machine Gun', dmg: 38, rate: 0.055, spread: 0.028, adsSpread: 0.0024, snd: 'mg', recoil: 0.026, kick: 0.0065, bloom: 0.002, mag: 100, reload: 4.0, ads: 54 },
    { id: 'rocket', key: '6', name: 'Rocket Launcher', rate: 0.3, snd: 'rocket', recoil: 0.13, kick: 0.05, mag: 1, reload: 2.0, semi: true, ads: 56, spread: 0.004 },
    { id: 'sword', key: '7', name: 'Stormfang Blade', rate: 0.36 },
    { id: 'repulsor', key: '8', name: 'Palm Repulsors', armor: true, dmg: 110, rate: 0.14, recoil: 0.03 },
    { id: 'swarm', key: '9', name: 'Micro-Missile Swarm', armor: true, rate: 1.0, recoil: 0.05 },
    { id: 'lance', key: '0', name: 'Chest Lance', armor: true, dmg: 130, rate: 0.05, recoil: 0.01 }
  ];
  const FORMS = [
    { name: 'Human', mult: 1, spd: 1, color: 0 },
    { name: 'ASCENDED', mult: 2, spd: 1.3, color: 0xffd23a },
    { name: 'ASCENDED II', mult: 3.2, spd: 1.5, color: 0xffdc50, sparks: 0x9fd8ff },
    { name: 'ASCENDED III', mult: 4.8, spd: 1.7, color: 0xffc81e, sparks: 0x9fd8ff, long: true },
    { name: 'CRIMSON DEITY', mult: 7.5, spd: 2.0, color: 0xff2a3a },
    { name: 'AZURE DEITY', mult: 11, spd: 2.3, color: 0x2aa8ff, sparks: 0xd8f4ff }
  ];
  const P = {
    pos: new V3(pads[0].x + 14, 0, pads[0].z + 16), vel: new V3(), yaw: 0, pitch: 0, onGround: false,
    form: 0, armor: false, thunder: 0, mode: 'foot', veh: null, third: false, weapon: 0, fireT: 0, kiT: 0, waveT: 0, skyT: 0,
    charge: null, summon: null, chant: null, swing: 0, kick: 0, walk: 0, hits: 0, kills: 0, invert: 1,
    model: makePlayerModel()
  };
  P.pos.y = terrainH(P.pos.x, P.pos.z);
  Object.assign(P, { ammo: WEAPONS.map((w) => w.mag || 0), reload: null, ads: 0, equip: 1, bloom: 0, rec: 0, swayX: 0, swayY: 0, trig: false, flashT: 0, hitT: 0, hitHead: false, sprint: false, sprintK: 0 });
  P.yaw = Math.atan2(P.pos.x - pads[0].x, P.pos.z - pads[0].z) + PI; // face the jet
  scene.add(P.model);
  const MU = P.model.userData;
  const vmHolder = new THREE.Group(); camera.add(vmHolder);
  const wModels = WEAPONS.map((w) => makeGun(w.id));
  // first-person rig per weapon: the gun plus the arms holding it
  const rigs = wModels.map((gun) => {
    const U = gun.userData, g = new THREE.Group(), R = { g, armL: null, armR: null };
    if (U.rh) { R.armR = makeArm(false); R.armR.position.copy(U.rh); g.add(R.armR); }
    if (U.lh) { R.armL = makeArm(true); R.armL.position.copy(U.lh); g.add(R.armL); }
    return R;
  });
  const vmLight = new THREE.PointLight(0xd8deff, 0.55, 2.5, 2); vmLight.position.set(-0.18, 0.22, -0.15); camera.add(vmLight);
  const mflash = glowSprite(0xffc860, 0.3, 1); mflash.visible = false;
  const _lh = new V3(), _mp = new V3(), _pouch = new V3(), _hold = new V3();
  // short sharp impulse that starts at c and dies out over w (peak ≈ 1 early on, then decays) — used for jolts
  const pulse = (u, c, w) => { const p = (u - c) / w; return p > 0 && p < 1 ? Math.sin(p * PI) * (1 - p) * 1.85 : 0; };
  /* Reload choreography at progress u (0..1); u = 0 is the rest pose.
     mag  : tilt, hand grabs + yanks the mag, old mag drops away, hand fetches a fresh one from the vest, inserts, palms it home, racks the bolt.
     drum : swing the cylinder out, flick the gun up to dump the empties, speed-loader in, snap it shut.
     tube : hand fetches a new rocket and slides it into the empty tube. */
  function poseReload(i, u, loaded) {
    const U = wModels[i].userData, R = rigs[i], kind = U.reloadKind, dir = U.tiltDir;
    if (U.mag) U.mag.visible = kind === 'tube' ? (u > 0 ? u >= 0.41 : loaded !== false) : !(u >= 0.36 && u < 0.41 && kind === 'mag');
    if (!R.armL) return;
    const tilt = smooth(0, 0.13, u) - smooth(0.86, 1, u);
    const away = smooth(0.24, 0.36, u) - smooth(0.44, 0.56, u);                   // left hand off at the vest
    const tug = pulse(u, 0.185, 0.09), seat = pulse(u, 0.632, 0.11), rack = U.bolt ? pulse(u, 0.872, 0.09) : 0;
    const flick = kind === 'drum' ? smooth(0.25, 0.31, u) - smooth(0.36, 0.45, u) : 0;
    const shut = kind === 'drum' ? pulse(u, 0.64, 0.1) : 0;
    R.g.rotation.set(
      0.3 * tilt - 0.09 * tug + 0.17 * seat + 0.11 * rack + 0.7 * flick + 0.06 * away,
      (0.12 * tilt + 0.05 * away) * dir - 0.08 * shut * dir,
      (-0.5 * tilt + 0.06 * seat + 0.25 * flick) * dir + 0.12 * shut * dir);
    R.g.position.set(-0.03 * tilt + 0.01 * away, 0.04 * tilt - 0.012 * tug + 0.02 * seat + 0.03 * flick, 0.02 * rack + 0.01 * seat);
    // mag offset d: 0 = seated, 1 = at magOut (the "just pulled" spot)
    const d = smooth(0.15, 0.24, u) - smooth(0.56, 0.635, u);
    _mp.copy(U.magPt).addScaledVector(U.magOut, d);
    _pouch.copy(U.magPt).add(U.magOut).add(_hold.set(-0.12, -0.24, 0.16));
    // left hand path
    _lh.copy(U.lh);
    if (u < 0.7) {
      _lh.lerp(_mp, smooth(0.04, 0.15, u));
      if (u > 0.22) {
        _lh.lerp(_pouch, away);
        if (away > 0.98) _lh.y += Math.sin(u * 90) * 0.006;                       // fumbling in the pouch
      }
      _lh.y += 0.014 * seat;                                                     // palm-slap
    } else if (U.bolt) {
      const pull = smooth(0.8, 0.86, u) - smooth(0.865, 0.885, u);              // slow pull, snappy release
      _lh.copy(U.magPt).lerp(U.bolt, smooth(0.69, 0.79, u)); _lh.z += 0.065 * pull;
      if (U.slide) U.slide.position.z = U.slideHome + 0.05 * pull;
      _lh.lerp(U.lh, smooth(0.9, 1, u));
    } else _lh.copy(U.magPt).lerp(U.lh, smooth(0.7, 0.93, u));
    R.armL.position.copy(_lh);
    R.armL.rotation.set(-0.5 * away, 0.3 * away, 0.4 * away);
    // the magazine itself
    if (!U.mag) return;
    U.mag.rotation.set(0, 0, 0);
    if (kind === 'drum' || u === 0) { U.mag.position.copy(U.magOut).multiplyScalar(d); return; }
    if (u < 0.24 || u >= 0.56) U.mag.position.copy(U.magOut).multiplyScalar(d);
    else if (u < 0.41) {                                                          // old mag tumbles away (rocket tube is empty)
      const f = clamp((u - 0.24) / 0.12, 0, 1);
      U.mag.position.copy(U.magOut).add(_hold.set(-0.02 * f, -0.75 * f * f, 0.08 * f));
      U.mag.rotation.set(0.9 * f, 0, -0.6 * f * dir);
    } else {                                                                      // fresh mag rides in the hand
      U.mag.position.copy(_lh).sub(U.magPt);
      U.mag.rotation.set(0.35 * away, 0, 0.25 * away);
    }
  }
  function startReload() {
    const w = WEAPONS[P.weapon];
    if (!w.mag || P.reload || P.ammo[P.weapon] >= w.mag || P.mode !== 'foot') return;
    P.reload = { t: 0, dur: w.reload, s: 0 };
  }
  function curSpread(w) {
    const mv = Math.hypot(P.vel.x, P.vel.z) / 9;
    const hip = (w.spread || 0.01) * (1 + mv * 0.8 + (P.onGround ? 0 : 1.5)) + P.bloom;
    return lerp(hip, (w.adsSpread || 0.001) + P.bloom * 0.25, P.ads);
  }
  function updateViewmodel(dt) {
    const w = WEAPONS[P.weapon], U = wModels[P.weapon].userData, fp = P.mode === 'foot' && !P.third;
    vmHolder.visible = fp; vmLight.intensity = fp ? 0.55 : 0;
    P.kick = Math.max(0, P.kick - dt * 0.9); P.swing = Math.max(0, P.swing - dt * 3.6);
    P.bloom = Math.max(0, P.bloom - dt * 0.05); P.equip = Math.min(1, P.equip + dt * 3.6);
    const rr = Math.min(P.rec, dt * 0.3); P.pitch -= rr; P.rec -= rr;       // recoil recovery
    P.flashT -= dt; mflash.visible = P.flashT > 0;
    const adsOn = P.mode === 'foot' && rmb && !!w.mag && !P.reload && P.equip > 0.8 && !P.chant && !P.summon;
    P.ads = clamp(P.ads + (adsOn ? 1 : -1) * dt * 7, 0, 1);
    P.sprintK = clamp(P.sprintK + (P.sprint && P.onGround && P.mode === 'foot' ? 1 : -1) * dt * 6, 0, 1);
    P.swayX *= Math.max(0, 1 - dt * 9); P.swayY *= Math.max(0, 1 - dt * 9);
    let u = 0;
    if (P.reload) {
      const R = P.reload; R.t += dt; u = R.t / R.dur;
      if (R.s === 0 && u > 0.2) { R.s = 1; AudioSys.play('magout', 0.8); }
      if (R.s === 1 && u > 0.64) { R.s = 2; AudioSys.play('magin', 0.8); P.ammo[P.weapon] = w.mag; }
      if (R.s === 2 && u > 0.865) { R.s = 3; if (U.bolt) AudioSys.play('bolt', 0.8); }
      if (u >= 1) { P.reload = null; u = 0; }
    }
    poseReload(P.weapon, u, P.ammo[P.weapon] > 0);
    // slide / charging handle: snaps fully back on each shot, springs home; pistol locks back on empty
    if (U.slide && !P.reload) U.slide.position.z = U.slideHome + (w.id === 'handgun' && P.ammo[P.weapon] <= 0 ? 0.045 : Math.min(0.045, P.kick * 1.4));
    stepVM(dt);
    if (!fp) return;
    const a = smooth(0, 1, P.ads), k = 1 - a * 0.9, s = smooth(0, 1, P.sprintK) * (w.mag ? 1 : 0.4);
    const e = P.equip - 1, drop = -(2.2 * e * e * e + 1.2 * e * e);              // ease-out-back: rises in with a little overshoot
    const mv = P.onGround ? Math.min(1.5, Math.hypot(P.vel.x, P.vel.z) / 9) : 0, run = 1 + s * 1.2;
    const wk = P.walk;
    // figure-8 bob: side-to-side once per stride, dip on every footfall; plus idle breathing
    const bx = Math.sin(wk) * 0.011 * mv * run + Math.sin(time * 0.85) * 0.0016 * (1 - a * 0.7);
    const by = (Math.cos(wk * 2) - 1) * 0.0055 * mv * run + Math.sin(time * 1.7) * 0.0026 * (1 - a * 0.6);
    const brx = (Math.cos(wk * 2) - 1) * 0.012 * mv * run + Math.sin(time * 1.7) * 0.007 * (1 - a * 0.7);
    const brz = Math.sin(wk) * 0.03 * mv * run, bry = Math.sin(wk) * 0.05 * s * mv;
    const lat = P.vel.x * right.x + P.vel.z * right.z, fv = P.vel.x * fwd.x + P.vel.z * fwd.z;
    const arc = Math.sin(a * PI);                                                // gun swings up into the shoulder on the way to ADS
    const air = VM.ly;
    if (w.id === 'sword') {
      const kk = Math.sin(P.swing * PI);
      vmHolder.position.set(U.hip.x - kk * 0.25 + bx + VM.sx * -0.4, U.hip.y + by + air - drop * 0.3, U.hip.z);
      vmHolder.rotation.set(-kk * 1.3 - drop * 0.6 + brx + VM.sy, kk * 0.9 + VM.sx * 1.3, kk * 0.7 + brz);
      if (P.chant) { vmHolder.position.set(0.05, -0.12, -0.5); vmHolder.rotation.set(0.45, 0, 0.25); }
    } else {
      vmHolder.position.set(
        lerp(U.hip.x, 0, a) + (bx - VM.sx * 0.45 - lat * 0.0009) * k - 0.07 * s + drop * 0.06 + VM.p.x * (1 - a * 0.7),
        lerp(U.hip.y, -U.sightY, a) + (by + VM.sy * 0.32 + air) * k - drop * 0.3 - 0.05 * s - arc * 0.014 + VM.p.y * (1 - a * 0.5),
        lerp(U.hip.z, U.adsZ, a) + fv * 0.0012 * k + VM.p.z * (1 - a * 0.35));
      vmHolder.rotation.set(
        -drop * 0.9 + (VM.sy + brx + air * 2.5) * k - 0.3 * s + VM.r.x * (1 - a * 0.55),
        (1 - a) * 0.035 + VM.sx * 1.3 * k + 0.75 * s + bry + VM.r.y * (1 - a * 0.6),
        (-VM.sx * 0.9 - lat * 0.005 + brz) * k + 0.25 * s + drop * 0.5 + arc * 0.06 + VM.r.z * (1 - a * 0.5));
    }
    if (P.flashT > 0) vmHolder.position.x += rand(-1, 1) * 0.0015 * (1 - a * 0.7);   // shot vibration
  }
  /* Viewmodel springs: recoil (position + rotation), mouse-look sway lag, jump/land bounce. Underdamped so things settle with a little overshoot. */
  const VM = { p: new V3(), pv: new V3(), r: new V3(), rv: new V3(), sx: 0, sy: 0, svx: 0, svy: 0, ly: 0, lv: 0, prevG: true, prevVy: 0 };
  function vmRecoil(w) {
    const r = Math.min(0.1, w.recoil || 0.02), ak = P.ads > 0.5 ? 0.6 : 1, heavy = w.id === 'revolver' || w.id === 'rocket' ? 1.5 : 1;
    VM.pv.z += r * 10 * ak; VM.pv.y += r * 2.2 * ak; VM.pv.x += rand(-1, 1) * r * 1.5 * ak;
    VM.rv.x += r * 40 * ak * heavy; VM.rv.y += rand(-1, 1) * r * 12 * ak; VM.rv.z += rand(-0.4, 1) * r * 18 * ak;
  }
  function spring1(x, v, target, kS, dmp, h) { v += (-(x - target) * kS - v * dmp) * h; return [x + v * h, v]; }
  function stepVM(dt) {
    if (P.mode === 'foot' && P.onGround && !VM.prevG && VM.prevVy < -5) VM.lv -= Math.min(0.55, -VM.prevVy * 0.018);   // landing thump
    VM.prevG = P.onGround; VM.prevVy = P.vel.y;
    const ly0 = P.onGround ? 0 : clamp(-P.vel.y * 0.0014, -0.025, 0.025);     // gun lags behind vertical motion in the air
    const n = dt > 1 / 50 ? 3 : 2, h = Math.min(dt, 0.1) / n;
    for (let i = 0; i < n; i++) {
      for (const ax of ['x', 'y', 'z']) {
        [VM.p[ax], VM.pv[ax]] = spring1(VM.p[ax], VM.pv[ax], 0, 260, 17, h);
        [VM.r[ax], VM.rv[ax]] = spring1(VM.r[ax], VM.rv[ax], 0, 170, 13, h);
      }
      [VM.sx, VM.svx] = spring1(VM.sx, VM.svx, P.swayX, 150, 15, h);
      [VM.sy, VM.svy] = spring1(VM.sy, VM.svy, P.swayY, 150, 15, h);
      [VM.ly, VM.lv] = spring1(VM.ly, VM.lv, ly0, 120, 11, h);
    }
    VM.r.x = Math.min(VM.r.x, 0.5);
  }
  function placeWeapon() {
    wModels.forEach((m, i) => { if (m.parent) m.parent.remove(m); if (rigs[i].g.parent) rigs[i].g.parent.remove(rigs[i].g); });
    if (P.mode !== 'foot') return;
    const m = wModels[P.weapon];
    if (P.third) MU.hand.add(m); else { rigs[P.weapon].g.add(m); vmHolder.add(rigs[P.weapon].g); }
    $('wname').textContent = WEAPONS[P.weapon].name;
    $('wlist').innerHTML = WEAPONS.map((w, i) => (!w.armor || P.armor) ? `<span class="${i === P.weapon ? 'on' : ''}">${w.key} ${w.name}</span>` : '').join(' ');
  }
  function selectWeapon(i) {
    if (i < 0 || i >= WEAPONS.length || (WEAPONS[i].armor && !P.armor) || P.mode !== 'foot') return;
    if (i !== P.weapon) { poseReload(P.weapon, 0); P.reload = null; P.equip = 0; P.ads = 0; }
    P.weapon = i; P.fireT = Math.max(P.fireT, 0.15); placeWeapon();
  }
  const dmgMul = () => FORMS[P.form].mult * (P.armor ? 1.5 : 1);

  function setForm(n) {
    const up = n > P.form; P.form = n; const F = FORMS[n];
    MU.hairM.color.setHex(n ? F.color : 0x2a1a10); MU.hairM.emissive.setHex(n ? F.color : 0); MU.hairM.emissiveIntensity = n ? 1.2 : 0;
    MU.spikes.forEach((s) => s.scale.setScalar(n ? 1.5 + (n === 2 ? 0.3 : 0) : 1));
    MU.longHair.visible = !!F.long; MU.aura.visible = n > 0;
    if (n) { MU.auraM.color.setHex(F.color); MU.aGlow.material.color.setHex(F.color); auraL.color.setHex(F.color); }
    auraL.intensity = n ? 40 + n * 10 : 0;
    const c = new THREE.Color(F.color);
    $('vig').style.boxShadow = n ? `inset 0 0 170px 34px rgba(${c.r * 255 | 0},${c.g * 255 | 0},${c.b * 255 | 0},.3)` : 'inset 0 0 180px 40px rgba(0,0,0,.75)';
    if (up) {
      const p = P.pos.clone(); p.y += 1;
      addFlash('ring', p, F.color, 1, 60, 0.8); addFlash('sph', p, F.color, 1, 22, 0.5);
      emit(p, 120, 30, F.color, 1.2, 0, 6); shake = 1.2; skyFlash = 1.5;
      big(F.name + '!', 1.8, '#' + c.getHexString());
      if (n === 1) msg('Flight unlocked — hold Space to rise, Q or Z to descend (Shift = faster)', 4);
      for (const e of enemies) if (e.alive && e.pos.distanceTo(P.pos) < 34) damageEnemy(e, 180 * F.mult);
      if (n === 5) skyBolt(P.pos.clone(), 0, 10);
    } else msg('Powered down');
  }
  function armorSet(on) {
    P.armor = on; MU.armor.forEach((m) => { m.visible = on; });
    $('armorhud').style.display = on ? 'block' : 'none';
    if (on) {
      const p = P.pos.clone(); p.y += 1.2; addFlash('sph', p, 0x4fe8ff, 0.5, 9, 0.5); emit(p, 60, 14, 0x4fe8ff, 0.8, 0, 2);
      big('ARMOR ONLINE', 1.5, '#7feaff'); selectWeapon(7);
    } else { msg('Armor dismissed'); if (WEAPONS[P.weapon].armor) P.weapon = 0; placeWeapon(); }
  }
  const pieces = [];
  const pieceM = std(0x505b66, { metalness: 0.9, roughness: 0.25, emissive: 0x4fe8ff, emissiveIntensity: 0.6 });
  function summonArmor() {
    if (P.summon || P.mode !== 'foot') return;
    if (P.armor) { armorSet(false); return; }
    P.summon = { t: 0 }; AudioSys.play('beep'); msg('⌚ WRIST-COMM: "ARMOR UP!"', 2.2); say('Armor up!', 0.8, 1);
    delayed.push({ t: 0.5, fn: () => AudioSys.play('armor') });
    for (let i = 0; i < 9; i++) {
      const m = box(0.4, 0.5, 0.3, pieceM); const a = rand(PI * 2);
      m.userData.from = new V3(P.pos.x + Math.cos(a) * rand(30, 70), P.pos.y + rand(70, 130), P.pos.z + Math.sin(a) * rand(30, 70));
      m.userData.off = new V3(rand(-0.3, 0.3), 0.4 + i * 0.17, rand(-0.2, 0.2)); m.userData.d = 0.5 + i * 0.09;
      m.position.copy(m.userData.from); scene.add(m); pieces.push(m);
    }
  }
  function updateSummon(dt) {
    if (!P.summon) return;
    const S = P.summon; S.t += dt;
    for (const m of pieces) {
      const k = clamp((S.t - m.userData.d) / 0.75, 0, 1), to = P.pos.clone().add(m.userData.off);
      m.position.lerpVectors(m.userData.from, to, k * k); m.rotation.x += dt * 9; m.rotation.y += dt * 7;
      if (k > 0 && k < 1 && Math.random() < 0.5) emit(m.position, 1, 1, 0x4fe8ff, 0.4, 0, 0);
      if (k >= 1) m.visible = false;
    }
    if (S.t > 2.05) { pieces.forEach((m) => scene.remove(m)); pieces.length = 0; P.summon = null; armorSet(true); }
  }
  function startChant() {
    if (P.chant || P.mode !== 'foot') return;
    if (P.thunder > 0) { msg('The blade is already awake'); return; }
    selectWeapon(6); P.chant = { t: 0, s: 0 };
    say('Thunder. Thunder. Thunder. Stormfang, hooooo!', 0.5, 0.9);
  }
  function updateChant(dt) {
    const sw = wModels[6].userData, awake = P.thunder > 0;
    const target = awake ? 2.3 : 1;
    sw.blade.scale.y = lerp(sw.blade.scale.y, target, Math.min(1, dt * 5)); sw.blade.scale.x = lerp(sw.blade.scale.x, awake ? 1.3 : 1, Math.min(1, dt * 5));
    sw.bladeM.emissive.setHex(awake ? 0x4fb8ff : 0); sw.bladeM.emissiveIntensity = awake ? 1.6 + Math.sin(time * 20) * 0.5 : 0;
    sw.gemM.emissiveIntensity = awake ? 5 : 1.5;
    if (awake) {
      P.thunder -= dt;
      if (P.weapon === 6 && Math.random() < dt * 14) { const a = muzzlePos(); lightning(a, a.clone().add(new V3(rand(-1, 1), rand(0.3, 1.6), rand(-1, 1))), 0x9fd8ff, 0.12, 0.25, 1); }
      if (P.thunder <= 0) msg('The storm fades from the blade…');
    }
    if (!P.chant) return;
    const C = P.chant; C.t += dt;
    const at = [0, 0.75, 1.5];
    if (C.s < 3 && C.t >= at[C.s]) {
      big('THUNDER' + '…'.repeat(1), 0.6); C.s++;
      const p = P.pos.clone().add(new V3(rand(-60, 60), 0, rand(-60, 60))); p.y = Math.max(terrainH(p.x, p.z), 0);
      skyBolt(p, 150, 8); shake = 0.5;
    }
    if (C.s === 3 && C.t >= 2.4) {
      big('STORMFANG — HOOOOO!', 2.2); P.chant = null; P.thunder = 45; shake = 1.4;
      const near = enemies.filter((e) => e.alive && e.pos.distanceTo(P.pos) < 110).slice(0, 16);
      near.forEach((e, i) => delayed.push({ t: 0.15 + i * 0.12, fn: () => { if (e.alive) skyBolt(e.pos.clone(), 900 * dmgMul(), 7); } }));
      const p = P.pos.clone(); p.y += 1; addFlash('ring', p, 0x7fc8ff, 1, 80, 1); addFlash('sph', p, 0x7fc8ff, 1, 16, 0.5);
      skyBolt(P.pos.clone().add(new V3(0, 2.2, 0)), 0, 6);
    }
  }

  // ---------- combat ----------
  const fwd = new V3(0, 0, -1), right = new V3(1, 0, 0), upv = new V3(0, 1, 0);
  function rayHit(o, d, max, fat, step) {
    let best = max, he = null, hh = null, head = false;
    for (const e of enemies) { // each monster is a stack of spheres following its silhouette; the top one is the head
      if (!e.alive) continue;
      const ox = e.pos.x - o.x, oz = e.pos.z - o.z, r = e.br + (fat || 0);
      const tm = ox * d.x + oz * d.z + (e.pos.y + e.h * 0.5 - o.y) * d.y;
      if (tm < -5 || tm - 5 > best) continue;
      for (let k = 0; k < e.ns; k++) {
        const oy = e.pos.y + e.br + (e.h - 2 * e.br) * (k / (e.ns - 1)) - o.y, tca = ox * d.x + oy * d.y + oz * d.z;
        if (tca < 0) continue;
        const d2 = ox * ox + oy * oy + oz * oz - tca * tca;
        if (d2 > r * r) continue;
        const t = Math.max(0, tca - Math.sqrt(r * r - d2));
        if (t < best) { best = t; he = e; head = k === e.ns - 1; }
      }
    }
    for (const h of houses) {
      if (!h.alive) continue;
      const ox = h.x - o.x, oy = h.y + 6 - o.y, oz = h.z - o.z, tca = ox * d.x + oy * d.y + oz * d.z, r = 8.5 + (fat || 0);
      if (tca < 0 || tca - r > best) continue;
      const d2 = ox * ox + oy * oy + oz * oz - tca * tca;
      if (d2 > r * r) continue;
      const t = Math.max(0, tca - Math.sqrt(r * r - d2));
      if (t < best) { best = t; he = null; hh = h; }
    }
    if (!(o.y > 26 && d.y >= 0)) {
      const st = step || 3;
      let t = (o.y > 26 && d.y < 0) ? (o.y - 26) / -d.y : 1;
      for (; t < best; t += st) {
        const x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t;
        if (y < Math.max(terrainH(x, z), 0)) { best = t; he = hh = null; break; }
      }
    }
    return { t: best, e: he, h: hh, head: head && !!he };
  }
  const ECOL = { ghost: 0x9fd8ff, vampire: 0xc01020, brute: 0x70a020 };
  function damageEnemy(e, dmg) {
    if (!e.alive) return;
    e.hp -= dmg; e.aggro = true;
    const c = new V3(e.pos.x, e.pos.y + e.h * 0.6, e.pos.z);
    emit(c, 5, 5, ECOL[e.type], 0.5, 12, 2);
    if (e.hp <= 0) {
      e.alive = false; e.t = 0; P.kills++;
      emit(c, 26, 8, ECOL[e.type], 0.9, 10, 3);
      AudioSys.play(e.type === 'ghost' ? 'wail' : e.type === 'vampire' ? 'shriek' : 'growl', volAt(e.pos) * 0.8);
    }
  }
  function damageHouse(h, dmg) {
    if (!h.alive) return;
    h.hp -= dmg;
    emit(new V3(h.x + rand(-5, 5), h.y + rand(2, 10), h.z + rand(-5, 5)), 6, 8, 0xff8a30, 0.8, 8, 3);
    if (h.hp <= 0) {
      h.alive = false; h.burn = 0;
      const p = new V3(h.x, h.y + 6, h.z); boom(p, 26, 0xff7020); AudioSys.play('collapse', volAt(p));
      const U = h.g.userData; U.winM.emissiveIntensity = 0; U.halo.visible = false; U.fire.material.opacity = 0.8;
      const left = houses.filter((x) => x.alive).length, onI = houses.filter((x) => x.alive && x.isl === h.isl).length;
      if (!left) { big('ALL THREE ISLES CLEANSED!', 5, '#ffd23a'); msg('The curse is broken. Press N to raise the nightmare again.', 12); say('The curse is broken.', 0.5, 0.85); }
      else if (!onI) big(ISLANDS[h.isl].name.toUpperCase() + ' CLEANSED', 3, '#7dff8a');
      else msg(`Monster house destroyed — ${left} remain`, 3);
    }
  }
  function resetNightmare() {
    houses.forEach((h) => {
      h.alive = true; h.hp = 1500; h.g.scale.set(1, 1, 1); h.g.position.y = h.y - 0.4;
      const U = h.g.userData; U.winM.emissiveIntensity = 2.2; U.halo.visible = true; U.fire.material.opacity = 0;
    });
    big('THE NIGHTMARE RETURNS', 3, '#ff3030');
  }

  const projMats = {};
  const projMat = (c) => projMats[c] || (projMats[c] = new THREE.MeshBasicMaterial({ color: c }));
  function spawnProj(o) {
    const g = new THREE.Group();
    if (o.kind === 'ki') { ball(1, projMat(o.color), 0, 0, 0, g, 10).scale.setScalar(o.size); const s = glowSprite(o.color, o.size * 7, 0.9); g.add(s); }
    else { zcyl(0.5, 0.5, 1, projMat(0xdddddd), 0, 0, 0, g, 6).scale.set(o.size, o.size * 6, o.size); const s = glowSprite(0xffa040, o.size * 14, 0.9); s.position.z = -o.size * 3; g.add(s); }
    g.position.copy(o.pos); scene.add(g);
    projectiles.push({ g, pos: g.position, vel: o.dir.clone().multiplyScalar(o.speed), speed: o.speed, life: o.life || 6, dmg: o.dmg, rad: o.rad, target: o.target || null, turn: o.turn || 0, color: o.color || 0xffa040, kind: o.kind, arm: 0.05 });
  }
  const _tv = new V3();
  function updateProjectiles(dt) {
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const p = projectiles[i]; p.life -= dt; p.arm -= dt;
      if (p.target && p.turn) {
        const T = p.target, alive = T.pos ? T.alive : T.alive;
        if (alive) {
          if (T.pos) _tv.set(T.pos.x, T.pos.y + T.h * 0.5, T.pos.z); else _tv.set(T.x, T.y + 5, T.z);
          _tv.sub(p.pos).normalize().multiplyScalar(p.speed);
          p.vel.lerp(_tv, Math.min(1, p.turn * dt)).setLength(p.speed);
        } else p.target = null;
      }
      p.pos.addScaledVector(p.vel, dt);
      _tv.copy(p.pos).add(p.vel); p.g.lookAt(_tv);
      if (Math.random() < 0.8) emit(p.pos, 1, 1.2, p.kind === 'ki' ? p.color : 0xff9040, 0.45, 0, 0);
      let hit = p.life <= 0 || p.pos.y < Math.max(terrainH(p.pos.x, p.pos.z), 0);
      if (!hit && p.arm <= 0) {
        for (const e of enemies) if (e.alive && Math.abs(e.pos.x - p.pos.x) < 6 && Math.hypot(e.pos.x - p.pos.x, e.pos.y + e.h * 0.5 - p.pos.y, e.pos.z - p.pos.z) < e.hr + 1) { hit = true; break; }
        if (!hit) for (const h of houses) if (h.alive && Math.hypot(h.x - p.pos.x, h.z - p.pos.z) < 8 && p.pos.y < h.y + 16) { hit = true; break; }
      }
      if (hit) { explode(p.pos, p.rad, p.dmg, p.kind === 'ki' ? p.color : 0xffa040); scene.remove(p.g); projectiles.splice(i, 1); }
    }
  }
  function muzzlePos() {
    if (P.third) return P.pos.clone().add(new V3(0, 1.5, 0)).addScaledVector(fwd, 0.9).addScaledVector(right, 0.35);
    return wModels[P.weapon].userData.muzzle.getWorldPosition(new V3());
  }
  function aimDir(spread) {
    const d = fwd.clone();
    if (spread) d.addScaledVector(right, rand(-spread, spread)).addScaledVector(upv, rand(-spread, spread)).normalize();
    return d;
  }
  function frontTargets(maxDist, cosMin, count) {
    const list = [];
    for (const e of enemies) {
      if (!e.alive) continue;
      _tv.set(e.pos.x, e.pos.y + e.h * 0.5, e.pos.z).sub(camera.position); const d = _tv.length();
      if (d > maxDist) continue;
      const c = _tv.dot(fwd) / d; if (c > cosMin) list.push({ t: e, s: c - d / maxDist * 0.3 });
    }
    for (const h of houses) {
      if (!h.alive) continue;
      _tv.set(h.x, h.y + 5, h.z).sub(camera.position); const d = _tv.length();
      if (d > maxDist) continue;
      const c = _tv.dot(fwd) / d; if (c > cosMin) list.push({ t: h, s: c - d / maxDist * 0.3 });
    }
    list.sort((a, b) => b.s - a.s);
    return list.slice(0, count).map((x) => x.t);
  }
  function hitscan(dmg, spread, color, range, fat) {
    const d = aimDir(spread), r = rayHit(camera.position, d, range || 600, fat || 0);
    const end = camera.position.clone().addScaledVector(d, r.t);
    if (r.e) {
      damageEnemy(r.e, dmg * (r.head ? 2 : 1));
      P.hitT = r.e.alive ? 0.14 : 0.3; P.hitHead = r.head || !r.e.alive; AudioSys.play(r.head ? 'head' : 'hit', 0.9);
    } else if (r.h) { damageHouse(r.h, dmg); P.hitT = 0.1; P.hitHead = false; }
    if (r.t < (range || 600)) emit(end, 4, 4, r.e ? ECOL[r.e.type] : 0xffd9a0, 0.3, 6, 1);
    return end;
  }
  function fireFoot(dt) {
    P.fireT -= dt; P.kiT -= dt; P.waveT -= dt; P.skyT -= dt;
    if (P.chant || P.summon || P.charge) return;
    const w = WEAPONS[P.weapon], mul = dmgMul();
    if (keys.KeyF && P.kiT <= 0) {
      if (!P.form) { if (P.kiT < -1) { msg('Ascend first — press G'); P.kiT = 0; } }
      else {
        P.kiT = 0.22; const F = FORMS[P.form];
        spawnProj({ kind: 'ki', pos: muzzlePos(), dir: aimDir(0.01), speed: 150, dmg: 160 * F.mult, rad: 7 + P.form * 1.5, color: F.color, size: 0.35 + P.form * 0.07 });
        AudioSys.play('ki', 0.8);
      }
    }
    if (keys.KeyX && P.waveT <= 0) {
      if (!P.form) { msg('Ascend first — press G'); P.waveT = 1; }
      else {
        P.waveT = 2.2; const F = FORMS[P.form], d = aimDir(0), a = muzzlePos();
        const r = rayHit(camera.position, d, 700, 0), end = camera.position.clone().addScaledVector(d, r.t);
        const rad = 2.5 + P.form * 0.8;
        addBeam(a, end, F.color, rad, 0.7); addBeam(a, end, 0xffffff, rad * 0.45, 0.5);
        AudioSys.play('beam'); shake = 1; big('MEGA WAVE!', 0.9, '#' + new THREE.Color(F.color).getHexString());
        for (const e of enemies) { // everything along the beam
          if (!e.alive) continue;
          _tv.set(e.pos.x, e.pos.y + e.h * 0.5, e.pos.z).sub(camera.position); const t = _tv.dot(d);
          if (t > 0 && t < r.t + 4 && _tv.lengthSq() - t * t < (rad + e.hr + 2) * (rad + e.hr + 2)) damageEnemy(e, 900 * F.mult);
        }
        explode(end, 16 + P.form * 3, 900 * F.mult, F.color);
      }
    }
    if (rmb && w.id === 'sword' && P.thunder > 0 && P.skyT <= 0) {
      P.skyT = 0.45; const d = aimDir(0), r = rayHit(camera.position, d, 500, 1);
      skyBolt(camera.position.clone().addScaledVector(d, r.t), 700 * mul, 10);
    }
    if (keys.KeyR) startReload();
    if (P.reload || P.equip < 0.95) return;
    if (!mouseDown || P.fireT > 0 || P.sprintK > 0.4) return;
    if (w.semi && !P.trig) return;
    P.trig = false;
    if (w.mag) {
      if (P.ammo[P.weapon] <= 0) { AudioSys.play('empty', 0.7); startReload(); return; }
      P.ammo[P.weapon]--;
      const kk = w.kick * (P.ads > 0.5 ? 0.65 : 1);                          // muzzle climb, partly recovered afterwards
      P.pitch = Math.min(1.5, P.pitch + kk); P.rec += kk * 0.7; P.yaw += rand(-1, 1) * kk * 0.45;
      P.bloom = Math.min(0.03, P.bloom + (w.bloom || 0));
      if (P.ammo[P.weapon] <= 0) delayed.push({ t: 0.25, fn: startReload });
    }
    P.fireT = w.rate; P.kick = Math.min(0.12, P.kick + (w.recoil || 0));
    if (w.id !== 'sword') vmRecoil(w);
    if (w.id === 'sword') {
      P.swing = 1; AudioSys.play('swing');
      const awake = P.thunder > 0, reach = awake ? 9 : 4.6, dm = (awake ? 520 : 190) * mul;
      for (const e of enemies) {
        if (!e.alive) continue;
        _tv.set(e.pos.x - P.pos.x, 0, e.pos.z - P.pos.z); const d = _tv.length();
        if (d < reach + e.hr && Math.abs(e.pos.y - P.pos.y) < 5 && (d < 1.5 || (_tv.x * fwd.x + _tv.z * fwd.z) / d > 0.25)) damageEnemy(e, dm);
      }
      for (const h of houses) if (h.alive && Math.hypot(h.x - P.pos.x, h.z - P.pos.z) < reach + 8) damageHouse(h, dm * 0.5);
      if (awake) {
        AudioSys.play('zap', 0.8); const a = muzzlePos();
        frontTargets(70, 0.5, 4).forEach((t) => {
          const b = t.pos ? new V3(t.pos.x, t.pos.y + t.h * 0.5, t.pos.z) : new V3(t.x, t.y + 5, t.z);
          lightning(a, b, 0x9fd8ff, 0.25, 1.4, 2); if (t.pos) damageEnemy(t, 420 * mul); else damageHouse(t, 300 * mul);
        });
      }
      return;
    }
    const mz = muzzlePos();
    if (w.id === 'rocket') {
      spawnProj({ kind: 'rocket', pos: mz, dir: aimDir(curSpread(w) * 0.5), speed: 130, dmg: 520 * mul, rad: 15, size: 0.13 });
      AudioSys.play('rocket'); emit(mz, 10, 5, 0xffa040, 0.4, 0, 0);
    } else if (w.id === 'swarm') {
      const ts = frontTargets(500, 0.6, 6);
      for (let i = 0; i < 6; i++) {
        const d = aimDir(0.25); d.y += 0.25; d.normalize();
        spawnProj({ kind: 'micro', pos: mz.clone().addScaledVector(right, (i - 2.5) * 0.15), dir: d, speed: 110, dmg: 260 * mul, rad: 8, size: 0.07, target: ts.length ? ts[i % ts.length] : null, turn: 5 });
      }
      AudioSys.play('rocket', 0.8);
    } else if (w.id === 'repulsor') {
      const end = hitscan(w.dmg * mul, 0.004, 0x4fe8ff, 600, 0.5);
      addBeam(mz, end, 0x7feaff, 0.12, 0.12); AudioSys.play('laser', 0.7);
    } else if (w.id === 'lance') {
      const o = P.third ? P.pos.clone().add(new V3(0, 1.4, 0)).addScaledVector(fwd, 0.4) : camera.position.clone().addScaledVector(upv, -0.35).addScaledVector(fwd, 0.4);
      const end = hitscan(w.dmg * mul, 0, 0x4fe8ff, 700, 1.2);
      addBeam(o, end, 0x9ff4ff, 0.3, 0.09); emit(end, 3, 8, 0x9ff4ff, 0.4, 0, 0);
      if (Math.random() < 0.3) AudioSys.play('laser', 0.5);
    } else {
      const end = hitscan(w.dmg * mul, curSpread(w), 0xffd9a0);
      tracers.add(mz, end, 0xffd890, 0.07); AudioSys.play(w.snd, 0.75);
      muzzleL.position.copy(mz); muzzleL.intensity = 160;
      const GU = wModels[P.weapon].userData;
      GU.muzzle.add(mflash); mflash.material.rotation = rand(PI); mflash.scale.setScalar(rand(0.2, 0.34) * (P.ads > 0.5 ? 0.6 : 1)); P.flashT = 0.045;
      if (!P.third) emit(mz.clone().addScaledVector(fwd, -GU.len * 0.8).addScaledVector(right, 0.05), 1, 2.2, 0xd8a030, 0.45, 9, 1.6); // ejected brass
    }
  }

  // ---------- monsters ----------
  const ETYPE = {
    // hr = loose radius (explosions, melee); br/ns = bullet hit spheres: radius and how many are stacked over height h
    ghost: { hp: 90, speed: 6, h: 2.9, hr: 1.15, br: 0.55, ns: 4, reach: 2.4, make: makeGhost },
    vampire: { hp: 170, speed: 9, h: 2.3, hr: 1.1, br: 0.42, ns: 4, reach: 2.2, make: makeVampire },
    brute: { hp: 650, speed: 6.5, h: 3.7, hr: 1.9, br: 1.0, ns: 3, reach: 3.6, make: makeBrute }
  };
  function spawnEnemy(type, x, z, isl) {
    const T = ETYPE[type], g = T.make();
    g.position.set(x, Math.max(terrainH(x, z), 0), z); scene.add(g);
    enemies.push({ type, g, pos: g.position, hp: T.hp, alive: true, t: 0, h: T.h, hr: T.hr, br: T.br, ns: T.ns, speed: T.speed * rand(0.85, 1.15), reach: T.reach, isl, aggro: false, atk: rand(0.5), ph: rand(6), wyaw: rand(6), wt: 0, parts: g.userData.parts, leap: rand(2, 6), ox: rand(-2, 2), oz: rand(-2, 2) });
  }
  const pickType = () => { const r = Math.random(); return r < 0.4 ? 'ghost' : r < 0.75 ? 'vampire' : 'brute'; };
  ISLANDS.forEach((I, k) => {
    for (let i = 0; i < 14; i++) {
      for (let tr = 0; tr < 20; tr++) {
        const a = rand(PI * 2), d = I.r * rand(0.25, 0.8), x = I.x + Math.cos(a) * d, z = I.z + Math.sin(a) * d;
        if (terrainH(x, z) > 2 && Math.hypot(x - P.pos.x, z - P.pos.z) > 90) { spawnEnemy(pickType(), x, z, k); break; }
      }
    }
  });
  let spawnTick = 0; const islCount = [0, 0, 0];
  function updateSpawns(dt) {
    spawnTick -= dt;
    if (spawnTick <= 0) { spawnTick = 1; islCount.fill(0); for (const e of enemies) if (e.alive) islCount[e.isl]++; }
    const total = enemies.length;
    for (const h of houses) {
      if (!h.alive) {
        if (h.burn < 6) {
          h.burn += dt; h.g.scale.y = Math.max(0.22, 1 - h.burn * 0.5); h.g.userData.fire.material.opacity = Math.max(0, 0.8 - h.burn * 0.13);
          if (Math.random() < 0.6) emit(new V3(h.x + rand(-6, 6), h.y + rand(0, 4), h.z + rand(-5, 5)), 2, 3, 0xff6a18, 1.4, -5, 4);
        }
        continue;
      }
      h.spawnT -= dt;
      if (h.spawnT <= 0) {
        h.spawnT = 3.2;
        if (total < 80 && islCount[h.isl] < 26 && Math.hypot(h.x - P.pos.x, h.z - P.pos.z) < 650) {
          spawnEnemy(pickType(), h.x + h.fx * 9 + rand(-2, 2), h.z + h.fz * 9 + rand(-2, 2), h.isl); islCount[h.isl]++;
          emit(new V3(h.x + h.fx * 7, h.y + 2, h.z + h.fz * 7), 12, 4, h.g.userData.halo.material.color.getHex(), 0.8, 0, 1);
        }
      }
    }
  }
  function hitPlayer(e) {
    P.hits++; $('dmg').style.opacity = 0.9; shake = Math.max(shake, 0.5);
    AudioSys.play(e.type === 'ghost' ? 'wail' : 'growl', 0.7);
    if (P.mode === 'foot') { const dx = P.pos.x - e.pos.x, dz = P.pos.z - e.pos.z, d = Math.hypot(dx, dz) || 1, k = e.type === 'brute' ? 16 : 7; P.vel.x += dx / d * k; P.vel.z += dz / d * k; if (e.type === 'brute') P.vel.y = 6; }
  }
  function updateEnemies(dt) {
    const T = P.pos;
    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i], pr = e.parts;
      if (!e.alive) {
        e.t += dt;
        if (e.type === 'ghost') { e.g.scale.setScalar(Math.max(0.01, 1 - e.t * 1.2)); e.pos.y += dt * 4; e.g.rotation.y += dt * 12; }
        else { e.g.rotation.x = -Math.min(PI / 2, e.t * 5); if (e.t > 0.7) e.pos.y -= dt * 2.2; }
        if (e.t > 1.5) { scene.remove(e.g); enemies.splice(i, 1); }
        continue;
      }
      const dx = T.x + e.ox - e.pos.x, dz = T.z + e.oz - e.pos.z, dist = Math.hypot(dx, dz);
      if (dist > 1000) { e.g.visible = false; continue; }
      e.g.visible = true;
      if (dist < 230) e.aggro = true; else if (dist > 420) e.aggro = false;
      let sp = 0, yaw = e.g.rotation.y;
      if (e.aggro) {
        yaw = Math.atan2(dx, dz); sp = dist > e.reach * 0.7 ? e.speed : 0;
        if (e.type === 'vampire') { e.leap -= dt; if (e.leap < 0) { e.leap = rand(3, 6); e.lt = 0.7; } if (e.lt > 0) { e.lt -= dt; sp *= 2.6; } }
      } else {
        e.wt -= dt; if (e.wt <= 0) { e.wt = rand(2, 6); e.wyaw = rand(PI * 2); }
        yaw = e.wyaw; sp = 1.6;
      }
      let dy = yaw - e.g.rotation.y; while (dy > PI) dy -= PI * 2; while (dy < -PI) dy += PI * 2;
      e.g.rotation.y += dy * Math.min(1, dt * 6);
      const nx = e.pos.x + Math.sin(e.g.rotation.y) * sp * dt, nz = e.pos.z + Math.cos(e.g.rotation.y) * sp * dt, th = terrainH(nx, nz);
      if (e.type === 'ghost') {
        e.pos.x = nx; e.pos.z = nz;
        const base = Math.max(th, 0) + 0.5 + Math.sin(time * 2 + e.ph) * 0.35;
        const want = e.aggro ? clamp(T.y - 0.6, base, base + 70) : base;
        e.pos.y += clamp(want - e.pos.y, -9 * dt, 9 * dt);
        pr.inner.rotation.z = Math.sin(time * 1.7 + e.ph) * 0.12; pr.inner.rotation.x = sp ? 0.25 : 0.05;
        pr.armL.rotation.x = PI / 2 + Math.sin(time * 3 + e.ph) * 0.3; pr.armR.rotation.x = PI / 2 + Math.cos(time * 3 + e.ph) * 0.3;
      } else {
        if (th > 0.2) { e.pos.x = nx; e.pos.z = nz; e.pos.y = th + (e.lt > 0 ? Math.sin((0.7 - e.lt) / 0.7 * PI) * 2.2 : 0); }
        else if (!e.aggro) e.wyaw += PI;
        const w = Math.sin(time * (e.type === 'brute' ? 6 : 10) + e.ph) * (sp ? 0.6 : 0.05);
        pr.legL.rotation.x = w; pr.legR.rotation.x = -w;
        if (e.type === 'brute') { pr.armL.rotation.x = -w * 0.8 - 0.2; pr.armR.rotation.x = w * 0.8 - 0.2; }
        else { pr.armL.rotation.x = -1.25 + w * 0.3; pr.armR.rotation.x = -1.25 - w * 0.3; pr.cape.rotation.x = 0.18 + (sp ? 0.35 : 0) + Math.sin(time * 5 + e.ph) * 0.08; }
      }
      e.atk -= dt;
      if (e.aggro && dist < e.reach + 0.6 && Math.abs(T.y - e.pos.y) < 3.5 && e.atk <= 0) {
        e.atk = e.type === 'brute' ? 1.6 : 1.1; hitPlayer(e);
        if (e.type !== 'ghost') { pr.armL.rotation.x = -2.3; pr.armR.rotation.x = -2.3; }
      }
    }
  }

  // ---------- input ----------
  const keys = {}; let mouseDown = false, rmb = false, locked = false, started = false, jdx = 0, jdy = 0;
  const canvas = renderer.domElement;
  $('start').addEventListener('click', () => {
    $('start').style.display = 'none'; started = true;
    try { AudioSys.init(); } catch (e) { console.warn('audio unavailable', e); }
    try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* click the game again to capture the mouse */ }
    msg('Destroy the monster houses. You cannot die.', 5);
  });
  canvas.addEventListener('click', () => { if (!locked) { try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* ignore */ } } });
  document.addEventListener('pointerlockchange', () => { locked = document.pointerLockElement === canvas; if (!locked) { mouseDown = rmb = false; } });
  document.addEventListener('mousemove', (e) => {
    if (!locked) return;
    const mx = clamp(e.movementX, -150, 150), my = clamp(e.movementY, -150, 150);
    if (P.mode === 'jet') { jdx += mx; jdy += my; }
    else {
      const sens = 0.0022 * camera.fov / 75; // slower when zoomed in, so aiming stays precise
      P.yaw -= mx * sens; P.pitch = clamp(P.pitch - my * sens, -1.5, 1.5);
      P.swayX = clamp(P.swayX + mx * 0.00022, -0.05, 0.05); P.swayY = clamp(P.swayY + my * 0.00022, -0.04, 0.04);
    }
  });
  document.addEventListener('mousedown', (e) => { if (!locked) return; if (e.button === 0) { mouseDown = true; P.trig = true; } if (e.button === 2) rmb = true; });
  document.addEventListener('mouseup', (e) => { if (e.button === 0) mouseDown = false; if (e.button === 2) rmb = false; });
  document.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('wheel', (e) => {
    if (!locked || P.mode !== 'foot') return;
    let i = P.weapon; const dir = e.deltaY > 0 ? 1 : -1;
    do { i = (i + dir + WEAPONS.length) % WEAPONS.length; } while (WEAPONS[i].armor && !P.armor);
    selectWeapon(i);
  });
  document.addEventListener('keydown', (e) => {
    if (['Space', 'Tab', 'ControlLeft', 'KeyS', 'KeyD', 'KeyW'].includes(e.code)) e.preventDefault();
    if (keys[e.code] || !started) { keys[e.code] = true; return; }
    keys[e.code] = true;
    const wi = WEAPONS.findIndex((w) => 'Digit' + w.key === e.code);
    if (wi >= 0) selectWeapon(wi);
    switch (e.code) {
      case 'KeyV': P.third = !P.third; placeWeapon(); break;
      case 'KeyE': useVehicle(); break;
      case 'KeyG':
        if (P.mode !== 'foot' || P.charge) break;
        if (P.form >= 5) { msg('Maximum power reached'); break; }
        P.charge = { t: 1.35, to: P.form + 1 }; AudioSys.play('powerup'); break;
      case 'KeyH': if (P.form && !P.charge) setForm(0); break;
      case 'KeyC': summonArmor(); break;
      case 'KeyT': startChant(); break;
      case 'KeyM': msg('Music: ' + AudioSys.cycleMode(), 2); break;
      case 'KeyI': P.invert *= -1; msg('Jet pitch ' + (P.invert < 0 ? 'inverted' : 'normal'), 2); break;
      case 'KeyN': if (!houses.some((h) => h.alive)) resetNightmare(); break;
    }
  });
  document.addEventListener('keyup', (e) => { keys[e.code] = false; });
  window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; mouseDown = rmb = false; });

  // ---------- vehicles ----------
  function nearestVehicle() {
    let best = null, bd = 1e9;
    for (const j of jets) { const d = j.pos.distanceTo(P.pos); if (d < 13 && d < bd) { bd = d; best = { kind: 'jet', v: j }; } }
    for (const b of boats) { const d = Math.hypot(b.pos.x - P.pos.x, b.pos.z - P.pos.z); if (d < 9 && Math.abs(P.pos.y) < 6 && d < bd) { bd = d; best = { kind: 'boat', v: b }; } }
    return best;
  }
  function useVehicle() {
    if (P.mode === 'foot') {
      if (P.chant || P.summon || P.charge) return;
      const n = nearestVehicle(); if (!n) return;
      P.mode = n.kind; P.veh = n.v; P.model.visible = false; placeWeapon();
      if (n.kind === 'jet') { n.v.ret = false; jdx = jdy = 0; msg('W throttle up — pull the nose up past 90 kts — V for cockpit', 5); $('wname').textContent = 'F-14 — Cannon + Missiles'; }
      else { P.yaw = n.v.yaw; P.pitch = -0.1; msg('Speed boat — twin machine guns', 3); $('wname').textContent = 'Twin Machine Guns'; }
      $('wlist').innerHTML = '';
    } else {
      const v = P.veh;
      if (P.mode === 'jet') {
        const r = new V3(1, 0, 0).applyQuaternion(v.g.quaternion); r.y = 0; r.normalize();
        P.pos.copy(v.pos).addScaledVector(r, 6); P.yaw = v.yaw; P.pitch = 0;
        const air = v.pos.y - Math.max(terrainH(v.pos.x, v.pos.z), 0) > GEAR + 3 || terrainH(v.pos.x, v.pos.z) < 0.5 || v.speed > 30;
        P.vel.set(-Math.sin(v.yaw), 0, -Math.cos(v.yaw)).multiplyScalar(Math.min(v.speed, 40));
        if (air) { v.ret = true; msg('Ejected! Jet returning to its pad on autopilot', 3); } else { v.speed = 0; v.thr = 0; }
      } else { P.pos.set(v.pos.x + Math.cos(v.yaw) * 3, 0, v.pos.z - Math.sin(v.yaw) * 3); P.vel.set(0, 0, 0); v.speed = 0; }
      P.mode = 'foot'; P.veh = null; placeWeapon();
    }
  }
  const _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ');
  function updateJets(dt) {
    for (const j of jets) {
      const U = j.g.userData, mine = P.mode === 'jet' && P.veh === j;
      if (j.ret) {
        const H = j.home; j.pos.x = lerp(j.pos.x, H.x, Math.min(1, dt * 1.2)); j.pos.z = lerp(j.pos.z, H.z, Math.min(1, dt * 1.2)); j.pos.y = lerp(j.pos.y, H.y, Math.min(1, dt * 1.2));
        j.pitch = 0; j.roll = 0; j.yaw = H.yaw; j.speed = 0; j.thr = 0;
        if (Math.hypot(j.pos.x - H.x, j.pos.y - H.y, j.pos.z - H.z) < 0.3) { j.pos.set(H.x, H.y, H.z); j.ret = false; }
      } else if (mine) {
        j.thr = clamp(j.thr + ((keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0)) * 0.55 * dt, 0, 1);
        const ab = keys.ShiftLeft && j.thr > 0.5;
        j.speed += ((j.thr * 300 + (ab ? 220 : 0)) - j.speed) * 0.55 * dt;
        const ground = Math.max(terrainH(j.pos.x, j.pos.z), 0) + GEAR, onG = j.pos.y <= ground + 0.05;
        const auth = clamp(j.speed / 90, 0.15, 1);
        const yawIn = -jdx * 0.0016 + ((keys.KeyA ? 1 : 0) - (keys.KeyD ? 1 : 0)) * 1.0 * dt;
        j.yaw += yawIn * auth; j.pitch = clamp(j.pitch - jdy * 0.0016 * P.invert * auth, -1.45, 1.45);
        jdx = jdy = 0;
        const rollT = onG ? 0 : clamp(yawIn / Math.max(dt, 0.001) * 0.75, -1.25, 1.25);
        j.roll = lerp(j.roll, rollT, Math.min(1, dt * 3.5));
        if (onG && (j.pitch < 0 || j.speed < 90)) j.pitch *= Math.max(0, 1 - dt * 8);
        _e.set(j.pitch, j.yaw, j.roll); _q.setFromEuler(_e);
        const f = new V3(0, 0, -1).applyQuaternion(_q);
        j.pos.addScaledVector(f, j.speed * dt);
        if (j.speed < 90 && !onG) j.pos.y -= (90 - j.speed) * 0.3 * dt;
        const g2 = Math.max(terrainH(j.pos.x, j.pos.z), 0) + GEAR;
        if (j.pos.y < g2) { j.pos.y = g2; if (j.speed > 160 && j.pitch < -0.25) { shake = 0.8; emit(j.pos, 20, 14, 0xffc070, 0.5, 8, 4); } }
        if (j.pos.y > 2500) { j.pos.y = 2500; j.pitch = Math.min(j.pitch, 0); }
        const cx = 670, cz = 390; if (Math.hypot(j.pos.x - cx, j.pos.z - cz) > 5200) { j.yaw = Math.atan2(j.pos.x - cx, j.pos.z - cz); msg('Turning back toward the isles', 2); }
        P.pos.copy(j.pos);
        // weapons
        j.gunT -= dt; j.mslT -= dt;
        if (mouseDown && j.gunT <= 0) {
          j.gunT = 0.04; j.side *= -1;
          const d = f.clone(); d.x += rand(-0.006, 0.006); d.y += rand(-0.006, 0.006); d.z += rand(-0.006, 0.006); d.normalize();
          const o = j.pos.clone().addScaledVector(f, 13).add(new V3(j.side * 0.8, -0.2, 0).applyQuaternion(_q));
          const r = rayHit(o, d, 1400, 3.5, 6), end = o.clone().addScaledVector(d, r.t);
          tracers.add(o, end, 0xffe070, 0.09);
          if (r.e) damageEnemy(r.e, 160); else if (r.h) damageHouse(r.h, 90);
          if (r.t < 1400) { emit(end, 5, 9, 0xffc070, 0.5, 10, 4); if (Math.random() < 0.15) boom(end, 5, 0xffa040); }
          if (Math.random() < 0.5) AudioSys.play('mg', 0.6);
        }
        if ((rmb || keys.Space) && j.mslT <= 0) {
          j.mslT = 0.3; j.side *= -1;
          const o = j.pos.clone().add(new V3(j.side * 2.9, -1.4, -2).applyQuaternion(_q));
          spawnProj({ kind: 'missile', pos: o, dir: f, speed: j.speed + 260, dmg: 900, rad: 28, size: 0.22, target: j.lock, turn: 3.2, life: 9 });
          AudioSys.play('rocket', 0.9);
        }
      }
      _e.set(j.pitch, j.yaw, j.roll); j.g.quaternion.setFromEuler(_e);
      const sw = lerp(0.35, 1.15, clamp((j.speed - 120) / 250, 0, 1));
      U.wings.forEach((w) => { w.rotation.y = lerp(w.rotation.y, -w.userData.s * sw, Math.min(1, dt * 2)); });
      const fl = mine ? j.thr * (keys.ShiftLeft && j.thr > 0.5 ? 2.2 : 1) : 0;
      U.glows.forEach((g) => { g.visible = fl > 0.03; g.scale.set(1, fl * rand(0.9, 1.1), 1); g.position.z = 9.8 + 2.5 * fl; });
      const cock = mine && !P.third;
      U.ext.visible = !cock; U.cp.visible = cock;
    }
  }
  let lockTick = 0;
  function updateLock(dt, j) {
    lockTick -= dt; if (lockTick > 0) return; lockTick = 0.15;
    const t = frontTargets(2200, 0.93, 1); j.lock = t.length ? t[0] : null;
  }
  function updateBoats(dt) {
    for (const b of boats) {
      const mine = P.mode === 'boat' && P.veh === b; let steer = 0;
      if (mine) {
        const thr = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 0.45 : 0);
        b.speed += (thr * (keys.ShiftLeft ? 58 : 42) - b.speed) * 0.9 * dt;
        steer = (keys.KeyA ? 1 : 0) - (keys.KeyD ? 1 : 0);
        b.yaw += steer * 1.15 * dt * clamp(b.speed / 14, -1, 1);
      } else b.speed *= Math.max(0, 1 - dt);
      const nx = b.pos.x - Math.sin(b.yaw) * b.speed * dt, nz = b.pos.z - Math.cos(b.yaw) * b.speed * dt;
      if (terrainH(nx, nz) < -1.7) { b.pos.x = nx; b.pos.z = nz; } else { if (Math.abs(b.speed) > 8) AudioSys.play('splash', mine ? 0.6 : 0); b.speed *= -0.25; }
      const sp = Math.abs(b.speed) / 42;
      b.pos.y = 0.12 + Math.sin(time * 1.8 + b.ph) * 0.12 + sp * 0.25;
      b.g.rotation.set(sp * 0.09 + Math.sin(time * 1.3 + b.ph) * 0.02, b.yaw, -steer * sp * 0.22 + Math.sin(time * 1.1 + b.ph) * 0.03);
      if (sp > 0.15 && Math.random() < 0.9) {
        const s = Math.sin(b.yaw), c = Math.cos(b.yaw);
        emit(new V3(b.pos.x + s * 4.5 + rand(-1, 1), 0.3, b.pos.z + c * 4.5 + rand(-1, 1)), 2, 3 + sp * 4, 0x9fc8dd, 0.7, 9, 3 * sp);
      }
      if (mine) {
        P.pos.set(b.pos.x, b.pos.y, b.pos.z);
        const U = b.g.userData; U.piv.rotation.y = P.yaw - b.yaw; U.gun.rotation.x = clamp(P.pitch + 0.12, -0.5, 0.9);
        b.gunT -= dt;
        if (mouseDown && b.gunT <= 0) {
          b.gunT = 0.055;
          const d = aimDir(0.012), r = rayHit(camera.position, d, 800, 0.8), end = camera.position.clone().addScaledVector(d, r.t);
          const o = new V3(rand(-0.15, 0.15), 0.2, -2).applyQuaternion(U.gun.getWorldQuaternion(_q)).add(U.gun.getWorldPosition(_tv));
          tracers.add(o, end, 0xffe070, 0.08);
          if (r.e) damageEnemy(r.e, 60); else if (r.h) damageHouse(r.h, 60);
          if (r.t < 800) emit(end, 4, 5, 0xffd9a0, 0.3, 6, 1);
          muzzleL.position.copy(o); muzzleL.intensity = 200; AudioSys.play('mg', 0.7);
        }
      }
    }
  }

  // ---------- on-foot movement ----------
  function updateFoot(dt) {
    const F = FORMS[P.form], canFly = P.form > 0 || P.armor;
    const frozen = !!(P.chant || P.charge);
    const waterHere = terrainH(P.pos.x, P.pos.z) < -1.3, swimming = waterHere && P.pos.y <= -1.25;
    P.sprint = !!(keys.ShiftLeft && !mouseDown && !rmb && !P.reload && (keys.KeyW || keys.KeyA || keys.KeyD));
    let sp = (P.sprint ? 15 : 9) * F.spd * (P.armor ? 1.3 : 1) * (1 - 0.45 * P.ads);
    if (swimming) sp *= 0.75; if (!P.onGround && canFly) sp *= 2;
    let mx = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0), mz = (keys.KeyS ? 1 : 0) - (keys.KeyW ? 1 : 0);
    const l = Math.hypot(mx, mz); if (l) { mx /= l; mz /= l; }
    if (frozen) { mx = mz = 0; }
    const s = Math.sin(P.yaw), c = Math.cos(P.yaw), wx = mx * c + mz * s, wz = -mx * s + mz * c;
    const acc = Math.min(1, dt * (P.onGround ? 10 : 4));
    P.vel.x += (wx * sp - P.vel.x) * acc; P.vel.z += (wz * sp - P.vel.z) * acc;
    const flying = canFly && !P.onGround;
    if (keys.Space && !frozen) {
      if (canFly) P.vel.y = lerp(P.vel.y, 17 * F.spd, Math.min(1, dt * 5));
      else if (P.onGround) P.vel.y = 9.5;
    }
    const descend = keys.KeyQ || keys.KeyZ || keys.ControlLeft;
    if (flying && descend && !frozen) P.vel.y = lerp(P.vel.y, -26 * Math.max(1, F.spd * 0.85) * (keys.ShiftLeft ? 1.6 : 1), Math.min(1, dt * 6));
    else if (flying && !keys.Space) P.vel.y = lerp(P.vel.y, P.armor ? 0 : -5, Math.min(1, dt * 2.5)); // hover / slow glide
    else if (!flying || !keys.Space) P.vel.y -= 28 * dt;
    if (frozen) P.vel.y = Math.max(P.vel.y, 0);
    P.pos.addScaledVector(P.vel, dt);
    for (const h of houses) {
      if (!h.alive) continue;
      const dx = P.pos.x - h.x, dz = P.pos.z - h.z, d = Math.hypot(dx, dz);
      if (d < 8.6 && P.pos.y < h.y + 15) { P.pos.x = h.x + dx / d * 8.6; P.pos.z = h.z + dz / d * 8.6; }
    }
    const ground = Math.max(terrainH(P.pos.x, P.pos.z), -1.3);
    if (P.pos.y <= ground) { if (P.vel.y < -24 && !swimming) { shake = 0.5; emit(P.pos, 14, 6, 0x8a7a60, 0.5, 8, 2); } P.pos.y = ground; P.vel.y = Math.max(0, P.vel.y); P.onGround = true; }
    else P.onGround = P.pos.y - ground < 0.08;
    if (P.pos.y > 1500) P.pos.y = 1500;
    // model + animation
    const m = P.model; m.visible = P.third; m.position.copy(P.pos); m.rotation.y = P.yaw;
    const moving = l > 0 && P.onGround; P.walk += dt * (moving ? sp * 1.1 : 0);
    const w = moving ? Math.sin(P.walk) * 0.7 : 0;
    MU.legL.rotation.x = flying ? 0.25 : w; MU.legR.rotation.x = flying ? 0.1 : -w; MU.armL.rotation.x = flying ? 0.3 : -w * 0.7;
    const rl = P.reload ? Math.sin(Math.min(1, P.reload.t / P.reload.dur) * PI) : 0;
    MU.armR.rotation.x = PI / 2 + P.pitch - P.swing * 1.2 + P.kick * 2.2 - rl * 0.5 - P.sprintK * 0.6 + (1 - P.equip) * -1;
    m.rotation.x = 0; if (flying) m.rotateX(-clamp(Math.hypot(P.vel.x, P.vel.z) / 40, 0, 0.9));
    MU.thr.forEach((t) => { t.visible = P.armor && flying; t.scale.y = rand(0.7, 1.2); });
    // aura
    if (P.form) {
      MU.a1.rotation.y += dt * 3; MU.a2.rotation.y -= dt * 4;
      MU.a1.scale.set(1 + Math.sin(time * 17) * 0.08, 1 + Math.sin(time * 23) * 0.1, 1 + Math.cos(time * 19) * 0.08);
      MU.auraM.opacity = 0.2 + Math.sin(time * 30) * 0.05;
      auraL.position.set(P.pos.x, P.pos.y + 1.5, P.pos.z);
      if (Math.random() < dt * 30) emit(new V3(P.pos.x + rand(-0.8, 0.8), P.pos.y + rand(0, 1), P.pos.z + rand(-0.8, 0.8)), 1, 0.6, F.color, 0.9, -4, 3);
      if (F.sparks && Math.random() < dt * 12) {
        const a = P.pos.clone().add(new V3(rand(-0.8, 0.8), rand(0.2, 2), rand(-0.8, 0.8)));
        lightning(a, a.clone().add(new V3(rand(-0.9, 0.9), rand(-0.9, 0.9), rand(-0.9, 0.9))), F.sparks, 0.12, 0.2, 1);
      }
    }
    if (P.charge) {
      P.charge.t -= dt; shake = Math.max(shake, 0.35);
      const col = FORMS[P.charge.to].color, a = rand(PI * 2);
      emit(new V3(P.pos.x + Math.cos(a) * 3, P.pos.y + rand(0, 0.5), P.pos.z + Math.sin(a) * 3), 2, 1.5, col, 0.6, -14, 5);
      if (P.charge.t <= 0) { const to = P.charge.to; P.charge = null; setForm(to); }
    }
  }

  // ---------- camera ----------
  const camT = new V3();
  function updateCamera(dt) {
    let fov = 75;
    if (P.mode === 'foot') {
      camera.rotation.set(P.pitch, P.yaw, 0);
      if (P.third) {
        const d = new V3(-Math.sin(P.yaw) * Math.cos(P.pitch), Math.sin(P.pitch), -Math.cos(P.yaw) * Math.cos(P.pitch));
        camT.copy(P.pos).add(new V3(0, 2.0, 0)).addScaledVector(d, -(5.5 - 2.7 * P.ads)).add(new V3(Math.cos(P.yaw) * 0.9, 0, -Math.sin(P.yaw) * 0.9));
        camT.y = Math.max(camT.y, Math.max(terrainH(camT.x, camT.z), 0) + 0.4);
        camera.position.copy(camT);
      } else {
        camera.position.set(P.pos.x, P.pos.y + 1.7 + VM.ly * 0.6, P.pos.z);
        camera.rotateX(VM.r.x * 0.07); camera.rotateZ(VM.r.z * 0.22 + VM.r.y * 0.1);   // small camera punch that follows the gun's recoil
      }
      fov = lerp(75 + P.sprintK * 4, WEAPONS[P.weapon].ads || 75, smooth(0, 1, P.ads));
      if (P.charge) fov = 82;
    } else if (P.mode === 'boat') {
      const b = P.veh; camera.rotation.set(P.pitch, P.yaw, 0);
      if (P.third) {
        const d = new V3(-Math.sin(P.yaw) * Math.cos(P.pitch), Math.sin(P.pitch), -Math.cos(P.yaw) * Math.cos(P.pitch));
        camT.copy(b.pos).add(new V3(0, 3.4, 0)).addScaledVector(d, -13); camT.y = Math.max(camT.y, 0.8); camera.position.copy(camT);
      } else camera.position.copy(new V3(0, 2.5, 0.9).applyQuaternion(b.g.quaternion).add(b.pos));
    } else {
      const j = P.veh; fov = P.third ? 72 + clamp(j.speed / 520, 0, 1) * 16 : 78;
      if (P.third) {
        _e.set(j.pitch, j.yaw, j.roll * 0.45); _q.setFromEuler(_e);
        camera.quaternion.slerp(_q, Math.min(1, dt * 5));
        camT.set(0, 6.5, 34).applyQuaternion(camera.quaternion).add(j.pos);
        camT.y = Math.max(camT.y, Math.max(terrainH(camT.x, camT.z), 0) + 1);
        camera.position.copy(camT);
      } else {
        camera.quaternion.copy(j.g.quaternion);
        camera.position.copy(new V3(0, 1.38, -3.55).applyQuaternion(j.g.quaternion).add(j.pos));
      }
    }
    if (shake > 0.01) {
      camera.rotateX(rand(-1, 1) * shake * 0.02); camera.rotateY(rand(-1, 1) * shake * 0.02); camera.rotateZ(rand(-1, 1) * shake * 0.012);
      shake *= Math.max(0, 1 - dt * 5);
    }
    if (Math.abs(camera.fov - fov) > 0.1) { camera.fov = lerp(camera.fov, fov, Math.min(1, dt * (P.mode === 'foot' ? 16 : 4))); camera.updateProjectionMatrix(); }
    camera.updateMatrixWorld();
    fwd.set(0, 0, -1).applyQuaternion(camera.quaternion); right.set(1, 0, 0).applyQuaternion(camera.quaternion); upv.set(0, 1, 0).applyQuaternion(camera.quaternion);
    // viewmodel
    updateViewmodel(dt);
    flash.intensity = P.mode === 'jet' ? 0 : 300;
    // sky follows camera
    ENV.sky.position.copy(camera.position); ENV.moon.position.copy(camera.position).addScaledVector(ENV.moonDir, 6000);
    ENV.water.position.x = camera.position.x; ENV.water.position.z = camera.position.z;
    TEX.water.offset.set(camera.position.x / 16000 * 260 + time * 0.012, -camera.position.z / 16000 * 260 + time * 0.008);
  }

  // ---------- HUD ----------
  let hudTick = 0, mapTick = 0;
  const crossI = Array.from(document.querySelectorAll('#cross i')), hitm = $('hitm');
  const mapC = $('map').getContext('2d');
  const MB = { x0: -700, z0: -1150, s: 204 / 3400 };
  function drawMap() {
    const g = mapC, X = (x) => (x - MB.x0) * MB.s, Z = (z) => (z - MB.z0) * MB.s;
    g.clearRect(0, 0, 170, 204);
    ISLANDS.forEach((I, k) => {
      const clean = !houses.some((h) => h.alive && h.isl === k);
      g.fillStyle = clean ? 'rgba(70,130,80,.8)' : 'rgba(84,60,50,.85)'; g.beginPath(); g.arc(X(I.x), Z(I.z), I.r * MB.s * 0.98, 0, 7); g.fill();
    });
    for (const h of houses) { g.fillStyle = h.alive ? '#ff3a2a' : '#444'; g.fillRect(X(h.x) - 2, Z(h.z) - 2, 4, 4); }
    g.fillStyle = 'rgba(255,90,90,.6)';
    for (const e of enemies) if (e.alive && e.aggro) g.fillRect(X(e.pos.x) - 0.7, Z(e.pos.z) - 0.7, 1.5, 1.5);
    g.fillStyle = '#40d8ff'; for (const j of jets) { g.beginPath(); g.arc(X(j.pos.x), Z(j.pos.z), 2.4, 0, 7); g.fill(); }
    g.fillStyle = '#ffe14a'; for (const b of boats) g.fillRect(X(b.pos.x) - 1.5, Z(b.pos.z) - 1.5, 3, 3);
    const yaw = P.mode === 'jet' ? P.veh.yaw : P.yaw;
    g.save(); g.translate(X(P.pos.x), Z(P.pos.z)); g.rotate(-yaw); g.fillStyle = '#fff';
    g.beginPath(); g.moveTo(0, -6); g.lineTo(4, 5); g.lineTo(0, 2.5); g.lineTo(-4, 5); g.closePath(); g.fill(); g.restore();
  }
  function updateHUD(dt) {
    if (msgT > 0) { msgT -= dt; if (msgT <= 0) $('msg').style.opacity = 0; }
    if (bigT > 0) { bigT -= dt; if (bigT <= 0) $('big').style.opacity = 0; }
    const dm = $('dmg'); if (dm.style.opacity > 0) dm.style.opacity = Math.max(0, dm.style.opacity - dt * 2.5);
    hudTick -= dt; mapTick -= dt;
    if (mapTick <= 0) { mapTick = 0.2; drawMap(); }
    if (hudTick <= 0) {
      hudTick = 0.12;
      const ww = WEAPONS[P.weapon];
      $('ammo').textContent = P.mode !== 'foot' ? 'AMMO ∞' : P.reload ? 'RELOADING…' : ww.mag ? P.ammo[P.weapon] + ' / ∞' : 'ENERGY ∞';
      let near = 0; for (const e of enemies) if (e.alive && e.aggro && e.pos.distanceTo(P.pos) < 70) near++;
      AudioSys.setDanger(clamp(near / 6, 0, 1));
      const isl = islandAt(P.pos.x, P.pos.z), left = houses.filter((h) => h.alive).length;
      $('stats').innerHTML = `HEALTH <span class="inf">∞ IMMORTAL</span><br>FORM <b style="color:${P.form ? '#' + new THREE.Color(FORMS[P.form].color).getHexString() : '#ccc'}">${FORMS[P.form].name}</b> ×${dmgMul().toFixed(1)}` +
        `${P.armor ? ' <b style="color:#7feaff">+ARMOR</b>' : ''}${P.thunder > 0 ? ` <b style="color:#9fd8ff">⚡${P.thunder | 0}s</b>` : ''}<br>KILLS <b>${P.kills}</b> &nbsp; HOUSES LEFT <b>${left}/12</b><br>` +
        `${isl >= 0 ? ISLANDS[isl].name : 'Open sea'} &nbsp;·&nbsp; ${P.third ? '3rd' : '1st'} person`;
      const pr = $('prompt');
      if (P.mode === 'foot') { const n = nearestVehicle(); if (n) { pr.style.display = 'block'; pr.innerHTML = `Press <kbd>E</kbd> to ${n.kind === 'jet' ? 'board the fighter jet' : 'take the speed boat'}`; } else pr.style.display = 'none'; }
      else pr.style.display = 'none';
      $('hint').innerHTML = !locked && started ? '<b>Click to capture the mouse</b>' :
        P.mode === 'jet' ? '<kbd>W</kbd>/<kbd>S</kbd> throttle <kbd>Shift</kbd> afterburner <kbd>LMB</kbd> cannon <kbd>RMB</kbd> missile <kbd>V</kbd> view <kbd>E</kbd> eject' :
        P.mode === 'boat' ? '<kbd>W A S D</kbd> drive <kbd>Shift</kbd> boost <kbd>LMB</kbd> guns <kbd>V</kbd> view <kbd>E</kbd> exit' :
        ((P.form || P.armor) ? '<kbd>Space</kbd> fly up <kbd>Q</kbd>/<kbd>Z</kbd> descend ' : '') +
        '<kbd>RMB</kbd> aim <kbd>R</kbd> reload <kbd>G</kbd> ascend <kbd>F</kbd> blast <kbd>X</kbd> mega wave <kbd>C</kbd> armor <kbd>T</kbd> thunder chant <kbd>V</kbd> view <kbd>E</kbd> vehicle <kbd>M</kbd> music';
    }
    { // dynamic crosshair: opens with spread, hides while aiming down sights; hit marker flashes on hits
      const w = WEAPONS[P.weapon], foot = P.mode === 'foot';
      $('cross').style.opacity = P.mode === 'jet' ? 0 : foot ? 1 - P.ads * 1.4 : 1;
      const gap = foot && w.mag ? 4 + curSpread(w) * 620 : 6;
      crossI[0].style.transform = `translate(-1px,${-gap - 9}px)`; crossI[1].style.transform = `translate(-1px,${gap}px)`;
      crossI[2].style.transform = `translate(${-gap - 9}px,-1px)`; crossI[3].style.transform = `translate(${gap}px,-1px)`;
      P.hitT = Math.max(0, P.hitT - dt); hitm.style.opacity = Math.min(1, P.hitT * 9); hitm.style.color = P.hitHead ? '#ff3a28' : '#fff';
    }
    // jet HUD
    hud.clearRect(0, 0, hudC.width, hudC.height);
    if (P.mode !== 'jet') return;
    const j = P.veh, w = hudC.width, h = hudC.height, cx = w / 2, cy = h / 2, cock = !P.third;
    hud.strokeStyle = hud.fillStyle = 'rgba(90,255,120,.95)'; hud.lineWidth = 1.6; hud.font = '15px Consolas, monospace'; hud.textAlign = 'center';
    hud.shadowColor = '#0f4'; hud.shadowBlur = 6;
    // boresight / gun cross (projected along jet nose)
    const nose = new V3(0, 0, -1).applyQuaternion(j.g.quaternion).multiplyScalar(600).add(j.pos).project(camera);
    const gx = (nose.x * 0.5 + 0.5) * w, gy = (-nose.y * 0.5 + 0.5) * h;
    hud.beginPath(); hud.arc(gx, gy, 13, 0, 7); hud.moveTo(gx - 26, gy); hud.lineTo(gx - 13, gy); hud.moveTo(gx + 13, gy); hud.lineTo(gx + 26, gy); hud.moveTo(gx, gy - 13); hud.lineTo(gx, gy - 24); hud.stroke();
    hud.fillRect(gx - 1, gy - 1, 2, 2);
    if (cock) { // pitch ladder
      hud.save(); hud.translate(cx, cy); hud.rotate(j.roll);
      const pd = j.pitch * 180 / PI, ppd = h / 60;
      for (let a = -90; a <= 90; a += 10) {
        const y = (pd - a) * ppd; if (Math.abs(y) > h * 0.3) continue;
        const half = a === 0 ? 210 : 70; hud.beginPath();
        if (a < 0) hud.setLineDash([7, 6]); else hud.setLineDash([]);
        hud.moveTo(-half, y); hud.lineTo(-28, y); hud.moveTo(28, y); hud.lineTo(half, y); hud.stroke();
        if (a !== 0) { hud.fillText(a, -half - 20, y + 5); hud.fillText(a, half + 20, y + 5); }
      }
      hud.setLineDash([]); hud.restore();
    }
    const alt = Math.max(0, j.pos.y - GEAR), hdg = ((-j.yaw * 180 / PI) % 360 + 360) % 360;
    const bx = cock ? cx - 300 : cx - 330, bx2 = cock ? cx + 300 : cx + 330;
    hud.strokeRect(bx - 48, cy - 15, 96, 30); hud.strokeRect(bx2 - 48, cy - 15, 96, 30);
    hud.font = '19px Consolas, monospace'; hud.fillText((j.speed * 1.2 | 0) + ' KT', bx, cy + 7); hud.fillText((alt * 3.28 | 0) + ' FT', bx2, cy + 7);
    hud.font = '14px Consolas, monospace';
    hud.fillText('SPD', bx, cy - 22); hud.fillText('ALT', bx2, cy - 22);
    hud.fillText('HDG ' + String(hdg | 0).padStart(3, '0') + '°', cx, cock ? cy - h * 0.34 : 60);
    hud.fillText('THR ' + (j.thr * 100 | 0) + '%' + (keys.ShiftLeft && j.thr > 0.5 ? '  A/B' : ''), bx, cy + 40);
    hud.fillText('GUN ∞   MSL ∞', bx2, cy + 40);
    if (j.speed < 90 && alt > 4) { hud.fillStyle = '#ff5040'; hud.fillText('STALL — THROTTLE UP', cx, cy + 120); hud.fillStyle = 'rgba(90,255,120,.95)'; }
    updateLock(dt, j);
    if (j.lock) {
      const T = j.lock, p = (T.pos ? new V3(T.pos.x, T.pos.y + T.h * 0.5, T.pos.z) : new V3(T.x, T.y + 5, T.z));
      const dist = p.distanceTo(j.pos); p.project(camera);
      if (p.z < 1) {
        const x = (p.x * 0.5 + 0.5) * w, y = (-p.y * 0.5 + 0.5) * h;
        hud.strokeStyle = hud.fillStyle = '#ff4030'; hud.shadowColor = '#f00';
        hud.strokeRect(x - 20, y - 20, 40, 40); hud.beginPath(); hud.moveTo(x - 28, y); hud.lineTo(x - 20, y); hud.moveTo(x + 20, y); hud.lineTo(x + 28, y); hud.stroke();
        hud.fillText('LOCK ' + (T.pos ? T.type.toUpperCase() : 'MONSTER HOUSE') + '  ' + (dist | 0) + 'm', x, y - 28);
      }
    }
    hud.shadowBlur = 0;
  }

  // ---------- main loop ----------
  let stormT = rand(6, 14), last = 0;
  placeWeapon();
  function frame(now) {
    requestAnimationFrame(frame);
    if (!last) last = now; const dt = clamp((now - last) / 1000, 0, 0.05); last = now;
    if (!started) { // slow title orbit
      time += dt; camera.position.set(pads[0].x + Math.cos(time * 0.1) * 90, 26, pads[0].z + Math.sin(time * 0.1) * 90);
      camera.lookAt(pads[0].x, 8, pads[0].z); ENV.sky.position.copy(camera.position); ENV.moon.position.copy(camera.position).addScaledVector(ENV.moonDir, 6000);
      renderer.render(scene, camera); return;
    }
    time += dt;
    for (let i = delayed.length - 1; i >= 0; i--) { delayed[i].t -= dt; if (delayed[i].t <= 0) { const f = delayed[i].fn; delayed.splice(i, 1); f(); } }
    if (P.mode === 'foot') { updateFoot(dt); fireFoot(dt); }
    updateSummon(dt); updateChant(dt);
    updateJets(dt); updateBoats(dt);
    updateEnemies(dt); updateSpawns(dt); updateProjectiles(dt);
    updateCamera(dt);
    updateParticles(dt); tracers.update(dt); bolts.update(dt); updateFlashes(dt);
    // weather + lights
    stormT -= dt;
    if (stormT <= 0) {
      stormT = rand(7, 20); const a = rand(PI * 2), d = rand(300, 900);
      const p = new V3(camera.position.x + Math.cos(a) * d, 0, camera.position.z + Math.sin(a) * d); p.y = Math.max(terrainH(p.x, p.z), 0);
      lightning(new V3(p.x + rand(-60, 60), 420, p.z + rand(-60, 60)), p, 0xbfd0ff, 0.5, 16, 2); skyFlash = Math.max(skyFlash, 1.3);
      delayed.push({ t: d / 500, fn: () => AudioSys.play('thunder', 0.45) });
    }
    skyFlash *= Math.max(0, 1 - dt * 4.5);
    ENV.hemi.intensity = 1.25 + skyFlash * 3; ENV.sun.intensity = 1.5 + skyFlash * 2.5;
    muzzleL.intensity *= Math.max(0, 1 - dt * 28); boomL.intensity *= Math.max(0, 1 - dt * 5);
    if (P.mode !== 'foot') auraL.intensity = 0; else if (P.form) auraL.intensity = 40 + P.form * 10 + Math.sin(time * 25) * 10;
    AudioSys.engines(P.mode === 'jet', P.mode === 'jet' ? P.veh.thr + (keys.ShiftLeft ? 0.4 : 0) : 0, P.mode === 'boat', P.mode === 'boat' ? Math.abs(P.veh.speed) / 42 : 0);
    updateHUD(dt);
    renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);
  window.__game = { P, enemies, houses, jets, boats, useVehicle, setForm, armorSet, selectWeapon, startReload, input: (o) => { if ('rmb' in o) rmb = o.rmb; if ('mouse' in o) { mouseDown = o.mouse; P.trig = o.mouse; } } };

  if (location.hash === '#test2') { $('start').style.display = 'none'; started = true; locked = true; }
  if (location.hash === '#test') { // automated smoke test: exercises every system, reports into #testout
    $('start').style.display = 'none'; started = true; locked = true;
    const steps = [
      () => { AudioSys.init(); mouseDown = true; },
      () => { selectWeapon(2); P.ammo[2] = 3; }, () => { rmb = true; }, () => {}, () => {}, () => {}, () => { rmb = false; selectWeapon(0); P.trig = true; }, () => { selectWeapon(1); P.trig = true; }, () => { selectWeapon(5); P.trig = true; }, () => selectWeapon(4),
      () => { selectWeapon(6); },
      () => startChant(),
      () => { P.charge = { t: 0.2, to: 1 }; },
      () => { keys.KeyF = true; keys.KeyX = true; },
      () => { setForm(3); setForm(5); rmb = true; },
      () => summonArmor(),
      () => { keys.Space = true; },
      () => { keys.KeyF = keys.KeyX = keys.Space = false; selectWeapon(8); },
      () => selectWeapon(9), () => selectWeapon(7),
      () => { P.third = true; placeWeapon(); selectWeapon(0); },
      () => { houses[0].hp = 1; damageHouse(houses[0], 5); enemies.slice(0, 10).forEach((e) => damageEnemy(e, 1e5)); },
      () => { P.pos.copy(jets[0].pos); useVehicle(); },
      () => { jets[0].thr = 1; jets[0].speed = 250; jets[0].pitch = 0.4; keys.Space = true; },
      () => { P.third = false; },
      () => { P.third = true; keys.Space = false; useVehicle(); },
      () => { P.pos.copy(boats[0].pos); P.vel.set(0, 0, 0); useVehicle(); keys.KeyW = true; },
      () => { P.third = false; },
      () => { useVehicle(); keys.KeyW = false; mouseDown = false; }
    ];
    let si = 0;
    const iv = setInterval(() => {
      try { if (si < steps.length) steps[si++](); } catch (e) { window.__errs.push('step ' + si + ': ' + e.message); }
      if (si >= steps.length) {
        clearInterval(iv);
        setTimeout(() => {
          const d = document.createElement('div'); d.id = 'testout';
          d.textContent = 'TESTDONE errs=' + JSON.stringify(window.__errs) + ' mode=' + P.mode + ' form=' + P.form + ' armor=' + P.armor + ' kills=' + P.kills + ' enemies=' + enemies.length + ' t=' + time.toFixed(1) + ' pos=' + [P.pos.x | 0, P.pos.y | 0, P.pos.z | 0];
          document.body.appendChild(d);
        }, 800);
      }
    }, 500);
  }
})();
