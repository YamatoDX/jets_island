'use strict';
/* First-person weapon models (forward = -Z, origin at the pistol grip) plus arms.
   Each model carries the data the handling code needs: muzzle, sight height, hand positions, magazine. */
function makeArm(left) {
  const g = new THREE.Group();
  const glove = std(0x17191c, { roughness: 0.85 }), sleeve = std(0x424b34, { roughness: 1 }), strap = std(0x0c0d0e, { roughness: 0.6 });
  box(0.078, 0.086, 0.11, glove, 0, 0, 0, g);                                   // fist
  box(0.03, 0.032, 0.075, glove, left ? 0.045 : -0.045, 0.03, -0.02, g);        // thumb
  for (let i = 0; i < 4; i++) box(0.082, 0.004, 0.004, strap, 0, 0.044, -0.04 + i * 0.026, g); // knuckle seams
  const fa = new THREE.Group(); g.add(fa);
  fa.lookAt(left ? new V3(-0.6, -0.42, 0.72) : new V3(0.22, -0.45, 0.9));
  zcyl(0.046, 0.046, 0.05, strap, 0, 0, 0.075, fa, 10);                          // cuff
  zcyl(0.062, 0.043, 0.66, sleeve, 0, 0, 0.42, fa, 10);                          // forearm
  if (left) box(0.034, 0.008, 0.04, glowMat(0x1a6f86), 0, 0.046, 0.13, fa);      // wrist-comm
  return g;
}

function makeGun(id) {
  const g = new THREE.Group();
  const blk = std(0x3d4048, { metalness: 0.15, roughness: 0.8 }), dk = std(0x22242a, { metalness: 0.1, roughness: 0.85 });
  const wood = std(0x8a4e26, { roughness: 0.9 }), steel = std(0xa8acb4, { metalness: 0.3, roughness: 0.6 });
  const olive = std(0x46553a, { roughness: 0.7, metalness: 0.2 }), brass = std(0xc89a30, { metalness: 0.3, roughness: 0.6 });
  const U = g.userData = { len: 0.4, sightY: 0.08, adsZ: -0.3, hip: new V3(0.19, -0.19, -0.36), rh: new V3(0, -0.05, 0.025), lh: null, mag: null, magPt: new V3(), magOut: new V3(0, -0.38, 0.05), bolt: null, slide: null, slideHome: 0, tiltDir: 1 };
  const muzzle = new THREE.Object3D(); g.add(muzzle); U.muzzle = muzzle;
  const grip = (m, w, h, d) => { const b = box(w || 0.03, h || 0.1, d || 0.042, m, 0, -0.045, 0.02, g); b.rotation.x = 0.28; return b; };
  const guard = () => { box(0.008, 0.006, 0.06, dk, 0, -0.03, -0.035, g); box(0.008, 0.03, 0.006, dk, 0, -0.016, -0.065, g); box(0.006, 0.02, 0.008, dk, 0, -0.012, -0.03, g); };
  const mag = new THREE.Group();
  switch (id) {
    case 'handgun': {
      box(0.03, 0.028, 0.17, dk, 0, 0.022, -0.07, g);
      const slide = new THREE.Group(); g.add(slide);
      box(0.034, 0.036, 0.2, blk, 0, 0.055, -0.075, slide);
      for (let i = 0; i < 5; i++) box(0.036, 0.03, 0.004, dk, 0, 0.055, 0.005 - i * 0.009, slide); // serrations
      box(0.006, 0.009, 0.006, dk, -0.011, 0.078, 0.015, slide); box(0.006, 0.009, 0.006, dk, 0.011, 0.078, 0.015, slide);
      box(0.005, 0.009, 0.006, glowMat(0xd8ffd0), 0, 0.078, -0.168, slide);
      zcyl(0.008, 0.008, 0.02, steel, 0, 0.055, -0.18, g, 8);
      grip(blk, 0.031, 0.115, 0.05); guard();
      const mm = box(0.022, 0.11, 0.036, steel, 0, -0.05, 0.022, mag); mm.rotation.x = 0.28; box(0.026, 0.012, 0.042, dk, 0, -0.105, 0.038, mag).rotation.x = 0.28;
      muzzle.position.set(0, 0.055, -0.19);
      Object.assign(U, { len: 0.2, sightY: 0.0815, adsZ: -0.36, hip: new V3(0.15, -0.16, -0.4), lh: new V3(-0.028, -0.07, 0.03), magPt: new V3(-0.02, -0.11, 0.04), magOut: new V3(0, -0.3, 0.08), bolt: new V3(-0.03, 0.07, 0.02), slide, slideHome: 0 });
      break;
    }
    case 'revolver': {
      box(0.03, 0.062, 0.1, steel, 0, 0.036, -0.02, g);
      zcyl(0.0125, 0.0125, 0.21, steel, 0, 0.06, -0.175, g, 10); box(0.014, 0.018, 0.2, steel, 0, 0.04, -0.17, g);
      box(0.005, 0.006, 0.19, dk, 0, 0.074, -0.17, g);
      const drum = zcyl(0.031, 0.031, 0.056, steel, 0, 0.046, -0.035, mag, 8);
      for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; zcyl(0.007, 0.007, 0.058, brass, Math.cos(a) * 0.019, 0.046 + Math.sin(a) * 0.019, -0.035, mag, 6); }
      void drum;
      box(0.008, 0.022, 0.014, dk, 0, 0.078, 0.028, g);
      box(0.004, 0.013, 0.012, glowMat(0xffb060), 0, 0.083, -0.27, g);
      box(0.005, 0.008, 0.006, dk, -0.008, 0.079, 0.012, g); box(0.005, 0.008, 0.006, dk, 0.008, 0.079, 0.012, g);
      grip(wood, 0.033, 0.115, 0.046); guard();
      muzzle.position.set(0, 0.06, -0.285);
      Object.assign(U, { len: 0.3, sightY: 0.0845, adsZ: -0.34, hip: new V3(0.15, -0.16, -0.4), lh: new V3(-0.028, -0.07, 0.03), magPt: new V3(-0.04, 0.04, -0.035), magOut: new V3(-0.06, -0.01, 0), tiltDir: -1 });
      break;
    }
    case 'ak': {
      box(0.04, 0.06, 0.3, blk, 0, 0.045, -0.08, g); box(0.036, 0.016, 0.24, dk, 0, 0.082, -0.08, g);
      box(0.043, 0.04, 0.2, wood, 0, 0.04, -0.34, g); box(0.034, 0.022, 0.16, wood, 0, 0.076, -0.33, g);
      zcyl(0.009, 0.009, 0.36, dk, 0, 0.05, -0.6, g, 8); zcyl(0.008, 0.008, 0.2, dk, 0, 0.079, -0.5, g, 8);
      zcyl(0.013, 0.011, 0.045, dk, 0, 0.05, -0.795, g, 8);
      box(0.012, 0.05, 0.02, dk, 0, 0.078, -0.7, g); box(0.004, 0.022, 0.004, dk, 0, 0.11, -0.7, g);
      box(0.003, 0.03, 0.012, dk, -0.011, 0.108, -0.7, g); box(0.003, 0.03, 0.012, dk, 0.011, 0.108, -0.7, g);
      box(0.022, 0.012, 0.05, dk, 0, 0.096, -0.2, g); box(0.006, 0.01, 0.006, dk, -0.008, 0.107, -0.18, g); box(0.006, 0.01, 0.006, dk, 0.008, 0.107, -0.18, g);
      const m1 = box(0.03, 0.12, 0.062, dk, 0, -0.055, -0.165, mag); m1.rotation.x = 0.2;
      const m2 = box(0.03, 0.11, 0.062, dk, 0, -0.15, -0.205, mag); m2.rotation.x = 0.55;
      const sk = box(0.036, 0.075, 0.27, wood, 0, 0.022, 0.21, g); sk.rotation.x = -0.1; box(0.038, 0.1, 0.02, dk, 0, 0.005, 0.345, g);
      const slide = new THREE.Group(); g.add(slide); box(0.022, 0.009, 0.014, steel, 0.03, 0.062, -0.1, slide);
      grip(wood); guard();
      muzzle.position.set(0, 0.05, -0.83);
      Object.assign(U, { len: 0.83, sightY: 0.113, adsZ: -0.25, hip: new V3(0.19, -0.2, -0.33), lh: new V3(0, -0.026, -0.34), magPt: new V3(0, -0.2, -0.2), magOut: new V3(0, -0.4, -0.06), bolt: new V3(0.03, 0.03, -0.09), slide });
      break;
    }
    case 'm416': {
      box(0.04, 0.05, 0.27, blk, 0, 0.06, -0.06, g); box(0.036, 0.042, 0.2, blk, 0, 0.02, -0.05, g);
      box(0.045, 0.05, 0.3, dk, 0, 0.058, -0.36, g);
      for (let i = 0; i < 6; i++) box(0.048, 0.01, 0.022, blk, 0, 0.058, -0.24 - i * 0.045, g);
      zcyl(0.009, 0.009, 0.2, dk, 0, 0.056, -0.6, g, 8); zcyl(0.013, 0.013, 0.07, dk, 0, 0.056, -0.725, g, 8);
      box(0.022, 0.008, 0.54, dk, 0, 0.089, -0.21, g);
      // red-dot sight
      box(0.032, 0.012, 0.07, dk, 0, 0.099, -0.1, g);
      box(0.004, 0.042, 0.06, dk, -0.021, 0.126, -0.1, g); box(0.004, 0.042, 0.06, dk, 0.021, 0.126, -0.1, g); box(0.046, 0.004, 0.06, dk, 0, 0.148, -0.1, g);
      box(0.038, 0.038, 0.002, new THREE.MeshBasicMaterial({ color: 0x66aaff, transparent: true, opacity: 0.08, depthWrite: false }), 0, 0.126, -0.1, g);
      ball(0.0022, glowMat(0xff2020), 0, 0.126, -0.1, g, 6);
      const mm = box(0.026, 0.17, 0.056, dk, 0, -0.085, -0.105, mag); mm.rotation.x = 0.12;
      zcyl(0.015, 0.015, 0.2, dk, 0, 0.056, 0.17, g, 8); box(0.034, 0.095, 0.1, blk, 0, 0.034, 0.27, g); box(0.036, 0.11, 0.014, dk, 0, 0.028, 0.325, g);
      const slide = new THREE.Group(); g.add(slide); box(0.046, 0.009, 0.014, steel, 0, 0.088, 0.07, slide);
      box(0.024, 0.075, 0.026, dk, 0, -0.005, -0.4, g);                           // foregrip
      grip(blk); guard();
      muzzle.position.set(0, 0.056, -0.77);
      Object.assign(U, { len: 0.77, sightY: 0.126, adsZ: -0.2, hip: new V3(0.19, -0.2, -0.32), lh: new V3(0, -0.03, -0.4), magPt: new V3(0, -0.17, -0.11), magOut: new V3(0, -0.4, 0.03), bolt: new V3(-0.02, 0.09, 0.07), slide });
      break;
    }
    case 'm249': {
      box(0.06, 0.08, 0.36, blk, 0, 0.05, -0.1, g); box(0.062, 0.022, 0.22, dk, 0, 0.1, -0.08, g);
      zcyl(0.014, 0.014, 0.44, dk, 0, 0.06, -0.55, g, 8); box(0.04, 0.02, 0.26, blk, 0, 0.086, -0.45, g);
      box(0.056, 0.046, 0.24, olive, 0, 0.03, -0.4, g); zcyl(0.016, 0.014, 0.05, dk, 0, 0.06, -0.79, g, 8);
      zcyl(0.006, 0.006, 0.3, dk, -0.022, 0.012, -0.6, g, 6); zcyl(0.006, 0.006, 0.3, dk, 0.022, 0.012, -0.6, g, 6); // folded bipod
      const ch = box(0.012, 0.012, 0.12, dk, 0.03, 0.135, -0.3, g); ch.rotation.y = 0.5; box(0.01, 0.03, 0.01, dk, 0.012, 0.115, -0.33, g);
      box(0.026, 0.014, 0.03, dk, 0, 0.118, -0.02, g); box(0.006, 0.012, 0.006, dk, -0.008, 0.131, -0.02, g); box(0.006, 0.012, 0.006, dk, 0.008, 0.131, -0.02, g);
      box(0.012, 0.07, 0.016, dk, 0, 0.1, -0.72, g); box(0.004, 0.016, 0.004, dk, 0, 0.134, -0.72, g);
      box(0.115, 0.115, 0.1, olive, -0.025, -0.055, -0.14, mag); box(0.118, 0.012, 0.102, dk, -0.025, 0.004, -0.14, mag);
      for (let i = 0; i < 5; i++) zcyl(0.006, 0.006, 0.05, brass, -0.06 + i * 0.013, 0.02 + i * 0.012, -0.14, mag, 6); // belt
      box(0.045, 0.08, 0.24, blk, 0, 0.035, 0.22, g); box(0.048, 0.11, 0.016, dk, 0, 0.03, 0.345, g);
      const slide = new THREE.Group(); g.add(slide); box(0.022, 0.012, 0.016, steel, 0.04, 0.05, -0.05, slide);
      grip(blk); guard();
      muzzle.position.set(0, 0.06, -0.83);
      Object.assign(U, { len: 0.83, sightY: 0.138, adsZ: -0.22, hip: new V3(0.2, -0.22, -0.3), lh: new V3(0, -0.04, -0.4), magPt: new V3(-0.03, -0.12, -0.14), magOut: new V3(-0.14, -0.36, 0), bolt: new V3(0.04, 0.02, -0.05), slide });
      break;
    }
    case 'rocket': {
      zcyl(0.046, 0.046, 0.9, olive, 0, 0.11, 0.05, g, 12); zcyl(0.046, 0.06, 0.07, dk, 0, 0.11, -0.42, g, 12);
      zcyl(0.085, 0.046, 0.16, dk, 0, 0.11, 0.56, g, 12); box(0.06, 0.07, 0.2, wood, 0, 0.11, 0.12, g);
      zcyl(0.034, 0.034, 0.16, olive, 0, 0.11, -0.5, mag, 10);
      const wh = cone(0.05, 0.16, std(0x7a8a4a, { roughness: 0.5 }), 0, 0.11, -0.64, mag, 10); wh.rotation.x = -Math.PI / 2;
      zcyl(0.034, 0.05, 0.05, std(0x7a8a4a), 0, 0.11, -0.565, mag, 10);
      box(0.012, 0.03, 0.012, dk, 0, 0.17, 0, g); box(0.004, 0.014, 0.004, dk, -0.006, 0.19, 0, g); box(0.004, 0.014, 0.004, dk, 0.006, 0.19, 0, g);
      box(0.012, 0.035, 0.012, dk, 0, 0.172, -0.3, g); box(0.004, 0.012, 0.004, glowMat(0xffb060), 0, 0.195, -0.3, g);
      box(0.026, 0.09, 0.03, dk, 0, 0.02, -0.22, g);
      grip(dk); guard();
      muzzle.position.set(0, 0.11, -0.74);
      Object.assign(U, { len: 0.74, sightY: 0.196, adsZ: -0.2, hip: new V3(0.2, -0.26, -0.3), lh: new V3(0, -0.01, -0.22), magPt: new V3(0, 0.06, -0.5), magOut: new V3(-0.05, -0.42, 0.1) });
      break;
    }
    case 'sword': {
      const piv = new THREE.Group(); g.add(piv);
      const gold = std(0xc8a030, { metalness: 0.7, roughness: 0.3 });
      cyl(0.02, 0.022, 0.2, std(0x2a1c12), 0, 0, 0, piv, 8); ball(0.032, gold, 0, -0.11, 0, piv, 8);
      box(0.26, 0.035, 0.045, gold, 0, 0.11, 0, piv);
      const c1 = box(0.035, 0.09, 0.04, gold, -0.13, 0.14, 0, piv); c1.rotation.z = 0.5; const c2 = box(0.035, 0.09, 0.04, gold, 0.13, 0.14, 0, piv); c2.rotation.z = -0.5;
      const gemM = new THREE.MeshStandardMaterial({ color: 0x103060, emissive: 0x2a8cff, emissiveIntensity: 1.5 });
      ball(0.03, gemM, 0, 0.11, 0.03, piv, 8); ball(0.03, gemM, 0, 0.11, -0.03, piv, 8);
      const bladeM = new THREE.MeshStandardMaterial({ color: 0xdfe6f0, metalness: 0.8, roughness: 0.2, emissive: 0x000000 });
      const blade = new THREE.Group(); blade.position.y = 0.13; piv.add(blade);
      box(0.055, 0.5, 0.012, bladeM, 0, 0.25, 0, blade); box(0.012, 0.46, 0.016, steel, 0, 0.24, 0, blade);
      const tp = cone(0.039, 0.12, bladeM, 0, 0.56, 0, blade, 4); tp.scale.z = 0.3; tp.rotation.y = Math.PI / 4;
      piv.rotation.set(-0.5, 0, -0.25);
      blade.add(muzzle); muzzle.position.set(0, 0.6, 0);
      Object.assign(U, { piv, blade, bladeM, gemM, len: 0.5, hip: new V3(0.3, -0.34, -0.5), rh: new V3(0, 0, 0) });
      break;
    }
    default: { // armour gauntlet (is its own arm)
      const arm = std(0x5a6672, { metalness: 0.6, roughness: 0.3 }), cy = glowMat(0x4fe8ff);
      const n = new THREE.Group(); n.rotation.x = 0.22; g.add(n);
      box(0.1, 0.1, 0.5, arm, 0, 0, 0.14, n); box(0.11, 0.05, 0.14, arm, 0, 0.01, -0.18, n); box(0.12, 0.03, 0.2, std(0x2a3038, { metalness: 0.6, roughness: 0.4 }), 0, 0.05, 0.2, n);
      zcyl(0.035, 0.035, 0.02, cy, 0, -0.01, -0.26, n, 10); box(0.03, 0.012, 0.2, cy, 0, 0.068, 0.2, n);
      n.add(muzzle); muzzle.position.set(0, -0.01, -0.28);
      Object.assign(U, { len: 0.35, hip: new V3(0.24, -0.22, -0.42), rh: null });
    }
  }
  if (mag.children.length) { g.add(mag); U.mag = mag; }
  return g;
}
