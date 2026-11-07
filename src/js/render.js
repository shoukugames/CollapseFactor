/*
 * Collapse Factor - renderer (HTML5 canvas)
 * Copyright (C) 2026 Shawn Rapaz. Licensed under the GNU GPL v3.0.
 */
(function (G) {
  'use strict';
  const CF = G.CF = G.CF || {};
  const { groundAt, PARTS, RNG } = CF.Physics;

  const SKIES = {
    day:     { top: '#3f86d6', mid: '#86bff0', bot: '#d4ecf8', haze: '#c2dcef', sun: '#fff6c8', light: 1.0, hill: ['#8fb7c9', '#6f9fa0', '#4f8a5a'] },
    morning: { top: '#5d8fd0', mid: '#b2c9e6', bot: '#ffd9ab', haze: '#f2d4b8', sun: '#fff0c0', light: 0.95, hill: ['#a9b5c9', '#8a9fa5', '#5d8c58'] },
    sunset:  { top: '#2e3b7a', mid: '#c86a6a', bot: '#ffc27a', haze: '#e8a07c', sun: '#ffdf8a', light: 0.82, hill: ['#8a6a86', '#6c5a72', '#3f4d4a'] },
    dusk:    { top: '#0e1633', mid: '#2e3466', bot: '#6b5c8f', haze: '#4a4878', sun: '#f4f1de', light: 0.6, hill: ['#3a3d66', '#2c3052', '#1f2b33'] }
  };
  const VEH_COLORS = ['#d9453b', '#2f78c4', '#f2b134', '#3fa66b', '#8a55c9', '#e8e4dc', '#3a3f4a', '#e5732d', '#1aa3a3'];

  function lerp(a, b, t) { return a + (b - a) * t; }
  function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function mix(c1, c2, t) { const a = hexToRgb(c1), b = hexToRgb(c2); return `rgb(${Math.round(lerp(a[0], b[0], t))},${Math.round(lerp(a[1], b[1], t))},${Math.round(lerp(a[2], b[2], t))})`; }
  function shade(c, f) { const a = hexToRgb(c); const k = (v) => Math.max(0, Math.min(255, Math.round(f >= 0 ? v + (255 - v) * f : v * (1 + f)))); return `rgb(${k(a[0])},${k(a[1])},${k(a[2])})`; }
  function stressColor(r) {
    r = Math.max(0, Math.min(1.1, r));
    if (r < 0.5) return `rgb(${Math.round(60 + r * 2 * 190)},${Math.round(200 + r * 2 * 20)},90)`;
    return `rgb(250,${Math.round(220 - (r - 0.5) * 2 * 190)},${Math.round(90 - (r - 0.5) * 120)})`;
  }

  class Renderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.particles = [];
      this.streaks = [];
      this.shake = 0;
      this.time = 0;
      this.level = null;
      this.margins = { top: 70, bottom: 130, left: 10, right: 10 };
      this.vehicleColors = new Map();
      this.resize();
    }

    resize() {
      const dpr = Math.min(2, G.devicePixelRatio || 1);
      this.dpr = dpr;
      this.W = this.canvas.clientWidth || G.innerWidth;
      this.H = this.canvas.clientHeight || G.innerHeight;
      this.canvas.width = Math.round(this.W * dpr);
      this.canvas.height = Math.round(this.H * dpr);
      if (this.level) { this.fitCamera(); this.renderStatic(); }
    }

    setMargins(m) { Object.assign(this.margins, m); if (this.level) { this.fitCamera(); this.renderStatic(); } }

    setLevel(level) {
      this.level = level;
      this.particles = [];
      this.vehicleColors.clear();
      this.sky = SKIES[level.decor.tod];
      this.rngStatic = RNG(level.seed ^ 0xabcdef);
      this.fitCamera();
      this.renderStatic();
      this.streaks = [];
      for (let i = 0; i < 70; i++) this.streaks.push({ x: Math.random(), y: Math.random(), l: 0.5 + Math.random(), o: Math.random() });
    }

    fitCamera() {
      const v = this.level.view, m = this.margins;
      const w = this.W - m.left - m.right, h = this.H - m.top - m.bottom;
      const s = Math.min(w / (v.x1 - v.x0), h / (v.y1 - v.y0));
      this.s = s;
      this.ox = m.left + w / 2 - ((v.x0 + v.x1) / 2) * s;
      this.oy = m.top + h / 2 + ((v.y0 + v.y1) / 2) * s;
      // world range visible on screen
      this.wx0 = (0 - this.ox) / s; this.wx1 = (this.W - this.ox) / s;
      this.wy1 = this.oy / s; this.wy0 = (this.oy - this.H) / s;
    }
    sx(x) { return this.ox + x * this.s; }
    sy(y) { return this.oy - y * this.s; }
    toWorld(px, py) { return { x: (px - this.ox) / this.s, y: (this.oy - py) / this.s }; }

    // ------------------------------------------------------------
    // static layers: sky, hills, terrain
    // ------------------------------------------------------------
    renderStatic() {
      const W = this.W, H = this.H, dpr = this.dpr;
      const mk = () => { const c = document.createElement('canvas'); c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); const x = c.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0); return [c, x]; };
      const [bg, b] = mk();
      const [tc, t] = mk();
      this.bgCanvas = bg; this.terrainCanvas = tc;
      this.drawSky(b);
      this.drawTerrain(t);
    }

    drawSky(c) {
      const W = this.W, H = this.H, sky = this.sky, lv = this.level, d = lv.decor;
      const horizon = Math.min(H, this.sy(lv.type === 'tower' ? 0 : (lv.water ? lv.water.y : 0)) + 40);
      const g = c.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, sky.top); g.addColorStop(0.5, sky.mid); g.addColorStop(Math.min(1, horizon / H), sky.bot); g.addColorStop(1, sky.bot);
      c.fillStyle = g; c.fillRect(0, 0, W, H);
      const r = RNG(lv.seed ^ 0x1234);
      if (d.tod === 'dusk') {
        for (let i = 0; i < 160; i++) {
          c.globalAlpha = 0.3 + r() * 0.7;
          c.fillStyle = '#fff';
          const s = r() < 0.1 ? 1.8 : 1;
          c.fillRect(r() * W, r() * H * 0.55, s, s);
        }
        c.globalAlpha = 1;
      }
      // sun / moon
      const sunX = W * (0.15 + r() * 0.7), sunY = d.tod === 'sunset' ? H * 0.42 : d.tod === 'morning' ? H * 0.3 : H * 0.16;
      const rad = d.tod === 'dusk' ? 26 : 38;
      const glow = c.createRadialGradient(sunX, sunY, 0, sunX, sunY, rad * 6);
      glow.addColorStop(0, 'rgba(255,250,220,0.55)'); glow.addColorStop(0.3, 'rgba(255,240,200,0.18)'); glow.addColorStop(1, 'rgba(255,240,200,0)');
      c.fillStyle = glow; c.fillRect(0, 0, W, H);
      c.fillStyle = sky.sun; c.beginPath(); c.arc(sunX, sunY, rad, 0, Math.PI * 2); c.fill();
      if (d.tod === 'dusk') { c.fillStyle = sky.top; c.globalAlpha = 0.9; c.beginPath(); c.arc(sunX + 11, sunY - 6, rad * 0.9, 0, Math.PI * 2); c.fill(); c.globalAlpha = 1; }
      // hill layers (parallax silhouettes)
      const base = horizon;
      d.hills.forEach((pts, li) => {
        const col = mix(sky.hill[li], sky.haze, 0.35 - li * 0.12);
        c.fillStyle = col;
        c.beginPath();
        c.moveTo(0, H);
        const n = pts.length - 1;
        for (let i = 0; i <= n; i++) {
          const x = (i / n) * W;
          const y = base - pts[i] * H * (lv.theme === 'mountain' ? 1.0 : 0.8) - li * 6;
          if (i === 0) c.lineTo(x, y);
          else {
            const px = ((i - 0.5) / n) * W, py = base - (pts[i - 1] + pts[i]) / 2 * H * (lv.theme === 'mountain' ? 1.0 : 0.8) - li * 6;
            lv.theme === 'mountain' ? c.lineTo(x, y) : c.quadraticCurveTo(px, py, x, y);
          }
        }
        c.lineTo(W, H); c.closePath(); c.fill();
        // snow caps on far mountains
        if (lv.theme === 'mountain' && li === 0) {
          c.save(); c.clip();
          c.fillStyle = 'rgba(255,255,255,0.85)';
          for (let i = 0; i <= n; i++) {
            if (pts[i] > 0.22) { const x = (i / n) * W, y = base - pts[i] * H; c.beginPath(); c.moveTo(x, y); c.lineTo(x - W / n * 0.5, y + 30); c.lineTo(x + W / n * 0.5, y + 30); c.fill(); }
          }
          c.restore();
        }
      });
      // city skyline (towers)
      if (d.buildings.length) {
        d.buildings.forEach((bd) => {
          const x = bd.x * W, w = bd.w * W, h = bd.h * H;
          c.fillStyle = mix(sky.hill[1], sky.haze, 0.3);
          c.fillRect(x, base - h, w, h + 20);
          c.fillStyle = d.tod === 'dusk' || d.tod === 'sunset' ? 'rgba(255,220,130,0.75)' : 'rgba(255,255,255,0.25)';
          for (let wy = base - h + 6; wy < base - 4; wy += 9) for (let wx = x + 4; wx < x + w - 4; wx += 7) if (r() < (d.tod === 'dusk' ? 0.45 : 0.6)) c.fillRect(wx, wy, 3, 4);
        });
      }
    }

    drawTerrain(c) {
      const lv = this.level, s = this.s;
      const terr = lv.terrain;
      const r = RNG(lv.seed ^ 0x777);
      const theme = lv.theme;
      const soilTop = theme === 'mountain' ? '#7d756c' : theme === 'tower' ? '#8a7350' : '#86603a';
      const soilBot = theme === 'mountain' ? '#3e3a37' : '#3f2d1d';
      const light = this.sky.light;
      const path = () => {
        c.beginPath();
        c.moveTo(this.sx(terr[0].x - 200), this.H + 10);
        c.lineTo(this.sx(terr[0].x - 200), this.sy(terr[0].y));
        for (const p of terr) c.lineTo(this.sx(p.x), this.sy(p.y));
        const last = terr[terr.length - 1];
        c.lineTo(this.sx(last.x + 200), this.sy(last.y));
        c.lineTo(this.sx(last.x + 200), this.H + 10);
        c.closePath();
      };
      path();
      const topY = this.sy(Math.max(...terr.map((p) => p.y)));
      const g = c.createLinearGradient(0, topY, 0, this.H);
      g.addColorStop(0, shade(soilTop, (light - 1) * 0.8)); g.addColorStop(1, shade(soilBot, (light - 1) * 0.8));
      c.fillStyle = g; c.fill();
      // strata & rocks inside the ground
      c.save(); path(); c.clip();
      c.strokeStyle = 'rgba(0,0,0,0.13)'; c.lineWidth = Math.max(1, s * 0.08);
      for (let i = 0; i < 26; i++) {
        const y = this.sy(r.range(lv.view.y0 - 4, lv.view.y1));
        c.beginPath(); c.moveTo(0, y);
        for (let x = 0; x <= this.W; x += 40) c.lineTo(x, y + Math.sin(x * 0.013 + i) * 4 + r.range(-2, 2));
        c.stroke();
      }
      for (let i = 0; i < 90; i++) {
        const x = r.range(0, this.W), y = r.range(topY, this.H);
        const rs = r.range(0.15, 0.55) * s;
        c.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.15)';
        c.beginPath(); c.ellipse(x, y, rs, rs * 0.7, r() * 3, 0, Math.PI * 2); c.fill();
      }
      c.restore();
      // grass on gentle top surfaces
      const grass = theme === 'mountain' ? '#6f9a45' : theme === 'tower' ? '#6c9e44' : '#5ea83c';
      const g2 = shade(grass, (light - 1) * 0.9);
      for (let i = -1; i < terr.length; i++) {
        let a = i < 0 ? { x: terr[0].x - 200, y: terr[0].y } : terr[i];
        let b = i + 1 < terr.length ? terr[i + 1] : { x: terr[terr.length - 1].x + 200, y: terr[terr.length - 1].y };
        const slope = Math.abs((b.y - a.y) / ((b.x - a.x) || 1e-6));
        if (slope > 1.2) continue;
        if (lv.water) {
          const wy = lv.water.y + 0.3;
          if (a.y < wy && b.y < wy) continue;
          // clip the grass line at the waterline
          if (a.y < wy || b.y < wy) {
            const tt = (wy - a.y) / (b.y - a.y);
            const cut = { x: a.x + (b.x - a.x) * tt, y: wy };
            if (a.y < wy) a = cut; else b = cut;
          }
        }
        c.strokeStyle = g2; c.lineWidth = Math.max(4, s * 0.45); c.lineCap = 'round';
        c.beginPath(); c.moveTo(this.sx(a.x), this.sy(a.y) + c.lineWidth * 0.35); c.lineTo(this.sx(b.x), this.sy(b.y) + c.lineWidth * 0.35); c.stroke();
        c.strokeStyle = shade(g2, 0.25); c.lineWidth = Math.max(1.5, s * 0.1);
        c.beginPath(); c.moveTo(this.sx(a.x), this.sy(a.y)); c.lineTo(this.sx(b.x), this.sy(b.y)); c.stroke();
        // tufts
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        c.strokeStyle = shade(g2, -0.1); c.lineWidth = 1.2;
        for (let k = 0; k < len * 1.5; k++) {
          const tt = r(), x = this.sx(lerp(a.x, b.x, tt)), y = this.sy(lerp(a.y, b.y, tt));
          if (x < -10 || x > this.W + 10) continue;
          c.beginPath(); c.moveTo(x, y); c.lineTo(x + r.range(-2, 2), y - r.range(3, 7)); c.stroke();
        }
      }
      // asphalt approach roads on both banks
      if (lv.type === 'bridge') {
        const roadSeg = (x0, x1) => {
          c.lineCap = 'butt';
          const pts = [];
          for (let x = x0; x <= x1 + 1e-6; x += 0.5) pts.push([this.sx(x), this.sy(groundAt(terr, x))]);
          c.strokeStyle = '#3a3a3e'; c.lineWidth = Math.max(4, s * 0.32);
          c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1] + c.lineWidth / 2) : c.moveTo(p[0], p[1] + c.lineWidth / 2))); c.stroke();
          c.strokeStyle = '#f2d24a'; c.lineWidth = Math.max(1, s * 0.05); c.setLineDash([s * 1.2, s * 1.2]);
          c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1] + Math.max(2, s * 0.16)) : c.moveTo(p[0], p[1] + Math.max(2, s * 0.16)))); c.stroke();
          c.setLineDash([]);
        };
        roadSeg(this.wx0 - 2, lv.leftEdge);
        roadSeg(lv.rightEdge, this.wx1 + 2);
      } else {
        // foundation slab
        const hw = lv.halfW + 1.2;
        c.fillStyle = '#a8a39a'; c.strokeStyle = '#6d6a64'; c.lineWidth = 2;
        c.fillRect(this.sx(-hw), this.sy(0.05), hw * 2 * s, 0.7 * s); c.strokeRect(this.sx(-hw), this.sy(0.05), hw * 2 * s, 0.7 * s);
        c.fillStyle = 'rgba(0,0,0,0.15)';
        for (let x = -hw; x < hw; x += 1.5) c.fillRect(this.sx(x), this.sy(0.05), 1, 0.7 * s);
      }
    }

    // ------------------------------------------------------------
    // dynamic layers
    // ------------------------------------------------------------
    drawClouds(c, dt, wind) {
      const d = this.level.decor, W = this.W, H = this.H;
      const alpha = d.tod === 'dusk' ? 0.25 : 0.85;
      for (const cl of d.clouds) {
        cl.x += dt * (0.004 * cl.sp + wind * 0.0009 * (this.windDir || 1));
        if (cl.x > 1.25) cl.x = -0.25; if (cl.x < -0.25) cl.x = 1.25;
        const x = cl.x * W, y = cl.y * H, r = 30 * cl.s;
        c.fillStyle = d.tod === 'sunset' ? `rgba(255,210,190,${alpha})` : `rgba(255,255,255,${alpha})`;
        c.beginPath();
        c.ellipse(x, y, r * 2.2, r * 0.8, 0, 0, Math.PI * 2);
        c.ellipse(x - r * 1.1, y + r * 0.1, r * 1.2, r * 0.7, 0, 0, Math.PI * 2);
        c.ellipse(x + r * 0.6, y - r * 0.45, r * 1.2, r * 0.9, 0, 0, Math.PI * 2);
        c.ellipse(x + r * 1.6, y + r * 0.15, r, r * 0.6, 0, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = 'rgba(120,140,170,0.12)';
        c.beginPath(); c.ellipse(x, y + r * 0.45, r * 2, r * 0.3, 0, 0, Math.PI * 2); c.fill();
      }
      // birds
      if (d.birds) {
        c.strokeStyle = 'rgba(30,30,40,0.7)'; c.lineWidth = 1.5;
        for (let i = 0; i < d.birds; i++) {
          const x = ((this.time * (14 + i * 3) + i * 300) % (W + 200)) - 100, y = H * (0.12 + 0.05 * i) + Math.sin(this.time * 2 + i) * 6;
          const f = Math.sin(this.time * 9 + i * 2) * 4;
          c.beginPath(); c.moveTo(x - 7, y - f); c.quadraticCurveTo(x - 3, y - 3, x, y); c.quadraticCurveTo(x + 3, y - 3, x + 7, y - f); c.stroke();
        }
      }
    }

    drawWater(c, overlay) {
      const w = this.level.water;
      if (!w) return;
      const s = this.s, t = this.time;
      const x0 = this.sx(w.x0 - 60), x1 = this.sx(w.x1 + 60);
      const y = this.sy(w.y);
      const bottom = this.H + 10;
      if (!overlay) {
        const g = c.createLinearGradient(0, y, 0, bottom);
        const tint = this.sky.light;
        g.addColorStop(0, shade('#3f8fc4', (tint - 1) * 0.9)); g.addColorStop(0.4, shade('#1f5f8f', (tint - 1) * 0.9)); g.addColorStop(1, '#0b2a45');
        c.fillStyle = g;
        c.beginPath();
        c.moveTo(x0, bottom);
        for (let x = x0; x <= x1; x += 8) c.lineTo(x, y + Math.sin(x * 0.04 + t * 2) * 1.5 + Math.sin(x * 0.011 - t * 1.2) * 2);
        c.lineTo(x1, bottom); c.closePath(); c.fill();
        // light shafts / sparkles
        c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = 1.5;
        for (let i = 0; i < 40; i++) {
          const sx = x0 + ((i * 97.3 + t * 18 * (i % 2 ? 1 : -0.6)) % (x1 - x0 + 1));
          const sy = y + 3 + (i % 5) * Math.max(3, s * 0.3);
          c.globalAlpha = 0.15 + 0.25 * (0.5 + 0.5 * Math.sin(t * 3 + i));
          c.beginPath(); c.moveTo(sx, sy); c.lineTo(sx + 6 + (i % 3) * 4, sy); c.stroke();
        }
        c.globalAlpha = 1;
        c.strokeStyle = 'rgba(255,255,255,0.6)'; c.lineWidth = 2;
        c.beginPath();
        for (let x = x0; x <= x1; x += 8) { const yy = y + Math.sin(x * 0.04 + t * 2) * 1.5 + Math.sin(x * 0.011 - t * 1.2) * 2; x === x0 ? c.moveTo(x, yy) : c.lineTo(x, yy); }
        c.stroke();
      } else {
        // translucent layer over submerged objects - only where there is open water
        const terr = this.level.terrain;
        const wave = (px) => y + Math.sin(px * 0.04 + t * 2) * 1.5 + Math.sin(px * 0.011 - t * 1.2) * 2;
        c.fillStyle = 'rgba(30,100,150,0.35)';
        const step = 4 / s;
        let run = null;
        const flush = () => {
          if (!run || run.length < 2) { run = null; return; }
          c.beginPath();
          run.forEach((wx, i) => { const px = this.sx(wx); i ? c.lineTo(px, wave(px)) : c.moveTo(px, wave(px)); });
          for (let i = run.length - 1; i >= 0; i--) c.lineTo(this.sx(run[i]), this.sy(groundAt(terr, run[i])));
          c.closePath(); c.fill();
          run = null;
        };
        for (let wx = Math.max(this.wx0, w.x0 - 60); wx <= Math.min(this.wx1, w.x1 + 60); wx += step) {
          if (groundAt(terr, wx) < w.y) (run = run || []).push(wx); else flush();
        }
        flush();
      }
    }

    drawDecor(c, wind) {
      const lv = this.level, d = lv.decor, s = this.s;
      const dir = this.windDir || 1;
      // houses
      for (const h of d.houses) {
        const gx = this.sx(h.x), gy = this.sy(groundAt(lv.terrain, h.x));
        const w = 5 * s * h.s, hh = 3.2 * s * h.s;
        c.fillStyle = `hsl(${h.hue},35%,${70 * this.sky.light}%)`; c.fillRect(gx - w / 2, gy - hh, w, hh);
        c.fillStyle = `hsl(${(h.hue + 180) % 360},40%,${38 * this.sky.light}%)`;
        c.beginPath(); c.moveTo(gx - w * 0.6, gy - hh); c.lineTo(gx, gy - hh - w * 0.45); c.lineTo(gx + w * 0.6, gy - hh); c.fill();
        c.fillStyle = d.tod === 'dusk' ? '#ffd27a' : '#a8d4ef';
        c.fillRect(gx - w * 0.32, gy - hh * 0.7, w * 0.2, hh * 0.3); c.fillRect(gx + w * 0.12, gy - hh * 0.7, w * 0.2, hh * 0.3);
        c.fillStyle = '#6b4a2b'; c.fillRect(gx - w * 0.07, gy - hh * 0.5, w * 0.14, hh * 0.5);
      }
      // trees sway with the wind
      for (const tr of d.trees) {
        const gx = this.sx(tr.x), gy = this.sy(groundAt(lv.terrain, tr.x));
        if (gx < -60 || gx > this.W + 60) continue;
        const sc = s * tr.s;
        const sway = Math.sin(this.time * 1.4 + tr.x) * 0.03 + Math.min(0.35, wind * 0.009) * dir * (0.8 + 0.2 * Math.sin(this.time * 5 + tr.x));
        c.save(); c.translate(gx, gy); c.rotate(sway);
        c.fillStyle = '#5b3d22'; c.fillRect(-0.18 * sc, -1.6 * sc, 0.36 * sc, 1.6 * sc);
        const L = this.sky.light;
        if (tr.kind === 'pine') {
          for (let k = 0; k < 3; k++) {
            c.fillStyle = `hsl(${140 + tr.hue},38%,${(26 + k * 5) * L}%)`;
            c.beginPath(); c.moveTo(0, -(5.2 - k * 0.2) * sc + k * 1.3 * sc - 1.2 * sc); c.lineTo(-(1.6 - k * 0.3) * sc, -1.2 * sc - k * 1.2 * sc + 1.2 * sc * 0.4); c.lineTo((1.6 - k * 0.3) * sc, -1.2 * sc - k * 1.2 * sc + 1.2 * sc * 0.4); c.fill();
          }
        } else {
          c.fillStyle = `hsl(${105 + tr.hue},42%,${32 * L}%)`;
          c.beginPath(); c.arc(0, -2.6 * sc, 1.4 * sc, 0, Math.PI * 2); c.arc(-0.9 * sc, -2.0 * sc, 1.0 * sc, 0, Math.PI * 2); c.arc(0.9 * sc, -2.1 * sc, 1.05 * sc, 0, Math.PI * 2); c.fill();
          c.fillStyle = `hsla(${95 + tr.hue},50%,${50 * L}%,0.6)`;
          c.beginPath(); c.arc(-0.4 * sc, -3.0 * sc, 0.6 * sc, 0, Math.PI * 2); c.fill();
        }
        c.restore();
      }
    }

    drawGrid(c) {
      const lv = this.level, b = lv.build, s = this.s;
      const step = s < 14 ? 2 : 1;
      c.fillStyle = 'rgba(255,255,255,0.32)';
      const r = Math.max(1, Math.min(2, s * 0.06));
      for (let x = Math.ceil(b.x0); x <= b.x1; x += step) {
        for (let y = Math.ceil(b.y0); y <= b.y1; y += step) {
          if (y < groundAt(lv.terrain, x) + 0.01) continue;
          c.fillRect(this.sx(x) - r / 2, this.sy(y) - r / 2, r, r);
        }
      }
      // build-area outline
      c.strokeStyle = 'rgba(255,255,255,0.18)'; c.setLineDash([6, 6]); c.lineWidth = 1;
      c.strokeRect(this.sx(b.x0), this.sy(b.y1), (b.x1 - b.x0) * s, (b.y1 - b.y0) * s);
      c.setLineDash([]);
    }

    drawAnchors(c, used) {
      const s = this.s, pulse = 0.5 + 0.5 * Math.sin(this.time * 4);
      for (const a of this.level.anchors) {
        const x = this.sx(a.x), y = this.sy(a.y);
        const r = Math.max(5, s * 0.32);
        const key = a.x + ',' + a.y;
        if (!used || !used.has(key)) {
          c.fillStyle = a.road ? `rgba(255,214,60,${0.15 + pulse * 0.25})` : `rgba(255,255,255,${0.08 + pulse * 0.15})`;
          c.beginPath(); c.arc(x, y, r * 2, 0, Math.PI * 2); c.fill();
        }
        c.fillStyle = '#4b5059'; c.strokeStyle = '#22262c'; c.lineWidth = 1.5;
        c.beginPath(); c.moveTo(x - r, y + r * 0.9); c.lineTo(x - r * 0.7, y - r * 0.4); c.lineTo(x + r * 0.7, y - r * 0.4); c.lineTo(x + r, y + r * 0.9); c.closePath(); c.fill(); c.stroke();
        c.fillStyle = a.road ? '#ffd23c' : '#c9ced6';
        c.beginPath(); c.arc(x, y, r * 0.55, 0, Math.PI * 2); c.fill();
        c.strokeStyle = '#22262c'; c.stroke();
        c.fillStyle = '#22262c'; c.beginPath(); c.arc(x, y, r * 0.18, 0, Math.PI * 2); c.fill();
      }
    }

    drawTargetLine(c) {
      const lv = this.level;
      if (lv.type !== 'tower') return;
      const y = this.sy(lv.targetHeight), x0 = this.sx(lv.build.x0 - 2), x1 = this.sx(lv.build.x1 + 2);
      c.strokeStyle = 'rgba(255,240,120,0.85)'; c.lineWidth = 2; c.setLineDash([10, 8]);
      c.beginPath(); c.moveTo(x0, y); c.lineTo(x1, y); c.stroke(); c.setLineDash([]);
      // flag
      c.strokeStyle = '#eee'; c.lineWidth = 2; c.beginPath(); c.moveTo(x1, y); c.lineTo(x1, y - 34); c.stroke();
      const wave = Math.sin(this.time * 6) * 3;
      c.fillStyle = '#ff5a4f'; c.beginPath(); c.moveTo(x1, y - 34); c.quadraticCurveTo(x1 + 12, y - 30 + wave, x1 + 24, y - 28); c.lineTo(x1, y - 20); c.fill();
      c.fillStyle = '#fff'; c.font = '700 13px "M PLUS Rounded 1c", sans-serif'; c.textAlign = 'right';
      c.fillText(lv.targetHeight + ' m', x1 - 6, y - 6);
    }

    // ------------------------------------------------------------
    // structure
    // ------------------------------------------------------------
    beamWidth(part) {
      const s = this.s;
      if (part.kind === 'cable') return Math.max(1.5, s * 0.07);
      if (part.kind === 'road') return Math.max(5, s * part.depth);
      return Math.max(3, s * part.depth);
    }

    drawBeam(c, ax, ay, bx, by, part, opt) {
      opt = opt || {};
      const x1 = this.sx(ax), y1 = this.sy(ay), x2 = this.sx(bx), y2 = this.sy(by);
      const w = this.beamWidth(part);
      const ang = Math.atan2(y2 - y1, x2 - x1);
      const len = Math.hypot(x2 - x1, y2 - y1);
      c.save();
      if (opt.alpha !== undefined) c.globalAlpha = opt.alpha;
      if (part.kind === 'cable') {
        c.strokeStyle = opt.invalid ? '#ff5050' : '#22262b'; c.lineWidth = w; c.lineCap = 'round';
        c.beginPath(); c.moveTo(x1, y1);
        if (opt.slack > 0.01) { const mx = (x1 + x2) / 2, my = (y1 + y2) / 2 + opt.slack * this.s * 0.8; c.quadraticCurveTo(mx, my, x2, y2); } else c.lineTo(x2, y2);
        c.stroke();
        c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = Math.max(0.6, w * 0.35); c.stroke();
      } else {
        c.translate(x1, y1); c.rotate(ang);
        const mat = part.mat;
        const col = opt.invalid ? '#ff5a5a' : mat === 'wood' ? '#b47e3c' : mat === 'steel' ? '#7f95aa' : '#bdb8ae';
        const edge = opt.invalid ? '#a01e1e' : mat === 'wood' ? '#5f3e17' : mat === 'steel' ? '#2c3a48' : '#6e6a63';
        if (part.kind === 'road') {
          // deck
          const deckG = c.createLinearGradient(0, -w / 2, 0, w / 2);
          deckG.addColorStop(0, shade(col, 0.15)); deckG.addColorStop(1, shade(col, -0.25));
          c.fillStyle = deckG; c.strokeStyle = edge; c.lineWidth = 1.2;
          c.beginPath(); c.rect(0, -w / 2, len, w); c.fill(); c.stroke();
          // asphalt / plank top
          const topH = Math.max(2, w * 0.28);
          c.fillStyle = mat === 'wood' ? '#8f6230' : '#3a3b40';
          c.fillRect(0, -w / 2, len, topH);
          if (mat === 'wood') {
            c.strokeStyle = 'rgba(60,35,10,0.55)'; c.lineWidth = 1;
            const step = Math.max(4, this.s * 0.45);
            for (let x = step; x < len; x += step) { c.beginPath(); c.moveTo(x, -w / 2); c.lineTo(x, w / 2); c.stroke(); }
          } else {
            c.strokeStyle = '#f0d050'; c.lineWidth = Math.max(1, topH * 0.25); c.setLineDash([Math.max(4, this.s * 0.8), Math.max(4, this.s * 0.8)]);
            c.beginPath(); c.moveTo(2, -w / 2 + topH / 2); c.lineTo(len - 2, -w / 2 + topH / 2); c.stroke(); c.setLineDash([]);
            if (mat === 'steel') { c.strokeStyle = 'rgba(255,255,255,0.25)'; c.lineWidth = 1; c.beginPath(); c.moveTo(0, w * 0.25); c.lineTo(len, w * 0.25); c.stroke(); }
          }
          // railing
          const rh = Math.max(5, this.s * 0.9);
          c.strokeStyle = mat === 'wood' ? '#6e4b22' : '#9aa6b2'; c.lineWidth = Math.max(1, this.s * 0.06);
          c.beginPath(); c.moveTo(0, -w / 2 - rh); c.lineTo(len, -w / 2 - rh); c.stroke();
          const ps = Math.max(8, this.s * 1.3);
          for (let x = 0; x <= len + 0.1; x += ps) { c.beginPath(); c.moveTo(Math.min(x, len), -w / 2); c.lineTo(Math.min(x, len), -w / 2 - rh); c.stroke(); }
        } else {
          const r = w / 2;
          const g = c.createLinearGradient(0, -r, 0, r);
          g.addColorStop(0, shade(col, 0.25)); g.addColorStop(0.5, col); g.addColorStop(1, shade(col, -0.3));
          c.fillStyle = g; c.strokeStyle = edge; c.lineWidth = 1.2;
          c.beginPath(); c.moveTo(0, -r); c.lineTo(len, -r); c.arc(len, 0, r, -Math.PI / 2, Math.PI / 2); c.lineTo(0, r); c.arc(0, 0, r, Math.PI / 2, Math.PI * 1.5); c.closePath(); c.fill(); c.stroke();
          if (mat === 'wood') {
            c.strokeStyle = 'rgba(80,45,10,0.45)'; c.lineWidth = 1;
            c.beginPath(); c.moveTo(r, -r * 0.3); c.bezierCurveTo(len * 0.3, -r * 0.6, len * 0.6, r * 0.1, len - r, -r * 0.2); c.stroke();
          } else if (mat === 'steel') {
            c.strokeStyle = 'rgba(255,255,255,0.45)'; c.lineWidth = 1;
            c.beginPath(); c.moveTo(r, -r * 0.45); c.lineTo(len - r, -r * 0.45); c.stroke();
            c.fillStyle = '#2c3a48';
            for (const xx of [r * 1.6, len - r * 1.6]) { c.beginPath(); c.arc(xx, 0, Math.max(1, r * 0.25), 0, Math.PI * 2); c.fill(); }
          } else {
            c.fillStyle = 'rgba(0,0,0,0.12)';
            for (let k = 0; k < len / 6; k++) c.fillRect(((k * 37) % Math.max(1, len - 4)) + 2, ((k * 13) % Math.max(1, w - 2)) - r + 1, 1.5, 1.5);
          }
        }
      }
      c.restore();
      // stress overlay
      if (opt.stress !== undefined && opt.stress !== null) {
        c.save();
        c.globalAlpha = 0.78;
        c.strokeStyle = stressColor(opt.stress);
        c.lineWidth = part.kind === 'cable' ? w + 1 : Math.max(2, w * 0.45);
        c.lineCap = 'round';
        c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
        c.restore();
      }
      if (opt.highlight) {
        c.save(); c.strokeStyle = opt.highlight; c.lineWidth = w + 6; c.globalAlpha = 0.45; c.lineCap = 'round';
        c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke(); c.restore();
      }
    }

    drawJoint(c, x, y, hl) {
      const r = Math.max(3, this.s * 0.17);
      const px = this.sx(x), py = this.sy(y);
      c.fillStyle = hl || '#3b4048'; c.beginPath(); c.arc(px, py, r, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#c8ccd2'; c.beginPath(); c.arc(px, py, r * 0.45, 0, Math.PI * 2); c.fill();
    }

    // draw structure from a node/beam list. nodes: [{x,y}], beams [{a,b,part(obj), stress?, broken?}]
    drawStructure(c, nodes, beams, opts) {
      opts = opts || {};
      const order = [[], [], []];
      beams.forEach((b, i) => { if (b.broken) return; order[b.part.kind === 'road' ? 2 : b.part.kind === 'cable' ? 0 : 1].push(i); });
      for (const group of order) for (const i of group) {
        const b = beams[i], A = nodes[b.a], B = nodes[b.b];
        const o = { stress: opts.stress ? b.ratio : undefined, highlight: opts.hlBeam === i ? (opts.hlColor || '#ffffff') : null };
        if (b.part.kind === 'cable' && b.L) { const cur = Math.hypot(B.x - A.x, B.y - A.y); o.slack = Math.max(0, b.L - cur) * 2; }
        this.drawBeam(c, A.x, A.y, B.x, B.y, b.part, o);
      }
      const deg = new Array(nodes.length).fill(0);
      beams.forEach((b) => { if (!b.broken) { deg[b.a]++; deg[b.b]++; } });
      nodes.forEach((n, i) => { if (deg[i] > 0 && !n.anchor && !n.fixed) this.drawJoint(c, n.x, n.y, opts.hlNode === i ? (opts.hlColor || '#ffd23c') : null); });
    }

    // ------------------------------------------------------------
    // vehicles & tank
    // ------------------------------------------------------------
    vehicleColor(v, i) {
      if (!this.vehicleColors.has(v)) {
        const id = v.spec.id;
        const col = id === 'bus' ? '#f2b134' : id === 'dump' ? '#e5732d' : VEH_COLORS[(i * 3 + 1) % VEH_COLORS.length];
        this.vehicleColors.set(v, col);
      }
      return this.vehicleColors.get(v);
    }

    drawVehicle(c, v, i) {
      const s = this.s, sp = v.spec, col = this.vehicleColor(v, i);
      const dusk = this.level.decor.tod === 'dusk';
      const wr = (sp.mass > 7000 ? 0.52 : 0.36) * s;
      const L = sp.length * s, Hh = sp.height * s;
      const x = this.sx(v.x), y = this.sy(v.y);
      c.save();
      c.translate(x, y); c.rotate(-v.ang);
      // vehicle coordinate: origin between wheels at road level, +x forward
      const back = -L / 2 - (sp.length - sp.wheelbase) * 0 * s;
      const bodyBottom = -wr * 0.9;
      const grad = (h) => { const g = c.createLinearGradient(0, bodyBottom - h, 0, bodyBottom); g.addColorStop(0, shade(col, 0.3)); g.addColorStop(1, shade(col, -0.25)); return g; };
      const glass = dusk ? '#2a3550' : '#9fd0ee';
      const rr = (x0, y0, w, h, r) => { c.beginPath(); c.moveTo(x0 + r, y0); c.lineTo(x0 + w - r, y0); c.quadraticCurveTo(x0 + w, y0, x0 + w, y0 + r); c.lineTo(x0 + w, y0 + h - r); c.quadraticCurveTo(x0 + w, y0 + h, x0 + w - r, y0 + h); c.lineTo(x0 + r, y0 + h); c.quadraticCurveTo(x0, y0 + h, x0, y0 + h - r); c.lineTo(x0, y0 + r); c.quadraticCurveTo(x0, y0, x0 + r, y0); c.closePath(); };
      c.strokeStyle = 'rgba(0,0,0,0.55)'; c.lineWidth = 1;
      const id = sp.id;
      if (id === 'car' || id === 'suv') {
        const lowH = Hh * (id === 'suv' ? 0.5 : 0.45);
        c.fillStyle = grad(Hh); rr(back, bodyBottom - lowH, L, lowH, lowH * 0.35); c.fill(); c.stroke();
        c.beginPath(); c.moveTo(back + L * 0.18, bodyBottom - lowH); c.lineTo(back + L * (id === 'suv' ? 0.2 : 0.3), bodyBottom - Hh * 0.92); c.lineTo(back + L * (id === 'suv' ? 0.78 : 0.68), bodyBottom - Hh * 0.92); c.lineTo(back + L * 0.86, bodyBottom - lowH); c.closePath(); c.fill(); c.stroke();
        c.fillStyle = glass;
        c.beginPath(); c.moveTo(back + L * 0.25, bodyBottom - lowH - 1); c.lineTo(back + L * (id === 'suv' ? 0.24 : 0.33), bodyBottom - Hh * 0.85); c.lineTo(back + L * 0.5, bodyBottom - Hh * 0.85); c.lineTo(back + L * 0.5, bodyBottom - lowH - 1); c.fill();
        c.beginPath(); c.moveTo(back + L * 0.54, bodyBottom - lowH - 1); c.lineTo(back + L * 0.54, bodyBottom - Hh * 0.85); c.lineTo(back + L * (id === 'suv' ? 0.75 : 0.66), bodyBottom - Hh * 0.85); c.lineTo(back + L * 0.8, bodyBottom - lowH - 1); c.fill();
      } else if (id === 'pickup') {
        const lowH = Hh * 0.45;
        c.fillStyle = grad(Hh); rr(back, bodyBottom - lowH, L, lowH, lowH * 0.25); c.fill(); c.stroke();
        c.beginPath(); c.moveTo(back + L * 0.48, bodyBottom - lowH); c.lineTo(back + L * 0.5, bodyBottom - Hh * 0.95); c.lineTo(back + L * 0.72, bodyBottom - Hh * 0.95); c.lineTo(back + L * 0.84, bodyBottom - lowH); c.closePath(); c.fill(); c.stroke();
        c.fillStyle = glass; c.beginPath(); c.moveTo(back + L * 0.62, bodyBottom - lowH - 1); c.lineTo(back + L * 0.62, bodyBottom - Hh * 0.88); c.lineTo(back + L * 0.71, bodyBottom - Hh * 0.88); c.lineTo(back + L * 0.8, bodyBottom - lowH - 1); c.fill();
        c.fillStyle = shade(col, -0.4); c.fillRect(back + L * 0.04, bodyBottom - lowH - Hh * 0.08, L * 0.42, Hh * 0.08);
      } else if (id === 'van') {
        c.fillStyle = grad(Hh); rr(back, bodyBottom - Hh * 0.95, L, Hh * 0.95, Hh * 0.12); c.fill(); c.stroke();
        c.fillStyle = glass; c.beginPath(); c.moveTo(back + L * 0.82, bodyBottom - Hh * 0.88); c.lineTo(back + L * 0.92, bodyBottom - Hh * 0.88); c.lineTo(back + L * 0.99, bodyBottom - Hh * 0.5); c.lineTo(back + L * 0.82, bodyBottom - Hh * 0.5); c.fill();
        c.fillStyle = 'rgba(255,255,255,0.8)'; c.fillRect(back + L * 0.1, bodyBottom - Hh * 0.45, L * 0.6, Hh * 0.08);
      } else if (id === 'bus') {
        c.fillStyle = grad(Hh); rr(back, bodyBottom - Hh * 0.95, L, Hh * 0.95, Hh * 0.15); c.fill(); c.stroke();
        c.fillStyle = glass;
        for (let k = 0; k < 7; k++) rr(back + L * (0.05 + k * 0.125), bodyBottom - Hh * 0.82, L * 0.1, Hh * 0.32, 2), c.fill();
        c.fillStyle = '#333'; c.fillRect(back, bodyBottom - Hh * 0.3, L, Hh * 0.06);
      } else if (id === 'boxtruck' || id === 'semi' || id === 'dump') {
        const cabL = (id === 'semi' ? 3.2 : 2.4) * s;
        const cabX = back + L - cabL;
        // cargo
        if (id === 'dump') {
          c.fillStyle = '#d65f22'; c.beginPath(); c.moveTo(back, bodyBottom - Hh * 0.9); c.lineTo(cabX - 0.2 * s, bodyBottom - Hh * 0.9); c.lineTo(cabX - 0.6 * s, bodyBottom - Hh * 0.25); c.lineTo(back + 0.4 * s, bodyBottom - Hh * 0.25); c.closePath(); c.fill(); c.stroke();
          c.fillStyle = '#7a5a3a'; c.beginPath(); c.ellipse((back + cabX) / 2, bodyBottom - Hh * 0.9, (cabX - back) * 0.42, Hh * 0.12, 0, Math.PI, 0); c.fill();
          c.fillStyle = '#444'; c.fillRect(back, bodyBottom - Hh * 0.25, cabX - back, Hh * 0.12);
        } else {
          const boxH = Hh * (id === 'semi' ? 0.98 : 0.95);
          const bg = c.createLinearGradient(0, bodyBottom - boxH, 0, bodyBottom);
          bg.addColorStop(0, '#f4f4f2'); bg.addColorStop(1, '#c9c9c4');
          c.fillStyle = bg; rr(back, bodyBottom - boxH, cabX - back - 0.15 * s, boxH * 0.85, 2); c.fill(); c.stroke();
          c.fillStyle = col; c.fillRect(back + 0.3 * s, bodyBottom - boxH * 0.55, cabX - back - 0.8 * s, boxH * 0.12);
          c.fillStyle = '#444'; c.fillRect(back, bodyBottom - boxH * 0.15, cabX - back, boxH * 0.08);
        }
        // cab
        c.fillStyle = grad(Hh); rr(cabX, bodyBottom - Hh * 0.8, cabL, Hh * 0.8, Hh * 0.1); c.fill(); c.stroke();
        c.fillStyle = glass; c.beginPath(); c.moveTo(cabX + cabL * 0.5, bodyBottom - Hh * 0.74); c.lineTo(cabX + cabL * 0.9, bodyBottom - Hh * 0.74); c.lineTo(cabX + cabL * 0.98, bodyBottom - Hh * 0.42); c.lineTo(cabX + cabL * 0.5, bodyBottom - Hh * 0.42); c.fill();
      }
      // headlight
      c.fillStyle = '#fff6c0'; c.fillRect(back + L - 3, bodyBottom - Hh * 0.35, 3, Math.max(2, Hh * 0.08));
      if (dusk && v.state === 'drive') {
        const lg = c.createLinearGradient(back + L, 0, back + L + 6 * s, 0);
        lg.addColorStop(0, 'rgba(255,240,180,0.45)'); lg.addColorStop(1, 'rgba(255,240,180,0)');
        c.fillStyle = lg; c.beginPath(); c.moveTo(back + L, bodyBottom - Hh * 0.33); c.lineTo(back + L + 6 * s, bodyBottom - Hh * 0.33 - 1.2 * s); c.lineTo(back + L + 6 * s, bodyBottom + 0.6 * s); c.closePath(); c.fill();
      }
      c.fillStyle = '#d33'; c.fillRect(back, bodyBottom - Hh * 0.35, 2, Math.max(2, Hh * 0.08));
      // wheels
      const wheelXs = id === 'semi' ? [-sp.wheelbase / 2, -sp.wheelbase / 2 + 1.3, sp.wheelbase / 2 - 4, sp.wheelbase / 2] : id === 'bus' || id === 'dump' || id === 'boxtruck' ? [-sp.wheelbase / 2, -sp.wheelbase / 2 + (id === 'dump' ? 1.4 : 0), sp.wheelbase / 2] : [-sp.wheelbase / 2, sp.wheelbase / 2];
      for (const wx of wheelXs) {
        const px = wx * s;
        c.fillStyle = '#1d1d20'; c.beginPath(); c.arc(px, -wr, wr, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#9aa0a8'; c.beginPath(); c.arc(px, -wr, wr * 0.5, 0, Math.PI * 2); c.fill();
        c.strokeStyle = '#555'; c.lineWidth = 1;
        for (let k = 0; k < 3; k++) { const a = v.wheelRot * -1 + k * 2.094; c.beginPath(); c.moveTo(px, -wr); c.lineTo(px + Math.cos(a) * wr * 0.5, -wr + Math.sin(a) * wr * 0.5); c.stroke(); }
      }
      c.restore();
    }

    drawTank(c, tank, crane) {
      if (!tank) return;
      const s = this.s, x = this.sx(tank.x), y = this.sy(tank.y);
      if (crane && !tank.attached && !tank.fallen) {
        c.strokeStyle = '#333'; c.lineWidth = 2; c.beginPath(); c.moveTo(x, 0); c.lineTo(x, y - 1.8 * s); c.stroke();
        c.fillStyle = '#e5b22d'; c.fillRect(x - 6, y - 1.9 * s - 6, 12, 8);
      }
      c.save(); c.translate(x, y); c.rotate(-tank.ang);
      const w = 3.2 * s, h = 2.6 * s;
      // legs
      c.strokeStyle = '#555'; c.lineWidth = Math.max(2, s * 0.12);
      c.beginPath(); c.moveTo(-w * 0.35, h * 0.3); c.lineTo(-w * 0.42, h * 0.62); c.moveTo(w * 0.35, h * 0.3); c.lineTo(w * 0.42, h * 0.62); c.stroke();
      const g = c.createLinearGradient(-w / 2, 0, w / 2, 0);
      g.addColorStop(0, '#2b6aa6'); g.addColorStop(0.35, '#6fb2e6'); g.addColorStop(1, '#1f4f7d');
      c.fillStyle = g; c.strokeStyle = '#173a5c'; c.lineWidth = 1.5;
      c.beginPath(); c.rect(-w / 2, -h / 2, w, h * 0.85); c.fill(); c.stroke();
      c.beginPath(); c.ellipse(0, -h / 2, w / 2, h * 0.12, 0, 0, Math.PI * 2); c.fillStyle = '#4c8fcb'; c.fill(); c.stroke();
      c.fillStyle = '#fff'; c.font = `800 ${Math.max(9, s * 0.7)}px "M PLUS Rounded 1c", sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(Math.round(tank.mass / 1000) + 't', 0, -h * 0.05);
      c.restore();
    }

    // ------------------------------------------------------------
    // particles
    // ------------------------------------------------------------
    spawnBreak(ev) {
      const mat = ev.mat;
      const part = PARTS[ev.part];
      const mx = (ev.ax + ev.bx) / 2, my = (ev.ay + ev.by) / 2;
      // two halves of the beam fall as debris
      for (const half of [[ev.ax, ev.ay, mx, my, ev.avx, ev.avy], [mx, my, ev.bx, ev.by, ev.bvx, ev.bvy]]) {
        const cx = (half[0] + half[2]) / 2, cy = (half[1] + half[3]) / 2;
        this.particles.push({
          type: 'stick', part, x: cx, y: cy, len: Math.hypot(half[2] - half[0], half[3] - half[1]) * 0.95,
          ang: Math.atan2(half[3] - half[1], half[2] - half[0]), vx: (half[4] || 0) + (Math.random() - 0.5) * 3, vy: (half[5] || 0) + Math.random() * 2,
          w: (Math.random() - 0.5) * 6, life: 9, max: 9
        });
      }
      const n = mat === 'concrete' ? 22 : 16;
      for (let i = 0; i < n; i++) {
        const sp = 2 + Math.random() * 7, a = Math.random() * Math.PI * 2;
        if (mat === 'wood') this.particles.push({ type: 'splinter', x: mx, y: my, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp + 2, ang: a, w: (Math.random() - 0.5) * 20, len: 0.15 + Math.random() * 0.35, life: 2.5, max: 2.5, color: Math.random() < 0.5 ? '#c99050' : '#8a5a28' });
        else if (mat === 'steel') this.particles.push({ type: 'spark', x: mx, y: my, vx: Math.cos(a) * sp * 1.5, vy: Math.sin(a) * sp * 1.5 + 2, life: 0.6 + Math.random() * 0.5, max: 1.1 });
        else this.particles.push({ type: 'chunk', x: mx, y: my, vx: Math.cos(a) * sp * 0.7, vy: Math.sin(a) * sp * 0.7 + 1, ang: a, w: (Math.random() - 0.5) * 10, size: 0.12 + Math.random() * 0.3, life: 4, max: 4 });
      }
      for (let i = 0; i < (mat === 'concrete' ? 10 : 5); i++) this.particles.push({ type: 'dust', x: mx + (Math.random() - 0.5), y: my + (Math.random() - 0.5), vx: (Math.random() - 0.5) * 1.5, vy: Math.random() * 0.8, r: 0.3 + Math.random() * 0.5, life: 1.8, max: 1.8, color: mat === 'concrete' ? '200,195,185' : mat === 'wood' ? '180,140,90' : '170,170,170' });
      this.shake = Math.min(14, this.shake + (mat === 'concrete' ? 6 : 4));
    }
    spawnSplash(x, y, big) {
      const n = big ? 40 : 14;
      for (let i = 0; i < n; i++) {
        const a = Math.PI / 2 + (Math.random() - 0.5) * 1.6, sp = (big ? 6 : 3) + Math.random() * (big ? 8 : 4);
        this.particles.push({ type: 'drop', x: x + (Math.random() - 0.5) * (big ? 2 : 0.8), y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 2, max: 2, r: 0.06 + Math.random() * 0.12 });
      }
      this.particles.push({ type: 'ripple', x, y, r: 0.3, life: big ? 2.2 : 1.4, max: big ? 2.2 : 1.4, big });
      if (big) this.shake = Math.min(14, this.shake + 3);
    }
    spawnDust(x, y, amount) {
      for (let i = 0; i < amount; i++) this.particles.push({ type: 'dust', x: x + (Math.random() - 0.5) * 2, y: y + Math.random() * 0.5, vx: (Math.random() - 0.5) * 3, vy: Math.random() * 1.5, r: 0.4 + Math.random() * 0.8, life: 2.2, max: 2.2, color: '160,140,110' });
    }
    spawnConfetti() {
      for (let i = 0; i < 120; i++) {
        const w = this.toWorld(Math.random() * this.W, -10);
        this.particles.push({ type: 'confetti', x: w.x, y: w.y, vx: (Math.random() - 0.5) * 4, vy: -Math.random() * 2, ang: Math.random() * 6, w: (Math.random() - 0.5) * 10, life: 5, max: 5, color: `hsl(${Math.random() * 360},90%,60%)` });
      }
    }

    updateParticles(dt) {
      const lv = this.level, water = lv.water;
      for (const p of this.particles) {
        p.life -= dt;
        if (p.type === 'ripple') { p.r += dt * (p.big ? 3 : 2); continue; }
        if (p.type === 'dust') { p.x += p.vx * dt; p.y += p.vy * dt; p.r += dt * 0.8; continue; }
        const g = p.type === 'confetti' ? 1.5 : p.type === 'spark' ? 6 : 9.81;
        p.vy -= g * dt;
        if (p.type === 'confetti') { p.vx *= 0.99; p.vy = Math.max(p.vy, -2.5); }
        const inWater = water && p.x > water.x0 - 60 && p.x < water.x1 + 60 && p.y < water.y;
        if (inWater && p.type !== 'drop' && p.type !== 'spark') {
          if (!p.wet && (p.type === 'stick' || p.type === 'chunk')) { p.wet = true; if (Math.abs(p.vy) > 3) this.spawnSplash(p.x, water.y, p.type === 'stick' && p.len > 2); }
          p.vx *= 0.92; p.vy *= 0.85; if (p.part && p.part.mat === 'wood') p.vy += 12 * dt; // wood floats
          if (p.w) p.w *= 0.95;
        }
        if (inWater && p.type === 'drop' && p.vy < 0) p.life = 0;
        p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.w) p.ang += p.w * dt;
        const gy = groundAt(lv.terrain, p.x);
        if (p.y < gy && p.type !== 'confetti') {
          if (p.type === 'spark') { p.life = 0; continue; }
          if (p.type === 'stick' && Math.abs(p.vy) > 4 && !p.landed) { this.spawnDust(p.x, gy, 3); p.landed = true; }
          p.y = gy; p.vy = -p.vy * 0.2; p.vx *= 0.5; if (p.w) p.w *= 0.5;
        }
      }
      this.particles = this.particles.filter((p) => p.life > 0);
      if (this.particles.length > 900) this.particles.splice(0, this.particles.length - 900);
    }

    drawParticles(c) {
      const s = this.s;
      for (const p of this.particles) {
        const a = Math.min(1, p.life / Math.min(1, p.max) );
        const x = this.sx(p.x), y = this.sy(p.y);
        if (p.type === 'stick') {
          c.globalAlpha = Math.min(1, p.life / 1.5);
          const dx = Math.cos(p.ang) * p.len / 2, dy = Math.sin(p.ang) * p.len / 2;
          this.drawBeam(c, p.x - dx, p.y - dy, p.x + dx, p.y + dy, p.part, { alpha: Math.min(1, p.life / 1.5) });
        } else if (p.type === 'splinter') {
          c.globalAlpha = a; c.strokeStyle = p.color; c.lineWidth = 2;
          c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(p.ang) * p.len * s, y - Math.sin(p.ang) * p.len * s); c.stroke();
        } else if (p.type === 'spark') {
          c.globalAlpha = a; c.strokeStyle = '#ffd25a'; c.lineWidth = 2;
          c.beginPath(); c.moveTo(x, y); c.lineTo(x - p.vx * 0.02 * s, y + p.vy * 0.02 * s); c.stroke();
        } else if (p.type === 'chunk') {
          c.globalAlpha = a; c.fillStyle = '#a9a49a';
          c.save(); c.translate(x, y); c.rotate(p.ang); const r = p.size * s; c.fillRect(-r, -r * 0.7, r * 2, r * 1.4); c.restore();
        } else if (p.type === 'dust') {
          c.globalAlpha = 0.45 * (p.life / p.max); c.fillStyle = `rgb(${p.color})`;
          c.beginPath(); c.arc(x, y, p.r * s, 0, Math.PI * 2); c.fill();
        } else if (p.type === 'drop') {
          c.globalAlpha = a * 0.9; c.fillStyle = '#cfeaff';
          c.beginPath(); c.arc(x, y, Math.max(1.5, p.r * s), 0, Math.PI * 2); c.fill();
        } else if (p.type === 'ripple') {
          c.globalAlpha = 0.7 * (p.life / p.max); c.strokeStyle = '#e8f6ff'; c.lineWidth = 2;
          c.beginPath(); c.ellipse(x, y, p.r * s, p.r * s * 0.18, 0, 0, Math.PI * 2); c.stroke();
        } else if (p.type === 'confetti') {
          c.globalAlpha = Math.min(1, p.life); c.fillStyle = p.color;
          c.save(); c.translate(x, y); c.rotate(p.ang); c.fillRect(-4, -2, 8, 4); c.restore();
        }
      }
      c.globalAlpha = 1;
    }

    drawWindStreaks(c, dt, speed, dir) {
      if (speed <= 0.5) return;
      const k = Math.min(1, speed / 35);
      c.lineCap = 'round';
      for (const st of this.streaks) {
        st.x += dir * dt * (0.08 + speed * 0.012) * (0.7 + st.o * 0.6);
        if (st.x > 1.1) { st.x = -0.1; st.y = Math.random(); }
        if (st.x < -0.1) { st.x = 1.1; st.y = Math.random(); }
        const x = st.x * this.W, y = st.y * this.H + Math.sin(this.time * 3 + st.o * 10) * 8;
        const l = (30 + speed * 4) * st.l;
        c.strokeStyle = `rgba(255,255,255,${0.12 + k * 0.3 * st.o})`;
        c.lineWidth = 1 + st.o * 1.2;
        c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x - dir * l * 0.5, y - 4, x - dir * l, y + Math.sin(st.o * 6) * 3); c.stroke();
      }
    }

    // ------------------------------------------------------------
    // frame
    // ------------------------------------------------------------
    begin(dt) {
      this.time += dt;
      const c = this.ctx;
      c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      this.shake *= Math.pow(0.02, dt);
      const shx = (Math.random() - 0.5) * this.shake, shy = (Math.random() - 0.5) * this.shake;
      c.drawImage(this.bgCanvas, 0, 0, this.W, this.H);
      c.save();
      c.translate(shx, shy);
      return c;
    }
    end() { this.ctx.restore(); }

    /**
     * Draw a full frame.
     * st: { mode, nodes, beams, wind, windDir, vehicles, tank, stress, preview, hover, dt, usedAnchors }
     */
    frame(st) {
      const dt = st.dt || 1 / 60;
      this.windDir = st.windDir || 1;
      const c = this.begin(dt);
      this.drawClouds(c, dt, st.wind || 0);
      this.drawWater(c, false);
      c.drawImage(this.terrainCanvas, 0, 0, this.W, this.H);
      this.drawDecor(c, st.wind || 0);
      if (st.mode === 'build') this.drawGrid(c);
      this.drawTargetLine(c);
      this.drawAnchors(c, st.usedAnchors);
      if (st.nodes) this.drawStructure(c, st.nodes, st.beams, { stress: st.stress, hlBeam: st.hlBeam, hlNode: st.hlNode, hlColor: st.hlColor });
      if (st.vehicles) st.vehicles.forEach((v, i) => { if (v.state !== 'done' && v.state !== 'sunk' && (v.x > this.wx0 - 20)) this.drawVehicle(c, v, i); });
      if (st.tank) this.drawTank(c, st.tank, true);
      if (st.preview) this.drawPreview(c, st.preview);
      this.updateParticles(dt);
      this.drawParticles(c);
      this.drawWater(c, true);
      this.drawWindStreaks(c, dt, st.wind || 0, this.windDir);
      this.end();
    }

    drawPreview(c, p) {
      const part = PARTS[p.part];
      this.drawBeam(c, p.ax, p.ay, p.bx, p.by, part, { alpha: 0.75, invalid: !!p.error });
      this.drawJoint(c, p.bx, p.by, p.error ? '#ff5050' : '#ffd23c');
      const x = this.sx(p.bx), y = this.sy(p.by);
      const label = p.len.toFixed(1) + ' m' + (p.error ? '  ' + p.error : p.warn ? '  ' + p.warn : '');
      c.font = '700 14px "M PLUS Rounded 1c", sans-serif';
      const w = c.measureText(label).width + 16;
      c.fillStyle = p.error ? 'rgba(160,30,30,0.9)' : p.warn ? 'rgba(200,120,20,0.92)' : 'rgba(20,30,45,0.85)';
      const bx = Math.min(this.W - w - 4, x + 14), by = y - 34;
      c.beginPath(); c.roundRect ? c.roundRect(bx, by, w, 24, 8) : c.rect(bx, by, w, 24); c.fill();
      c.fillStyle = '#fff'; c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillText(label, bx + 8, by + 12);
    }

    // ------------------------------------------------------------
    // weak-point map (blueprint style) on any canvas
    // ------------------------------------------------------------
    drawWeakMap(canvas, level, design, sim, t) {
      const dpr = this.dpr;
      const W = canvas.clientWidth, H = canvas.clientHeight;
      canvas.width = W * dpr; canvas.height = H * dpr;
      const c = canvas.getContext('2d');
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.fillStyle = '#123a63'; c.fillRect(0, 0, W, H);
      // bounds from design + anchors
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      const pts = design.nodes.concat(level.anchors);
      for (const p of pts) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
      if (level.type === 'tower') y1 = Math.max(y1, level.targetHeight);
      x0 -= 3; x1 += 3; y0 -= 2; y1 += 3;
      const s = Math.min(W / (x1 - x0), H / (y1 - y0));
      const ox = W / 2 - ((x0 + x1) / 2) * s, oy = H / 2 + ((y0 + y1) / 2) * s;
      const X = (x) => ox + x * s, Y = (y) => oy - y * s;
      c.strokeStyle = 'rgba(255,255,255,0.08)'; c.lineWidth = 1;
      for (let x = Math.floor(x0); x <= x1; x++) { c.beginPath(); c.moveTo(X(x), 0); c.lineTo(X(x), H); c.stroke(); }
      for (let y = Math.floor(y0); y <= y1; y++) { c.beginPath(); c.moveTo(0, Y(y)); c.lineTo(W, Y(y)); c.stroke(); }
      // terrain outline
      c.strokeStyle = 'rgba(180,220,255,0.6)'; c.lineWidth = 2;
      c.beginPath(); level.terrain.forEach((p, i) => (i ? c.lineTo(X(p.x), Y(p.y)) : c.moveTo(X(p.x), Y(p.y)))); c.stroke();
      if (level.water) { c.strokeStyle = 'rgba(120,200,255,0.5)'; c.setLineDash([4, 4]); c.beginPath(); c.moveTo(X(level.water.x0), Y(level.water.y)); c.lineTo(X(level.water.x1), Y(level.water.y)); c.stroke(); c.setLineDash([]); }
      if (level.type === 'tower') { c.strokeStyle = 'rgba(255,240,120,0.7)'; c.setLineDash([6, 5]); c.beginPath(); c.moveTo(0, Y(level.targetHeight)); c.lineTo(W, Y(level.targetHeight)); c.stroke(); c.setLineDash([]); }
      // beams by peak stress
      const breaks = sim.record.breaks.slice(0, 3).map((b) => b.beam);
      sim.beams.forEach((b, i) => {
        const A = design.nodes[b.a], B = design.nodes[b.b];
        c.strokeStyle = stressColor(Math.min(1.1, b.peak));
        c.lineWidth = b.part.kind === 'road' ? 5 : b.part.kind === 'cable' ? 1.5 : 3;
        c.globalAlpha = 0.9;
        c.beginPath(); c.moveTo(X(A.x), Y(A.y)); c.lineTo(X(B.x), Y(B.y)); c.stroke();
      });
      c.globalAlpha = 1;
      design.nodes.forEach((n) => { if (n.anchor) { c.fillStyle = '#ffd23c'; c.fillRect(X(n.x) - 3, Y(n.y) - 3, 6, 6); } });
      // markers on the first breaks
      const pulse = 0.5 + 0.5 * Math.sin((t || 0) * 5);
      let highlight = breaks;
      if (!highlight.length) {
        const top = sim.beams.map((b, i) => [b.peak, i]).sort((a, b) => b[0] - a[0]).slice(0, 2).filter((x) => x[0] > 0.5).map((x) => x[1]);
        highlight = top;
      }
      highlight.forEach((bi, k) => {
        const b = sim.beams[bi], A = design.nodes[b.a], B = design.nodes[b.b];
        const mx = X((A.x + B.x) / 2), my = Y((A.y + B.y) / 2);
        c.strokeStyle = `rgba(255,80,80,${0.5 + pulse * 0.5})`; c.lineWidth = 3;
        c.beginPath(); c.arc(mx, my, 12 + pulse * 5, 0, Math.PI * 2); c.stroke();
        c.fillStyle = '#ff5050'; c.beginPath(); c.arc(mx + 14, my - 14, 9, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#fff'; c.font = '800 11px "M PLUS Rounded 1c", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(String(k + 1), mx + 14, my - 14);
      });
      // legend
      const lg = c.createLinearGradient(10, 0, 110, 0);
      lg.addColorStop(0, stressColor(0)); lg.addColorStop(0.5, stressColor(0.5)); lg.addColorStop(1, stressColor(1));
      c.fillStyle = lg; c.fillRect(10, H - 16, 100, 7);
      c.fillStyle = 'rgba(255,255,255,0.8)'; c.font = '600 10px "M PLUS Rounded 1c", sans-serif'; c.textAlign = 'left';
      c.fillText('0%', 10, H - 22); c.textAlign = 'right'; c.fillText('100%', 110, H - 22);
    }
  }

  CF.Renderer = Renderer;
  CF.RenderUtil = { stressColor, shade, mix };
})(typeof window !== 'undefined' ? window : globalThis);
