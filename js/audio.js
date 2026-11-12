'use strict';
/* Procedural audio: a slow horror score (organ, choir, music box, heartbeat, danger strings),
   night ambience and all sound effects. WebAudio only, no files. */
const AudioSys = (() => {
  let ctx = null, master, sfx, scoreBus, ambBus, verb, noiseBuf, jetG, jetF, boatG, boatO;
  let mode = 0, step = 0, chord = 0, nextT = 0, hb = 0, danger = 0, tensionG, ostG;
  const MODES = ['Scary score', 'Ambience only', 'Music off'];
  const D2 = 73.42, STEP = 0.25, BAR = 32;
  const st = (n) => Math.pow(2, n / 12);

  // D-minor dread: chord voicings (semitones from D2) and a music-box figure (semitones from D5)
  const CH = [
    { n: [0, 12, 15, 19, 24], m: [0, 3, 7, 3, 12, 7] },      // Dm
    { n: [0, 12, 15, 18, 21], m: [0, 3, 6, 3, 9, 6] },       // D dim
    { n: [-7, 5, 8, 12, 17], m: [5, 8, 12, 8, 17, 12] },     // Gm
    { n: [-5, 7, 11, 14, 20], m: [7, 11, 14, 11, 8, 7] },    // A7 b9
    { n: [0, 12, 15, 19, 24], m: [12, 7, 3, 7, 0, 3] },      // Dm
    { n: [-4, 8, 12, 15, 20], m: [8, 12, 15, 12, 20, 15] },  // Bb
    { n: [2, 14, 17, 20, 23], m: [2, 5, 8, 5, 11, 8] },      // E dim
    { n: [-5, 7, 11, 14, 19], m: [7, 2, -1, 2, -5, -1] }     // A
  ];
  const OST = [0, 0, 1, 0, 0, 0, 3, 1];

  function init() {
    if (ctx) { ctx.resume(); return; }
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp); comp.connect(ctx.destination);
    sfx = ctx.createGain(); sfx.gain.value = 0.9; sfx.connect(master);

    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

    // cathedral reverb
    const len = Math.floor(ctx.sampleRate * 3.6), ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const b = ir.getChannelData(c); for (let i = 0; i < len; i++) b[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6); }
    verb = ctx.createConvolver(); verb.buffer = ir;
    const wet = ctx.createGain(); wet.gain.value = 0.55; verb.connect(wet); wet.connect(master);
    scoreBus = ctx.createGain(); scoreBus.connect(master); scoreBus.connect(verb);
    ambBus = ctx.createGain(); ambBus.connect(master); ambBus.connect(verb);
    const sv = ctx.createGain(); sv.gain.value = 0.12; sfx.connect(sv); sv.connect(verb);

    buildAmbience(); buildTension(); buildEngines();
    setMode(0);
    nextT = ctx.currentTime + 0.4;
    setInterval(schedule, 60);
    setTimeout(randomEvent, 6000);
  }

  // ---------- low level voices ----------
  function env(g, t, a, peak, dur) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + dur);
  }
  function noise(t, dur, type, f0, f1, vol, out, q, attack) {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q || 0.8;
    f.frequency.setValueAtTime(f0, t);
    if (f1) f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain(); env(g, t, attack || 0.003, vol, dur);
    s.connect(f); f.connect(g); g.connect(out || sfx);
    s.start(t, Math.random()); s.stop(t + dur + (attack || 0) + 0.05);
  }
  function tone(t, dur, type, f0, f1, vol, out, attack) {
    const o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(10, f1), t + dur);
    const g = ctx.createGain(); env(g, t, attack || 0.004, vol, dur);
    o.connect(g); g.connect(out || sfx);
    o.start(t); o.stop(t + dur + (attack || 0) + 0.05);
    return o;
  }
  function slowGain(t, attack, hold, release, peak, out) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.setValueAtTime(peak, t + attack + hold); g.gain.linearRampToValueAtTime(0, t + attack + hold + release);
    g.connect(out); return g;
  }

  // ---------- score instruments ----------
  function organ(t, semis, dur) {
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1500;
    const g = slowGain(t, 1.6, dur - 1.6, 2.6, 0.05, scoreBus); lp.connect(g);
    semis.forEach((s, i) => {
      const f = D2 * st(s);
      [1, 2, 3, 4, 6].forEach((p, k) => {
        const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f * p; o.detune.value = (Math.random() - 0.5) * 9;
        const og = ctx.createGain(); og.gain.value = (i === 0 ? 1.4 : 0.7) / (1 + k * 1.3);
        o.connect(og); og.connect(lp); o.start(t); o.stop(t + dur + 3);
      });
    });
  }
  function choir(t, semis, dur) {
    const g = slowGain(t, 2.8, dur - 2.8, 3, 0.05, scoreBus);
    const f1 = ctx.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = 640; f1.Q.value = 5;
    const f2 = ctx.createBiquadFilter(); f2.type = 'bandpass'; f2.frequency.value = 1090; f2.Q.value = 7;
    f1.connect(g); f2.connect(g);
    for (const s of semis) for (const dt of [-9, 8]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = D2 * 2 * st(s); o.detune.value = dt;
      const l = ctx.createOscillator(); l.frequency.value = 4.6 + Math.random(); const lg = ctx.createGain(); lg.gain.value = 3.5;
      l.connect(lg); lg.connect(o.frequency);
      o.connect(f1); o.connect(f2); o.start(t); l.start(t); o.stop(t + dur + 3.2); l.stop(t + dur + 3.2);
    }
  }
  function musicBox(t, semi) {
    const f = D2 * 8 * st(semi) * st((Math.random() - 0.5) * 0.3);
    tone(t, 2.2, 'sine', f, 0, 0.075, scoreBus, 0.002);
    tone(t, 0.9, 'sine', f * 3.01, 0, 0.022, scoreBus, 0.002);
    tone(t, 0.4, 'sine', f * 5.04, 0, 0.01, scoreBus, 0.002);
  }
  function heartbeat(t, v) {
    tone(t, 0.16, 'sine', 62, 38, 0.55 * v, scoreBus); tone(t + 0.19, 0.2, 'sine', 54, 32, 0.4 * v, scoreBus);
  }
  function celloStab(t, semi, v) {
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = D2 * st(semi);
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 520;
    const g = ctx.createGain(); env(g, t, 0.012, 0.3 * v, 0.2);
    o.connect(f); f.connect(g); g.connect(scoreBus); o.start(t); o.stop(t + 0.3);
  }
  function timpani(t, v) { tone(t, 0.9, 'sine', 82, 55, 0.6 * v, scoreBus); noise(t, 0.12, 'lowpass', 400, 0, 0.3 * v, scoreBus); }

  function schedule() {
    if (!ctx) return;
    while (nextT < ctx.currentTime + 0.3) {
      if (mode === 0) playStep(nextT);
      nextT += STEP; step++;
      if (step >= BAR) { step = 0; chord = (chord + 1) % CH.length; }
    }
  }
  function playStep(t) {
    const C = CH[chord], s = step;
    if (s === 0) { organ(t, C.n, BAR * STEP); choir(t, [C.n[1], C.n[3]], BAR * STEP); }
    // creepy music box: one note a second, drifting slightly out of time
    if (s % 4 === 0 && s / 4 < 6 && (chord % 2 === 1 || s < 12)) musicBox(t + Math.random() * 0.03, C.m[s / 4]);
    if (s === 28 && chord % 4 === 3) noise(t, 1.0, 'bandpass', 300, 2400, 0.1, scoreBus, 3, 0.9); // reverse swell into the turnaround
    hb += STEP;
    const period = 1.4 - danger * 0.8;
    if (hb >= period) { hb = 0; heartbeat(t, 0.5 + danger * 0.5); }
    if (danger > 0.08) {
      celloStab(t, OST[s % 8] + (C.n[0] < 0 ? C.n[0] + 12 : C.n[0]), danger);
      if (s % 8 === 0) timpani(t, danger);
      if (danger > 0.6 && s % 8 === 6) timpani(t, danger * 0.6);
    }
  }
  function buildTension() { // shrieking tremolo strings that rise with danger
    tensionG = ctx.createGain(); tensionG.gain.value = 0;
    const trem = ctx.createGain(); trem.gain.value = 0.6;
    const l = ctx.createOscillator(); l.frequency.value = 9.5; const lg = ctx.createGain(); lg.gain.value = 0.4; l.connect(lg); lg.connect(trem.gain); l.start();
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3200;
    for (const f of [1108.7, 1174.7, 1568, 1661.2]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = (Math.random() - 0.5) * 20; o.connect(lp); o.start(); }
    lp.connect(trem); trem.connect(tensionG); tensionG.connect(scoreBus);
  }

  // ---------- night ambience ----------
  function buildAmbience() {
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 150;
    const dg = ctx.createGain(); dg.gain.value = 0.3;
    for (const f of [36.7, 37.1, 55, 73.9]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.connect(lp); o.start(); }
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.06;
    const lg = ctx.createGain(); lg.gain.value = 60; lfo.connect(lg); lg.connect(lp.frequency); lfo.start();
    lp.connect(dg); dg.connect(ambBus);
    const w = ctx.createBufferSource(); w.buffer = noiseBuf; w.loop = true; // wind
    const wf = ctx.createBiquadFilter(); wf.type = 'bandpass'; wf.frequency.value = 420; wf.Q.value = 1.8;
    const wl = ctx.createOscillator(); wl.frequency.value = 0.11;
    const wlg = ctx.createGain(); wlg.gain.value = 280; wl.connect(wlg); wlg.connect(wf.frequency);
    const wg = ctx.createGain(); wg.gain.value = 0.1;
    w.connect(wf); wf.connect(wg); wg.connect(ambBus); w.start(); wl.start();
  }
  function randomEvent() {
    if (ctx && mode < 2) {
      const t = ctx.currentTime + 0.05, r = Math.random();
      if (r < 0.25) { for (const m of [1, 2.01, 2.76, 5.4]) tone(t, 5, 'sine', 98 * m, 0, 0.1 / m, ambBus, 0.005); }           // funeral bell
      else if (r < 0.45) { noise(t, 1.8, 'bandpass', 2600, 900, 0.06, ambBus, 7, 0.4); noise(t + 0.7, 1.5, 'bandpass', 1300, 3300, 0.05, ambBus, 9, 0.3); } // whispers
      else if (r < 0.65) { // distant wail
        const o = tone(t, 3, 'sine', 560, 290, 0.05, ambBus, 0.8);
        const l = ctx.createOscillator(); l.frequency.value = 6; const g = ctx.createGain(); g.gain.value = 16; l.connect(g); g.connect(o.frequency); l.start(t); l.stop(t + 4);
      } else if (r < 0.8) { for (const f of [932, 988, 1397, 1480]) tone(t, 3.5, 'sawtooth', f, f * 1.03, 0.012, ambBus, 2.4); }  // string cluster swell
      else if (r < 0.9) { for (let i = 0; i < 5; i++) tone(t + i * 0.5 + Math.random() * 0.1, 0.5, 'triangle', 180 - i * 14, 150 - i * 14, 0.06, ambBus, 0.01); } // slow knocking
      else { tone(t, 4, 'sine', 43, 39, 0.3, ambBus, 1.5); noise(t, 3.5, 'lowpass', 120, 60, 0.3, ambBus, 1, 1.5); }              // sub rumble
    }
    setTimeout(randomEvent, 6000 + Math.random() * 10000);
  }

  // ---------- engines ----------
  function buildEngines() {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    jetF = ctx.createBiquadFilter(); jetF.type = 'bandpass'; jetF.frequency.value = 500; jetF.Q.value = 0.7;
    jetG = ctx.createGain(); jetG.gain.value = 0;
    s.connect(jetF); jetF.connect(jetG); jetG.connect(sfx); s.start();
    boatO = ctx.createOscillator(); boatO.type = 'sawtooth'; boatO.frequency.value = 45;
    const bf = ctx.createBiquadFilter(); bf.type = 'lowpass'; bf.frequency.value = 260;
    boatG = ctx.createGain(); boatG.gain.value = 0;
    boatO.connect(bf); bf.connect(boatG); boatG.connect(sfx); boatO.start();
  }
  function engines(jetOn, thr, boatOn, bspd) {
    if (!ctx) return;
    const t = ctx.currentTime;
    jetG.gain.setTargetAtTime(jetOn ? 0.1 + thr * 0.22 : 0, t, 0.15);
    jetF.frequency.setTargetAtTime(350 + thr * 1500, t, 0.2);
    boatG.gain.setTargetAtTime(boatOn ? 0.1 + bspd * 0.12 : 0, t, 0.15);
    boatO.frequency.setTargetAtTime(38 + bspd * 60, t, 0.2);
  }
  function setMode(m) {
    mode = m;
    if (!ctx) return;
    const t = ctx.currentTime;
    scoreBus.gain.setTargetAtTime(m === 0 ? 0.9 : 0, t, 0.5);
    ambBus.gain.setTargetAtTime(m < 2 ? 1 : 0, t, 0.5);
  }
  function setDanger(v) {
    danger += (v - danger) * 0.15;
    if (ctx) tensionG.gain.setTargetAtTime(Math.max(0, danger - 0.35) * 0.05, ctx.currentTime, 0.6);
  }

  // ---------- sound effects ----------
  const FX = {
    pistol: (t, v) => { noise(t, 0.12, 'lowpass', 3800, 500, 0.55 * v); tone(t, 0.07, 'square', 220, 70, 0.25 * v); },
    revolver: (t, v) => { noise(t, 0.3, 'lowpass', 3000, 250, 0.8 * v); tone(t, 0.14, 'square', 150, 45, 0.45 * v); },
    rifle: (t, v) => { noise(t, 0.13, 'lowpass', 3000, 400, 0.55 * v); tone(t, 0.06, 'square', 170, 60, 0.3 * v); },
    rifle2: (t, v) => { noise(t, 0.1, 'bandpass', 2400, 700, 0.6 * v); tone(t, 0.05, 'square', 240, 80, 0.22 * v); },
    mg: (t, v) => { noise(t, 0.11, 'lowpass', 2600, 300, 0.6 * v); tone(t, 0.06, 'sawtooth', 130, 50, 0.3 * v); },
    rocket: (t, v) => { noise(t, 0.7, 'bandpass', 500, 2600, 0.5 * v, null, 1.5); tone(t, 0.3, 'sawtooth', 90, 40, 0.3 * v); },
    magout: (t, v) => { noise(t, 0.05, 'highpass', 2200, 0, 0.3 * v); tone(t, 0.05, 'square', 520, 300, 0.1 * v); noise(t + 0.09, 0.08, 'bandpass', 900, 500, 0.15 * v, null, 2); },
    magin: (t, v) => { noise(t, 0.04, 'highpass', 1800, 0, 0.35 * v); tone(t, 0.06, 'square', 300, 180, 0.16 * v); tone(t + 0.05, 0.04, 'square', 760, 500, 0.1 * v); },
    bolt: (t, v) => { noise(t, 0.05, 'highpass', 2600, 0, 0.3 * v); tone(t, 0.04, 'square', 900, 500, 0.1 * v); noise(t + 0.12, 0.06, 'highpass', 2000, 0, 0.4 * v); tone(t + 0.12, 0.05, 'square', 420, 240, 0.16 * v); },
    empty: (t, v) => { noise(t, 0.03, 'highpass', 3000, 0, 0.25 * v); tone(t, 0.03, 'square', 1200, 800, 0.08 * v); },
    hit: (t, v) => { tone(t, 0.05, 'square', 1900, 1500, 0.07 * v); },
    head: (t, v) => { tone(t, 0.12, 'sine', 2400, 1800, 0.14 * v); tone(t, 0.06, 'square', 1200, 900, 0.07 * v); },
    explosion: (t, v) => { noise(t, 1.4, 'lowpass', 900, 40, 1.1 * v); tone(t, 0.9, 'sine', 95, 28, 0.9 * v); },
    thunder: (t, v) => { noise(t, 0.25, 'highpass', 1800, 0, 0.6 * v); noise(t + 0.05, 3.2, 'lowpass', 500, 50, 1.0 * v); noise(t + 0.6, 2.5, 'lowpass', 180, 40, 0.7 * v); },
    zap: (t, v) => { noise(t, 0.18, 'highpass', 3000, 0, 0.35 * v); tone(t, 0.2, 'sawtooth', 1400, 180, 0.2 * v); },
    laser: (t, v) => { tone(t, 0.16, 'sawtooth', 1500, 240, 0.22 * v); tone(t, 0.16, 'sine', 2400, 500, 0.15 * v); },
    beam: (t, v) => { tone(t, 0.9, 'sawtooth', 110, 420, 0.4 * v); noise(t, 0.9, 'bandpass', 900, 3200, 0.4 * v, null, 2); },
    ki: (t, v) => { tone(t, 0.25, 'sine', 700, 1700, 0.25 * v); noise(t, 0.2, 'bandpass', 1800, 600, 0.2 * v, null, 3); },
    swing: (t, v) => noise(t, 0.2, 'bandpass', 700, 3500, 0.4 * v, null, 2.5),
    growl: (t, v) => {
      const o = tone(t, 0.6, 'sawtooth', 85, 48, 0.4 * v, null, 0.05);
      const l = ctx.createOscillator(); l.frequency.value = 28; const g = ctx.createGain(); g.gain.value = 22;
      l.connect(g); g.connect(o.frequency); l.start(t); l.stop(t + 0.8);
      noise(t, 0.5, 'bandpass', 500, 250, 0.2 * v, null, 2);
    },
    wail: (t, v) => { tone(t, 0.9, 'sine', 780, 320, 0.16 * v, null, 0.1); tone(t, 0.9, 'sine', 795, 300, 0.1 * v, null, 0.1); },
    shriek: (t, v) => { tone(t, 0.35, 'sawtooth', 900, 1500, 0.14 * v, null, 0.03); noise(t, 0.3, 'bandpass', 3000, 2000, 0.15 * v, null, 4); },
    powerup: (t, v) => {
      tone(t, 1.6, 'sawtooth', 70, 620, 0.35 * v, null, 0.5); tone(t, 1.6, 'square', 105, 930, 0.15 * v, null, 0.5);
      noise(t, 1.8, 'bandpass', 300, 5000, 0.5 * v, null, 1.2); noise(t + 1.2, 1.2, 'lowpass', 1200, 60, 0.9 * v);
    },
    armor: (t, v) => {
      for (let i = 0; i < 6; i++) { tone(t + i * 0.16, 0.1, 'square', 300 + i * 120, 200 + i * 100, 0.2 * v); noise(t + i * 0.16, 0.08, 'highpass', 3000, 0, 0.3 * v); }
      tone(t + 1.0, 0.8, 'sine', 200, 1200, 0.3 * v, null, 0.3);
    },
    beep: (t, v) => { tone(t, 0.08, 'square', 1250, 0, 0.14 * v); tone(t + 0.11, 0.08, 'square', 1650, 0, 0.14 * v); },
    collapse: (t, v) => { noise(t, 2.2, 'lowpass', 700, 50, 1.0 * v); tone(t, 1.4, 'sine', 70, 25, 0.8 * v); },
    splash: (t, v) => noise(t, 0.5, 'bandpass', 1200, 400, 0.4 * v, null, 0.7)
  };
  function play(name, vol) {
    if (!ctx || !FX[name]) return;
    const v = vol === undefined ? 1 : vol;
    if (v < 0.02) return;
    try { FX[name](ctx.currentTime + 0.001, v); } catch (e) { /* ignore */ }
  }
  return { init, play, engines, setDanger, cycleMode() { setMode((mode + 1) % 3); return MODES[mode]; } };
})();
