/*
 * Collapse Factor - procedural audio (music + sound effects)
 * Copyright (C) 2026 Shawn Rapaz. Licensed under the GNU GPL v3.0.
 *
 * Everything is synthesised live with the Web Audio API: a calm, ambient
 * generative soundtrack and physically-flavoured effects for each material.
 */
(function (G) {
  'use strict';
  const CF = G.CF = G.CF || {};

  let ctx = null, master, musicBus, sfxBus, reverb, reverbSend, delay, delayFb, comp;
  let noiseBuf = null, brownBuf = null;
  let musicOn = true, sfxOn = true, musicStarted = false;
  let windNodes = null, engineNodes = null, ambNodes = null;
  let schedTimer = null;
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

  function init() {
    if (ctx) return;
    const AC = G.AudioContext || G.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 12; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.25;
    master = ctx.createGain(); master.gain.value = 0.9;
    master.connect(comp); comp.connect(ctx.destination);
    musicBus = ctx.createGain(); musicBus.gain.value = musicOn ? 0.34 : 0; musicBus.connect(master);
    sfxBus = ctx.createGain(); sfxBus.gain.value = sfxOn ? 0.85 : 0; sfxBus.connect(master);
    // reverb (generated impulse response)
    reverb = ctx.createConvolver();
    reverb.buffer = makeImpulse(4.2, 2.6);
    reverbSend = ctx.createGain(); reverbSend.gain.value = 1;
    reverbSend.connect(reverb); reverb.connect(master);
    // dotted-eighth style delay for plucks
    delay = ctx.createDelay(2); delay.delayTime.value = 0.69;
    delayFb = ctx.createGain(); delayFb.gain.value = 0.33;
    const delayLp = ctx.createBiquadFilter(); delayLp.type = 'lowpass'; delayLp.frequency.value = 2400;
    delay.connect(delayLp); delayLp.connect(delayFb); delayFb.connect(delay);
    const delayOut = ctx.createGain(); delayOut.gain.value = 0.5;
    delayLp.connect(delayOut); delayOut.connect(musicBus); delayOut.connect(reverbSend);
    // noise buffers
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    brownBuf = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
    const b = brownBuf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < b.length; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; b[i] = last * 3.5; }
  }

  function makeImpulse(seconds, decay) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const ch = buf.getChannelData(c);
      for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  function resume() { init(); if (ctx && ctx.state === 'suspended') ctx.resume(); }

  // -------------------------------------------------------------------
  // generative ambient music
  // -------------------------------------------------------------------
  const PROGRESSIONS = [
    // [bass midi, chord voicing midi...]
    [[38, 62, 66, 69, 73, 76], [35, 62, 66, 69, 71, 74], [31, 62, 66, 67, 71, 74], [33, 61, 64, 69, 71, 76]],
    [[41, 64, 69, 72, 76, 79], [38, 62, 65, 69, 72, 76], [34, 62, 65, 69, 70, 74], [36, 60, 64, 67, 70, 74]],
    [[36, 64, 67, 71, 74, 79], [40, 64, 67, 71, 74, 76], [33, 60, 64, 67, 71, 76], [41, 60, 65, 69, 72, 76]]
  ];
  let prog = PROGRESSIONS[0], chordIdx = 0, nextChordT = 0, nextNoteT = 0, chordLen = 7.2, mood = 'calm';

  function startMusic() {
    init();
    if (!ctx || musicStarted) return;
    musicStarted = true;
    prog = PROGRESSIONS[Math.floor(Math.random() * PROGRESSIONS.length)];
    nextChordT = ctx.currentTime + 0.3;
    nextNoteT = nextChordT + 2;
    schedTimer = setInterval(schedule, 250);
  }
  function setMood(m) { mood = m; }

  function schedule() {
    if (!ctx || !musicOn) return;
    const ahead = ctx.currentTime + 1.2;
    while (nextChordT < ahead) {
      const ch = prog[chordIdx % prog.length];
      playChord(ch, nextChordT, chordLen);
      chordIdx++;
      if (chordIdx % (prog.length * 4) === 0) prog = PROGRESSIONS[Math.floor(Math.random() * PROGRESSIONS.length)];
      nextChordT += chordLen;
    }
    while (nextNoteT < ahead) {
      const ch = prog[(chordIdx + prog.length - 1) % prog.length];
      const busy = mood === 'build' ? 0.42 : mood === 'test' ? 0.22 : 0.32;
      if (Math.random() < busy) {
        const scale = ch.slice(1).concat(ch.slice(1).map((n) => n + 12));
        const note = scale[Math.floor(Math.random() * scale.length)] + (Math.random() < 0.25 ? 12 : 0);
        pluck(mtof(note), nextNoteT, 0.06 + Math.random() * 0.05);
      }
      if (Math.random() < 0.05) bell(mtof(ch[1] + 24 + (Math.random() < 0.5 ? 7 : 0)), nextNoteT);
      nextNoteT += 0.6 * (Math.random() < 0.3 ? 2 : 1);
    }
  }

  function playChord(ch, t, len) {
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass'; filt.Q.value = 0.6;
    filt.frequency.setValueAtTime(500, t);
    filt.frequency.linearRampToValueAtTime(1500 + Math.random() * 600, t + len * 0.5);
    filt.frequency.linearRampToValueAtTime(600, t + len + 3);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.11, t + 2.6);
    g.gain.setValueAtTime(0.11, t + len - 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len + 3.2);
    filt.connect(g); g.connect(musicBus);
    const send = ctx.createGain(); send.gain.value = 0.9; g.connect(send); send.connect(reverbSend);
    ch.slice(1).forEach((m, i) => {
      for (const det of [-7, 7]) {
        const o = ctx.createOscillator();
        o.type = i % 2 ? 'triangle' : 'sine';
        o.frequency.value = mtof(m);
        o.detune.value = det + (Math.random() - 0.5) * 4;
        const og = ctx.createGain(); og.gain.value = 0.16;
        o.connect(og); og.connect(filt);
        o.start(t); o.stop(t + len + 3.4);
      }
    });
    // bass
    const bo = ctx.createOscillator(); bo.type = 'sine'; bo.frequency.value = mtof(ch[0]);
    const bg = ctx.createGain();
    bg.gain.setValueAtTime(0.0001, t);
    bg.gain.linearRampToValueAtTime(0.16, t + 1.5);
    bg.gain.setValueAtTime(0.16, t + len - 0.5);
    bg.gain.exponentialRampToValueAtTime(0.0001, t + len + 1.5);
    bo.connect(bg); bg.connect(musicBus);
    bo.start(t); bo.stop(t + len + 1.6);
  }

  function pluck(freq, t, vol) {
    const o = ctx.createOscillator(), o2 = ctx.createOscillator();
    o.type = 'sine'; o2.type = 'triangle';
    o.frequency.value = freq; o2.frequency.value = freq * 2.001;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);
    const g2 = ctx.createGain(); g2.gain.value = 0.25;
    o.connect(g); o2.connect(g2); g2.connect(g);
    g.connect(musicBus); g.connect(delay);
    const s = ctx.createGain(); s.gain.value = 0.6; g.connect(s); s.connect(reverbSend);
    o.start(t); o2.start(t); o.stop(t + 2.3); o2.stop(t + 2.3);
  }

  function bell(freq, t) {
    [1, 2.76, 5.4].forEach((r, i) => {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = freq * r;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.03 / (i + 1), t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 4 / (i + 1));
      o.connect(g); g.connect(reverbSend); g.connect(musicBus);
      o.start(t); o.stop(t + 4.2);
    });
  }

  function setMusic(on) {
    musicOn = on;
    if (!ctx) return;
    musicBus.gain.cancelScheduledValues(ctx.currentTime);
    musicBus.gain.setTargetAtTime(on ? 0.34 : 0, ctx.currentTime, 0.4);
    if (on) { startMusic(); nextChordT = Math.max(nextChordT, ctx.currentTime + 0.1); nextNoteT = Math.max(nextNoteT, ctx.currentTime + 0.5); }
  }
  function setSfx(on) {
    sfxOn = on;
    if (!ctx) return;
    sfxBus.gain.setTargetAtTime(on ? 0.85 : 0, ctx.currentTime, 0.05);
  }

  // -------------------------------------------------------------------
  // effect helpers
  // -------------------------------------------------------------------
  function noise(t, dur, { type = 'bandpass', freq = 1000, q = 1, vol = 0.3, attack = 0.005, freqEnd = null, brown = false, rev = 0.2, pan = 0 } = {}) {
    const src = ctx.createBufferSource();
    src.buffer = brown ? brownBuf : noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let out = g;
    if (pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); out = p; }
    src.connect(f); f.connect(g); out.connect(sfxBus);
    if (rev) { const s = ctx.createGain(); s.gain.value = rev; out.connect(s); s.connect(reverbSend); }
    src.start(t, Math.random() * 1.5); src.stop(t + dur + 0.05);
  }
  function tone(t, freq, dur, { type = 'sine', vol = 0.2, attack = 0.005, freqEnd = null, rev = 0.2, pan = 0 } = {}) {
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let out = g;
    if (pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); out = p; }
    o.connect(g); out.connect(sfxBus);
    if (rev) { const s = ctx.createGain(); s.gain.value = rev; out.connect(s); s.connect(reverbSend); }
    o.start(t); o.stop(t + dur + 0.05);
  }
  const ok = () => ctx && sfxOn;
  const now = () => ctx.currentTime;

  const SFX = {
    click() { if (!ok()) return; const t = now(); tone(t, 880, 0.08, { vol: 0.12, type: 'triangle', freqEnd: 1320, rev: 0.1 }); },
    hover() { if (!ok()) return; tone(now(), 1500, 0.04, { vol: 0.03, rev: 0 }); },
    toggle() { if (!ok()) return; const t = now(); tone(t, 660, 0.07, { vol: 0.1, type: 'triangle' }); tone(t + 0.06, 990, 0.09, { vol: 0.1, type: 'triangle' }); },
    error() { if (!ok()) return; const t = now(); tone(t, 220, 0.14, { vol: 0.12, type: 'square', rev: 0.05 }); tone(t + 0.1, 196, 0.16, { vol: 0.1, type: 'square', rev: 0.05 }); },
    place(mat, kind) {
      if (!ok()) return; const t = now();
      if (mat === 'wood') { tone(t, 180, 0.12, { vol: 0.35, freqEnd: 90 }); noise(t, 0.06, { freq: 2200, q: 3, vol: 0.2 }); }
      else if (mat === 'steel') {
        if (kind === 'cable') { tone(t, 1250, 0.25, { vol: 0.08, type: 'triangle', freqEnd: 1180 }); noise(t, 0.05, { freq: 5000, q: 2, vol: 0.08 }); }
        else { tone(t, 620, 0.45, { vol: 0.12, type: 'triangle' }); tone(t, 1563, 0.3, { vol: 0.05 }); noise(t, 0.04, { freq: 4000, q: 2, vol: 0.15 }); }
      } else { tone(t, 90, 0.2, { vol: 0.45, freqEnd: 50 }); noise(t, 0.15, { freq: 600, q: 0.8, vol: 0.18, type: 'lowpass' }); }
    },
    remove() { if (!ok()) return; const t = now(); tone(t, 500, 0.12, { vol: 0.12, freqEnd: 200, type: 'triangle' }); noise(t, 0.1, { freq: 1500, vol: 0.06, freqEnd: 400 }); },
    tick(urgent) { if (!ok()) return; tone(now(), urgent ? 1400 : 1000, 0.05, { vol: urgent ? 0.12 : 0.06, rev: 0 }); },
    testStart() {
      if (!ok()) return; const t = now();
      noise(t, 0.9, { freq: 300, freqEnd: 3000, q: 1.2, vol: 0.18, attack: 0.5 });
      [523.25, 659.25, 783.99].forEach((f, i) => tone(t + 0.45 + i * 0.09, f, 0.6, { vol: 0.12, type: 'triangle', rev: 0.4 }));
    },
    horn() { if (!ok()) return; const t = now(); [349, 440].forEach((f) => tone(t, f, 0.35, { type: 'sawtooth', vol: 0.05, rev: 0.2 })); },
    creak(mat, amount) {
      if (!ok()) return; const t = now();
      if (mat === 'wood') {
        const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(70 + Math.random() * 60, t);
        const lfo = ctx.createOscillator(); lfo.frequency.value = 18 + Math.random() * 20;
        const lg = ctx.createGain(); lg.gain.value = 30; lfo.connect(lg); lg.connect(o.frequency);
        const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 700 + Math.random() * 500; f.Q.value = 6;
        const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.07 * amount, t + 0.08); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
        o.connect(f); f.connect(g); g.connect(sfxBus);
        o.start(t); lfo.start(t); o.stop(t + 0.55); lfo.stop(t + 0.55);
      } else if (mat === 'steel') {
        tone(t, 140 + Math.random() * 40, 0.8, { type: 'sawtooth', vol: 0.025 * amount, freqEnd: 110, rev: 0.5 });
      } else {
        noise(t, 0.3, { freq: 900, q: 4, vol: 0.05 * amount });
      }
    },
    break(mat, kind, pan) {
      if (!ok()) return; const t = now();
      pan = Math.max(-0.8, Math.min(0.8, pan || 0));
      if (mat === 'wood') {
        noise(t, 0.25, { type: 'highpass', freq: 1800, vol: 0.55, attack: 0.002, pan });
        tone(t, 140, 0.3, { vol: 0.45, freqEnd: 50, pan });
        for (let i = 0; i < 6; i++) noise(t + 0.03 + Math.random() * 0.25, 0.04, { freq: 2500 + Math.random() * 3000, q: 4, vol: 0.2, pan });
      } else if (mat === 'steel') {
        if (kind === 'cable') {
          tone(t, 2400, 0.9, { type: 'triangle', vol: 0.12, freqEnd: 300, rev: 0.6, pan });
          noise(t, 0.4, { type: 'highpass', freq: 3000, vol: 0.25, freqEnd: 800, pan });
        } else {
          [523, 1290, 2210, 3170].forEach((f, i) => tone(t, f * (0.97 + Math.random() * 0.06), 1.4 - i * 0.25, { vol: 0.12 / (i + 1), type: 'sine', rev: 0.7, pan }));
          tone(t + 0.05, 190, 1.2, { type: 'sawtooth', vol: 0.06, freqEnd: 70, rev: 0.4, pan });
          noise(t, 0.12, { freq: 5000, q: 1, vol: 0.3, attack: 0.001, pan });
        }
      } else {
        tone(t, 70, 0.6, { vol: 0.6, freqEnd: 35, pan });
        noise(t, 1.4, { type: 'lowpass', freq: 1500, freqEnd: 200, vol: 0.45, brown: false, attack: 0.003, pan });
        for (let i = 0; i < 10; i++) noise(t + 0.1 + Math.random() * 1.1, 0.07, { freq: 600 + Math.random() * 1600, q: 2, vol: 0.15, pan });
      }
    },
    collapse(size) {
      if (!ok()) return; const t = now();
      const s = Math.min(1.4, 0.6 + size * 0.15);
      noise(t, 3.8, { type: 'lowpass', freq: 500, freqEnd: 60, vol: 0.8 * s, attack: 0.05, brown: true, rev: 0.5 });
      tone(t, 55, 2.5, { vol: 0.5 * s, freqEnd: 28, rev: 0.4 });
      noise(t + 0.2, 2.2, { type: 'bandpass', freq: 900, freqEnd: 150, q: 0.7, vol: 0.25 * s });
    },
    splash(big) {
      if (!ok()) return; const t = now();
      noise(t, big ? 1.4 : 0.6, { type: 'bandpass', freq: big ? 900 : 1600, freqEnd: big ? 250 : 500, q: 0.7, vol: big ? 0.55 : 0.2, attack: 0.01, rev: 0.4 });
      if (big) noise(t, 0.4, { type: 'lowpass', freq: 300, vol: 0.5, brown: true });
      for (let i = 0; i < (big ? 8 : 3); i++) {
        const tt = t + 0.1 + Math.random() * (big ? 1.2 : 0.4);
        tone(tt, 600 + Math.random() * 900, 0.08, { vol: 0.05, freqEnd: 1500 + Math.random() * 1500, rev: 0.3 });
      }
    },
    crash(mass) {
      if (!ok()) return; const t = now();
      const s = Math.min(1, 0.4 + mass / 30000);
      tone(t, 80, 0.5, { vol: 0.6 * s, freqEnd: 40 });
      noise(t, 0.6, { type: 'bandpass', freq: 1200, freqEnd: 300, q: 0.8, vol: 0.4 * s });
      [430, 980, 1700].forEach((f) => tone(t, f, 0.5, { vol: 0.05 * s, rev: 0.3 }));
    },
    thud(v) { if (!ok()) return; const t = now(); tone(t, 90, 0.18, { vol: Math.min(0.3, v * 0.03), freqEnd: 45, rev: 0.1 }); noise(t, 0.15, { type: 'lowpass', freq: 400, vol: Math.min(0.2, v * 0.02) }); },
    clank() { if (!ok()) return; const t = now(); tone(t, 300, 0.4, { type: 'triangle', vol: 0.2, rev: 0.4 }); tone(t, 755, 0.3, { vol: 0.1, rev: 0.4 }); noise(t, 0.08, { freq: 3000, vol: 0.2 }); },
    success() {
      if (!ok()) return; const t = now();
      [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => { tone(t + i * 0.11, f, 1.4, { vol: 0.13, type: 'triangle', rev: 0.6 }); tone(t + i * 0.11, f * 2, 0.8, { vol: 0.03, rev: 0.6 }); });
      noise(t + 0.5, 1.5, { type: 'highpass', freq: 6000, vol: 0.05, attack: 0.3, rev: 0.6 });
    },
    fail() {
      if (!ok()) return; const t = now();
      // gentle, encouraging "try again" motif (not sad)
      [659.25, 587.33, 523.25, 587.33, 783.99].forEach((f, i) => tone(t + i * 0.16, f, 0.7, { vol: 0.1, type: 'triangle', rev: 0.6 }));
    },
    star(i) { if (!ok()) return; const t = now(); tone(t, 880 * Math.pow(1.26, i), 0.6, { vol: 0.12, type: 'triangle', rev: 0.6 }); tone(t, 1760 * Math.pow(1.26, i), 0.4, { vol: 0.04, rev: 0.6 }); },
    tankLand() { if (!ok()) return; const t = now(); tone(t, 70, 0.4, { vol: 0.5, freqEnd: 40 }); tone(t, 230, 0.6, { type: 'triangle', vol: 0.1, rev: 0.5 }); noise(t, 0.2, { type: 'lowpass', freq: 800, vol: 0.2 }); },
    bird() {
      if (!ok()) return; const t = now();
      const base = 2500 + Math.random() * 1500;
      for (let i = 0; i < 2 + Math.floor(Math.random() * 3); i++) tone(t + i * 0.12, base, 0.09, { vol: 0.025, freqEnd: base * 1.4, rev: 0.4, pan: Math.random() - 0.5 });
    }
  };

  // continuous wind sound
  function setWind(speed) {
    if (!ctx) return;
    if (!windNodes) {
      const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 0.9; bp.frequency.value = 400;
      const g = ctx.createGain(); g.gain.value = 0;
      const src2 = ctx.createBufferSource(); src2.buffer = noiseBuf; src2.loop = true;
      const wh = ctx.createBiquadFilter(); wh.type = 'bandpass'; wh.Q.value = 18; wh.frequency.value = 900;
      const g2 = ctx.createGain(); g2.gain.value = 0;
      src.connect(bp); bp.connect(g); g.connect(sfxBus);
      src2.connect(wh); wh.connect(g2); g2.connect(sfxBus);
      const s = ctx.createGain(); s.gain.value = 0.3; g.connect(s); s.connect(reverbSend);
      src.start(); src2.start();
      windNodes = { bp, g, wh, g2 };
    }
    const t = ctx.currentTime;
    const k = Math.min(1, speed / 40);
    windNodes.g.gain.setTargetAtTime(sfxOn ? k * 0.38 : 0, t, 0.3);
    windNodes.bp.frequency.setTargetAtTime(250 + speed * 22, t, 0.3);
    windNodes.g2.gain.setTargetAtTime(sfxOn ? Math.max(0, k - 0.3) * 0.25 : 0, t, 0.3);
    windNodes.wh.frequency.setTargetAtTime(700 + speed * 30 + Math.sin(t * 1.7) * 120, t, 0.2);
  }

  // engine rumble from vehicles on screen
  function setEngine(amount, heavy) {
    if (!ctx) return;
    if (!engineNodes) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 48;
      const o2 = ctx.createOscillator(); o2.type = 'square'; o2.frequency.value = 72;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 220; lp.Q.value = 2;
      const g = ctx.createGain(); g.gain.value = 0;
      const g2 = ctx.createGain(); g2.gain.value = 0.3;
      o.connect(lp); o2.connect(g2); g2.connect(lp); lp.connect(g); g.connect(sfxBus);
      o.start(); o2.start();
      engineNodes = { o, o2, g, lp };
    }
    const t = ctx.currentTime;
    engineNodes.g.gain.setTargetAtTime(sfxOn ? Math.min(0.16, amount * 0.07) : 0, t, 0.3);
    engineNodes.o.frequency.setTargetAtTime(heavy ? 38 : 58, t, 0.5);
    engineNodes.o2.frequency.setTargetAtTime(heavy ? 57 : 87, t, 0.5);
  }

  // soft environmental ambience (water / breeze)
  function setAmbience(kind) {
    if (!ctx) return;
    if (!ambNodes) {
      const src = ctx.createBufferSource(); src.buffer = brownBuf; src.loop = true;
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 700;
      const g = ctx.createGain(); g.gain.value = 0;
      src.connect(f); f.connect(g); g.connect(sfxBus); src.start();
      ambNodes = { f, g };
    }
    const t = ctx.currentTime;
    const vol = kind === 'river' ? 0.09 : kind === 'lake' ? 0.05 : kind === 'mountain' ? 0.035 : kind === 'tower' ? 0.03 : 0;
    ambNodes.g.gain.setTargetAtTime(sfxOn ? vol : 0, t, 0.8);
    ambNodes.f.frequency.setTargetAtTime(kind === 'river' ? 900 : kind === 'mountain' ? 400 : 600, t, 0.5);
  }

  function stopLoops() { setWind(0); setEngine(0); }

  CF.Audio = { init, resume, startMusic, setMusic, setSfx, setMood, setWind, setEngine, setAmbience, stopLoops, sfx: SFX };
})(typeof window !== 'undefined' ? window : globalThis);
