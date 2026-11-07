/*
 * Collapse Factor - level play: building, testing, results
 * Copyright (C) 2026 Shawn Rapaz. Licensed under the GNU GPL v3.0.
 */
(function (G) {
  'use strict';
  const CF = G.CF = G.CF || {};
  const { PARTS, PART_ORDER, VEHICLES, MAX_ROAD_SLOPE, groundAt, Sim } = CF.Physics;
  const t = (k, v) => CF.I18n.t(k, v);
  const $ = (id) => document.getElementById(id);

  const SWATCH = {
    wood_road: 'linear-gradient(180deg,#8f6230 0 35%,#c08a48 35%)', wood_beam: '#b47e3c',
    steel_road: 'linear-gradient(180deg,#3a3b40 0 35%,#8ea3b7 35%)', steel_beam: '#7f95aa', steel_cable: 'repeating-linear-gradient(90deg,#22262b 0 6px,#55606b 6px 8px)',
    concrete_road: 'linear-gradient(180deg,#3a3b40 0 35%,#c9c4ba 35%)', concrete_beam: '#bdb8ae'
  };

  const Game = {
    state: 'idle', level: null, design: null, sim: null, renderer: null,
    part: null, tool: 'build', drag: null, hover: null, undoStack: [],
    timeLeft: 120, paused: false, speed: 1, stressView: true, resultShown: false,
    creakT: 0, breakTimes: [], collapsePlayed: false, thudT: 0,

    init(renderer, hooks) {
      this.renderer = renderer;
      this.hooks = hooks;
      const cv = renderer.canvas;
      cv.addEventListener('pointerdown', (e) => this.onDown(e));
      cv.addEventListener('pointermove', (e) => this.onMove(e));
      G.addEventListener('pointerup', (e) => this.onUp(e));
      cv.addEventListener('contextmenu', (e) => { e.preventDefault(); });
      G.addEventListener('keydown', (e) => this.onKey(e));
      $('btn-test').onclick = () => { CF.Audio.sfx.click(); this.startTest(); };
      $('btn-pause').onclick = () => this.pause(true);
      $('tool-undo').onclick = () => this.undo();
      $('tool-erase').onclick = () => this.setTool(this.tool === 'erase' ? 'build' : 'erase');
      $('tool-clear').onclick = () => {
        if (!this.design.beams.length) return;
        this.hooks.confirm(t('confirm_clear'), () => { this.pushUndo(); this.design = { nodes: [], beams: [] }; CF.Audio.sfx.remove(); this.refreshPalette(); });
      };
      $('btn-brief-go').onclick = () => { CF.Audio.sfx.click(); $('modal-brief').classList.add('hidden'); this.state = 'build'; this.showHint(); };
      $('btn-resume').onclick = () => this.pause(false);
      $('btn-restart').onclick = () => { this.pause(false); this.start(this.level.number, this.level.difficulty, { level: this.level }); };
      $('btn-quit-menu').onclick = () => { this.pause(false); this.exit(); this.hooks.toMenu(); };
      $('chk-stress').onchange = (e) => { this.stressView = e.target.checked; };
      document.querySelectorAll('#seg-speed button').forEach((b) => {
        b.onclick = () => { this.speed = +b.dataset.v; this.syncSpeed(); CF.Audio.sfx.toggle(); };
      });
      $('btn-next').onclick = () => { CF.Audio.sfx.click(); this.hideResult(); this.start(this.level.number + 1, this.level.difficulty); };
      $('btn-retry').onclick = () => { CF.Audio.sfx.click(); this.hideResult(); this.start(this.level.number, this.level.difficulty, { level: this.level, design: this.lastDesign }); };
      $('btn-newlayout').onclick = () => { CF.Audio.sfx.click(); this.hideResult(); this.start(this.level.number, this.level.difficulty); };
      $('btn-levels').onclick = () => { CF.Audio.sfx.click(); this.hideResult(); this.exit(); this.hooks.toLevels(); };
    },

    syncSpeed() { document.querySelectorAll('#seg-speed button').forEach((b) => b.classList.toggle('on', +b.dataset.v === this.speed)); },

    // ------------------------------------------------------------
    // level lifecycle
    // ------------------------------------------------------------
    start(n, difficulty, opts) {
      opts = opts || {};
      // stop the previous level immediately (it must not finish in the background)
      this.state = 'loading';
      this.sim = null;
      this.hideResult();
      ['modal-pause', 'modal-brief'].forEach((id) => $(id).classList.add('hidden'));
      CF.Audio.stopLoops();
      this.hooks.showLoading(true);
      // let the loading overlay paint before the (blocking) generation
      setTimeout(() => {
        const level = opts.level || CF.LevelGen.generate(n, difficulty);
        this.hooks.showLoading(false);
        this.level = level;
        this.design = opts.design ? JSON.parse(JSON.stringify(opts.design)) : { nodes: [], beams: [] };
        this.sim = null; this.undoStack = []; this.drag = null; this.hover = null;
        this.timeLeft = level.buildTime; this.lastTick = Math.ceil(this.timeLeft);
        this.paused = false; this.speed = 1; this.syncSpeed(); this.resultShown = false;
        this.breakTimes = []; this.collapsePlayed = false;
        this.part = level.allowedParts.find((p) => PARTS[p].kind === 'road') || level.allowedParts[0];
        this.tool = 'build';
        this.renderer.setMargins({ top: 84, bottom: 128, left: 14, right: 14 });
        this.renderer.setLevel(level);
        this.state = 'brief';
        $('hud').classList.remove('hidden');
        $('palette-bar').classList.remove('hidden');
        $('test-bar').classList.add('hidden');
        $('btn-test').classList.remove('hidden');
        $('timer').classList.remove('hidden', 'urgent');
        this.buildHud();
        this.refreshPalette();
        this.updateTimer();
        this.showBrief();
        CF.Audio.setMood('build');
        CF.Audio.setAmbience(level.theme);
        CF.Audio.stopLoops();
      }, 30);
    },

    exit() {
      this.state = 'idle';
      $('hud').classList.add('hidden');
      CF.Audio.stopLoops();
      CF.Audio.setAmbience('none');
      CF.Audio.setMood('calm');
    },

    // ------------------------------------------------------------
    // HUD
    // ------------------------------------------------------------
    themeName(lv) { return t('theme_' + lv.theme); },
    buildHud() {
      const lv = this.level;
      $('hud-level-num').textContent = lv.number;
      $('hud-theme').textContent = this.themeName(lv) + ' · ' + t('test_' + lv.test);
      const info = $('hud-info');
      info.innerHTML = '';
      const add = (html) => { const d = document.createElement('div'); d.className = 'item'; d.innerHTML = html; info.appendChild(d); };
      if (lv.type === 'bridge') {
        add(`${t('span')}: <b>${lv.span} m</b>`);
        if (lv.vehicles.length) add(lv.vehicles.map((v) => `<span class="veh">${t('veh_' + v)} ${CF.I18n.fmtNum(VEHICLES[v].mass)} kg</span>`).join(' '));
      } else {
        add(`${t('target_height')}: <b>${lv.targetHeight} m</b>`);
        add(`${t('load')}: <b>${CF.I18n.fmtNum(lv.loadMass)} kg</b>`);
      }
      if (lv.wind) add(`${t('wind')}: <b>${Math.round(lv.wind.speed * 3.6)} km/h</b> ${lv.wind.dir > 0 ? '→' : '←'}`);
    },

    showBrief() {
      const lv = this.level, fmt = CF.I18n.fmtNum;
      $('brief-num').textContent = lv.number;
      $('brief-theme').textContent = this.themeName(lv);
      $('brief-test').textContent = t('test_' + lv.test);
      let goal;
      if (lv.type === 'bridge') goal = lv.test === 'wind' ? t('brief_bridge_wind') : t('brief_bridge');
      else goal = lv.wind ? t('brief_tower_wind') : t('brief_tower');
      $('brief-goal').textContent = goal;
      $('brief-road').classList.toggle('hidden', lv.type !== 'bridge');
      let loads = '';
      if (lv.type === 'bridge') {
        loads += `<h4>${t('span')}</h4><div class="load-list"><span class="veh">${lv.span} m</span></div>`;
        if (lv.vehicles.length) loads += `<h4>${t('vehicles')}</h4><div class="load-list">` + lv.vehicles.map((v) => `<span class="veh">${t('veh_' + v)} <small>${fmt(VEHICLES[v].mass)} kg</small></span>`).join('') + '</div>';
      } else {
        loads += `<h4>${t('target_height')}</h4><div class="load-list"><span class="veh">${lv.targetHeight} m</span></div>`;
        loads += `<h4>${t('load')}</h4><div class="load-list"><span class="veh">${fmt(lv.loadMass)} kg</span></div>`;
      }
      if (lv.wind) loads += `<h4>${t('wind')}</h4><div class="load-list"><span class="veh">${Math.round(lv.wind.speed * 3.6)} km/h <small>(${lv.wind.speed} m/s)</small></span></div>`;
      $('brief-loads').innerHTML = loads;
      $('brief-mats').innerHTML = lv.allowedParts.map((p) => `<div class="m"><span>${t('part_' + p)}</span><span>${lv.inventory[p]} m</span></div>`).join('');
      $('modal-brief').classList.remove('hidden');
    },

    used() {
      const u = {};
      for (const b of this.design.beams) {
        const A = this.design.nodes[b.a], B = this.design.nodes[b.b];
        u[b.part] = (u[b.part] || 0) + Math.hypot(B.x - A.x, B.y - A.y);
      }
      return u;
    },
    remaining(part) { return this.level.inventory[part] - (this.used()[part] || 0); },

    refreshPalette() {
      const lv = this.level, pal = $('palette');
      const u = this.used();
      pal.innerHTML = '';
      lv.allowedParts.forEach((p, i) => {
        const part = PARTS[p];
        const inv = lv.inventory[p], rem = Math.max(0, inv - (u[p] || 0));
        const el = document.createElement('div');
        el.className = 'part' + (p === this.part && this.tool === 'build' ? ' sel' : '') + (rem < 1 ? ' empty' : '');
        const tip = part.kind === 'cable' ? t('tip_cable') : t('tip_' + part.mat);
        el.title = (part.kind === 'road' ? t('tip_road') + '\n' : '') + tip;
        el.innerHTML = `<div class="swatch" style="background:${SWATCH[p]}"></div>
          <div class="pname">${t('part_' + p)}</div>
          <div class="pmeta">${rem.toFixed(1)} / ${inv} m · ${t('max_len')} ${part.maxLen} m</div>
          <div class="bar"><i style="width:${(rem / inv) * 100}%"></i></div>
          <span class="key">${i + 1}</span>${part.kind === 'road' ? '<span class="road-tag">ROAD</span>' : ''}`;
        el.onclick = () => { this.part = p; this.setTool('build'); CF.Audio.sfx.toggle(); };
        pal.appendChild(el);
      });
      $('tool-erase').classList.toggle('active', this.tool === 'erase');
    },

    setTool(tool) { this.tool = tool; this.refreshPalette(); this.showHint(); },
    showHint() { const h = $('hint'); h.textContent = this.tool === 'erase' ? t('hint_erase') : t('hint_start'); h.classList.toggle('hidden', this.state !== 'build'); },

    updateTimer() {
      const tl = Math.max(0, this.timeLeft);
      $('timer-text').textContent = Math.ceil(tl);
      $('timer-ring').style.strokeDashoffset = String(119.4 * (1 - tl / this.level.buildTime));
      $('timer').classList.toggle('urgent', tl <= 10 && this.state === 'build');
    },

    banner(text, ms) {
      const b = $('banner');
      b.textContent = text; b.classList.add('show');
      clearTimeout(this._bt);
      this._bt = setTimeout(() => b.classList.remove('show'), ms || 1600);
    },

    // ------------------------------------------------------------
    // building
    // ------------------------------------------------------------
    pointerWorld(e) {
      const r = this.renderer.canvas.getBoundingClientRect();
      return this.renderer.toWorld(e.clientX - r.left, e.clientY - r.top);
    },
    findNode(x, y) { return this.design.nodes.findIndex((n) => Math.abs(n.x - x) < 1e-6 && Math.abs(n.y - y) < 1e-6); },
    anchorAt(x, y) { return this.level.anchors.find((a) => a.x === x && a.y === y); },

    nearestPoint(w) {
      // nearest existing node or anchor within reach
      let best = null, bd = 0.75;
      for (const n of this.design.nodes) { const d = Math.hypot(n.x - w.x, n.y - w.y); if (d < bd) { bd = d; best = { x: n.x, y: n.y }; } }
      for (const a of this.level.anchors) { const d = Math.hypot(a.x - w.x, a.y - w.y); if (d < bd) { bd = d; best = { x: a.x, y: a.y }; } }
      return best;
    },

    nearestBeam(w) {
      let best = -1, bd = 0.5;
      this.design.beams.forEach((b, i) => {
        const A = this.design.nodes[b.a], B = this.design.nodes[b.b];
        const dx = B.x - A.x, dy = B.y - A.y, L2 = dx * dx + dy * dy;
        const tt = Math.max(0, Math.min(1, ((w.x - A.x) * dx + (w.y - A.y) * dy) / L2));
        const d = Math.hypot(A.x + dx * tt - w.x, A.y + dy * tt - w.y);
        if (d < bd) { bd = d; best = i; }
      });
      return best;
    },

    validate(ax, ay, bx, by, part) {
      const lv = this.level, p = PARTS[part];
      const len = Math.hypot(bx - ax, by - ay);
      const res = { len, error: null, warn: null };
      const b = lv.build;
      const endIsAnchor = !!this.anchorAt(bx, by);
      if (len < 0.5) { res.error = ' '; return res; }
      if (len > p.maxLen + 1e-6) res.error = t('warn_len');
      else if (bx < b.x0 || bx > b.x1 || by < b.y0 || by > b.y1) res.error = t('warn_bounds');
      else if (!endIsAnchor && this.findNode(bx, by) < 0 && by < groundAt(lv.terrain, bx) + 0.3) res.error = t('warn_ground');
      else {
        for (let k = 1; k < 20; k++) {
          const tt = k / 20, x = ax + (bx - ax) * tt, y = ay + (by - ay) * tt;
          if (y < groundAt(lv.terrain, x) - 0.08) { res.error = t('warn_ground'); break; }
        }
      }
      if (!res.error) {
        const ia = this.findNode(ax, ay), ib = this.findNode(bx, by);
        if (ia >= 0 && ib >= 0 && this.design.beams.some((bm) => (bm.a === ia && bm.b === ib) || (bm.a === ib && bm.b === ia))) res.error = t('warn_dup');
      }
      if (!res.error && this.remaining(part) < len - 1e-6) res.error = t('warn_mat');
      if (!res.error && p.kind === 'road' && Math.abs(Math.atan2(by - ay, Math.abs(bx - ax))) > MAX_ROAD_SLOPE) res.warn = t('warn_steep');
      return res;
    },

    targetFor(start, w) {
      const p = PARTS[this.part];
      let dx = w.x - start.x, dy = w.y - start.y;
      const d = Math.hypot(dx, dy);
      // snap to an existing node/anchor near the cursor first
      const near = this.nearestPoint(w);
      if (near && Math.hypot(near.x - start.x, near.y - start.y) <= p.maxLen + 1e-6 && Math.hypot(near.x - w.x, near.y - w.y) < 0.45) return near;
      let tx = w.x, ty = w.y;
      if (d > p.maxLen) { tx = start.x + dx / d * p.maxLen; ty = start.y + dy / d * p.maxLen; }
      let best = null, bd = 1e9;
      for (let gx = Math.floor(tx) - 1; gx <= Math.ceil(tx) + 1; gx++) {
        for (let gy = Math.floor(ty) - 1; gy <= Math.ceil(ty) + 1; gy++) {
          if (Math.hypot(gx - start.x, gy - start.y) > p.maxLen + 1e-6) continue;
          const dd = Math.hypot(gx - tx, gy - ty);
          if (dd < bd) { bd = dd; best = { x: gx, y: gy }; }
        }
      }
      return best || { x: Math.round(tx), y: Math.round(ty) };
    },

    onDown(e) {
      CF.Audio.resume();
      if (this.state !== 'build' || this.paused) return;
      const w = this.pointerWorld(e);
      if (e.button === 2 || this.tool === 'erase') { this.eraseAt(w); return; }
      if (e.button !== 0) return;
      const start = this.nearestPoint(w);
      if (!start) { this.hooks.toast(t('warn_start')); CF.Audio.sfx.error(); return; }
      if (this.remaining(this.part) < 0.99) { this.hooks.toast(t('warn_mat')); CF.Audio.sfx.error(); return; }
      this.drag = { start, target: start, w };
      this.renderer.canvas.setPointerCapture && this.renderer.canvas.setPointerCapture(e.pointerId);
    },
    onMove(e) {
      if (this.state !== 'build') return;
      const w = this.pointerWorld(e);
      this.mouse = w;
      if (this.drag) {
        this.drag.target = this.targetFor(this.drag.start, w);
        const tg = this.drag.target;
        this.drag.check = this.validate(this.drag.start.x, this.drag.start.y, tg.x, tg.y, this.part);
      }
    },
    onUp(e) {
      if (!this.drag || this.state !== 'build') { this.drag = null; return; }
      const d = this.drag; this.drag = null;
      const tg = d.target;
      if (!tg || (tg.x === d.start.x && tg.y === d.start.y)) return;
      const chk = this.validate(d.start.x, d.start.y, tg.x, tg.y, this.part);
      if (chk.error) { if (chk.error.trim()) { this.hooks.toast(chk.error); CF.Audio.sfx.error(); } return; }
      this.pushUndo();
      const ia = this.ensureNode(d.start.x, d.start.y), ib = this.ensureNode(tg.x, tg.y);
      this.design.beams.push({ a: ia, b: ib, part: this.part });
      const p = PARTS[this.part];
      CF.Audio.sfx.place(p.mat, p.kind);
      this.refreshPalette();
      if (this.remaining(this.part) < 0.99) {
        const alt = this.level.allowedParts.find((q) => PARTS[q].kind === p.kind && this.remaining(q) >= 1);
        if (alt) this.part = alt, this.refreshPalette();
      }
    },
    ensureNode(x, y) {
      let i = this.findNode(x, y);
      if (i >= 0) return i;
      this.design.nodes.push({ x, y, anchor: !!this.anchorAt(x, y) });
      return this.design.nodes.length - 1;
    },
    eraseAt(w) {
      const near = this.nearestPoint(w);
      let changed = false;
      if (near) {
        const ni = this.findNode(near.x, near.y);
        if (ni >= 0 && Math.hypot(near.x - w.x, near.y - w.y) < 0.45) {
          const before = this.design.beams.length;
          if (before && this.design.beams.some((b) => b.a === ni || b.b === ni)) {
            this.pushUndo();
            this.design.beams = this.design.beams.filter((b) => b.a !== ni && b.b !== ni);
            changed = true;
          }
        }
      }
      if (!changed) {
        const bi = this.nearestBeam(w);
        if (bi >= 0) { this.pushUndo(); this.design.beams.splice(bi, 1); changed = true; }
      }
      if (changed) { this.cleanup(); CF.Audio.sfx.remove(); this.refreshPalette(); }
    },
    cleanup() {
      const deg = new Array(this.design.nodes.length).fill(0);
      this.design.beams.forEach((b) => { deg[b.a]++; deg[b.b]++; });
      const map = [], nodes = [];
      this.design.nodes.forEach((n, i) => { if (deg[i] > 0) { map[i] = nodes.length; nodes.push(n); } });
      this.design.beams.forEach((b) => { b.a = map[b.a]; b.b = map[b.b]; });
      this.design.nodes = nodes;
    },
    pushUndo() { this.undoStack.push(JSON.stringify(this.design)); if (this.undoStack.length > 120) this.undoStack.shift(); },
    undo() {
      if (this.state !== 'build' || !this.undoStack.length) return;
      this.design = JSON.parse(this.undoStack.pop());
      CF.Audio.sfx.remove();
      this.refreshPalette();
    },

    onKey(e) {
      if (this.state === 'idle') return;
      if (e.key === 'Escape') { if (this.state === 'build' || this.state === 'test') this.pause(!this.paused); return; }
      if (this.paused || this.state !== 'build') return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); this.undo(); return; }
      if (e.key >= '1' && e.key <= '9') {
        const p = this.level.allowedParts[+e.key - 1];
        if (p) { this.part = p; this.setTool('build'); CF.Audio.sfx.toggle(); }
      }
      if (e.key.toLowerCase() === 'e' || e.key === 'Delete') this.setTool(this.tool === 'erase' ? 'build' : 'erase');
      if (e.key === ' ') { e.preventDefault(); this.startTest(); }
    },

    pause(on) {
      if (this.state !== 'build' && this.state !== 'test') return;
      this.paused = on;
      $('modal-pause').classList.toggle('hidden', !on);
      CF.Audio.sfx.click();
      if (on) CF.Audio.stopLoops();
    },

    // ------------------------------------------------------------
    // testing
    // ------------------------------------------------------------
    startTest(timeUp) {
      if (this.state !== 'build') return;
      this.drag = null;
      this.state = 'test';
      this.lastDesign = JSON.parse(JSON.stringify(this.design));
      const simDesign = { nodes: this.design.nodes.map((n) => ({ x: n.x, y: n.y, anchor: n.anchor })), beams: this.design.beams.map((b) => ({ a: b.a, b: b.b, part: b.part })) };
      this.sim = new Sim(this.level, simDesign);
      this.simDesign = simDesign;
      $('palette-bar').classList.add('hidden');
      $('hint').classList.add('hidden');
      $('btn-test').classList.add('hidden');
      $('timer').classList.add('hidden');
      $('test-bar').classList.remove('hidden');
      $('m-load-label').textContent = this.level.type === 'bridge' ? t('load_now') : t('load');
      this.banner(timeUp ? t('time_up') : t('test_starting'), 1600);
      CF.Audio.sfx.testStart();
      CF.Audio.setMood('test');
      this.usageFrac = this.usageFraction();
      const u = this.used(), ru = CF.LevelGen.usage(this.level.reference);
      const tot = (o) => Object.values(o).reduce((a, b) => a + b, 0);
      this.refRatio = tot(u) / Math.max(1, tot(ru));
    },

    usageFraction() {
      const u = this.used(); let used = 0, inv = 0;
      for (const p of this.level.allowedParts) { used += u[p] || 0; inv += this.level.inventory[p]; }
      // relative to what a good design needs (inventory is generous)
      return inv ? used / inv : 1;
    },

    handleEvents() {
      const sim = this.sim, r = this.renderer;
      for (const ev of sim.events) {
        const pan = ev.ax !== undefined ? (r.sx((ev.ax + ev.bx) / 2) / r.W) * 2 - 1 : ev.x !== undefined ? (r.sx(ev.x) / r.W) * 2 - 1 : 0;
        switch (ev.type) {
          case 'break': {
            r.spawnBreak(ev);
            CF.Audio.sfx.break(ev.mat, ev.kind, pan);
            const now = sim.t;
            this.breakTimes.push(now);
            this.breakTimes = this.breakTimes.filter((x) => now - x < 1.2);
            if (this.breakTimes.length >= 3 && !this.collapsePlayed) { this.collapsePlayed = true; CF.Audio.sfx.collapse(sim.record.breaks.length); r.shake = 18; }
            break;
          }
          case 'splash': r.spawnSplash(ev.x, ev.y, ev.big); CF.Audio.sfx.splash(ev.big); break;
          case 'crash': CF.Audio.sfx.crash(ev.mass); r.spawnDust(ev.x, ev.y, 10); r.shake = Math.min(16, r.shake + 6); break;
          case 'thud': if (sim.t - this.thudT > 0.12) { this.thudT = sim.t; CF.Audio.sfx.thud(ev.v); r.spawnDust(ev.x, ev.y, 2); } break;
          case 'vehicleFall': CF.Audio.sfx.horn(); break;
          case 'tankLand': CF.Audio.sfx.tankLand(); r.shake = 4; break;
          case 'tankFall': CF.Audio.sfx.clank(); break;
          case 'end':
            if (!this.collapsePlayed && !ev.success && sim.record.breaks.length >= 2) { this.collapsePlayed = true; CF.Audio.sfx.collapse(sim.record.breaks.length); }
            break;
        }
      }
      sim.events.length = 0;
    },

    testAudio(dt) {
      const sim = this.sim;
      CF.Audio.setWind(sim.windNow);
      if (sim.vehicles) {
        let n = 0, heavy = false;
        for (const v of sim.vehicles) if (v.state === 'drive' && sim.t > v.delay && v.speed > 0.5) { n++; if (v.spec.mass > 7000) heavy = true; }
        CF.Audio.setEngine(n, heavy);
      }
      this.creakT -= dt;
      if (this.creakT <= 0) {
        this.creakT = 0.35 + Math.random() * 0.4;
        let mx = 0, mat = 'wood';
        for (const b of sim.beams) if (!b.broken && b.ratio > mx) { mx = b.ratio; mat = b.part.mat; }
        if (mx > 0.62) CF.Audio.sfx.creak(mat, Math.min(1, (mx - 0.5) * 2));
      }
      // meters
      $('m-wind').textContent = Math.round(sim.windNow * 3.6);
      let load = 0;
      if (sim.vehicles) for (const v of sim.vehicles) if (v.state === 'drive' && v.onBridge) load += v.spec.mass;
      if (sim.tank && sim.tank.attached) load += sim.tank.mass;
      $('m-load').textContent = CF.I18n.fmtNum(load);
    },

    // ------------------------------------------------------------
    // per-frame update + draw
    // ------------------------------------------------------------
    update(dt) {
      if (this.state === 'idle' || this.state === 'loading') return;
      const r = this.renderer;
      if (this.state === 'build' && !this.paused) {
        this.timeLeft -= dt;
        const sec = Math.ceil(this.timeLeft);
        if (sec !== this.lastTick) { this.lastTick = sec; if (sec <= 10 && sec > 0) CF.Audio.sfx.tick(sec <= 5); }
        this.updateTimer();
        if (this.timeLeft <= 0) this.startTest(true);
      }
      if (this.state === 'test' && !this.paused) {
        // fixed 60 Hz physics, decoupled from the display frame rate
        this.acc = (this.acc || 0) + dt * this.speed;
        let n = 0;
        while (this.acc >= 1 / 60 && n < 8) { this.sim.step(1 / 60); this.acc -= 1 / 60; n++; }
        if (n >= 8) this.acc = 0;
        this.handleEvents();
        this.testAudio(dt);
        const sim = this.sim;
        if (sim.status !== 'running' && !this.resultShown && sim.t > sim.doneAt + (sim.status === 'success' ? 1.2 : 2.6)) {
          this.resultShown = true;
          this.showResult();
        }
      }
      // ---- draw ----
      const st = { dt: this.paused ? 0 : dt, mode: this.state === 'build' || this.state === 'brief' ? 'build' : 'test' };
      if (this.state === 'test' || this.state === 'result') {
        const sim = this.sim;
        st.nodes = sim.nodes; st.beams = sim.beams;
        st.wind = sim.windNow; st.windDir = sim.wind.dir;
        st.vehicles = sim.vehicles; st.tank = sim.tank;
        st.stress = this.stressView;
        st.usedAnchors = new Set(sim.nodes.filter((n) => n.fixed && n.beams > 0).map((n) => n.x0 + ',' + n.y0));
      } else {
        const nodes = this.design.nodes;
        st.nodes = nodes;
        st.beams = this.design.beams.map((b) => ({ a: b.a, b: b.b, part: PARTS[b.part] }));
        st.usedAnchors = new Set(nodes.filter((n) => n.anchor).map((n) => n.x + ',' + n.y));
        if (this.drag && this.drag.check) {
          const tg = this.drag.target;
          st.preview = { ax: this.drag.start.x, ay: this.drag.start.y, bx: tg.x, by: tg.y, part: this.part, len: this.drag.check.len, error: this.drag.check.error && this.drag.check.error.trim() ? this.drag.check.error : null, warn: this.drag.check.warn };
        } else if (this.mouse && this.state === 'build') {
          if (this.tool === 'erase') {
            const near = this.nearestPoint(this.mouse);
            const ni = near ? this.findNode(near.x, near.y) : -1;
            if (ni >= 0 && Math.hypot(near.x - this.mouse.x, near.y - this.mouse.y) < 0.45) { st.hlNode = ni; st.hlColor = '#ff5050'; }
            else { const bi = this.nearestBeam(this.mouse); if (bi >= 0) { st.hlBeam = bi; st.hlColor = '#ff5050'; } }
          } else {
            const near = this.nearestPoint(this.mouse);
            if (near) { const ni = this.findNode(near.x, near.y); if (ni >= 0) st.hlNode = ni; else st.anchorHover = near; }
          }
        }
      }
      r.frame(st);
      if (st.anchorHover) {
        const c = r.ctx; c.save(); c.setTransform(r.dpr, 0, 0, r.dpr, 0, 0);
        c.strokeStyle = '#ffd23c'; c.lineWidth = 2; c.beginPath(); c.arc(r.sx(st.anchorHover.x), r.sy(st.anchorHover.y), Math.max(9, r.s * 0.5), 0, Math.PI * 2); c.stroke(); c.restore();
      }
    },

    // ------------------------------------------------------------
    // results
    // ------------------------------------------------------------
    showResult() {
      this.state = 'result';
      CF.Audio.stopLoops();
      CF.Audio.setMood('build');
      const lv = this.level, sim = this.sim;
      const a = CF.Analysis.analyse(lv, sim, this.usageFrac, this.refRatio);
      CF.Store.recordResult(lv.difficulty, lv.number, a.success, a.stars, a.reason || 'collapse');
      $('test-bar').classList.add('hidden');
      $('res-title').textContent = a.success ? t('success_title') : t('fail_title');
      const stars = $('res-stars');
      stars.classList.toggle('hidden', !a.success);
      [...stars.children].forEach((s, i) => { s.classList.remove('on'); if (a.success && i < a.stars) setTimeout(() => { s.classList.add('on'); CF.Audio.sfx.star(i); }, 500 + i * 300); });
      $('res-opener').textContent = a.success ? '' : a.opener;
      $('res-opener').classList.toggle('hidden', a.success);
      $('res-h1').classList.toggle('hidden', a.success);
      $('res-h2').classList.toggle('hidden', a.success);
      const lines = $('res-lines');
      lines.innerHTML = a.lines.map((l) => `<li>${l}</li>`).join('');
      lines.style.listStyle = a.success ? 'none' : '';
      $('res-tips').innerHTML = a.tips.map((l) => `<li>${l}</li>`).join('');
      let closer = a.closer || '';
      if (a.success && lv.number === CF.LevelGen.TOTAL_LEVELS) closer = t('game_complete');
      $('res-closer').textContent = closer;
      $('res-stats').innerHTML = `<div>${t('material_used')}: <b>${Math.round(this.usageFrac * 100)}%</b></div><div>${t('peak_stress')}: <b>${Math.round(Math.min(a.peak, 1) * 100)}%</b></div>`;
      $('btn-next').classList.toggle('hidden', !a.success || lv.number >= CF.LevelGen.TOTAL_LEVELS);
      $('btn-retry').classList.toggle('hidden', a.success);
      $('btn-retry').classList.toggle('btn-primary', !a.success);
      $('modal-result').classList.remove('hidden');
      if (a.success) { CF.Audio.sfx.success(); this.renderer.spawnConfetti(); } else CF.Audio.sfx.fail();
      // animate the weak point map
      const cv = $('res-canvas');
      const t0 = performance.now();
      const loop = () => {
        if ($('modal-result').classList.contains('hidden')) return;
        this.renderer.drawWeakMap(cv, lv, this.simDesign, sim, (performance.now() - t0) / 1000);
        this._mapRaf = requestAnimationFrame(loop);
      };
      cancelAnimationFrame(this._mapRaf);
      requestAnimationFrame(loop);
    },
    hideResult() { $('modal-result').classList.add('hidden'); cancelAnimationFrame(this._mapRaf); }
  };

  CF.Game = Game;
})(typeof window !== 'undefined' ? window : globalThis);
