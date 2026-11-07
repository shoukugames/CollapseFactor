/*
 * Collapse Factor - animated tutorial: how structures work
 * Copyright (C) 2026 Shawn Rapaz. Licensed under the GNU GPL v3.0.
 */
(function (G) {
  'use strict';
  const CF = G.CF = G.CF || {};
  const FONT = '"M PLUS Rounded 1c", sans-serif';

  function arrow(c, x1, y1, x2, y2, col, w) {
    const a = Math.atan2(y2 - y1, x2 - x1), hl = Math.max(8, w * 3);
    c.strokeStyle = col; c.fillStyle = col; c.lineWidth = w; c.lineCap = 'round';
    c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2 - Math.cos(a) * hl * 0.6, y2 - Math.sin(a) * hl * 0.6); c.stroke();
    c.beginPath(); c.moveTo(x2, y2); c.lineTo(x2 - Math.cos(a - 0.45) * hl, y2 - Math.sin(a - 0.45) * hl); c.lineTo(x2 - Math.cos(a + 0.45) * hl, y2 - Math.sin(a + 0.45) * hl); c.closePath(); c.fill();
  }
  function beam(c, x1, y1, x2, y2, col, w) {
    c.strokeStyle = '#1b2430'; c.lineWidth = w + 3; c.lineCap = 'round';
    c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
    c.strokeStyle = col; c.lineWidth = w;
    c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
  }
  function joint(c, x, y) { c.fillStyle = '#2b313a'; c.beginPath(); c.arc(x, y, 6, 0, 7); c.fill(); c.fillStyle = '#d0d4da'; c.beginPath(); c.arc(x, y, 2.5, 0, 7); c.fill(); }
  function label(c, txt, x, y, size, col, align) { c.fillStyle = col || '#fff'; c.font = `700 ${size || 15}px ${FONT}`; c.textAlign = align || 'center'; c.textBaseline = 'middle'; c.fillText(txt, x, y); }
  function ground(c, w, y) { c.fillStyle = '#5c4a35'; c.fillRect(0, y, w, 400); c.fillStyle = '#5ea83c'; c.fillRect(0, y, w, 6); }

  function vehicle(c, x, y, len, h, col) {
    c.fillStyle = col; c.strokeStyle = 'rgba(0,0,0,0.5)'; c.lineWidth = 1.5;
    c.beginPath(); c.roundRect ? c.roundRect(x - len / 2, y - h, len, h * 0.7, 6) : c.rect(x - len / 2, y - h, len, h * 0.7); c.fill(); c.stroke();
    c.fillStyle = '#1d1d20';
    for (const wx of [x - len * 0.32, x + len * 0.32]) { c.beginPath(); c.arc(wx, y - h * 0.22, h * 0.22, 0, 7); c.fill(); }
  }

  const demos = [
    // 1. weight is a force
    function (c, w, h, t) {
      ground(c, w, h - 50);
      const t2 = CF.I18n.t, fmt = CF.I18n.fmtNum;
      const bob = Math.sin(t * 2) * 3;
      // car
      const cx = w * 0.28, tx = w * 0.7;
      vehicle(c, cx, h - 60, 90, 50, '#2f78c4');
      c.fillStyle = '#aab'; c.fillRect(cx - 60, h - 60, 120, 10);
      arrow(c, cx, h - 160 + bob, cx, h - 115 + bob, '#ff6b5a', 6);
      label(c, t2('veh_car') + ' 1,500 kg', cx, h - 190, 16);
      label(c, '≈ 14.7 kN', cx, h - 170, 14, '#ffd23c');
      // semi
      c.fillStyle = '#eee'; c.fillRect(tx - 110, h - 125, 160, 60); c.strokeStyle = '#555'; c.strokeRect(tx - 110, h - 125, 160, 60);
      c.fillStyle = '#d9453b'; c.fillRect(tx + 55, h - 115, 50, 50);
      c.fillStyle = '#1d1d20'; for (const wx of [tx - 90, tx - 65, tx + 20, tx + 85]) { c.beginPath(); c.arc(wx, h - 62, 12, 0, 7); c.fill(); }
      c.fillStyle = '#aab'; c.fillRect(tx - 125, h - 60, 245, 10);
      for (let k = -2; k <= 2; k++) arrow(c, tx + k * 40, h - 230 + bob, tx + k * 40, h - 135 + bob, '#ff6b5a', 9);
      label(c, t2('veh_semi') + ' 36,000 kg', tx, h - 265, 16);
      label(c, '≈ 353 kN  (×24)', tx, h - 245, 14, '#ffd23c');
      label(c, 'F = m × 9.81 m/s²', w / 2, 30, 20, '#9fe0ff');
    },
    // 2. tension & compression
    function (c, w, h, t) {
      const t2 = CF.I18n.t;
      const k = (Math.sin(t * 2) + 1) / 2;
      const cx = w / 2, L = Math.min(260, w * 0.32);
      // tension beam
      const st = 6 + k * 14;
      const y1 = h * 0.32;
      beam(c, cx - L / 2 - st, y1, cx + L / 2 + st, y1, CF.RenderUtil.stressColor(k * 0.9), 14);
      joint(c, cx - L / 2 - st, y1); joint(c, cx + L / 2 + st, y1);
      arrow(c, cx - L / 2 - st - 10, y1, cx - L / 2 - st - 60 - k * 20, y1, '#4fc3ff', 6);
      arrow(c, cx + L / 2 + st + 10, y1, cx + L / 2 + st + 60 + k * 20, y1, '#4fc3ff', 6);
      label(c, t2('tut_tension'), cx, y1 - 38, 17, '#4fc3ff');
      // compression beam
      const y2 = h * 0.7, sq = k * 14;
      beam(c, cx - L / 2 + sq, y2, cx + L / 2 - sq, y2, CF.RenderUtil.stressColor(k * 0.9), 14);
      joint(c, cx - L / 2 + sq, y2); joint(c, cx + L / 2 - sq, y2);
      arrow(c, cx - L / 2 + sq - 80 - k * 10, y2, cx - L / 2 + sq - 12, y2, '#ff7a5a', 6);
      arrow(c, cx + L / 2 - sq + 80 + k * 10, y2, cx + L / 2 - sq + 12, y2, '#ff7a5a', 6);
      label(c, t2('tut_compression'), cx, y2 - 38, 17, '#ff7a5a');
      // colour key
      const g = c.createLinearGradient(w * 0.3, 0, w * 0.7, 0);
      g.addColorStop(0, CF.RenderUtil.stressColor(0)); g.addColorStop(0.5, CF.RenderUtil.stressColor(0.5)); g.addColorStop(1, CF.RenderUtil.stressColor(1));
      c.fillStyle = g; c.fillRect(w * 0.3, h - 26, w * 0.4, 10);
      label(c, '0%', w * 0.3 - 20, h - 21, 12); label(c, '100%', w * 0.7 + 26, h - 21, 12);
    },
    // 3. triangles
    function (c, w, h, t) {
      const t2 = CF.I18n.t;
      ground(c, w, h - 40);
      const push = Math.max(0, Math.sin(t * 1.6));
      const S = Math.min(150, h * 0.5);
      // square
      const bx = w * 0.27, by = h - 40;
      const shear = push * S * 0.55;
      const sq = [[bx - S / 2, by], [bx + S / 2, by], [bx + S / 2 + shear, by - S * Math.cos(push * 0.6)], [bx - S / 2 + shear, by - S * Math.cos(push * 0.6)]];
      beam(c, ...sq[0], ...sq[3], '#b47e3c', 9); beam(c, ...sq[1], ...sq[2], '#b47e3c', 9); beam(c, ...sq[3], ...sq[2], '#b47e3c', 9);
      sq.forEach((p) => joint(c, p[0], p[1]));
      arrow(c, sq[3][0] - 80, sq[3][1], sq[3][0] - 10, sq[3][1], '#4fc3ff', 6);
      label(c, t2('tut_square'), bx, 34, 17, '#ffb0a0');
      // triangle
      const tx = w * 0.72, wob = push * 3;
      const tr = [[tx - S / 2, by], [tx + S / 2, by], [tx + wob, by - S]];
      beam(c, ...tr[0], ...tr[2], CF.RenderUtil.stressColor(push * 0.5), 9); beam(c, ...tr[1], ...tr[2], CF.RenderUtil.stressColor(push * 0.4), 9); beam(c, ...tr[0], ...tr[1], '#b47e3c', 9);
      tr.forEach((p) => joint(c, p[0], p[1]));
      arrow(c, tr[2][0] - 90, tr[2][1], tr[2][0] - 10, tr[2][1], '#4fc3ff', 6);
      label(c, t2('tut_triangle'), tx, 34, 17, '#a8f0a0');
    },
    // 4. buckling
    function (c, w, h, t) {
      const t2 = CF.I18n.t;
      ground(c, w, h - 40);
      const k = (Math.sin(t * 1.4) + 1) / 2;
      const by = h - 40;
      // long column
      const lx = w * 0.3, LH = h * 0.62;
      const bow = Math.max(0, k - 0.35) * 70;
      c.strokeStyle = '#1b2430'; c.lineWidth = 15; c.lineCap = 'round';
      c.beginPath(); c.moveTo(lx, by); c.quadraticCurveTo(lx + bow * 2, by - LH / 2, lx, by - LH + bow * 0.4); c.stroke();
      c.strokeStyle = CF.RenderUtil.stressColor(k); c.lineWidth = 11;
      c.beginPath(); c.moveTo(lx, by); c.quadraticCurveTo(lx + bow * 2, by - LH / 2, lx, by - LH + bow * 0.4); c.stroke();
      arrow(c, lx, by - LH - 70, lx, by - LH - 8 + bow * 0.4, '#ff7a5a', 7);
      label(c, t2('tut_long'), lx, 26, 17, '#ffb0a0');
      // short column
      const sx = w * 0.7, SH = LH / 2;
      beam(c, sx, by, sx, by - SH, CF.RenderUtil.stressColor(k * 0.35), 11);
      arrow(c, sx, by - SH - 70, sx, by - SH - 8, '#ff7a5a', 7);
      label(c, t2('tut_short'), sx, 26, 17, '#a8f0a0');
      label(c, 'P = π² E I / L²', w / 2, h * 0.45, 20, '#9fe0ff');
      label(c, 'L ÷ 2  →  P × 4', w / 2, h * 0.45 + 28, 16, '#ffd23c');
    },
    // 5. wind
    function (c, w, h, t) {
      ground(c, w, h - 40);
      const gust = 0.6 + 0.4 * Math.sin(t * 1.3) * Math.sin(t * 0.7 + 1);
      const by = h - 40, tx = w * 0.62, TH = h * 0.65, TW = 50;
      const sway = gust * 14;
      // braced tower
      const lv = 4;
      const pts = [];
      for (let i = 0; i <= lv; i++) { const f = i / lv; pts.push([[tx - TW / 2 + sway * f * f, by - TH * f], [tx + TW / 2 + sway * f * f, by - TH * f]]); }
      for (let i = 0; i < lv; i++) {
        const [a, b] = pts[i], [c2, d] = pts[i + 1];
        beam(c, ...a, ...c2, '#7f95aa', 6); beam(c, ...b, ...d, '#7f95aa', 6); beam(c, ...c2, ...d, '#7f95aa', 5);
        beam(c, ...a, ...d, CF.RenderUtil.stressColor(gust * 0.6), 4); beam(c, ...b, ...c2, CF.RenderUtil.stressColor(gust * 0.3), 4);
      }
      // streaks
      for (let i = 0; i < 14; i++) {
        const y = 40 + ((i * 47) % (h - 100)), x = ((t * (120 + i * 9) + i * 90) % (w + 200)) - 100;
        c.strokeStyle = 'rgba(255,255,255,0.45)'; c.lineWidth = 2;
        c.beginPath(); c.moveTo(x, y); c.lineTo(x - 50 - gust * 40, y); c.stroke();
      }
      // force bars
      const bx = 30, bw = Math.min(200, w * 0.3);
      label(c, '½ ρ v²', bx + bw / 2, 30, 19, '#9fe0ff');
      c.fillStyle = '#4fc3ff'; c.fillRect(bx, 56, bw * 0.25, 18); label(c, 'v = 10 m/s', bx + bw * 0.25 + 50, 65, 13, '#fff', 'left');
      c.fillStyle = '#ff7a5a'; c.fillRect(bx, 86, bw, 18); label(c, 'v = 20 m/s  → ×4', bx + 6, 95, 13, '#fff', 'left');
    },
    // 6. materials
    function (c, w, h, t) {
      const t2 = CF.I18n.t, P = CF.Physics.PARTS;
      const mats = [['wood_beam', '#b47e3c'], ['steel_beam', '#7f95aa'], ['steel_cable', '#30353c'], ['concrete_beam', '#bdb8ae']];
      const rows = [[t2('tut_mat_strength_t'), (p) => p.tension / 1300e3], [t2('tut_mat_strength_c'), (p) => p.crush / 1300e3], [t2('tut_mat_weight'), (p) => p.massPerM / 130]];
      const colW = (w - 60) / mats.length;
      mats.forEach(([id, col], i) => {
        const x = 30 + i * colW + colW / 2;
        beam(c, x - colW * 0.35, 36, x + colW * 0.35, 36, col, 12);
        label(c, t2('part_' + id), x, 64, 14);
        rows.forEach(([name, f], r) => {
          const y = 96 + r * ((h - 110) / 3);
          const val = Math.min(1, f(P[id]));
          const anim = Math.min(1, (t * 0.8) % 4);
          c.fillStyle = 'rgba(255,255,255,0.12)'; c.fillRect(x - colW * 0.38, y + 18, colW * 0.76, 14);
          c.fillStyle = r === 2 ? '#ffb35a' : r === 0 ? '#4fc3ff' : '#ff7a5a';
          c.fillRect(x - colW * 0.38, y + 18, colW * 0.76 * val * anim, 14);
          if (i === 0) label(c, name, 30, y + 6, 12, '#cfe', 'left');
        });
      });
    },
    // 7. how to play
    function (c, w, h, t) {
      const t2 = CF.I18n.t;
      const gy = h * 0.62;
      c.fillStyle = '#3f8fc4'; c.fillRect(w * 0.3, gy + 20, w * 0.4, h);
      c.fillStyle = '#86603a';
      c.beginPath(); c.moveTo(0, gy); c.lineTo(w * 0.3, gy); c.lineTo(w * 0.36, h); c.lineTo(0, h); c.fill();
      c.beginPath(); c.moveTo(w, gy); c.lineTo(w * 0.7, gy); c.lineTo(w * 0.64, h); c.lineTo(w, h); c.fill();
      c.fillStyle = '#5ea83c'; c.fillRect(0, gy - 4, w * 0.3, 6); c.fillRect(w * 0.7, gy - 4, w * 0.3, 6);
      const A = [w * 0.3, gy], B = [w * 0.7, gy];
      const k = (t * 0.45) % 1;
      const mid = [w * 0.5, gy];
      const top = [w * 0.4, gy - 70];
      const pulse = 0.5 + 0.5 * Math.sin(t * 5);
      for (const p of [A, B]) { c.fillStyle = `rgba(255,214,60,${0.2 + pulse * 0.3})`; c.beginPath(); c.arc(p[0], p[1], 18, 0, 7); c.fill(); c.fillStyle = '#ffd23c'; c.beginPath(); c.arc(p[0], p[1], 7, 0, 7); c.fill(); }
      // animated drag
      const stage = Math.floor((t * 0.45) % 3);
      const seg = [[A, mid], [mid, B], [A, top]][stage];
      for (let s2 = 0; s2 < stage; s2++) { const sg = [[A, mid], [mid, B], [A, top]][s2]; beam(c, ...sg[0], ...sg[1], s2 < 2 ? '#8f6230' : '#b47e3c', s2 < 2 ? 12 : 7); }
      const cur = [seg[0][0] + (seg[1][0] - seg[0][0]) * Math.min(1, k * 3 % 3), seg[0][1] + (seg[1][1] - seg[0][1]) * Math.min(1, k * 3 % 3)];
      beam(c, ...seg[0], ...cur, stage < 2 ? '#8f6230' : '#b47e3c', stage < 2 ? 12 : 7);
      c.globalAlpha = 1;
      // cursor
      c.fillStyle = '#fff'; c.strokeStyle = '#000'; c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(cur[0], cur[1]); c.lineTo(cur[0] + 4, cur[1] + 18); c.lineTo(cur[0] + 8, cur[1] + 12); c.lineTo(cur[0] + 15, cur[1] + 14); c.closePath(); c.fill(); c.stroke();
      label(c, '120', w - 50, 30, 26, '#ffd23c');
      c.strokeStyle = '#ffd23c'; c.lineWidth = 4; c.beginPath(); c.arc(w - 50, 30, 24, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - (t % 12) / 12)); c.stroke();
      label(c, t2('time'), w - 50, 66, 13);
    }
  ];

  let page = 0, raf = 0, t0 = 0, canvas, ctx;
  function render(ts) {
    if (!canvas) return;
    const t = (ts - t0) / 1000;
    const dpr = Math.min(2, G.devicePixelRatio || 1);
    const W = canvas.clientWidth, H = canvas.clientHeight;
    if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) { canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#1d3557'); g.addColorStop(1, '#2a5a85');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    demos[page](ctx, W, H, t);
    raf = requestAnimationFrame(render);
  }

  function open(cv, p) { canvas = cv; ctx = cv.getContext('2d'); page = p || 0; t0 = performance.now(); cancelAnimationFrame(raf); raf = requestAnimationFrame(render); }
  function setPage(p) { page = p; t0 = performance.now(); }
  function close() { cancelAnimationFrame(raf); canvas = null; }

  CF.Tutorial = { open, close, setPage, count: demos.length };
})(typeof window !== 'undefined' ? window : globalThis);
